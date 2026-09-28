/** Alan düzenlenince ya da silinince kapatılan giriş kaydı. */
export interface ClosedVisit {
  id: string;
  user_id: string;
  exit_time: Date;
}
