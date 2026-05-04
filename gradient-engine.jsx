/* Gradient engine — pure canvas rendering, seeded.
 * Renders at NATIVE resolution to an offscreen canvas, then we scale to preview.
 *
 * Aplos primary palette:
 *   Greenblack #0a2222, Dark Green #1b4445, Medium Green #407d70,
 *   Core Green #63ba86, Light Green #b9eaca, Sand #fcfbe9,
 *   Light Gray #dfe5e3, White #ffffff
 * Secondary (sparingly): blue, purple, clay, yellow tones
 */

const APLOS = {
  greenblack: '#0a2222',
  darkGreen: '#1b4445',
  mediumGreen: '#407d70',
  coreGreen: '#63ba86',
  lightGreen: '#b9eaca',
  sand: '#fcfbe9',
  lightGray: '#dfe5e3',
  white: '#ffffff',
};

// Secondary palette (sensible values — PDF had placeholder hexes)
const SECONDARY = {
  blue:   ['#cfe0ee', '#7fa8c8', '#2f5a82'],
  purple: ['#dcd0ea', '#9d86c2', '#4a3a78'],
  clay:   ['#ecd8c5', '#c89a78', '#7a4a32'],
  yellow: ['#f3ead0', '#d8c168', '#8a7022'],
};

// Mode palettes — primary palette ordered by lightness emphasis
const MODE_PALETTES = {
  dark: {
    base: '#0a2222',
    blobs: ['#0a2222', '#1b4445', '#407d70', '#63ba86', '#1b4445'],
    name: 'Dark',
  },
  medium: {
    base: '#1b4445',
    blobs: ['#1b4445', '#407d70', '#63ba86', '#b9eaca', '#407d70'],
    name: 'Medium',
  },
  light: {
    base: '#b9eaca',
    blobs: ['#b9eaca', '#fcfbe9', '#63ba86', '#ffffff', '#b9eaca'],
    name: 'Light',
  },
};

// Mulberry32 seeded RNG
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex({ r, g, b }) {
  const h = (v) => v.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex({
    r: Math.round(lerp(A.r, B.r, t)),
    g: Math.round(lerp(A.g, B.g, t)),
    b: Math.round(lerp(A.b, B.b, t)),
  });
}

// Compute relative luminance for a hex color (0..1)
function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Mode-specific palette anchors organized by lightness band
// (dark / mid / light) so we can guarantee a varied composition.
const MODE_BANDS = {
  dark: {
    dark:  ['#0a2222', '#1b4445'],
    mid:   ['#407d70', '#1b4445'],
    light: ['#63ba86', '#b9eaca'],
  },
  medium: {
    dark:  ['#1b4445', '#0a2222'],
    mid:   ['#407d70', '#63ba86'],
    light: ['#b9eaca', '#fcfbe9'],
  },
  light: {
    dark:  ['#407d70', '#1b4445'],
    mid:   ['#63ba86', '#b9eaca'],
    light: ['#fcfbe9', '#ffffff'],
  },
};

function pickFromBand(band, rng) {
  return band[Math.floor(rng() * band.length)];
}

// Pick a palette for a given mode — five stops biased dark/mid/light/mid/dark.
function buildPalette(mode, rng) {
  const bands = MODE_BANDS[mode];
  return [
    pickFromBand(bands.dark, rng),
    pickFromBand(bands.mid, rng),
    pickFromBand(bands.light, rng),
    pickFromBand(bands.mid, rng),
    pickFromBand(bands.dark, rng),
  ];
}

// Accent strength presets — 'hint' = 1 soft blob, 'splash' = 2 with more presence.
const ACCENT_STRENGTHS = {
  hint:   { count: 1, alpha: 0.35 },
  splash: { count: 2, alpha: 0.55 },
};

// Render 1-2 large soft radial blobs of the accent color on top of the canvas.
// Positions are biased into off-center quadrants so the accent reads as a
// localized region of color, not a uniform tint.
function renderAccentBlobs(ctx, w, h, accentColor, rng, strength) {
  const { count, alpha } = ACCENT_STRENGTHS[strength] || ACCENT_STRENGTHS.hint;
  // Pick a base angle for the placement — splash uses two opposite quadrants,
  // hint uses just one.
  const baseAngle = rng() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const theta = baseAngle + (i * Math.PI) + (rng() - 0.5) * 0.6;
    const dist = 0.22 + rng() * 0.12; // 22-34% from center
    const cx = w / 2 + Math.cos(theta) * w * dist;
    const cy = h / 2 + Math.sin(theta) * h * dist;
    const radius = (0.55 + rng() * 0.25) * Math.max(w, h);

    ctx.save();
    ctx.globalAlpha = alpha;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0,   accentColor + 'ff');
    grad.addColorStop(0.5, accentColor + '66');
    grad.addColorStop(1,   accentColor + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

// Convert angle (deg) to a vector
function angleVec(deg) {
  const r = (deg * Math.PI) / 180;
  return { x: Math.cos(r), y: Math.sin(r) };
}

// ---- Style renderers ----
// All take (ctx, w, h, palette, rng, angleDeg)

function renderRadialBlobs(ctx, w, h, palette, rng, angle) {
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, w, h);
  const v = angleVec(angle);
  // Place blobs along the angle axis, jittered
  const count = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const along = (t - 0.5) * 1.6;
    const jitter = (rng() - 0.5) * 0.4;
    // Project along angle, add perpendicular jitter
    const px = w / 2 + along * v.x * w * 0.6 + (-v.y) * jitter * w;
    const py = h / 2 + along * v.y * h * 0.6 + v.x * jitter * h;
    const radius = (0.35 + rng() * 0.45) * Math.max(w, h);
    const color = palette[1 + (i % (palette.length - 1))];
    const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

function renderMesh(ctx, w, h, palette, rng, angle) {
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, w, h);
  // Mesh: scatter ~7 control points, big soft radial gradients
  const v = angleVec(angle);
  const points = 7;
  for (let i = 0; i < points; i++) {
    // bias along the angle axis
    const ax = (rng() - 0.5) * 1.4;
    const ay = (rng() - 0.5) * 1.4;
    const along = (rng() - 0.5) * 0.8;
    const px = w * (0.5 + ax * 0.45 + along * v.x * 0.3);
    const py = h * (0.5 + ay * 0.45 + along * v.y * 0.3);
    const radius = (0.5 + rng() * 0.5) * Math.max(w, h);
    const color = palette[(i + 1) % palette.length];
    const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
    grad.addColorStop(0, color + 'cc');
    grad.addColorStop(0.6, color + '55');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

function renderLinear(ctx, w, h, palette, rng, angle) {
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, w, h);
  // Main linear gradient
  const v = angleVec(angle);
  const cx = w / 2, cy = h / 2;
  const len = Math.max(w, h) * 0.9;
  const x0 = cx - v.x * len, y0 = cy - v.y * len;
  const x1 = cx + v.x * len, y1 = cy + v.y * len;
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  // Pick 3-4 stops from palette
  const nStops = 3 + Math.floor(rng() * 2);
  const used = [];
  for (let i = 0; i < nStops; i++) {
    let c;
    do { c = palette[Math.floor(rng() * palette.length)]; }
    while (used.includes(c) && used.length < palette.length);
    used.push(c);
    grad.addColorStop(i / (nStops - 1), c);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Add 1-2 soft radial accents on top to break up the band
  for (let i = 0; i < 2; i++) {
    const px = w * (0.2 + rng() * 0.6);
    const py = h * (0.2 + rng() * 0.6);
    const r = (0.3 + rng() * 0.3) * Math.max(w, h);
    const c = palette[Math.floor(rng() * palette.length)];
    const rg = ctx.createRadialGradient(px, py, 0, px, py, r);
    rg.addColorStop(0, c + '88');
    rg.addColorStop(1, c + '00');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }
}

function renderBlobs(ctx, w, h, palette, rng, angle) {
  // Random freeform organic blobs — a few large, soft, irregular shapes
  // built from radial gradients with displaced edges, layered on a base color.
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, w, h);

  const v = angleVec(angle);
  // 4-6 blobs of varying size, biased loosely along the angle axis
  const count = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const along = (t - 0.5) * 1.4 + (rng() - 0.5) * 0.5;
    const perp = (rng() - 0.5) * 1.0;
    const cx = w / 2 + along * v.x * w * 0.55 + (-v.y) * perp * w * 0.35;
    const cy = h / 2 + along * v.y * h * 0.55 + v.x * perp * h * 0.35;
    const baseR = (0.28 + rng() * 0.35) * Math.max(w, h);

    // Pick color: alternate mid + light to keep harmony
    const c = palette[1 + Math.floor(rng() * (palette.length - 1))];

    // Build an irregular blob path (8-12 points, radius modulated by sine sums)
    const points = 10 + Math.floor(rng() * 4);
    const wob1 = 0.18 + rng() * 0.18;
    const wob2 = 0.08 + rng() * 0.12;
    const phase1 = rng() * Math.PI * 2;
    const phase2 = rng() * Math.PI * 2;

    ctx.save();
    // Soft edge — fill via a radial gradient clipped to the blob path
    ctx.beginPath();
    for (let p = 0; p <= points; p++) {
      const a = (p / points) * Math.PI * 2;
      const rMod = 1
        + Math.sin(a * 2 + phase1) * wob1
        + Math.sin(a * 3 + phase2) * wob2;
      const r = baseR * rMod;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.clip();
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.25);
    grad.addColorStop(0, c + 'ee');
    grad.addColorStop(0.7, c + '88');
    grad.addColorStop(1, c + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function renderAurora(ctx, w, h, palette, rng, angle) {
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, w, h);
  // Stack of softer, fewer bands flowing roughly along angle
  const v = angleVec(angle);
  const nx = -v.y, ny = v.x; // perpendicular
  const bands = 4;
  for (let i = 0; i < bands; i++) {
    const t = bands === 1 ? 0.5 : i / (bands - 1);
    const offset = (t - 0.5) * Math.max(w, h) * 0.7;
    const cx = w / 2 + nx * offset;
    const cy = h / 2 + ny * offset;
    const c = palette[1 + (i % (palette.length - 1))];

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(v.y, v.x));
    const bandW = Math.max(w, h) * 1.8;
    const bandH = Math.max(w, h) * (0.28 + rng() * 0.12);
    // Softer alpha falloff — no hard middle band
    const grad = ctx.createLinearGradient(0, -bandH, 0, bandH);
    grad.addColorStop(0,    c + '00');
    grad.addColorStop(0.4,  c + '88');
    grad.addColorStop(0.6,  c + '88');
    grad.addColorStop(1,    c + '00');
    ctx.fillStyle = grad;
    const steps = 32;
    const wobble = (rng() - 0.5) * bandH * 0.4;
    const phase = rng() * Math.PI * 2;
    ctx.beginPath();
    for (let s = 0; s <= steps; s++) {
      const x = -bandW / 2 + (s / steps) * bandW;
      const y = -bandH + Math.sin((s / steps) * Math.PI * 2 + phase) * wobble;
      s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    for (let s = steps; s >= 0; s--) {
      const x = -bandW / 2 + (s / steps) * bandW;
      const y = bandH + Math.sin((s / steps) * Math.PI * 2 + phase + 1) * wobble;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

const STYLE_RENDERERS = {
  radial: renderRadialBlobs,
  mesh: renderMesh,
  linear: renderLinear,
  blobs: renderBlobs,
  aurora: renderAurora,
};

// Apply blur. Standardized — three presets only.
const BLUR_PRESETS = {
  soft: 0.04,    // 4% of min dimension
  medium: 0.07,
  heavy: 0.12,
};

// Apply gaussian-style blur via canvas filter, with edge-extend padding so the
// blur kernel doesn't sample transparent space and darken the edges.
function applyBlur(ctx, w, h, preset) {
  const px = Math.round(Math.min(w, h) * BLUR_PRESETS[preset]);
  if (px <= 0) return;
  // Pad >= 2x the blur radius so the kernel never reaches the (transparent) outside.
  const pad = Math.ceil(px * 3);
  const tmp = document.createElement('canvas');
  tmp.width = w + pad * 2;
  tmp.height = h + pad * 2;
  const tctx = tmp.getContext('2d');
  // Center
  tctx.drawImage(ctx.canvas, pad, pad);
  // Edge-extend by stretching 1px-wide slices outward.
  // Left
  tctx.drawImage(ctx.canvas, 0, 0, 1, h, 0, pad, pad, h);
  // Right
  tctx.drawImage(ctx.canvas, w - 1, 0, 1, h, w + pad, pad, pad, h);
  // Top
  tctx.drawImage(ctx.canvas, 0, 0, w, 1, pad, 0, w, pad);
  // Bottom
  tctx.drawImage(ctx.canvas, 0, h - 1, w, 1, pad, h + pad, w, pad);
  // Corners
  tctx.drawImage(ctx.canvas, 0, 0, 1, 1, 0, 0, pad, pad);
  tctx.drawImage(ctx.canvas, w - 1, 0, 1, 1, w + pad, 0, pad, pad);
  tctx.drawImage(ctx.canvas, 0, h - 1, 1, 1, 0, h + pad, pad, pad);
  tctx.drawImage(ctx.canvas, w - 1, h - 1, 1, 1, w + pad, h + pad, pad, pad);

  // Now blur the padded canvas and draw back the center region.
  ctx.clearRect(0, 0, w, h);
  ctx.filter = `blur(${px}px)`;
  ctx.drawImage(tmp, -pad, -pad);
  ctx.filter = 'none';
}

// Real film-grain texture, scaled to fit the canvas and composited with
// soft-light so dark/light grains modulate luminance without shifting hue.
// Opacity drops as blur deepens, so heavier blur reads as the grain itself
// fading into the haze.
const GRAIN_SRC = 'assets/film-grain.png';
const GRAIN_OPACITY_BY_BLUR = {
  soft:   0.45,
  medium: 0.30,
  heavy:  0.18,
};
const grainImage = (typeof window !== 'undefined') ? new Image() : null;
if (grainImage) grainImage.src = GRAIN_SRC;

function applyNoise(ctx, w, h, blur) {
  if (!grainImage || !grainImage.complete || grainImage.naturalWidth === 0) return false;
  const opacity = GRAIN_OPACITY_BY_BLUR[blur] ?? GRAIN_OPACITY_BY_BLUR.medium;
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = opacity;
  ctx.drawImage(grainImage, 0, 0, w, h);
  ctx.restore();
  return true;
}

// Real Aplos logo — preloaded as Image objects.
// Native aspect ratio is 1000:198.83 (~5.03:1).
const LOGO_ASPECT = 1000 / 198.83;
const logoCache = {};
function loadLogo(variant) {
  if (logoCache[variant]) return logoCache[variant];
  const img = new Image();
  img.src = variant === 'darkgreen'
    ? 'assets/aplos-logo-darkgreen.svg'
    : 'assets/aplos-logo-white.svg';
  logoCache[variant] = img;
  return img;
}
// Kick off preload immediately
if (typeof window !== 'undefined') {
  loadLogo('white');
  loadLogo('darkgreen');
}

function drawLogo(ctx, w, h, mode, position) {
  const variant = mode === 'light' ? 'darkgreen' : 'white';
  const img = loadLogo(variant);
  if (!img.complete || img.naturalWidth === 0) {
    // Logo not loaded yet — skip; render fn will be called again
    return false;
  }

  const margin = Math.round(Math.min(w, h) * 0.05);
  // Size: ~22% of canvas width for horizontal lockup
  const logoW = Math.round(w * 0.22);
  const logoH = Math.round(logoW / LOGO_ASPECT);

  let x, y;
  switch (position) {
    case 'tl': x = margin; y = margin; break;
    case 'tr': x = w - margin - logoW; y = margin; break;
    case 'bl': x = margin; y = h - margin - logoH; break;
    case 'br': x = w - margin - logoW; y = h - margin - logoH; break;
    case 'center':
    default:
      x = (w - logoW) / 2; y = (h - logoH) / 2; break;
  }
  ctx.drawImage(img, x, y, logoW, logoH);
  return true;
}

// ---- Main render fn ----
function renderGradient({
  canvas,
  width,
  height,
  style,            // 'radial' | 'mesh' | 'linear' | 'aurora' | 'blobs' | 'random'
  mode,             // 'dark' | 'medium' | 'light'
  angle,            // 0..360
  seed,             // integer — base gradient
  blur,             // 'soft' | 'medium' | 'heavy'
  secondaryFamily,  // null | 'blue' | 'purple' | 'clay' | 'yellow'
  accentStrength,   // 'hint' | 'splash' (only when secondaryFamily is set)
  accentSeed,       // integer — accent blob positions, independent of base seed
  showLogo,
  logoPosition,     // 'tl'|'tr'|'bl'|'br'|'center'
}) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const rng = makeRng(seed);

  // Pick style — if random, derive from seed
  let actualStyle = style;
  if (style === 'random') {
    const styles = Object.keys(STYLE_RENDERERS);
    actualStyle = styles[Math.floor(rng() * styles.length)];
  }
  const palette = buildPalette(mode, rng);
  STYLE_RENDERERS[actualStyle](ctx, width, height, palette, rng, angle);

  // Secondary accent — soft localized blobs of the accent color.
  // Uses its own seed so the "Move accent" button can reroll positions
  // without regenerating the base gradient.
  if (secondaryFamily && SECONDARY[secondaryFamily] && accentStrength) {
    const accentColor = SECONDARY[secondaryFamily][1]; // mid shade
    const accentRng = makeRng(accentSeed != null ? accentSeed : seed + 2);
    renderAccentBlobs(ctx, width, height, accentColor, accentRng, accentStrength);
  }

  applyBlur(ctx, width, height, blur);
  const noiseDrawn = applyNoise(ctx, width, height, blur);

  let logoDrawn = true;
  if (showLogo) {
    logoDrawn = drawLogo(ctx, width, height, mode, logoPosition);
  }

  return { actualStyle, logoDrawn, noiseDrawn };
}

window.GradientEngine = {
  render: renderGradient,
  APLOS,
  MODE_PALETTES,
  BLUR_PRESETS,
};
