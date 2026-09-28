import { type FormEvent, useState } from 'react';
import { api, ApiError } from '@shared/api/client';
import { PASSWORD_MAX_LENGTH, USERNAME_MAX_LENGTH } from '@shared/api/limits';
import type { AdminSession } from '@shared/api/types';

/** Operasyon paneli girişi. Yönetici hesapları panelden açılmaz (README, "Yönetici hesapları"). */
export function AdminLogin({ notice, onSignedIn }: { notice: string | null; onSignedIn: (s: AdminSession) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.adminLogin(username, password));
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

  return (
    <div className="gate">
      {notice ? <p className="notice gate__notice">{notice}</p> : null}
      <form className="gate__card" onSubmit={submit} noValidate>
        <div className="panel__head">
          <h1>Yönetici girişi</h1>
          <p>Operasyon paneli: canlı izleme, giriş kayıtları, alanlar ve filo.</p>
        </div>
        <div className="field">
          <label htmlFor="admin-username">Kullanıcı adı</label>
          <input
            id="admin-username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            maxLength={USERNAME_MAX_LENGTH}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="admin-password">Şifre</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            maxLength={PASSWORD_MAX_LENGTH}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn--primary" disabled={busy || !username || !password}>
          {busy ? 'Bekleyin…' : 'Giriş yap'}
        </button>
      </form>
    </div>
  );
}
