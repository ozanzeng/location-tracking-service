import type { Repository } from 'typeorm';
import type { RealtimePublisher } from '../realtime/realtime.publisher.js';
import type { Area } from './area.entity.js';
import { AreasService } from './areas.service.js';

describe('AreasService.create', () => {
  it('yayın asılı kalsa da (Redis erişilemiyor) kaydedilen alanı hemen döner', async () => {
    const saved = { id: 'a1', name: 'Park', type: 'PARKING' } as Area;
    const repo = {
      query: vi.fn().mockResolvedValue([{ valid: true, reason: 'Valid' }]),
      create: vi.fn((a: object) => a),
      save: vi.fn().mockResolvedValue(saved),
    } as unknown as Repository<Area>;
    const publishAreasChanged = vi.fn(() => new Promise<void>(() => {}));
    const service = new AreasService(repo, {
      publishAreasChanged,
    } as unknown as RealtimePublisher);

    const result = await Promise.race([
      service.create({
        name: 'Park',
        type: 'PARKING' as never,
        geometry: { type: 'Polygon', coordinates: [] },
      }),
      new Promise((resolve) => setTimeout(() => resolve('asılı kaldı'), 200)),
    ]);
    expect(result).toBe(saved);
    expect(publishAreasChanged).toHaveBeenCalledWith({
      created: { id: 'a1', name: 'Park', type: 'PARKING' },
    });
  });
});
