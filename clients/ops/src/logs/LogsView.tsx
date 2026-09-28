import { useCallback, useEffect, useState } from 'react';
import { useAreas } from '@shared/hooks/useAreas';
import { LOGS_CLOCK_MS } from '../config';
import { EMPTY_FILTERS, isEmpty, type LogFilters } from './logFilters';
import { LogFiltersForm } from './LogFiltersForm';
import { LogsTable } from './LogsTable';
import { useLogs } from './useLogs';

/** GET /logs: alan giriş kayıtları; filtreler ve cursor ile sayfalama. */
export function LogsView() {
  const { areas } = useAreas();
  const [draft, setDraft] = useState<LogFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<LogFilters>(EMPTY_FILTERS);
  const logs = useLogs(applied);
  const now = useNow(LOGS_CLOCK_MS);
  // Sabit kimlik: tablo (memo) filtre yazarken yeniden çizilmesin.
  const pickUser = useCallback((userId: string) => setDraft((d) => ({ ...d, userId })), []);

  return (
    <div className="page">
      <header className="page__head">
        <h1>Giriş kayıtları</h1>
        <p>Her satır bir alan girişidir. Kullanıcı alandan çıkınca çıkış zamanı dolar.</p>
      </header>

      <LogFiltersForm
        value={draft}
        areas={areas}
        onChange={setDraft}
        onSubmit={() => setApplied(draft)}
        onReset={() => {
          setDraft(EMPTY_FILTERS);
          setApplied(EMPTY_FILTERS);
        }}
      />

      {logs.newEntries > 0 ? (
        <button type="button" className="new-entries" onClick={logs.reload}>
          {logs.newEntries} yeni giriş var, listeyi yenile
        </button>
      ) : null}
      {logs.error ? <p className="error">Kayıtlar yüklenemedi: {logs.error}</p> : null}

      <div className="table-wrap">
        <LogsTable rows={logs.rows} now={now} onPickUser={pickUser} />
        {!logs.rows.length && !logs.loading ? (
          <p className="hint logs__empty">
            {isEmpty(applied)
              ? 'Henüz giriş kaydı yok. Sürücü uygulamasında bir scooter bir alana girince burada görünür.'
              : 'Bu filtrelere uyan kayıt yok.'}
          </p>
        ) : null}
      </div>

      {logs.hasMore ? (
        <button type="button" className="btn load-more" disabled={logs.loading} onClick={logs.loadMore}>
          {logs.loading ? 'Yükleniyor' : 'Daha fazla göster'}
        </button>
      ) : null}
    </div>
  );
}

/** Belirli aralıkla değişen şimdiki zaman: "Sinyal yok · X önce" yazıları eskimesin. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
