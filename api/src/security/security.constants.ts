import { Access } from './access.enum.js';
import { PrincipalKind } from './principal-kind.enum.js';
import type { Principal } from './security.types.js';

/** API anahtarıyla gelen isteğin kimliği. */
export const SERVICE_PRINCIPAL: Principal = { kind: PrincipalKind.SERVICE };

/**
 * Kontrol ve artırma tek adımda (atomik): önce bütün kullanıcıların sayacı okunur, biri
 * sınıra ulaşmışsa hiçbir sayaca dokunulmadan reddedilir. Böylece reddedilen istek kotayı
 * harcamaz; ret sürekli tekrarlansa bile pencere sonunda istemci yeniden gönderebilir.
 * KEYS: kullanıcı sayaçları, ARGV: sınır, TTL, ardından her kullanıcının konum sayısı.
 * Dönen değer: sınıra ulaşmış kullanıcıların KEYS içindeki sırası (1'den başlar).
 */
export const CONSUME_SCRIPT = `
local limit = tonumber(ARGV[1])
local exceeded = {}
for i, key in ipairs(KEYS) do
  if tonumber(redis.call('GET', key) or '0') >= limit then
    table.insert(exceeded, i)
  end
end
if #exceeded > 0 then return exceeded end
for i, key in ipairs(KEYS) do
  redis.call('INCRBY', key, ARGV[i + 2])
  redis.call('EXPIRE', key, ARGV[2])
end
return exceeded
`;

/** Uç noktanın erişim düzeyi metadata anahtarı (@AllowRiders, @RidersOnly...). */
export const ACCESS = 'access';

/** Kimlik istemeyen uç nokta metadata anahtarı (@Public). */
export const IS_PUBLIC = 'isPublic';

/** API anahtarının geldiği başlık. */
export const API_KEY_HEADER = 'x-api-key';

/** Her erişim düzeyine hangi kimlik türlerinin girebildiği. */
export const ACCESS_RULES: Record<Access, readonly PrincipalKind[]> = {
  [Access.OPERATOR]: [PrincipalKind.SERVICE, PrincipalKind.ADMIN],
  [Access.ANY]: [
    PrincipalKind.SERVICE,
    PrincipalKind.ADMIN,
    PrincipalKind.RIDER,
  ],
  [Access.DEVICE]: [PrincipalKind.SERVICE, PrincipalKind.RIDER],
  [Access.RIDER]: [PrincipalKind.RIDER],
  [Access.ADMIN]: [PrincipalKind.ADMIN],
};
