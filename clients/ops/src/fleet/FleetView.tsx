import { useState } from 'react';
import { api } from '@shared/api/client';
import { ScooterStatus } from '@shared/api/types';
import { useScooters } from '@shared/hooks/useScooters';
import { FleetTable } from './FleetTable';
import { ScooterForm } from './ScooterForm';

/**
 * Filo yönetimi: scooter ekle, sil; kimin kullandığını ve son sinyali gör. Sadece kayıtlı
 * scooter'lar konum gönderebilir; eklenen scooter hemen gönderebilir, silinen hemen duramaz.
 */
export function FleetView() {
  const { scooters, error: loadError, refresh } = useScooters();
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const add = async (id: string, name: string): Promise<boolean> => {
    setSaving(true);
    setMessage(null);
    try {
      const scooter = await api.createScooter({ id, name: name || undefined });
      setMessage({ error: false, text: `${scooter.id} filoya eklendi.` });
      void refresh();
      return true;
    } catch (err) {
      setMessage({ error: true, text: (err as Error).message });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setRemoving(id);
    setMessage(null);
    try {
      await api.deleteScooter(id);
      setMessage({ error: false, text: `${id} filodan çıkarıldı. Giriş kayıtları duruyor.` });
    } catch (err) {
      setMessage({ error: true, text: `${id} silinemedi: ${(err as Error).message}` });
    } finally {
      setRemoving(null);
      void refresh();
    }
  };

  const inUse = scooters?.filter((s) => s.status === ScooterStatus.IN_USE).length ?? 0;

  return (
    <div className="page">
      <header className="page__head">
        <h1>Scooterlar</h1>
        <p>
          Sadece buradaki scooterlar konum gönderebilir ve sürücüler tarafından seçilebilir. Kullanımdaki scooter
          silinemez.
        </p>
      </header>

      <ScooterForm onAdd={add} saving={saving} />
      {message ? (
        <p className={message.error ? 'error' : 'notice'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}
      {loadError ? <p className="error">Scooterlar yüklenemedi: {loadError}</p> : null}

      {scooters ? (
        <>
          <p className="hint fleet__summary">
            {scooters.length} scooter · {inUse} kullanımda · {scooters.length - inUse} boşta
          </p>
          <div className="table-wrap">
            <FleetTable scooters={scooters} removing={removing} onRemove={(id) => void remove(id)} />
            {scooters.length === 0 ? <p className="hint logs__empty">Filoda scooter yok. Yukarıdan ekleyin.</p> : null}
          </div>
        </>
      ) : (
        <p className="hint">Yükleniyor</p>
      )}
    </div>
  );
}
