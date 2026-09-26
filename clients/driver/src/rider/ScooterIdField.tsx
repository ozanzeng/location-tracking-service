/** Scooter kimliği; sunucunun kabul ettiği karakterlerle sınırlı. Sürüş sırasında değiştirilemez. */
export function ScooterIdField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <section className="field">
      <label htmlFor="scooter-id">Scooter kimliği</label>
      <input
        id="scooter-id"
        value={value}
        maxLength={64}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/[^A-Za-z0-9_.:-]/g, ''))}
      />
    </section>
  );
}
