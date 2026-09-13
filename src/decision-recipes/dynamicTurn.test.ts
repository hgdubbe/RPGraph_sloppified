import { describe, expect, it, vi } from 'vitest';
import { parseSequence, runDynamicTurn, type SceneContext } from './dynamicTurn';

function scriptedLlm(answers: Record<string, string>) {
  return {
    complete: vi.fn().mockImplementation(async (request: { prompt: string; label: string }) => {
      const answer = answers[request.label];
      if (answer === undefined) throw new Error(`Unscripted call: ${request.label}`);
      return { text: answer };
    }),
  };
}

const scene: SceneContext = {
  situation: 'A quiet evening at camp.',
  actorName: 'Alice',
  characters: {
    Alice: { persona: 'Alice is warm and dramatic.', appearance: 'Tall, curly red hair, green jacket.' },
    Bob: { persona: 'Bob is dry and teasing.', appearance: 'Short, glasses, always in a hoodie.' },
  },
};

describe('parseSequence', () => {
  it('parses one action per line, with or without a recipient', () => {
    expect(parseSequence('narration\nwhatsup-message: Bob\nimage: Bob')).toEqual([
      { type: 'narration', target: undefined },
      { type: 'whatsup-message', target: 'Bob' },
      { type: 'image', target: 'Bob' },
    ]);
  });

  it('tolerates numbering/bullets and ignores blank lines and unknown types', () => {
    expect(parseSequence('1. narration\n\n- image: Bob\nsomething-unknown: X\n')).toEqual([
      { type: 'narration', target: undefined },
      { type: 'image', target: 'Bob' },
    ]);
  });
});

describe('runDynamicTurn', () => {
  it('runs a "just narration" turn as a single call, no message/image blocks at all', async () => {
    const llm = scriptedLlm({
      'Sequence decision': 'narration',
      'Content: narration-text': 'Alice settles in for the night.',
    });
    const result = await runDynamicTurn(scene, llm);
    expect(result.sequence).toEqual([{ type: 'narration', target: undefined }]);
    expect(result.blocks).toHaveLength(1);
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });

  it('runs a dynamic multi-block sequence in the model\'s chosen order: voice message, then whatsup message, then narration', async () => {
    const llm = scriptedLlm({
      'Sequence decision': 'voice-message: Bob\nwhatsup-message: Bob\nnarration',
      'Content: message-text': 'placeholder',
      'Content: narration-text': 'Alice looks at the stars.',
    });
    // Two different blocks both use the id "message-text" — script per-call-order instead.
    let messageCallCount = 0;
    llm.complete.mockImplementation(async (request: { label: string }) => {
      if (request.label === 'Sequence decision') return { text: 'voice-message: Bob\nwhatsup-message: Bob\nnarration' };
      if (request.label === 'Content: message-text') {
        messageCallCount++;
        return { text: messageCallCount === 1 ? 'Hey Bob, listen to this.' : 'Also, texting you the same thing.' };
      }
      return { text: 'Alice looks at the stars.' };
    });
    const result = await runDynamicTurn(scene, llm);
    expect(result.sequence).toEqual([
      { type: 'voice-message', target: 'Bob' }, { type: 'whatsup-message', target: 'Bob' }, { type: 'narration', target: undefined },
    ]);
    expect(result.blocks.map((b) => b.request.type)).toEqual(['voice-message', 'whatsup-message', 'narration']);
    expect(result.blocks[0].outcomes).toEqual([{ kind: 'content', id: 'message-text', skipped: false, text: 'Hey Bob, listen to this.' }]);
    expect(result.blocks[1].outcomes).toEqual([{ kind: 'content', id: 'message-text', skipped: false, text: 'Also, texting you the same thing.' }]);
  });

  it('gives the image block appearance but never persona in the picture prompt, and gives message blocks persona but never appearance', async () => {
    const llm = scriptedLlm({
      'Sequence decision': 'image: Bob\nwhatsup-message: Bob',
      'Decision: narrative-framing': 'no',
      'Content: picture-content': 'A red-haired woman in a green jacket by a campfire.',
      'Decision: reaction': 'no',
      'Content: message-text': 'Hey Bob!',
    });
    await runDynamicTurn(scene, llm);
    const picturePrompt = llm.complete.mock.calls.find((c) => c[0].label === 'Content: picture-content')![0].prompt as string;
    expect(picturePrompt).toContain('Tall, curly red hair, green jacket.');
    expect(picturePrompt).not.toContain('Alice is warm and dramatic.');
    const messagePrompt = llm.complete.mock.calls.find((c) => c[0].label === 'Content: message-text')![0].prompt as string;
    expect(messagePrompt).toContain('Alice is warm and dramatic.');
    expect(messagePrompt).not.toContain('Tall, curly red hair');
  });

  it('an empty/unparseable sequence runs zero blocks', async () => {
    const llm = scriptedLlm({ 'Sequence decision': 'nothing happens this turn' });
    const result = await runDynamicTurn(scene, llm);
    expect(result.sequence).toEqual([]);
    expect(result.blocks).toEqual([]);
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });
});
