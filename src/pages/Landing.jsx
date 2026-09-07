import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Razekit opening — faithful rebuild of the 3-page onboarding mockup (Razekit Web.html).
// Public entry: Get Started -> register, Log in -> login. Plus Jakarta Sans + IBM Plex Mono.
const BLUE = '#1668f2';
const NAVY = '#0d1b3a';
const MUTED = '#5b6b85';
const jakarta = "'Plus Jakarta Sans', system-ui, sans-serif";
const mono = "'IBM Plex Mono', ui-monospace, monospace";

function Mark({ w = 44, h = 32 }) {
  const u = w / 44;
  const cell = { position: 'absolute', width: 23 * u, height: 12 * u, transform: 'skewX(-22deg)', borderRadius: 2 };
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      <div style={{ ...cell, left: 0, top: 20 * u, background: 'linear-gradient(135deg,#1b2f5e,#0d1b3a)' }} />
      <div style={{ ...cell, left: 10 * u, top: 10 * u, background: 'linear-gradient(135deg,#2f7bf5,#0f47c2)' }} />
      <div style={{ ...cell, left: 20 * u, top: 0, background: 'linear-gradient(135deg,#31d3ff,#1479f5)' }} />
    </div>
  );
}
const Wordmark = ({ size = 22 }) => (
  <span style={{ fontFamily: jakarta, fontSize: size, fontWeight: 700, letterSpacing: '-.03em', color: NAVY }}>Raze<span style={{ color: '#1479f5' }}>kit</span></span>
);
const Badge = ({ children }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '7px 14px', borderRadius: 999, background: 'rgba(255,255,255,.8)', border: '1px solid rgba(22,104,242,.14)', fontSize: 12, fontWeight: 600, letterSpacing: '.06em', color: BLUE, textTransform: 'uppercase', fontFamily: jakarta }}>{children}</div>
);
const Primary = ({ children, onClick }) => (
  <button onClick={onClick} style={{ border: 0, cursor: 'pointer', fontFamily: jakarta, fontSize: 16, fontWeight: 700, color: '#fff', background: BLUE, padding: '16px 30px', borderRadius: 999, boxShadow: '0 14px 30px rgba(22,104,242,.3)' }}>{children}</button>
);
const panel = { position: 'relative', borderRadius: 28, padding: 44, border: '1px solid rgba(255,255,255,.9)', boxShadow: '0 30px 70px rgba(22,104,242,.15)', minHeight: 480, display: 'grid', placeItems: 'center' };
const hatch = { position: 'absolute', inset: 0, borderRadius: 28, backgroundImage: 'repeating-linear-gradient(135deg,rgba(22,104,242,.05) 0 2px,transparent 2px 11px)' };
const H1 = ({ children }) => <h1 style={{ margin: '22px 0 0', fontSize: 'clamp(38px,6vw,64px)', lineHeight: 1.04, letterSpacing: '-.035em', fontWeight: 800, fontFamily: jakarta }}>{children}</h1>;
const Sub = ({ children }) => <p style={{ margin: '24px 0 0', maxWidth: '30em', fontSize: 19, lineHeight: 1.6, color: MUTED }}>{children}</p>;

export default function Landing() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const go = (n) => { setPage(n); window.scrollTo(0, 0); };
  const next = () => go(page === 3 ? 1 : page + 1);
  const taglines = { 1: 'Create · Compete · Win · Grow', 2: 'Real creativity. Real opportunities.', 3: 'More creators. A brighter tomorrow.' };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(120% 80% at 80% 0%,#e2edff 0%,#f4f9ff 45%,#fbfdff 100%)', color: '#0b1220', fontFamily: jakarta }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, backdropFilter: 'blur(18px)', background: 'rgba(255,255,255,.72)', borderBottom: '1px solid rgba(22,104,242,.08)' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><Mark /><Wordmark /></div>
          <nav style={{ display: 'none', gap: 28, marginLeft: 'auto', fontSize: 14.5, fontWeight: 500, color: MUTED }} className="rz-nav">
            <button onClick={() => go(1)} style={navBtn}>Contests</button>
            <button onClick={() => go(2)} style={navBtn}>Creators</button>
            <button onClick={() => go(2)} style={navBtn}>How it works</button>
            <button onClick={() => go(3)} style={navBtn}>Pricing</button>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 'auto' }}>
            <button onClick={() => navigate('/login')} style={{ ...navBtn, color: '#8695ad' }}>Log in</button>
            <button onClick={() => navigate('/register')} style={{ border: 0, cursor: 'pointer', fontFamily: jakarta, fontSize: 14.5, fontWeight: 600, color: '#fff', background: BLUE, padding: '11px 22px', borderRadius: 999, boxShadow: '0 8px 20px rgba(22,104,242,.28)' }}>Get Started</button>
          </div>
        </div>
      </header>

      {/* Page 1 */}
      {page === 1 && (
        <main style={mainGrid('1.02fr 1fr')}>
          <div>
            <Badge><span style={dotPlus}>+</span>For brands</Badge>
            <H1>Create opportunities that <span style={{ color: BLUE }}>inspire.</span></H1>
            <Sub>Launch creative contests, set your goals, and let the world's best creators bring your vision to life.</Sub>
            <div style={{ margin: '36px 0 0', display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              <Primary onClick={() => navigate('/register')}>Launch a contest &nbsp;→</Primary>
              <button onClick={() => navigate('/register')} style={ghost}>See examples</button>
            </div>
            <div style={{ margin: '44px 0 0', display: 'flex', gap: 44, flexWrap: 'wrap' }}>
              {[['Open', 'contests, live now'], ['Verified', 'creators competing'], ['Secure', 'prize payouts']].map(([n, l]) => (
                <div key={l}><div style={stat}>{n}</div><div style={statLbl}>{l}</div></div>
              ))}
            </div>
          </div>
          <div style={{ ...panel, background: 'linear-gradient(155deg,rgba(255,255,255,.9),rgba(222,236,255,.75))' }}>
            <div style={hatch} />
            <div style={{ position: 'relative', width: '100%', maxWidth: 330, animation: 'rzFloat 7s ease-in-out infinite' }}>
              <div style={{ position: 'absolute', top: -26, left: -30, width: 180, height: 180, borderRadius: 20, background: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.9)', boxShadow: '0 18px 40px rgba(22,104,242,.12)' }} />
              <div style={{ position: 'relative', background: 'rgba(255,255,255,.94)', border: '1px solid rgba(255,255,255,.95)', borderRadius: 24, padding: '30px 26px 34px', boxShadow: '0 26px 60px rgba(22,104,242,.18)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
                <div style={{ width: 66, height: 66, borderRadius: '50%', background: BLUE, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 32, boxShadow: '0 12px 26px rgba(22,104,242,.4)' }}>+</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>New Contest</div>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ height: 11, borderRadius: 6, background: '#e6eefc' }} />
                  <div style={{ height: 11, borderRadius: 6, background: '#eef3fc', width: '76%' }} />
                  <div style={{ height: 11, borderRadius: 6, background: '#eef3fc', width: '54%' }} />
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Page 2 */}
      {page === 2 && (
        <main style={mainGrid('1fr 1.02fr')}>
          <div style={{ ...panel, background: 'linear-gradient(155deg,rgba(255,255,255,.9),rgba(219,234,255,.8))', order: 2 }} className="rz-illo">
            <div style={hatch} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16, animation: 'rzFloat 8s ease-in-out infinite' }}>
              <div style={miniCard(118, 186)}><div style={{ height: 66, borderRadius: 12, background: '#3d8bff', display: 'grid', placeItems: 'center', color: '#fff' }}>▶</div><div style={bar()} /><div style={bar('70%')} /></div>
              <div style={{ ...miniCard(132, 216), boxShadow: '0 24px 50px rgba(22,104,242,.2)' }}><div style={{ flex: 1, borderRadius: 12, background: '#dcebff', display: 'grid', placeItems: 'center', color: '#7aaaff', fontSize: 22 }}>◍</div><div style={bar('60%')} /></div>
              <div style={miniCard(104, 160)} />
            </div>
          </div>
          <div>
            <Badge>Step 02 · The competition</Badge>
            <H1>Creators compete. <span style={{ color: BLUE }}>Great work wins.</span></H1>
            <Sub>Talented creators submit their best work, you choose the winner, and creativity turns into real value.</Sub>
            <div style={{ margin: '34px 0 0', display: 'grid', gap: 12 }}>
              {['Briefs go live to a global creator pool', 'Entries arrive in one reviewable feed', 'You pick the winner and pay in one click'].map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '16px 18px', borderRadius: 16, background: 'rgba(255,255,255,.85)', border: '1px solid rgba(22,104,242,.1)' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: '#e6f0ff', color: BLUE, display: 'grid', placeItems: 'center', fontWeight: 700 }}>{i + 1}</div>
                  <div style={{ fontSize: 15.5, fontWeight: 600 }}>{t}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 32 }}><Primary onClick={() => navigate('/register')}>Browse live contests &nbsp;→</Primary></div>
          </div>
        </main>
      )}

      {/* Page 3 */}
      {page === 3 && (
        <main style={mainGrid('1.02fr 1fr')}>
          <div>
            <Badge>For creators</Badge>
            <H1>Winners build bigger <span style={{ color: BLUE }}>futures.</span></H1>
            <Sub>Get paid, gain exposure, grow your portfolio, and unlock new opportunities on Razekit.</Sub>
            <div style={{ margin: '34px 0 0', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {[['$', 'Get Paid'], ['●', 'Get Noticed'], ['▲', 'Grow']].map(([ic, t]) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px 11px 11px', borderRadius: 999, background: '#fff', border: '1px solid rgba(22,104,242,.12)', boxShadow: '0 10px 24px rgba(22,104,242,.1)' }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: BLUE, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>{ic}</span>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{t}</span>
                </div>
              ))}
            </div>
            <div style={{ margin: '36px 0 0', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
              <Primary onClick={() => navigate('/register')}>Get Started &nbsp;→</Primary>
              <span style={{ fontSize: 14, color: '#8695ad', fontWeight: 500 }}>Free to join · No fees on your first win</span>
            </div>
          </div>
          <div style={{ ...panel, background: 'linear-gradient(155deg,rgba(255,255,255,.88),rgba(210,229,255,.85))' }} className="rz-illo">
            <div style={hatch} />
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'rzFloat 9s ease-in-out infinite' }}>
              <div style={{ width: 132, height: 132, borderRadius: '0 0 46px 46px', background: 'linear-gradient(170deg,#4d95ff,#0b45b8)', display: 'grid', placeItems: 'center', boxShadow: '0 22px 44px rgba(11,69,184,.35)' }}>
                <Mark w={52} h={38} />
              </div>
              <div style={{ width: 96, height: 20, background: '#2f7bf5', borderRadius: 4, marginTop: -2 }} />
              <div style={{ width: 150, height: 26, background: 'rgba(255,255,255,.85)', borderRadius: 6, marginTop: 4 }} />
              <div style={{ width: 190, height: 22, background: 'rgba(255,255,255,.6)', borderRadius: 6, marginTop: 4 }} />
            </div>
          </div>
        </main>
      )}

      {/* Carousel controls */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '26px 24px 56px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: mono, fontSize: 12.5, color: '#8695ad' }}>0{page} / 03</span>
        <div style={{ display: 'flex', gap: 9 }}>
          {[1, 2, 3].map((n) => <button key={n} onClick={() => go(n)} aria-label={`Page ${n}`} style={{ border: 0, cursor: 'pointer', padding: 0, width: 11, height: 11, borderRadius: '50%', background: page === n ? BLUE : '#cfdcf0' }} />)}
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.18em', color: '#9aa9c0', textTransform: 'uppercase' }}>{taglines[page]}</span>
        <button onClick={next} aria-label="Next" style={{ marginLeft: 'auto', border: '1px solid rgba(11,18,32,.08)', cursor: 'pointer', width: 56, height: 56, borderRadius: '50%', background: '#fff', fontSize: 20, color: '#0b1220', boxShadow: '0 12px 28px rgba(22,104,242,.14)' }}>→</button>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(22,104,242,.08)', background: 'rgba(255,255,255,.6)' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', fontSize: 13, color: '#8695ad' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><Mark w={30} h={22} /><Wordmark size={15} /></span>
          <span style={{ letterSpacing: '.16em', textTransform: 'uppercase', fontSize: 11 }}>Create · Compete · Win · Grow</span>
          <span style={{ marginLeft: 'auto' }}>© 2026 Razekit</span>
        </div>
      </footer>

      <style>{`@keyframes rzFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}} @media(min-width:900px){.rz-nav{display:flex!important}} @media(max-width:860px){.rz-illo{display:none!important} main.rz-main{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}

const navBtn = { background: 'none', border: 0, cursor: 'pointer', fontFamily: jakarta, fontSize: 14.5, fontWeight: 500, color: MUTED, padding: 0 };
const dotPlus = { width: 20, height: 20, borderRadius: '50%', background: BLUE, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, lineHeight: 1 };
const ghost = { cursor: 'pointer', fontFamily: jakarta, fontSize: 16, fontWeight: 600, color: '#0b1220', background: 'rgba(255,255,255,.85)', border: '1px solid rgba(11,18,32,.1)', padding: '16px 26px', borderRadius: 999 };
const stat = { fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', fontFamily: jakarta };
const statLbl = { fontSize: 13, color: '#8695ad', fontWeight: 500 };
const mainGrid = (cols) => ({ maxWidth: 1240, margin: '0 auto', padding: '64px 24px 40px', display: 'grid', gridTemplateColumns: cols.split(' ').map((c) => `minmax(0,${c})`).join(' '), gap: 56, alignItems: 'center' });
const miniCard = (w, h) => ({ width: w, height: h, borderRadius: 18, background: 'rgba(255,255,255,.9)', border: '1px solid rgba(255,255,255,.95)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 16px 36px rgba(22,104,242,.12)' });
const bar = (w = '100%') => ({ height: 9, borderRadius: 5, background: '#eef3fc', width: w });