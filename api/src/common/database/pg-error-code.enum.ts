/** Uygulamanın ayırt ettiği Postgres hata kodları (SQLSTATE). */
export enum PgErrorCode {
  /** Unique index ihlali: aynı kullanıcı adı, aynı scooter'ın ikinci açık kiralaması. */
  UNIQUE_VIOLATION = '23505',
}
