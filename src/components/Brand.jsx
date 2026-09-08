// RazeKit brand lockup — the locked mark (blue diagonal stacked parallelograms)
// + wordmark ("Raze" navy, "kit" blue). Do not alter the mark or the wordmark text.

export function RazekitMark({ size = 32 }) {
  const u = size / 44;
  const cell = { position: 'absolute', width: 23 * u, height: 12 * u, transform: 'skewX(-22deg)', borderRadius: 2 };
  return (
    <div style={{ position: 'relative', width: size, height: (32 / 44) * size }} aria-hidden="true">
      <div style={{ ...cell, left: 0, top: 20 * u, background: 'linear-gradient(135deg,#1b2f5e,#0d1b3a)' }} />
      <div style={{ ...cell, left: 10 * u, top: 10 * u, background: 'linear-gradient(135deg,#2f7bf5,#0f47c2)' }} />
      <div style={{ ...cell, left: 20 * u, top: 0, background: 'linear-gradient(135deg,#31d3ff,#1479f5)' }} />
    </div>
  );
}

export function RazekitWordmark({ size = 22 }) {
  return (
    <span style={{ fontFamily: '"Inter Tight", Inter, sans-serif', fontSize: size, fontWeight: 800, letterSpacing: '-0.03em', color: '#0d1b3a', lineHeight: 1 }}>
      Raze<span style={{ color: '#1479f5' }}>kit</span>
    </span>
  );
}

export function RazekitLogo({ mark = 32, word = 22, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <RazekitMark size={mark} />
      <RazekitWordmark size={word} />
    </span>
  );
}
