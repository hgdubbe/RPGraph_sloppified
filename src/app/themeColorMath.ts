/** Minimal color math for the theme resolver's basic-to-advanced derivation
 * layer. Deliberately tiny — only handles the #hex / rgb(a) shapes this
 * codebase's theme values actually use, not a general color library. */

type RGBA = { r: number; g: number; b: number; a: number };

function parseColor(input: string): RGBA | undefined {
  const hex = input.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  const rgba = input.trim().match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i,
  );
  if (rgba) {
    return {
      r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]),
      a: rgba[4] !== undefined ? Number(rgba[4]) : 1,
    };
  }
  return undefined;
}

function clamp255(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function toColorString({ r, g, b, a }: RGBA): string {
  return a >= 1
    ? `rgb(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)})`
    : `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${Math.round(a * 1000) / 1000})`;
}

/** Lighten a color toward white by `percent` (0-100). */
export function lighten(color: string, percent: number): string | undefined {
  const c = parseColor(color);
  if (!c) return undefined;
  const t = percent / 100;
  return toColorString({ r: c.r + (255 - c.r) * t, g: c.g + (255 - c.g) * t, b: c.b + (255 - c.b) * t, a: c.a });
}

/** Mix two colors by `ratio` (0 = all `from`, 1 = all `to`). */
export function mix(from: string, to: string, ratio: number): string | undefined {
  const a = parseColor(from);
  const b = parseColor(to);
  if (!a || !b) return undefined;
  return toColorString({
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio,
    a: a.a + (b.a - a.a) * ratio,
  });
}

/** Pick black or white-ish text for readable contrast against `color`. */
export function contrastingText(color: string): string | undefined {
  const c = parseColor(color);
  if (!c) return undefined;
  const luminance = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return luminance > 0.6 ? '#0b0e1a' : '#f4f7ff';
}

/** Apply an alpha value to a color, replacing any existing alpha. */
export function withAlpha(color: string, alpha: number): string | undefined {
  const c = parseColor(color);
  if (!c) return undefined;
  return toColorString({ ...c, a: alpha });
}
