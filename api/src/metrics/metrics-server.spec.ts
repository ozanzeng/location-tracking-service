import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Logger } from '@nestjs/common';
import { startMetricsServer } from './metrics-server.js';

const listening = (server: Server) =>
  new Promise<void>((resolve) => server.listen(0, resolve));

describe('startMetricsServer', () => {
  it('port doluysa süreci düşürmez, hatayı loglar', async () => {
    const occupant = createServer();
    await listening(occupant);
    const { port } = occupant.address() as AddressInfo;
    const logger = { log: vi.fn(), error: vi.fn() } as unknown as Logger;

    // 'error' dinleyicisi olmasaydı EADDRINUSE yakalanmamış istisna olarak süreci düşürürdü.
    const server = startMetricsServer(port, logger);
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
    expect(vi.mocked(logger.error).mock.calls[0][0]).toMatch(/EADDRINUSE/);

    server.close();
    occupant.close();
  });

  it('/metrics Prometheus formatında yanıt verir', async () => {
    const logger = { log: vi.fn(), error: vi.fn() } as unknown as Logger;
    const probe = createServer();
    await listening(probe);
    const { port } = probe.address() as AddressInfo;
    await new Promise((resolve) => probe.close(resolve));

    const server = startMetricsServer(port, logger);
    await vi.waitFor(() => expect(logger.log).toHaveBeenCalled());
    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/process_cpu_user_seconds_total/);
    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(404);
    server.close();
  });
});
