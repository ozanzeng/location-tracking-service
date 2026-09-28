interface Props {
  online: boolean;
  pending: number;
  onToggle: () => void;
}

/**
 * Sürüş sırasında ağ kopmasını denemek için. Uygulama sürüş başlayınca kendiliğinden çevrimiçi
 * olur; bu bölüm sadece bağlantı koptuğunda konumların biriktiğini ve bağlanınca toplu
 * gönderildiğini göstermek içindir (gerçek bir telefonda bu düğme olmaz).
 */
export function ConnectionPanel({ online, pending, onToggle }: Props) {
  return (
    <section className="field">
      <span className="field__label">Ağ kopmasını dene</span>
      <div className="row">
        <p className={online ? 'live' : 'live live--off'}>{online ? 'Çevrimiçi' : 'Çevrimdışı'}</p>
        <button type="button" className="btn" onClick={onToggle}>
          {online ? 'Bağlantıyı kes' : 'Bağlan'}
        </button>
      </div>
      <p className="hint">
        {pending
          ? `${pending} konum gönderilmeyi bekliyor.`
          : 'Uygulama sürüş boyunca kendiliğinden çevrimiçidir. Bağlantıyı kesince konumlar birikir, bağlanınca toplu gönderilir.'}
      </p>
    </section>
  );
}
