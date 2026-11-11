/*
 * Athlesite Studio — color helpers.
 *
 * Athletes can pick any accent color. These make sure whatever they pick stays readable:
 * the accent is nudged until it has enough contrast against the page background, and the
 * text that sits on top of it (buttons, badges) is chosen automatically.
 */
(function () {
  const A = (window.Athlesite = window.Athlesite || {});

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const hexToRgb = (hex) => {
    const h = String(hex).replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  };
  const rgbToHex = (rgb) => '#' + rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();

  /** WCAG relative luminance and contrast ratio. */
  function luminance(rgb) {
    const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  /**
   * An accent that reads on this background: if the athlete's color is too close to the
   * page (yellow on white, navy on black), move it toward the ink color just until it
   * reaches 3:1, the bar for large text and graphics. Their hue is kept as much as possible.
   */
  function readableAccent(accentHex, bgHex, inkHex, min = 3) {
    const accent = hexToRgb(accentHex), bg = hexToRgb(bgHex), ink = hexToRgb(inkHex);
    if (!accent || !bg || !ink) return accentHex;
    if (contrast(accent, bg) >= min) return rgbToHex(accent);
    for (let t = 0.05; t <= 1; t += 0.05) {
      const c = mix(accent, ink, t);
      if (contrast(c, bg) >= min) return rgbToHex(c);
    }
    return inkHex;
  }

  /**
   * A color for small text (4.5:1, WCAG AA) on every one of these backgrounds: unchanged if it
   * already reads, otherwise moved toward the ink color in small steps, just far enough. Used for
   * the accent as small text (--accent-text) and for muted text.
   */
  function readableOn(hex, bgHexes, inkHex, min = 4.5) {
    const c0 = hexToRgb(hex), ink = hexToRgb(inkHex), bgs = bgHexes.map(hexToRgb).filter(Boolean);
    if (!c0 || !ink || !bgs.length) return hex;
    const ok = (c) => bgs.every((b) => contrast(c, b) >= min + 0.04); // a hair over: rounding to hex never drops it under
    if (ok(c0)) return rgbToHex(c0);
    for (let t = 0.02; t <= 1; t += 0.02) { const c = mix(c0, ink, t); if (ok(c)) return rgbToHex(c); }
    return inkHex;
  }

  /** Text that sits on the accent (buttons, badges): near-black or white, whichever reads better. */
  function textOn(accentHex, dark = '#0B0B0F', light = '#FFFFFF') {
    const a = hexToRgb(accentHex);
    if (!a) return light;
    return contrast(a, hexToRgb(dark)) >= contrast(a, hexToRgb(light)) ? dark : light;
  }

  function rgbToHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hslToRgb([h, s, l]) {
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }

  /**
   * "Pull colors from my photo": the team and gear colors in an image the page can read.
   * Pixels are bucketed by hue. Skipped: greys, near-black and near-white, and the muted
   * orange-brown band where skin, dirt and infields live (a real orange jersey is far more
   * saturated, so it still counts). Dark jersey colors are lifted to a usable brightness with
   * their hue kept, so team navy becomes a confident blue rather than near-black.
   * Returns hex strings, best first; an empty list when the photo has no clear colors.
   */
  function colorsFromImage(img, count = 4) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const [h, s, l] = rgbToHsl([data[i], data[i + 1], data[i + 2]]);
      if (s < 0.3 || l < 0.08 || l > 0.85) continue;
      if (h >= 8 && h <= 48 && s < 0.65) continue; // skin, dirt, infield
      const key = Math.round(h / 20) % 18;
      const bucket = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, s: 0 };
      bucket.n++; bucket.r += data[i]; bucket.g += data[i + 1]; bucket.b += data[i + 2]; bucket.s += s;
      buckets.set(key, bucket);
    }
    return [...buckets.values()]
      .filter((b) => b.n >= 10) // enough of the photo to matter
      .sort((a, b) => b.n * (b.s / b.n) ** 2 - a.n * (a.s / a.n) ** 2) // common, and vivid counts double
      .slice(0, count)
      .map((b) => {
        const [h, s, l] = rgbToHsl([b.r / b.n, b.g / b.n, b.b / b.n]);
        return rgbToHex(hslToRgb([h, Math.max(s, 0.5), Math.min(Math.max(l, 0.38), 0.62)]));
      });
  }

  A.color = { hexToRgb, rgbToHex, contrast: (a, b) => contrast(hexToRgb(a), hexToRgb(b)), mix: (a, b, t) => rgbToHex(mix(hexToRgb(a), hexToRgb(b), t)), readableAccent, readableOn, textOn, colorsFromImage };
})();
