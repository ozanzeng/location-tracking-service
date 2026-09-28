import { useCallback, useState } from 'react';
import { useAreas } from '@shared/hooks/useAreas';
import { useScooters } from '@shared/hooks/useScooters';
import { ScooterDrawer } from '../fleet/ScooterDrawer';
import { EMPTY_FILTERS, isEmpty, type LogFilters } from './logFilters';
import { LogFiltersForm } from './LogFiltersForm';
import { LogsTable } from './LogsTable';
import { useLogs } from './useLogs';

/**
 * GET /logs: alan giriş kayıtları; filtreler ve cursor ile sayfalama. Satırdaki scooter'a
 * tıklamak sağdan detay panelini (durum, cihaz günlüğü, kiralamalar) açar.
 */
export function LogsView() {
  const { areas } = useAreas();
  const { scooters } = useScooters();
  const [draft, setDraft] = useState<LogFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<LogFilters>(EMPTY_FILTERS);
  const [opened, setOpened] = useState<string | null>(null);
  const logs = useLogs(applied);
  // Sabit kimlikler: tablo (memo) filtre değişirken ya da panel açılıp kapanırken yeniden çizilmesin.
  const openScooter = useCallback((scooterId: string) => setOpened(scooterId), []);
  const closeScooter = useCallback(() => setOpened(null), []);
  const filterByScooter = useCallback((userId: string) => {
    setDraft((d) => ({ ...d, userId }));
    setApplied((a) => ({ ...a, userId }));
  }, []);

  return (
    <div className="page">
      <header className="page__head">
        <h1>Giriş kayıtları</h1>
        <p>
          Her satır bir alan girişidir. Scooter alandan çıkınca çıkış zamanı dolar. Scooter'a tıklayınca detayı ve cihaz
          günlüğü sağda açılır.
        </p>
      </header>

      <LogFiltersForm
        value={draft}
        areas={areas}
        scooters={scooters}
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
        <LogsTable rows={logs.rows} onOpenScooter={openScooter} />
        {!logs.rows.length && !logs.loading ? (
          <p className="hint logs__empty">
            {isEmpty(applied)
              ? 'Henüz giriş kaydı yok. Sürücü uygulamasında bir scooter bir alana girince burada görünür.'
              : 'Bu filtrelere uyan kayıt yok.'}
          </p>
        ) : null}
      </div>

      {opened ? <ScooterDrawer scooterId={opened} onClose={closeScooter} onFilter={filterByScooter} /> : null}

      {logs.hasMore ? (
        <button type="button" className="btn load-more" disabled={logs.loading} onClick={logs.loadMore}>
          {logs.loading ? 'Yükleniyor' : 'Daha fazla göster'}
        </button>
      ) : null}
    </div>
  );
}
