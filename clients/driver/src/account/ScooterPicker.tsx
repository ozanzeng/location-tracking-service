import { useState } from 'react';
import { api, ApiError } from '@shared/api/client';
import { ScooterStatus, type Rental, type Scooter } from '@shared/api/types';
import { useScooters } from '@shared/hooks/useScooters';

/**
 * Boştaki scooter'lardan biri seçilir. Kullanımdakiler görünür ama seçilemez; hepsi doluysa
 * "boşta scooter yok" yazar. Liste, bir scooter kiralanınca ya da bırakılınca kendiliğinden
 * yenilenir.
 */
export function ScooterPicker({ notice, onRented }: { notice: string | null; onRented: (rental: Rental) => void }) {
  const { scooters, error: listError, refresh } = useScooters();
  const [renting, setRenting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rent = async (scooter: Scooter) => {
    setRenting(scooter.id);
    setError(null);
    try {
      onRented(await api.rent(scooter.id));
    } catch (err) {
      // En sık sebep: başka bir sürücü aynı anda aldı (409). Liste yenilenir.
      setError(
        err instanceof ApiError && err.status === 409 ? `${scooter.name}: ${err.message}` : (err as Error).message,
      );
      setRenting(null);
      void refresh();
    }
  };

  const available = scooters?.filter((s) => s.status === ScooterStatus.AVAILABLE) ?? [];

  return (
    <div className="gate">
      <section className="gate__card gate__card--wide" aria-labelledby="picker-title">
        <div className="panel__head">
          <h1 id="picker-title">Scooter seç</h1>
          <p>Boştaki bir scooter'a dokun; sürüş bitene kadar sadece sen kullanırsın.</p>
        </div>
        {notice ? <p className="notice">{notice}</p> : null}
        {scooters === null ? (
          <p className="hint">{listError ?? 'Scooterlar yükleniyor…'}</p>
        ) : available.length === 0 ? (
          <div className="empty-fleet" role="status">
            <strong>Boşta scooter yok</strong>
            <span>
              {scooters.length === 0
                ? 'Filoda henüz scooter yok.'
                : `${scooters.length} scooter'ın hepsi kullanımda. Biri boşaldığında burada seçilebilir hale gelir.`}
            </span>
          </div>
        ) : null}
        {scooters && scooters.length > 0 ? (
          <ul className="fleet" aria-label="Scooterlar">
            {scooters.map((s) => {
              const free = s.status === ScooterStatus.AVAILABLE;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className="bay"
                    data-status={s.status}
                    disabled={!free || renting !== null}
                    onClick={() => void rent(s)}
                  >
                    <span className="bay__plate">{s.id}</span>
                    <span className="bay__name">{s.name}</span>
                    <span className="bay__status">
                      {renting === s.id ? 'Alınıyor…' : free ? 'Boşta' : 'Kullanımda'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
