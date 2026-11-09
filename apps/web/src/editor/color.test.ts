import { describe, expect, it } from 'vitest';

import { hexToHsv, hsvToHex, parseHexColor } from './color';

describe('HSV palette conversion', () => {
  it('maps reference colors to and from HSV', () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000');
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00ff00');
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe('#0000ff');
    expect(hsvToHex({ h: 180, s: 0, v: 0.5 })).toBe('#808080');
    expect(hexToHsv('#00ffff')).toEqual({ h: 180, s: 1, v: 1 });
    expect(hexToHsv('#ffffff')).toEqual({ h: 0, s: 0, v: 1 });
  });

  it('accepts exact six-digit hex only and normalizes case', () => {
    expect(parseHexColor(' A1b2C3 ')).toBe('#a1b2c3');
    expect(parseHexColor('#a1b2c3')).toBe('#a1b2c3');
    expect(parseHexColor('#gggfff')).toBeNull();
    expect(parseHexColor('#fff')).toBeNull();
  });
});
