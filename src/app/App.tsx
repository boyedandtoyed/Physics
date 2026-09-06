import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { simulations, type SimulationEntry } from '../registry/sims';
const PhysicsPanel = lazy(() => import('../ui/PhysicsPanel').then(module => ({ default: module.PhysicsPanel })));

type Theme = 'system' | 'light' | 'dark';
function readTheme(): Theme {
  try {
    const saved = localStorage.getItem('abstract-physics-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* A blocked storage API must not prevent startup. */ }
  return 'system';
}

class RouteError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <section role="alert"><h1>This simulation could not load.</h1><p>Check your connection and reload the page.</p><a href="/">Return to the collection</a></section> : this.props.children;
  }
}

export function App({ entries = simulations }: { entries?: readonly SimulationEntry[] }) {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  const routes = useMemo(() => entries.map(entry => ({ ...entry, View: lazy(entry.load) })), [entries]);
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('abstract-physics-theme', theme); } catch { /* Optional preference. */ }
  }, [theme]);
  useEffect(() => {
    document.title = location.pathname === '/' ? 'Abstract Physics' : `${location.pathname === '/method' ? 'Our method' : entries.find(e => `/sims/${e.id}` === location.pathname)?.title ?? 'Page not found'} · Abstract Physics`;
    if (previousPath.current !== location.pathname) main.current?.focus();
    previousPath.current = location.pathname;
  }, [location.pathname, entries]);
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header>
      <Link to="/" className="brand"><span className="brand-mark" aria-hidden="true">∂</span> Abstract Physics</Link>
      <nav aria-label="Main"><NavLink to="/">Collection</NavLink><NavLink to="/method">Our method</NavLink></nav>
      <label className="theme-control">Theme <select value={theme} onChange={e => setTheme(e.target.value as Theme)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
    </header>
    <main id="main" ref={main} tabIndex={-1}>
      <RouteError key={location.pathname}><Suspense fallback={<p role="status">Loading simulation…</p>}><Routes>
        <Route path="/" element={<Gallery entries={entries} />} />
        <Route path="/method" element={<Method />} />
        {routes.map(({ id, View }) => <Route key={id} path={`/sims/${id}`} element={<View />} />)}
        <Route path="*" element={<section className="hero"><p className="eyebrow">Outside the collection</p><h1>Nothing at these coordinates.</h1><p>This page doesn’t exist. The collection is a good place to start.</p><Link to="/">Back to the collection →</Link></section>} />
      </Routes></Suspense></RouteError>
    </main>
    <footer><span>Abstract Physics</span><span>Equations first. Assumptions in the open.</span><Link to="/method">How we check our work ↗</Link></footer>
  </>;
}

function Gallery({ entries }: { entries: readonly SimulationEntry[] }) {
  return <>
    <section className="hero">
      <p className="eyebrow">A laboratory for the universe</p>
      <h1>Wonder is the start.<br /><em>Understanding</em> is the work.</h1>
      <p className="intro">Explore space, time, and the physics beneath the familiar picture. Real equations. Visible assumptions. Room to ask better questions.</p>
      <Link className="text-link" to="/method">Meet the method <span aria-hidden="true">↗</span></Link>
    </section>
    <section className="collection" aria-labelledby="collection-heading">
      <div className="section-heading"><h2 id="collection-heading">The collection</h2><span>Foundation stage</span></div>
      {entries.length ? <div className="sim-grid">{entries.map(entry => <article key={entry.id}><h3><Link to={`/sims/${entry.id}`}>{entry.title}</Link></h3><p>{entry.description}</p><p>{entry.tags.join(' · ')}</p></article>)}</div> : <article className="coming-next">
        <div><p className="eyebrow">First experiment · In development</p><h3>When light meets<br />a black hole.</h3><p>Trace the geometry that bends starlight. Our first simulation will explore a non-rotating black hole, with its equations and limitations alongside the view.</p></div>
        <aside><span className="status-label">Not available yet</span><p>We’re building and testing the numerical foundation first. There are no playable simulations in this release.</p><Link to="/method">What we’re checking →</Link></aside>
      </article>}
    </section>
    <section className="principles" aria-label="Our commitments"><article><p className="eyebrow">01 / Accuracy</p><h2>The calculation comes first.</h2><p>Known results are benchmarks to reproduce, not details to approximate away.</p></article><article><p className="eyebrow">02 / Honesty</p><h2>Every model has edges.</h2><p>Approximations and common misconceptions belong beside the explanation, not in fine print.</p></article><article><p className="eyebrow">03 / Access</p><h2>More than a picture.</h2><p>Keyboard controls, readable equations, and meaningful descriptions are part of the design.</p></article></section>
  </>;
}

function Method() {
  return <section className="method"><p className="eyebrow">Behind the experiments</p><h1>Trust the checks,<br />not the picture.</h1><p className="intro">A convincing image isn’t evidence of correct physics. We start with reference problems whose answers we can calculate independently.</p><h2>A small system, a demanding test</h2><p>The harmonic oscillator is one of our numerical reference problems. Its exact solution lets us measure how numerical errors shrink as we reduce the time step.</p>
    <PhysicsPanel equation={String.raw`\ddot q=-q,\qquad q(t)=\cos t,\qquad v(t)=-\sin t`} assumptions={[
      'Dimensionless test system with angular frequency 1 and initial state q = 1, v = 0. This is not a model of motion around a black hole.',
      'CPU calculations use float64. RK4 and Yoshida-4 have fourth-order global accuracy; velocity Verlet has second-order accuracy for smooth solutions.',
      'Symplectic methods here require an autonomous, position-dependent acceleration and fixed time steps. Energy error is bounded for our stable oscillator test, not identically zero.',
      'Finite steps introduce truncation error. We test convergence and stated tolerances rather than claiming exact numerical trajectories.',
    ]} sources={[{ title: 'Hairer, Lubich & Wanner — Geometric Numerical Integration (2006)', url: 'https://doi.org/10.1007/3-540-30666-8' }, { title: 'Yoshida — Construction of higher order symplectic integrators (1990)', url: 'https://doi.org/10.1016/0375-9601(90)90092-3' }]} />
    <h2>What is verified now?</h2><p>Our current tests cover integrator convergence, forward/backward symmetry, long-run oscillator energy, and Newtonian orbit closure at a specified resolution. These checks validate the numerical building blocks—not a black-hole renderer or a future simulation.</p><h2>What comes next?</h2><p>A Schwarzschild lensing simulation with independent tests of photon-sphere and shadow geometry, explicit model assumptions, and accessible controls. It will join the collection only when it is ready.</p>
  </section>;
}
