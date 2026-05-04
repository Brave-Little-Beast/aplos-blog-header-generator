/* App — UI shell + state */
const { useState, useEffect, useRef, useCallback, useMemo } = React;

const APLOS = window.GradientEngine.APLOS;

const STYLES = [
  { id: 'random',  label: 'Random' },
  { id: 'mesh',    label: 'Mesh' },
  { id: 'radial',  label: 'Radial' },
  { id: 'linear',  label: 'Linear' },
  { id: 'blobs'   , label: 'Blobs' },
  { id: 'aurora',  label: 'Aurora' },
];

const MODES = [
  { id: 'dark',   label: 'Dark',   sub: 'Greenblack' },
  { id: 'medium', label: 'Medium', sub: 'Medium green' },
  { id: 'light',  label: 'Light',  sub: 'Light / sand' },
];

const BLURS = [
  { id: 'soft',   label: 'Soft' },
  { id: 'medium', label: 'Medium' },
  { id: 'heavy', label: 'Heavy' },
];

const RESOLUTIONS = [
  { id: 2000, label: '2000 × 1125', sub: 'Min spec' },
  { id: 2400, label: '2400 × 1350', sub: '' },
  { id: 3000, label: '3000 × 1688', sub: 'Recommended' },
  { id: 4000, label: '4000 × 2250', sub: 'Large' },
];

const FORMATS = [
  { id: 'png', label: 'PNG' },
  { id: 'jpg', label: 'JPG' },
];

const LOGO_POSITIONS = [
  { id: 'tl', label: '↖' },
  { id: 'tr', label: '↗' },
  { id: 'center', label: '·' },
  { id: 'bl', label: '↙' },
  { id: 'br', label: '↘' },
];

const TITLE_SAFE_REGIONS = [
  { id: 'left',   label: 'Left third' },
  { id: 'center', label: 'Center' },
  { id: 'right',  label: 'Right third' },
];

function newSeed() { return Math.floor(Math.random() * 1e9); }

// Render an offscreen canvas at full res for a given config.
// Returns a promise that resolves once any logo image has loaded.
function renderToCanvas(cfg) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const tryRender = () => {
      const result = window.GradientEngine.render({ canvas, ...cfg });
      if (cfg.showLogo && result.logoDrawn === false) {
        const variant = cfg.mode === 'light' ? 'darkgreen' : 'white';
        const src = variant === 'darkgreen'
          ? 'assets/aplos-logo-darkgreen.svg'
          : 'assets/aplos-logo-white.svg';
        const probe = new Image();
        probe.onload = () => { tryRender(); };
        probe.onerror = () => resolve({ canvas, ...result });
        probe.src = src;
      } else {
        resolve({ canvas, ...result });
      }
    };
    tryRender();
  });
}

function App() {
  const [style, setStyle] = useState('random');
  const [mode, setMode] = useState('dark');
  const [angle, setAngle] = useState(135);
  const [seed, setSeed] = useState(() => newSeed());
  const [blur, setBlur] = useState('medium');
  const [secondaryFamily, setSecondaryFamily] = useState(null);
  const [accentStrength, setAccentStrength] = useState('hint'); // 'hint' | 'splash'
  const [accentSeed, setAccentSeed] = useState(() => newSeed());
  const [showLogo, setShowLogo] = useState(false);
  const [logoPos, setLogoPos] = useState('bl');
  const [resolution, setResolution] = useState(3000);
  const [format, setFormat] = useState('png');
  const [rendering, setRendering] = useState(false);
  const [lastStyle, setLastStyle] = useState(null);

  // Title-safe overlay (preview only, not exported)
  const [showTitleSafe, setShowTitleSafe] = useState(false);
  const [titleSafeRegion, setTitleSafeRegion] = useState('left');

  // Favorites — pinned variations the user wants to keep
  const [favorites, setFavorites] = useState([]);

  // Batch export
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchCount, setBatchCount] = useState(6);
  const [batchProgress, setBatchProgress] = useState(null);

  const previewCanvasRef = useRef(null);
  const fullCanvasRef = useRef(null);

  const dims = useMemo(() => {
    const w = resolution;
    const h = Math.round(w * 9 / 16);
    return { w, h };
  }, [resolution]);

  // Preview is rendered at a much smaller fixed size so live editing stays smooth.
  // Full-resolution render happens only on download / batch / pin.
  const PREVIEW_W = 1280;
  const PREVIEW_H = Math.round(PREVIEW_W * 9 / 16); // 720

  const drawToPreview = useCallback(() => {
    if (!previewCanvasRef.current || !fullCanvasRef.current) return;
    const preview = previewCanvasRef.current;
    const cssW = preview.clientWidth;
    if (!cssW) return;
    const cssH = Math.round(cssW * 9 / 16);
    const dpr = window.devicePixelRatio || 1;
    preview.width = cssW * dpr;
    preview.height = cssH * dpr;
    preview.style.height = cssH + 'px';
    const pctx = preview.getContext('2d');
    pctx.imageSmoothingEnabled = true;
    pctx.imageSmoothingQuality = 'high';
    pctx.drawImage(fullCanvasRef.current, 0, 0, preview.width, preview.height);
  }, []);

  const render = useCallback(() => {
    if (!fullCanvasRef.current || !previewCanvasRef.current) return;
    setRendering(true);
    requestAnimationFrame(() => {
      const result = window.GradientEngine.render({
        canvas: fullCanvasRef.current,
        width: PREVIEW_W,
        height: PREVIEW_H,
        style, mode, angle, seed, blur,
        secondaryFamily, accentStrength, accentSeed,
        showLogo, logoPosition: logoPos,
      });
      setLastStyle(result.actualStyle);
      drawToPreview();
      if (showLogo && result.logoDrawn === false) {
        const variant = mode === 'light' ? 'darkgreen' : 'white';
        const src = variant === 'darkgreen'
          ? 'assets/aplos-logo-darkgreen.svg'
          : 'assets/aplos-logo-white.svg';
        const probe = new Image();
        probe.onload = () => render();
        probe.src = src;
      }
      if (result.noiseDrawn === false) {
        const probe = new Image();
        probe.onload = () => render();
        probe.src = 'assets/film-grain.png';
      }
      setRendering(false);
    });
  }, [style, mode, angle, seed, blur, secondaryFamily, accentStrength, accentSeed, showLogo, logoPos, drawToPreview]);

  useEffect(() => { render(); }, [render]);
  useEffect(() => {
    const handle = () => drawToPreview();
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, [drawToPreview]);

  // Build a config object from current state
  const currentConfig = () => ({
    width: dims.w, height: dims.h, style, mode, angle, seed, blur,
    secondaryFamily, accentStrength, accentSeed,
    showLogo, logoPosition: logoPos,
  });

  // Filename helper — self-documenting
  const makeFilename = (cfg, ext) => {
    const styleStr = cfg.actualStyle || cfg.style;
    return `aplos-${styleStr}-${cfg.mode}-${cfg.angle}deg-${cfg.seed}.${ext}`;
  };

  const download = async () => {
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpg' ? 'jpg' : 'png';
    const cfg = { ...currentConfig() };
    setRendering(true);
    const { canvas, actualStyle } = await renderToCanvas(cfg);
    setRendering(false);
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = makeFilename({ ...cfg, actualStyle }, ext);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, mime, format === 'jpg' ? 0.92 : undefined);
  };

  const regenerate = () => {
    setSeed(newSeed());
    setAccentSeed(newSeed());
  };

  const moveAccent = () => setAccentSeed(newSeed());

  const pinFavorite = () => {
    const fav = {
      id: `${seed}-${Date.now()}`,
      cfg: { ...currentConfig(), actualStyle: lastStyle },
    };
    // Render thumbnail at small res
    const thumbCanvas = document.createElement('canvas');
    window.GradientEngine.render({
      canvas: thumbCanvas,
      width: 320, height: 180,
      style: fav.cfg.style, mode: fav.cfg.mode, angle: fav.cfg.angle,
      seed: fav.cfg.seed, blur: fav.cfg.blur,
      secondaryFamily: fav.cfg.secondaryFamily,
      accentStrength: fav.cfg.accentStrength,
      accentSeed: fav.cfg.accentSeed,
      showLogo: false, logoPosition: 'bl',
    });
    fav.thumb = thumbCanvas.toDataURL('image/jpeg', 0.7);
    setFavorites(prev => prev.length >= 12 ? [fav, ...prev.slice(0, 11)] : [fav, ...prev]);
  };

  const restoreFavorite = (fav) => {
    const c = fav.cfg;
    setStyle(c.style); setMode(c.mode); setAngle(c.angle);
    setSeed(c.seed); setBlur(c.blur);
    setSecondaryFamily(c.secondaryFamily ?? null);
    setAccentStrength(c.accentStrength ?? 'hint');
    setAccentSeed(c.accentSeed ?? newSeed());
    setShowLogo(c.showLogo); setLogoPos(c.logoPosition);
  };

  const removeFavorite = (id) => {
    setFavorites(prev => prev.filter(f => f.id !== id));
  };

  // Batch export — N variations from current settings, random seeds, ZIP download
  const runBatchExport = async () => {
    if (batchProgress) return;
    setBatchProgress({ done: 0, total: batchCount });
    const ext = format === 'jpg' ? 'jpg' : 'png';
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpg' ? 0.92 : undefined;

    // Build seeds — current seed plus N-1 fresh ones (current included so user
    // gets the result they're previewing)
    const seeds = [seed];
    for (let i = 1; i < batchCount; i++) seeds.push(newSeed());

    const zip = new window.JSZip();
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      const cfg = { ...currentConfig(), seed: s };
      const { canvas, actualStyle } = await renderToCanvas(cfg);
      const blob = await new Promise(r => canvas.toBlob(r, mime, quality));
      const filename = makeFilename({ ...cfg, actualStyle }, ext);
      zip.file(filename, blob);
      setBatchProgress({ done: i + 1, total: seeds.length });
      // Yield to UI between renders
      await new Promise(r => setTimeout(r, 10));
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aplos-gradients-batch-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBatchProgress(null);
    setBatchOpen(false);
  };

  return (
    <div className="app">
      <Sidebar
        style={style} setStyle={setStyle}
        mode={mode} setMode={setMode}
        angle={angle} setAngle={setAngle}
        blur={blur} setBlur={setBlur}
        secondaryFamily={secondaryFamily} setSecondaryFamily={setSecondaryFamily}
        accentStrength={accentStrength} setAccentStrength={setAccentStrength}
        moveAccent={moveAccent}
        showLogo={showLogo} setShowLogo={setShowLogo}
        logoPos={logoPos} setLogoPos={setLogoPos}
        resolution={resolution} setResolution={setResolution}
        format={format} setFormat={setFormat}
        showTitleSafe={showTitleSafe} setShowTitleSafe={setShowTitleSafe}
        titleSafeRegion={titleSafeRegion} setTitleSafeRegion={setTitleSafeRegion}
        regenerate={regenerate}
        download={download}
        pinFavorite={pinFavorite}
        seed={seed}
        openBatch={() => setBatchOpen(true)}
      />
      <main className="stage">
        <div className="stage-head">
          <div className="stage-head-title">
            <span className="dot" /> Aplos Data Gradient Generator
          </div>
          <div className="stage-head-meta">
            <span>{dims.w} × {dims.h}</span>
            <span className="sep">/</span>
            <span>{lastStyle || style}</span>
            <span className="sep">/</span>
            <span>seed {seed}</span>
            {rendering && <span className="rendering">rendering…</span>}
          </div>
        </div>
        <div className="preview-wrap">
          <div className="preview-frame">
            <canvas ref={previewCanvasRef} className="preview" />
            <canvas ref={fullCanvasRef} style={{ display: 'none' }} />
            {showTitleSafe && <TitleSafeOverlay region={titleSafeRegion} />}
          </div>
        </div>
        <FavoritesStrip
          favorites={favorites}
          onRestore={restoreFavorite}
          onRemove={removeFavorite}
          onPin={pinFavorite}
        />
        <div className="stage-foot">
          <span>16:9 · standardized noise · {blur} blur · title-safe overlay {showTitleSafe ? 'on' : 'off'}</span>
        </div>
      </main>

      {batchOpen && (
        <BatchModal
          count={batchCount} setCount={setBatchCount}
          progress={batchProgress}
          onClose={() => !batchProgress && setBatchOpen(false)}
          onRun={runBatchExport}
          format={format}
          mode={mode}
        />
      )}
    </div>
  );
}

// ---- Title-safe overlay ----
function TitleSafeOverlay({ region }) {
  // Three preset regions matching common editorial layouts
  const regions = {
    left:   { x: '5%',   y: '50%', w: '40%', h: '40%' },
    center: { x: '20%',  y: '50%', w: '60%', h: '40%' },
    right:  { x: '55%',  y: '50%', w: '40%', h: '40%' },
  };
  const r = regions[region];
  return (
    <div className="title-safe-overlay" aria-hidden="true">
      <div
        className="title-safe-box"
        style={{
          left: r.x, top: r.y, width: r.w, height: r.h,
          transform: 'translateY(-50%)',
        }}
      >
        <span className="title-safe-label">TITLE-SAFE · NOT EXPORTED</span>
      </div>
    </div>
  );
}

// ---- Favorites strip ----
function FavoritesStrip({ favorites, onRestore, onRemove, onPin }) {
  return (
    <div className="favorites">
      <div className="favorites-head">
        <span className="favorites-title">Pinned</span>
        <span className="favorites-hint">
          {favorites.length === 0
            ? 'Pin variations to compare. Click to restore.'
            : `${favorites.length} of 12`}
        </span>
      </div>
      <div className="favorites-row">
        <button className="fav-pin-card" onClick={onPin} title="Pin current">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        {favorites.map(f => (
          <div className="fav-card" key={f.id}>
            <button className="fav-thumb" onClick={() => onRestore(f)}>
              <img src={f.thumb} alt="" />
              <span className="fav-meta">{f.cfg.actualStyle || f.cfg.style} · {f.cfg.mode}</span>
            </button>
            <button className="fav-remove" onClick={() => onRemove(f.id)} title="Remove">
              <svg viewBox="0 0 12 12" width="10" height="10"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </div>
        ))}
        {favorites.length === 0 && (
          <div className="fav-empty">No pinned variations yet.</div>
        )}
      </div>
    </div>
  );
}

// ---- Batch modal ----
function BatchModal({ count, setCount, progress, onClose, onRun, format, mode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Batch export</span>
          {!progress && (
            <button className="modal-close" onClick={onClose}>
              <svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>
        <div className="modal-body">
          <p className="modal-desc">
            Generate <strong>{count}</strong> variations using current style, mode, angle, and blur — each with a fresh seed. Downloads as a single ZIP.
          </p>
          <div className="section">
            <div className="section-head">
              <span className="section-title">Variations</span>
              <span className="section-suffix">{count}</span>
            </div>
            <input
              type="range" min="2" max="24" step="1"
              className="slider"
              value={count}
              disabled={!!progress}
              onChange={e => setCount(parseInt(e.target.value, 10))}
            />
            <div className="hint">Current: {format.toUpperCase()} · {mode} mode · current style/angle/blur</div>
          </div>
          {progress && (
            <div className="batch-progress">
              <div className="batch-bar">
                <div className="batch-bar-fill" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
              <div className="batch-progress-label">
                Rendering {progress.done} of {progress.total}…
              </div>
            </div>
          )}
        </div>
        <div className="modal-actions">
          {!progress && (
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          )}
          <button className="btn btn-primary" onClick={onRun} disabled={!!progress}>
            {progress ? 'Rendering…' : `Export ${count} as ZIP`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Sidebar ----
function Sidebar(props) {
  const {
    style, setStyle, mode, setMode, angle, setAngle, blur, setBlur,
    secondaryFamily, setSecondaryFamily,
    accentStrength, setAccentStrength, moveAccent,
    showLogo, setShowLogo, logoPos, setLogoPos,
    resolution, setResolution, format, setFormat,
    showTitleSafe, setShowTitleSafe, titleSafeRegion, setTitleSafeRegion,
    regenerate, download, pinFavorite, openBatch,
  } = props;
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="assets/aplos-logo-white.svg" className="brand-logo" alt="Aplos Data" />
      </div>

      <div className="controls">
        <Section title="Mode">
          <Segmented
            value={mode} onChange={setMode}
            options={MODES.map(m => ({ id: m.id, label: m.label, sub: m.sub }))}
            cols={3}
          />
        </Section>

        <Section title="Style">
          <Segmented
            value={style} onChange={setStyle}
            options={STYLES.map(s => ({ id: s.id, label: s.label }))}
            cols={3}
          />
        </Section>

        <Section title="Angle" suffix={`${angle}°`}>
          <Slider min={0} max={360} step={1} value={angle} onChange={setAngle} />
          <div className="angle-presets">
            {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
              <button key={a} className="chip"
                data-active={angle === a}
                onClick={() => setAngle(a)}>{a}°</button>
            ))}
          </div>
        </Section>

        <Section title="Secondary accent" suffix={!secondaryFamily ? 'off' : `${secondaryFamily} · ${accentStrength}`}>
          <div className="accent-row">
            {[
              { id: null, label: 'None', sw: null },
              { id: 'blue', label: 'Blue', sw: '#7aa9d6' },
              { id: 'purple', label: 'Purple', sw: '#a692c8' },
              { id: 'clay', label: 'Clay', sw: '#c89881' },
              { id: 'yellow', label: 'Yellow', sw: '#e6cf6a' },
            ].map(opt => (
              <button
                key={opt.id ?? 'none'}
                className={`accent-btn ${secondaryFamily === opt.id ? 'is-active' : ''}`}
                onClick={() => setSecondaryFamily(opt.id)}
                title={opt.label}
              >
                {opt.sw
                  ? <span className="accent-sw" style={{ background: opt.sw }} />
                  : <span className="accent-sw accent-sw-none" />}
                <span className="accent-label">{opt.label}</span>
              </button>
            ))}
          </div>
          <div className={`accent-strength-row ${!secondaryFamily ? 'is-disabled' : ''}`}>
            <div className="accent-strength-segmented">
              <Segmented
                value={accentStrength} onChange={setAccentStrength}
                options={[{ id: 'hint', label: 'Hint' }, { id: 'splash', label: 'Splash' }]}
                cols={2}
              />
            </div>
            <button
              className="accent-move"
              onClick={moveAccent}
              disabled={!secondaryFamily}
              title="Move accent — reroll blob position only"
            >
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                <path d="M3 6h7a3 3 0 0 1 0 6H6" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 4l-2 2 2 2" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13 10l-2 2 2 2" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Move
            </button>
          </div>
        </Section>

        <Section title="Blur">
          <Segmented
            value={blur} onChange={setBlur}
            options={BLURS.map(b => ({ id: b.id, label: b.label }))}
            cols={3}
          />
        </Section>

        <Section title="Logo overlay">
          <div className="row">
            <Toggle checked={showLogo} onChange={setShowLogo} label={showLogo ? 'On' : 'Off'} />
            <div className="logo-positions" data-disabled={!showLogo}>
              {LOGO_POSITIONS.map(p => (
                <button key={p.id} className="pos"
                  data-active={logoPos === p.id}
                  onClick={() => setLogoPos(p.id)}
                  disabled={!showLogo}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="hint">Color auto-flips for mode contrast.</div>
        </Section>

        <Section title="Title-safe guide">
          <div className="row">
            <Toggle checked={showTitleSafe} onChange={setShowTitleSafe} label={showTitleSafe ? 'On' : 'Off'} />
          </div>
          {showTitleSafe && (
            <Segmented
              value={titleSafeRegion} onChange={setTitleSafeRegion}
              options={TITLE_SAFE_REGIONS}
              cols={3}
            />
          )}
          <div className="hint">Preview-only guide — never exported.</div>
        </Section>

        <Section title="Resolution">
          <Select
            value={resolution}
            onChange={(v) => setResolution(parseInt(v, 10))}
            options={RESOLUTIONS.map(r => ({ id: r.id, label: `${r.label}${r.sub ? ' · ' + r.sub : ''}` }))}
          />
        </Section>

        <Section title="Format">
          <Segmented value={format} onChange={setFormat} options={FORMATS} cols={2} />
        </Section>
      </div>

      <div className="actions">
        <div className="actions-row">
          <button className="btn btn-secondary" onClick={regenerate}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M13.5 2.5v3h-3M2.5 13.5v-3h3" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 6.5A4.5 4.5 0 0 0 4 5M4 9.5A4.5 4.5 0 0 0 12 11" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Regenerate
          </button>
          <button className="btn btn-secondary" onClick={pinFavorite} title="Pin current variation">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Pin
          </button>
        </div>
        <div className="actions-row">
          <button className="btn btn-secondary" onClick={openBatch}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <rect x="2.5" y="2.5" width="5" height="5" stroke="currentColor" fill="none" strokeWidth="1.3" rx="0.6" />
              <rect x="8.5" y="2.5" width="5" height="5" stroke="currentColor" fill="none" strokeWidth="1.3" rx="0.6" />
              <rect x="2.5" y="8.5" width="5" height="5" stroke="currentColor" fill="none" strokeWidth="1.3" rx="0.6" />
              <rect x="8.5" y="8.5" width="5" height="5" stroke="currentColor" fill="none" strokeWidth="1.3" rx="0.6" />
            </svg>
            Batch
          </button>
          <button className="btn btn-primary" onClick={download}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M8 2v9m0 0L4.5 7.5M8 11l3.5-3.5" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2.5 13.5h11" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Download {format.toUpperCase()}
          </button>
        </div>
      </div>
    </aside>
  );
}

function Section({ title, suffix, children }) {
  return (
    <div className="section">
      <div className="section-head">
        <span className="section-title">{title}</span>
        {suffix && <span className="section-suffix">{suffix}</span>}
      </div>
      {children}
    </div>
  );
}

function Segmented({ value, onChange, options, cols = 2 }) {
  return (
    <div className="segmented" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {options.map(o => (
        <button key={o.id} className="seg"
          data-active={value === o.id}
          onClick={() => onChange(o.id)}>
          <span className="seg-label">{o.label}</span>
          {o.sub && <span className="seg-sub">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

function Slider({ min, max, step, value, onChange, disabled }) {
  return (
    <input type="range" className="slider"
      min={min} max={max} step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button className="toggle" data-on={checked} onClick={() => onChange(!checked)}>
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      <span className="toggle-label">{label}</span>
    </button>
  );
}

function Select({ value, onChange, options }) {
  return (
    <div className="select-wrap">
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <svg viewBox="0 0 12 12" width="12" height="12" className="select-caret" aria-hidden="true">
        <path d="M3 4.5L6 8 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
