import { lazy, Suspense, useEffect, useState } from 'react';
import { LiveMap } from './live/LiveMap';
import { LogsView } from './logs/LogsView';
import { SystemStatus } from './SystemStatus';

// Çizim aracını içeren ekran ayrı pakete bölünür.
const AreasEditor = lazy(() => import('./areas/AreasEditor').then((m) => ({ default: m.AreasEditor })));

const ROUTES = [
  { hash: '#/live', label: 'Canlı izleme' },
  { hash: '#/logs', label: 'Giriş kayıtları' },
  { hash: '#/areas', label: 'Alanlar' },
] as const;

type Route = (typeof ROUTES)[number]['hash'];

const current = (): Route => ROUTES.find((r) => r.hash === window.location.hash)?.hash ?? '#/live';

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
        <a className="brand" href="#/live">
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
        <SystemStatus />
      </header>
      <main>
        {route === '#/live' ? <LiveMap /> : null}
        {route === '#/logs' ? <LogsView /> : null}
        {route === '#/areas' ? (
          <Suspense fallback={<div className="loading">Harita araçları yükleniyor</div>}>
            <AreasEditor />
          </Suspense>
        ) : null}
      </main>
    </div>
  );
}
