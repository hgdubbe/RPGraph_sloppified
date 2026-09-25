import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmojiText } from './EmojiText';
import { AccountLinkText } from './AccountLinkText';
import { ChatBubbleText } from './ChatBubbleText';

function render(text: string) {
  return renderToStaticMarkup(createElement(EmojiText, { text }));
}

describe('EmojiText', () => {
  it('protects the emojis from the reported chat without changing the message', () => {
    const text = 'Poor university student 🙄 Ice 🧊 Love youuu ❤️';
    const markup = render(text);
    expect(markup.match(/class="text-emoji"/g)).toHaveLength(3);
    expect(markup.replace(/<\/?span[^>]*>/g, '')).toBe(text);
    expect(markup).toContain('-webkit-text-fill-color:currentColor');
  });

  it('keeps joined emoji, skin tones, flags, keycaps and subdivision flags intact', () => {
    const subdivisionFlag = String.fromCodePoint(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);
    const emojis = ['👩🏽‍💻', '👨‍👩‍👧‍👦', '👍🏿', '🇩🇪', '1️⃣', '#️⃣', subdivisionFlag];
    const markup = render(emojis.join(' '));
    expect(markup.match(/class="text-emoji"/g)).toHaveLength(emojis.length);
    for (const emoji of emojis) expect(markup).toContain(`>${emoji}</span>`);
  });

  it('leaves plain text, whitespace and escaping intact', () => {
    const text = '123 # * <script> & hello\n  world';
    expect(render(text)).toBe(renderToStaticMarkup(createElement(Fragment, null, text)));
  });

  it('protects emoji in both plain bubbles and account-aware message text', () => {
    const plain = renderToStaticMarkup(createElement(ChatBubbleText, null, 'Hi 🙄'));
    const linked = renderToStaticMarkup(createElement(ChatBubbleText, null,
      createElement(AccountLinkText, { text: 'Hi 🙄' })));
    expect(plain).toContain('class="text-emoji"');
    expect(linked).toContain('class="text-emoji"');
  });
});
