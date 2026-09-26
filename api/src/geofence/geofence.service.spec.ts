import type { DataSource, EntityManager } from 'typeorm';
import { AreaType } from '../areas/area-type.enum.js';
import { AreaEventType } from './area-event-type.enum.js';
import type {
  GeofenceRepository,
  GeofenceState,
  Transition,
} from './geofence.repository.js';
import { GeofenceService } from './geofence.service.js';

const MODA = { id: 'moda', name: 'Moda', type: AreaType.NO_RIDE };
const PARK = { id: 'park', name: 'Park', type: AreaType.PARKING };
const location = {
  userId: 'u1',
  lat: 41,
  lng: 29,
  recordedAt: '2026-01-01T10:00:05.000Z',
};

function setup(state: GeofenceState, transitions: Transition[] = []) {
  const manager = {} as EntityManager;
  const repository = {
    lockUser: vi.fn().mockResolvedValue(undefined),
    readState: vi.fn().mockResolvedValue(state),
    relaxCommitDurability: vi.fn().mockResolvedValue(undefined),
    applyTransitions: vi.fn().mockResolvedValue(transitions),
  };
  const dataSource = {
    transaction: vi.fn((work: (m: EntityManager) => Promise<unknown>) =>
      work(manager),
    ),
  } as unknown as DataSource;
  const service = new GeofenceService(
    dataSource,
    repository as unknown as GeofenceRepository,
  );
  return { service, repository, manager };
}

describe('GeofenceService.process', () => {
  it('önce kullanıcı kilidini alır, sonra durumu okur', async () => {
    const { service, repository } = setup({
      lastRecordedAt: null,
      inside: [],
      present: [],
    });
    await service.process(location);
    expect(repository.lockUser.mock.invocationCallOrder[0]).toBeLessThan(
      repository.readState.mock.invocationCallOrder[0],
    );
  });

  it('son işlenenden eski ya da aynı zamanlı konumu atlar, hiçbir şey yazmaz', async () => {
    const { service, repository } = setup({
      lastRecordedAt: new Date('2026-01-01T10:00:05.000Z'),
      inside: [MODA],
      present: [],
    });
    expect(await service.process(location)).toEqual({ status: 'stale' });
    expect(repository.applyTransitions).not.toHaveBeenCalled();
    expect(repository.relaxCommitDurability).not.toHaveBeenCalled();
  });

  it('giriş/çıkış yoksa commit dayanıklılığını gevşetir (sadece son konum yazılır)', async () => {
    const { service, repository } = setup({
      lastRecordedAt: null,
      inside: [MODA],
      present: [MODA],
    });
    const result = await service.process(location);
    expect(repository.relaxCommitDurability).toHaveBeenCalledTimes(1);
    expect(repository.applyTransitions).toHaveBeenCalledWith(
      expect.anything(),
      location,
      [],
      [],
    );
    expect(result).toMatchObject({ status: 'processed', events: [] });
  });

  it('giriş/çıkış varsa dayanıklılığı gevşetmez; olaylar alan ad ve tipiyle döner', async () => {
    const { service, repository } = setup(
      { lastRecordedAt: null, inside: [PARK], present: [MODA] },
      [
        { logId: '7', areaId: 'park', eventType: AreaEventType.ENTER },
        { logId: '3', areaId: 'moda', eventType: AreaEventType.EXIT },
      ],
    );
    const result = await service.process(location);

    expect(repository.relaxCommitDurability).not.toHaveBeenCalled();
    expect(repository.applyTransitions).toHaveBeenCalledWith(
      expect.anything(),
      location,
      ['park'],
      ['moda'],
    );
    expect(result).toEqual({
      status: 'processed',
      events: [
        {
          logId: '7',
          userId: 'u1',
          eventType: 'ENTER',
          area: PARK,
          occurredAt: location.recordedAt,
        },
        {
          logId: '3',
          userId: 'u1',
          eventType: 'EXIT',
          area: MODA,
          occurredAt: location.recordedAt,
        },
      ],
      position: {
        userId: 'u1',
        lat: 41,
        lng: 29,
        recordedAt: location.recordedAt,
        areas: [PARK],
      },
    });
  });
});
