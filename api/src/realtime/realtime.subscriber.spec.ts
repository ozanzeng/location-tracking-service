import { loadConfig } from '../config/configuration.js';
import { RealtimeSubscriber } from './realtime.subscriber.js';

describe('RealtimeSubscriber.dispatch', () => {
  const subscriber = new RealtimeSubscriber(loadConfig({}));

  it('geçerli mesajı işleyicilere iletir', () => {
    const handler = vi.fn();
    subscriber.dispatch('{"created":{"name":"Park"}}', [handler]);
    expect(handler).toHaveBeenCalledWith({ created: { name: 'Park' } });
  });

  it('bozuk mesajda hata fırlatmaz, işleyiciyi çağırmaz', () => {
    const handler = vi.fn();
    expect(() => subscriber.dispatch('{bozuk', [handler])).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
