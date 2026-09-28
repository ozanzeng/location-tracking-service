/** Kiralanan scooter ve sürüşü başlat/bitir; bitirilemiyorsa sebebi uyarı olarak gösterilir. */
export function RidePanel({
  scooterId,
  riding,
  ending,
  notice,
  onToggle,
  onRelease,
}: {
  scooterId: string;
  riding: boolean;
  ending: boolean;
  notice: string | null;
  onToggle: () => void;
  /** Sürüşe başlamadan scooter'ı bırakmak (vazgeçmek). */
  onRelease: () => void;
}) {
  return (
    <section className="ride">
      <p className="ride__scooter">
        <span className="bay__plate">{scooterId}</span>
        <span>{ending ? 'bırakılıyor…' : riding ? 'sürüşte' : 'senin için ayrıldı'}</span>
      </p>
      <button
        type="button"
        className={riding ? 'ride__button ride__button--stop' : 'ride__button'}
        disabled={ending}
        onClick={onToggle}
      >
        {riding ? 'Sürüşü bitir' : 'Sürüşü başlat'}
      </button>
      {notice ? (
        <p className="error" role="alert">
          {notice}
        </p>
      ) : (
        <p className="hint">
          {riding
            ? 'Konumunuz 5 saniyede bir gönderiliyor. Sürüşü bir park alanında (mavi P) bitirin; scooter bırakılır.'
            : 'Sürüş başlayınca uygulama konumunuzu 5 saniyede bir gönderir.'}
        </p>
      )}
      {!riding ? (
        <button type="button" className="btn btn--quiet" disabled={ending} onClick={onRelease}>
          Vazgeç, scooter'ı bırak
        </button>
      ) : null}
    </section>
  );
}
