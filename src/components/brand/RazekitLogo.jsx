// Razekit brand mark components — used in Layout sidebar and nav bars.
// Uses the uploaded wordmark image; falls back to a styled SVG wordmark if needed.

const WORDMARK_URL = 'https://media.base44.com/images/public/6a56806fb5a83c449f3f5db9/2818395d2_ChatGPTImageSep6202603_03_24AM.png';
const ICON_URL     = 'https://media.base44.com/images/public/6a56806fb5a83c449f3f5db9/7bbb878fd_ChatGPTImageSep5202609_48_00PM.png';

/** Full horizontal wordmark — sidebar header & auth pages */
export function RazekitWordmark({ className = '', height = 28 }) {
  return (
    <img
      src={WORDMARK_URL}
      alt="Razekit"
      height={height}
      style={{ height: `${height}px`, width: 'auto', objectFit: 'contain' }}
      className={className}
      onError={(e) => {
        // Fallback: styled text wordmark
        e.currentTarget.style.display = 'none';
        const span = document.createElement('span');
        span.textContent = 'Razekit';
        span.className = 'font-display font-extrabold text-[1.15rem] tracking-tight';
        span.style.background = 'linear-gradient(135deg, #1A7BF8 0%, #0B48E8 100%)';
        span.style.webkitBackgroundClip = 'text';
        span.style.webkitTextFillColor = 'transparent';
        e.currentTarget.parentNode.appendChild(span);
      }}
    />
  );
}

/** Square icon mark — collapsed sidebar / favicon fallback */
export function RazekitIcon({ size = 32, className = '' }) {
  return (
    <img
      src={ICON_URL}
      alt="Razekit"
      width={size}
      height={size}
      style={{ width: `${size}px`, height: `${size}px`, objectFit: 'contain' }}
      className={`rounded-xl ${className}`}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        const div = document.createElement('div');
        div.style.cssText = `width:${size}px;height:${size}px;border-radius:10px;background:linear-gradient(135deg,#1A7BF8,#0B48E8);display:flex;align-items:center;justify-content:center;`;
        div.innerHTML = '<span style="color:white;font-weight:800;font-size:14px;font-family:Sora,sans-serif">R</span>';
        e.currentTarget.parentNode.appendChild(div);
      }}
    />
  );
}