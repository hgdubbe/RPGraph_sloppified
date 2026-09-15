import { describe, expect, it, vi } from 'vitest';
import type { MessageRecord } from '../types';
import { applyPhoneOutputCommits, buildPhoneOutputCommits } from './phoneOutputCommits';

describe('phone output commits', () => {
  const phoneCharacters = [{ name: 'Helga Harper' }, { name: 'Espen Harper' }];
  it('canonicalizes names without merging intentional identical messages', () => {
    const reply = { from: 'Helga', to: 'Espen', message: 'hey', sourceOrder: 3, isVoiceMessage: true };
    const commits = buildPhoneOutputCommits({ phoneCharacters, replies: [reply, reply], existingMessages: [], firstSound: 'received' });
    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({ type: 'append-phone-message', payload: { from: 'Helga Harper', to: 'Espen Harper', message: 'hey', sourceOrder: 3, isVoiceMessage: true }, sound: 'received' });
    expect(commits[1].sound).toBeUndefined();
    expect(reply.from).toBe('Helga');
    const append = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(11);
    const links = applyPhoneOutputCommits(commits, { appendPhoneMessage: append });
    expect(links.map((link) => link.phoneMessageId)).toEqual([10, 11]);
    expect(append).toHaveBeenCalledTimes(2);
  });

  it('resolves RP pictures and retains caption, translation and first-message metadata', () => {
    const image = { id: 'source', name: 'photo.png', dataUrl: 'data:image/png;base64,AA==', mimeType: 'image/png', size: 1 };
    const existingMessages = [{ id: 1, role: 'user', originalText: '', rpImageName: 'RP_Picture_01', rpImageDescription: 'A photo', imageAttachments: [image] }] as MessageRecord[];
    const commands = [{ name: 'test', value: '1' }];
    const commits = buildPhoneOutputCommits({ phoneCharacters, existingMessages, replies: [{ from: 'Helga', to: 'Espen', message: 'Look', imageId: 'RP Picture 1', translatedMessage: 'Schau' }],
      resolveRpPictures: true, firstSound: 'sent', phoneAutoTurnSource: 'narrator', workflowVariableSetCommands: commands });
    expect(commits[0].payload).toMatchObject({ imageId: 'RP_Picture_01', imageDescription: 'A photo', imageAttachments: [{ id: 'RP_Picture_01', dataUrl: image.dataUrl }] });
    expect(commits[0].workflowVariableSetCommands).not.toBe(commands);
    const append = vi.fn().mockReturnValue(20);
    expect(applyPhoneOutputCommits(commits, { appendPhoneMessage: append })[0]).toMatchObject({ phoneMessageId: 20, translatedMessage: 'Schau' });
    expect(append.mock.calls[0].slice(1)).toEqual(['sent', 'output', 'narrator', commands]);
  });

  it('keeps unresolved gallery IDs for the existing append adapter and stops on callback failure', () => {
    const commits = buildPhoneOutputCommits({ phoneCharacters, existingMessages: [], replies: [
      { from: 'Outside contact', to: 'Helga', message: 'Photo', imageId: 'gallery-image' },
      { from: 'Outside contact', to: 'Helga', message: 'Second' },
    ], resolveRpPictures: true });
    expect(commits[0].payload.imageId).toBe('gallery-image');
    const append = vi.fn(() => { throw new Error('commit failed'); });
    expect(() => applyPhoneOutputCommits(commits, { appendPhoneMessage: append })).toThrow('commit failed');
    expect(append).toHaveBeenCalledTimes(1);
  });
});
