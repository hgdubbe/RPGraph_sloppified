import { Fragment } from 'react';

// Keep complete emoji sequences together, including skin tones, flags and keycaps.
const emojiPattern = /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:[\u{E0020}-\u{E007E}]+\u{E007F})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*)/gu;

/** Restore native color glyphs inside text whose fill is a clipped gradient. */
export function EmojiText({ text }: { text: string }) {
  const matches = Array.from(text.matchAll(emojiPattern));
  const parts = matches.map((match, index) => {
    const start = match.index!;
    const previous = matches[index - 1];
    const before = text.slice(previous ? previous.index! + previous[0].length : 0, start);
    return (
      <Fragment key={start}>
        {before}
        <span className="text-emoji" style={{ WebkitTextFillColor: 'currentColor', font: 'inherit', display: 'inline' }}>{match[0]}</span>
      </Fragment>
    );
  });
  const last = matches[matches.length - 1];
  return <>{parts}{text.slice(last ? last.index! + last[0].length : 0)}</>;
}
