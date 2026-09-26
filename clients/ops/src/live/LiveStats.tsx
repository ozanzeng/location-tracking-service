import type { Counts } from './ScooterLayer';

/** Anlık sayaçlar: aktif scooter, sürüş yasak bölgede ve hizmet bölgesi dışında olanlar. */
export function LiveStats({ counts }: { counts: Counts }) {
  const outside = Math.max(0, counts.total - (counts.SERVICE ?? 0));
  return (
    <section className="stats" aria-label="Anlık durum">
      <div className="stat">
        <b className="num">{counts.total}</b>
        <span>aktif scooter</span>
      </div>
      <div className="stat stat--alert">
        <b className="num">{counts.NO_RIDE ?? 0}</b>
        <span>sürüş yasak bölgede</span>
      </div>
      <div className="stat">
        <b className="num">{outside}</b>
        <span>hizmet bölgesi dışında</span>
      </div>
    </section>
  );
}
