import { AreaType, EventType } from '@shared/api/types';

/** Sürücüye gösterilecek levha metni (Martı uygulaması bildirimleri gibi). */
export function riderMessage(type: AreaType, event: EventType): { title: string; body: string } {
  const messages: Record<AreaType, Record<EventType, { title: string; body: string }>> = {
    [AreaType.NO_RIDE]: {
      [EventType.ENTER]: { title: 'Sürüş yasak bölge', body: 'Scooter durduruldu. Bölgeden yürüterek çıkın.' },
      [EventType.EXIT]: { title: 'Yasak bölgeden çıktınız', body: 'Sürüşe devam edebilirsiniz.' },
    },
    [AreaType.SLOW]: {
      [EventType.ENTER]: { title: 'Yavaş bölge', body: 'Hızınız 10 km/s ile sınırlandı.' },
      [EventType.EXIT]: { title: 'Yavaş bölge bitti', body: 'Normal hız sınırı geri geldi.' },
    },
    [AreaType.NO_PARKING]: {
      [EventType.ENTER]: { title: 'Park yasak', body: 'Sürüşü burada bitiremezsiniz.' },
      [EventType.EXIT]: { title: 'Park yasağı bitti', body: 'Uygun bir park alanı arayın.' },
    },
    [AreaType.PARKING]: {
      [EventType.ENTER]: { title: 'Park alanı', body: 'Sürüşü burada bitirebilirsiniz.' },
      [EventType.EXIT]: { title: 'Park alanından çıktınız', body: 'En yakın park alanı haritada mavi.' },
    },
    [AreaType.SERVICE]: {
      [EventType.ENTER]: { title: 'Hizmet bölgesindesiniz', body: 'İyi sürüşler.' },
      [EventType.EXIT]: { title: 'Hizmet bölgesi dışı', body: 'Geri dönün; bölge dışında sürüş bitirilemez.' },
    },
  };
  return messages[type][event];
}
