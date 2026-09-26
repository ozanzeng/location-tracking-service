interface Props {
  riding: boolean;
  online: boolean;
  pending: number;
  onToggle: () => void;
}

/** Cihaz bağlantısı: sürüş sırasında bağlantı kopmasını denemek için kesilip açılabilir. */
export function ConnectionPanel({ riding, online, pending, onToggle }: Props) {
  return (
    <section className="field">
      <span className="field__label">Bağlantı</span>
      {riding ? (
        <div className="row">
          <p className={online ? 'live' : 'live live--off'}>{online ? 'Çevrimiçi' : 'Çevrimdışı'}</p>
          <button type="button" className="btn" onClick={onToggle}>
            {online ? 'Bağlantıyı kes' : 'Bağlan'}
          </button>
        </div>
      ) : (
        <p className="live live--off">Sürüş başlayınca bağlantı açılır.</p>
      )}
      <p className="hint">
        {pending
          ? `${pending} konum gönderilmeyi bekliyor.`
          : riding
            ? 'Bağlantı kesilince konumlar birikir, bağlanınca toplu gönderilir.'
            : 'Sürüş sırasında bağlantı kopmasını denemek için "Bağlantıyı kes" düğmesi çıkar.'}
      </p>
    </section>
  );
}
