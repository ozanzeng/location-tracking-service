import { move, type LatLng } from './geo';

export interface Bot extends LatLng {
  id: string;
  heading: number;
  /** metre/saniye */
  speed: number;
}

/** Botların dolaştığı alan: Kadıköy hizmet bölgesinin kabaca içi. */
const BOUNDS = { minLat: 40.964, maxLat: 40.998, minLng: 29.02, maxLng: 29.068 };

const random = (min: number, max: number) => min + Math.random() * (max - min);

export function createBots(count: number): Bot[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `bot-${String(i + 1).padStart(3, '0')}`,
    lat: random(BOUNDS.minLat, BOUNDS.maxLat),
    lng: random(BOUNDS.minLng, BOUNDS.maxLng),
    heading: random(0, 360),
    speed: random(3, 7),
  }));
}

/** Bir adım ilerlet: yön hafifçe sapar, sınıra gelince geri döner. */
export function stepBot(bot: Bot, seconds: number): Bot {
  let heading = (bot.heading + random(-25, 25) + 360) % 360;
  let next = move(bot, heading, bot.speed * seconds);
  if (next.lat < BOUNDS.minLat || next.lat > BOUNDS.maxLat || next.lng < BOUNDS.minLng || next.lng > BOUNDS.maxLng) {
    heading = (heading + 180) % 360;
    next = move(bot, heading, bot.speed * seconds);
  }
  return { ...bot, ...next, heading };
}
