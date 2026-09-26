/**
 * Sırası gelmemiş iş en geç bu aralıkla yeniden denenir. Normalde beklemez: önceki iş
 * bitince bekleyen ardılını hemen öne alır (UserSequencer.complete); bu aralık, ikisinin
 * aynı anda çalıştığı nadir yarışta yedektir.
 */
export const ORDER_RETRY_MS = 250;
/**
 * Önceki iş bu süre boyunca hiç ilerlemezse kaybolmuş sayılır (ör. sıra no alındıktan sonra
 * kuyruğa eklenemedi ya da denemeleri tükendi) ve iş beklemeden işlenir. Süre, işin
 * oluşturulmasından değil kullanıcının son ilerlemesinden sayılır: uzun birikmiş kuyrukta
 * sonraki işler sırası gelene kadar bekleyebilir.
 */
export const ORDER_STALL_MS = 30_000;

/** Bekleyen işin gözlediği son durum: tamamlanan sıra ve o değeri ilk gördüğü an. */
export interface OrderWait {
  done: number;
  since: number;
}

export type OrderDecision =
  | { action: 'process'; outOfOrder: boolean }
  | { action: 'wait'; wait: OrderWait };

/**
 * İş şimdi işlenmeli mi? Sıra no yoksa (eski biçimde iş) ya da kullanıcının sayacı yoksa
 * (TTL doldu) sıra bilinmiyor: beklemeden işlenir. Tekrar denenen ya da zaman aşımıyla
 * geride kalmış iş (seq <= done + 1) de beklemez.
 */
export function decideOrder(
  seq: number | undefined,
  done: number | null,
  previous: OrderWait | undefined,
  now: number,
): OrderDecision {
  if (seq === undefined || done === null || seq <= done + 1) {
    return { action: 'process', outOfOrder: false };
  }
  const since = previous && previous.done === done ? previous.since : now;
  if (now - since < ORDER_STALL_MS) {
    return { action: 'wait', wait: { done, since } };
  }
  return { action: 'process', outOfOrder: true };
}
