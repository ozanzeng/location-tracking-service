import { BadRequestException, HttpStatus } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { RetryableHttpException } from '../common/http/retryable.exception.js';
import { loadConfig } from '../config/configuration.js';
import { ScooterRegistry } from './scooter-registry.js';

/** Redis aboneliği ve zamanlayıcı olmadan: liste yalnızca refresh() ile yüklenir. */
const registryWith = (query: () => Promise<Array<{ id: string }>>) =>
  new ScooterRegistry({ query } as unknown as DataSource, loadConfig({}));

describe('ScooterRegistry', () => {
  it('liste hiç yüklenemediyse kimliği kabul etmez, 503 ile tekrar denetir', () => {
    const registry = registryWith(async () => []);
    try {
      registry.assertRegistered(['scooter-01']);
      throw new Error('hata bekleniyordu');
    } catch (err) {
      expect(err).toBeInstanceOf(RetryableHttpException);
      expect((err as RetryableHttpException).getStatus()).toBe(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  });

  it('kayıtlı olmayan kimlikleri 400 ile söyler; kayıtlıları kabul eder', async () => {
    const registry = registryWith(async () => [{ id: 'scooter-01' }]);
    await registry.refresh();
    expect(() => registry.assertRegistered(['scooter-01'])).not.toThrow();
    expect(() => registry.assertRegistered(['scooter-01', 'x', 'x'])).toThrow(
      new BadRequestException('Kayıtlı olmayan scooter: x'),
    );
  });

  it('veritabanı sonradan erişilemezse bilinen son liste kullanılır', async () => {
    let fail = false;
    const registry = registryWith(async () => {
      if (fail) throw new Error('veritabanı yok');
      return [{ id: 'scooter-01' }];
    });
    await registry.refresh();
    fail = true;
    await registry.refresh();
    expect(() => registry.assertRegistered(['scooter-01'])).not.toThrow();
  });

  it("eklenen ve silinen scooter bu instance'ta hemen geçerli olur", async () => {
    const registry = registryWith(async () => []);
    await registry.refresh();
    registry.added('yeni');
    expect(() => registry.assertRegistered(['yeni'])).not.toThrow();
    registry.removed('yeni');
    expect(() => registry.assertRegistered(['yeni'])).toThrow(
      BadRequestException,
    );
  });
});
