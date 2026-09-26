import type { AreaType, EventType } from '@shared/api/types';

/** Sürücüye gösterilecek levha metni (Martı uygulaması bildirimleri gibi). */
export function riderMessage(type: AreaType, event: EventType): { title: string; body: string } {
  const messages: Record<AreaType, Record<EventType, { title: string; body: string }>> = {
    NO_RIDE: {
      ENTER: { title: 'Sürüş yasak bölge', body: 'Scooter durduruldu. Bölgeden yürüterek çıkın.' },
      EXIT: { title: 'Yasak bölgeden çıktınız', body: 'Sürüşe devam edebilirsiniz.' },
    },
    SLOW: {
      ENTER: { title: 'Yavaş bölge', body: 'Hızınız 10 km/s ile sınırlandı.' },
      EXIT: { title: 'Yavaş bölge bitti', body: 'Normal hız sınırı geri geldi.' },
    },
    NO_PARKING: {
      ENTER: { title: 'Park yasak', body: 'Sürüşü burada bitiremezsiniz.' },
      EXIT: { title: 'Park yasağı bitti', body: 'Uygun bir park alanı arayın.' },
    },
    PARKING: {
      ENTER: { title: 'Park alanı', body: 'Sürüşü burada bitirebilirsiniz.' },
      EXIT: { title: 'Park alanından çıktınız', body: 'En yakın park alanı haritada mavi.' },
    },
    SERVICE: {
      ENTER: { title: 'Hizmet bölgesindesiniz', body: 'İyi sürüşler.' },
      EXIT: { title: 'Hizmet bölgesi dışı', body: 'Geri dönün; bölge dışında sürüş bitirilemez.' },
    },
  };
  return messages[type][event];
}
