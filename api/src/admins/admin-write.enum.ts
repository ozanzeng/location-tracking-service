/** Yönetici hesabı yazılırken var olan hesaba ne yapılacağı. */
export enum AdminWrite {
  /** Hesap yoksa oluşturulur; varsa şifresine dokunulmaz (migrate adımı). */
  CREATE_IF_MISSING = 'create-if-missing',
  /** Hesap yoksa oluşturulur, varsa şifresi değiştirilir (admin betiği). */
  UPSERT = 'upsert',
}
