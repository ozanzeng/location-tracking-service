import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { api, ApiError, setAuthToken, setUnauthorizedHandler } from '@shared/api/client';
import type { AdminSession } from '@shared/api/types';
import { setSocketAuth } from '@shared/realtime/socket';
import { AdminLogin } from './account/AdminLogin';
import { clearAdminSession, loadAdminSession, saveAdminSession } from './account/storedAdminSession';
import { FleetView } from './fleet/FleetView';
import { LiveMap } from './live/LiveMap';
import { LogsView } from './logs/LogsView';
import { SystemStatus } from './SystemStatus';
import { ROUTES, EXPIRED_NOTICE } from './app.constants';
import { type Route, Gate, type GateState } from './app.types';
import type { StoredAdminSession } from './account/account.types';

// Çizim aracını içeren ekran ayrı pakete bölünür.
const AreasEditor = lazy(() => import('./areas/AreasEditor').then((m) => ({ default: m.AreasEditor })));

const current = (): Route => ROUTES.find((r) => r.hash === window.location.hash)?.hash ?? '#/live';

const stored = loadAdminSession();
// Kimlik ilk istekten önce bağlansın: ekranlar açılır açılmaz istek atar ve canlı yayına bağlanır.
setAuthToken(stored?.token ?? null);
setSocketAuth(stored?.token ?? null);

export function App() {
  const [route, setRoute] = useState<Route>(current);
  const [session, setSession] = useState<StoredAdminSession | null>(stored);
  const [gate, setGate] = useState<GateState>(
    stored ? { kind: Gate.CHECKING } : { kind: Gate.SIGNED_OUT, notice: null },
  );

  useEffect(() => {
    const onHash = () => setRoute(current());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const signOut = useCallback((notice: string | null) => {
    clearAdminSession();
    setAuthToken(null);
    setSocketAuth(null);
    setSession(null);
    setGate({ kind: Gate.SIGNED_OUT, notice });
  }, []);

  // Herhangi bir ekranın isteği oturum düştüğü için 401 alırsa giriş ekranına dönülür.
  useEffect(() => {
    setUnauthorizedHandler(() => signOut(EXPIRED_NOTICE));
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  // Saklı oturum hâlâ geçerli mi? Sunucuya ulaşılamıyorsa panel açılır: üst çubuktaki durum
  // sorunu gösterir, oturum sunucu dönünce doğrulanır (ilk 401'de giriş ekranı).
  useEffect(() => {
    if (gate.kind !== Gate.CHECKING) return;
    api.adminMe().then(
      () => setGate({ kind: Gate.SIGNED_IN }),
      (err: unknown) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) signOut(EXPIRED_NOTICE);
        else setGate({ kind: Gate.SIGNED_IN });
      },
    );
  }, [gate.kind, signOut]);

  const onSignedIn = (s: AdminSession) => {
    const next = { token: s.token, admin: s.admin };
    saveAdminSession(next);
    setAuthToken(s.token);
    setSocketAuth(s.token);
    setSession(next);
    setGate({ kind: Gate.SIGNED_IN });
  };

  const logout = async () => {
    await api.adminLogout().catch(() => undefined);
    signOut(null);
  };

  const signedIn = gate.kind === Gate.SIGNED_IN;

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/live">
          <span className="brand__mark" aria-hidden="true" />
          Bölge Takip
        </a>
        {signedIn ? (
          <nav aria-label="Ekranlar">
            {ROUTES.map((r) => (
              <a key={r.hash} href={r.hash} aria-current={route === r.hash ? 'page' : undefined}>
                {r.label}
              </a>
            ))}
          </nav>
        ) : null}
        <SystemStatus />
        {signedIn && session ? (
          <span className="account">
            <span>{session.admin.username}</span>
            <button type="button" className="account__logout" onClick={() => void logout()}>
              Çıkış yap
            </button>
          </span>
        ) : null}
      </header>
      <main>
        {gate.kind === Gate.CHECKING ? <p className="loading">Oturum kontrol ediliyor…</p> : null}
        {gate.kind === Gate.SIGNED_OUT ? <AdminLogin notice={gate.notice} onSignedIn={onSignedIn} /> : null}
        {signedIn && route === '#/live' ? <LiveMap /> : null}
        {signedIn && route === '#/logs' ? <LogsView /> : null}
        {signedIn && route === '#/scooters' ? <FleetView /> : null}
        {signedIn && route === '#/areas' ? (
          <Suspense fallback={<div className="loading">Harita araçları yükleniyor</div>}>
            <AreasEditor />
          </Suspense>
        ) : null}
      </main>
    </div>
  );
}
