export interface HsvColor { h: number; s: number; v: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function parseHexColor(value: string): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
}

export function hexToHsv(value: string): HsvColor {
  const hex = parseHexColor(value) ?? '#000000';
  const rgb = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  let h = 0;
  if (diff > 0) {
    if (max === r) h = ((g - b) / diff) % 6;
    else if (max === g) h = (b - r) / diff + 2;
    else h = (r - g) / diff + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : diff / max, v: max };
}

export function hsvToHex({ h, s, v }: HsvColor): string {
  if (![h, s, v].every(Number.isFinite)) return '#000000';
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 1);
  const brightness = clamp(v, 0, 1);
  const chroma = brightness * saturation;
  const section = hue / 60;
  const secondary = chroma * (1 - Math.abs(section % 2 - 1));
  const [red, green, blue] = section < 1 ? [chroma, secondary, 0]
    : section < 2 ? [secondary, chroma, 0]
      : section < 3 ? [0, chroma, secondary]
        : section < 4 ? [0, secondary, chroma]
          : section < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  const offset = brightness - chroma;
  return `#${[red, green, blue].map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, '0')).join('')}`;
}
