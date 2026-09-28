import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, setAuthToken } from '@shared/api/client';
import type { Rental, Session } from '@shared/api/types';
import { setSocketAuth } from '@shared/realtime/socket';
import { LoginScreen } from './account/LoginScreen';
import { ScooterPicker } from './account/ScooterPicker';
import { clearSession, loadSession, saveSession, type StoredSession } from './account/storedSession';
import { DriverScreen, RideEnd } from './DriverScreen';

/** Ekran akışı: giriş → scooter seçimi → sürüş → (sürüş bitince) scooter seçimi. */
const Screen = {
  /** Saklı oturum doğrulanıyor, süren kiralama aranıyor. */
  CHECKING: 'checking',
  SIGNED_OUT: 'signed-out',
  PICKING: 'picking',
  RIDING: 'riding',
} as const;

type Phase =
  | { kind: typeof Screen.CHECKING }
  | { kind: typeof Screen.SIGNED_OUT; notice: string | null }
  | { kind: typeof Screen.PICKING; notice: string | null }
  | { kind: typeof Screen.RIDING; scooterId: string };

const stored = loadSession();
// Kimlik ilk istekten önce bağlansın: DriverScreen açılır açılmaz istek atar.
setAuthToken(stored?.token ?? null);
setSocketAuth(stored?.token ?? null);

const endNotice = (end: RideEnd, scooterId: string) =>
  end === RideEnd.RETURNED
    ? `${scooterId} bırakıldı.`
    : `${scooterId} kiralaması sona erdi: uzun süre konum gönderilemedi (sinyal kaybı). Scooter başka sürücülere açıldı.`;

export function App() {
  const [session, setSession] = useState<StoredSession | null>(stored);
  const [phase, setPhase] = useState<Phase>(
    stored ? { kind: Screen.CHECKING } : { kind: Screen.SIGNED_OUT, notice: null },
  );

  const signOut = useCallback((notice: string | null) => {
    clearSession();
    setAuthToken(null);
    setSocketAuth(null);
    setSession(null);
    setPhase({ kind: Screen.SIGNED_OUT, notice });
  }, []);

  /** Oturumu doğrular ve süren bir kiralama varsa (sayfa yenilendi) sürüşe döner. */
  const resume = useCallback(async () => {
    try {
      const rental = await api.currentRental();
      setPhase(rental ? { kind: Screen.RIDING, scooterId: rental.scooterId } : { kind: Screen.PICKING, notice: null });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) signOut('Oturumun süresi doldu, tekrar giriş yap.');
      else setPhase({ kind: Screen.PICKING, notice: `Sunucuya ulaşılamadı: ${(err as Error).message}` });
    }
  }, [signOut]);

  useEffect(() => {
    if (phase.kind === Screen.CHECKING) void resume();
  }, [phase.kind, resume]);

  const onSignedIn = (s: Session) => {
    const next = { token: s.token, rider: s.rider };
    saveSession(next);
    setAuthToken(s.token);
    setSocketAuth(s.token);
    setSession(next);
    setPhase({ kind: Screen.CHECKING });
  };

  const logout = async () => {
    await api.logout().catch(() => undefined);
    signOut(null);
  };

  const onRented = (rental: Rental) => setPhase({ kind: Screen.RIDING, scooterId: rental.scooterId });
  const onRideEnded = useCallback(
    (end: RideEnd, scooterId: string) => setPhase({ kind: Screen.PICKING, notice: endNotice(end, scooterId) }),
    [],
  );
  const onSessionExpired = useCallback(() => signOut('Oturumun süresi doldu, tekrar giriş yap.'), [signOut]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="brand__mark" aria-hidden="true" />
          Bölge Takip
          <span className="brand__role">Sürücü</span>
        </span>
        {session ? (
          <span className="topbar__status account">
            <span>{session.rider.username}</span>
            {/* Sürüş sırasında çıkış yok: önce scooter bırakılmalı. */}
            {phase.kind !== Screen.RIDING ? (
              <button type="button" className="account__logout" onClick={() => void logout()}>
                Çıkış yap
              </button>
            ) : null}
          </span>
        ) : null}
      </header>
      <main>
        {phase.kind === Screen.CHECKING ? <p className="loading">Oturum kontrol ediliyor…</p> : null}
        {phase.kind === Screen.SIGNED_OUT ? (
          <>
            {phase.notice ? <p className="notice gate__notice">{phase.notice}</p> : null}
            <LoginScreen onSignedIn={onSignedIn} />
          </>
        ) : null}
        {phase.kind === Screen.PICKING ? <ScooterPicker notice={phase.notice} onRented={onRented} /> : null}
        {phase.kind === Screen.RIDING ? (
          <DriverScreen
            key={phase.scooterId}
            scooterId={phase.scooterId}
            onRideEnded={onRideEnded}
            onSessionExpired={onSessionExpired}
          />
        ) : null}
      </main>
    </div>
  );
}
