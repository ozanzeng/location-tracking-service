import { lazy, Suspense, useEffect, useState } from 'react';
import { Simulator } from './views/Simulator';
import { Monitor } from './views/Monitor';

// Çizim aracını içeren ekran ayrı pakete bölünür.
const AreasEditor = lazy(() => import('./views/AreasEditor').then((m) => ({ default: m.AreasEditor })));

const ROUTES = [
  { hash: '#/simulator', label: 'Simülatör' },
  { hash: '#/monitor', label: 'Canlı izleme' },
  { hash: '#/areas', label: 'Alanlar' },
] as const;

type Route = (typeof ROUTES)[number]['hash'];

const current = (): Route => ROUTES.find((r) => r.hash === window.location.hash)?.hash ?? '#/simulator';

export function App() {
  const [route, setRoute] = useState<Route>(current);

  useEffect(() => {
    const onHash = () => setRoute(current());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/simulator">
          <span className="brand__mark" aria-hidden="true" />
          Bölge Takip
        </a>
        <nav aria-label="Ekranlar">
          {ROUTES.map((r) => (
            <a key={r.hash} href={r.hash} aria-current={route === r.hash ? 'page' : undefined}>
              {r.label}
            </a>
          ))}
        </nav>
      </header>
      <main>
        {route === '#/simulator' ? <Simulator /> : null}
        {route === '#/monitor' ? <Monitor /> : null}
        {route === '#/areas' ? (
          <Suspense fallback={<div className="loading">Harita araçları yükleniyor</div>}>
            <AreasEditor />
          </Suspense>
        ) : null}
      </main>
    </div>
  );
}
