import { type FormEvent, useState } from 'react';
import { api, ApiError } from '@shared/api/client';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@shared/api/limits';
import type { Session } from '@shared/api/types';
import { Mode } from './account.types';

/** Giriş ya da üyelik; ikisi de oturum açar. */
export function LoginScreen({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [mode, setMode] = useState<Mode>(Mode.LOGIN);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session =
        mode === Mode.LOGIN ? await api.login(username, password) : await api.register(username, password);
      onSignedIn(session);
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      setError(
        e?.status === 429 && e.retryAfterSeconds
          ? `${e.message} (${Math.ceil(e.retryAfterSeconds / 60)} dk)`
          : (e?.message ?? 'Beklenmeyen bir hata oluştu'),
      );
      setBusy(false);
    }
  };

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="gate">
      <form className="gate__card" onSubmit={submit} noValidate>
        <div className="panel__head">
          <h1>{mode === Mode.LOGIN ? 'Giriş yap' : 'Üye ol'}</h1>
          <p>Sürüşe başlamak için hesabınla giriş yap, ardından boştaki bir scooter'ı seç.</p>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Hesap">
          <button type="button" role="radio" aria-checked={mode === Mode.LOGIN} onClick={() => switchTo(Mode.LOGIN)}>
            Giriş yap
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === Mode.REGISTER}
            onClick={() => switchTo(Mode.REGISTER)}
          >
            Üye ol
          </button>
        </div>
        <div className="field">
          <label htmlFor="username">Kullanıcı adı</label>
          <input
            id="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            maxLength={USERNAME_MAX_LENGTH}
            onChange={(e) => setUsername(e.target.value)}
          />
          {mode === Mode.REGISTER ? (
            <p className="hint">
              {USERNAME_MIN_LENGTH}–{USERNAME_MAX_LENGTH} karakter: harf, rakam ve _ . -
            </p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="password">Şifre</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === Mode.LOGIN ? 'current-password' : 'new-password'}
            value={password}
            maxLength={PASSWORD_MAX_LENGTH}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === Mode.REGISTER ? <p className="hint">En az {PASSWORD_MIN_LENGTH} karakter.</p> : null}
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="ride__button" disabled={busy || !username || !password}>
          {busy ? 'Bekleyin…' : mode === Mode.LOGIN ? 'Giriş yap' : 'Üye ol ve giriş yap'}
        </button>
      </form>
    </div>
  );
}
