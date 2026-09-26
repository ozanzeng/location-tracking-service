/** Sürüşü başlat/bitir düğmesi; bitirilemiyorsa sebebi uyarı olarak gösterilir. */
export function RidePanel({
  riding,
  notice,
  onToggle,
}: {
  riding: boolean;
  notice: string | null;
  onToggle: () => void;
}) {
  return (
    <section className="ride">
      <button type="button" className={riding ? 'ride__button ride__button--stop' : 'ride__button'} onClick={onToggle}>
        {riding ? 'Sürüşü bitir' : 'Sürüşü başlat'}
      </button>
      {notice ? (
        <p className="error" role="alert">
          {notice}
        </p>
      ) : (
        <p className="hint">
          {riding
            ? 'Konumunuz 5 saniyede bir gönderiliyor. Sürüşü bir park alanında (mavi P) bitirin.'
            : 'Sürüş başlayınca uygulama konumunuzu 5 saniyede bir gönderir.'}
        </p>
      )}
    </section>
  );
}
