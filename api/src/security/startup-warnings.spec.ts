import { loadConfig } from '../config/configuration.js';
import { securityWarnings } from './startup-warnings.js';

const security = (apiKeys: string[], ingestApiKeys: string[]) => ({
  ...loadConfig({}).security,
  apiKeys,
  ingestApiKeys,
});

describe('securityWarnings', () => {
  it('anahtar yoksa doğrulamanın kapalı olduğunu söyler', () => {
    expect(securityWarnings(security([], []), {})).toEqual([
      expect.stringMatching(/API_KEYS tanımlı değil/),
    ]);
  });

  it('yerel geliştirmede sürücü anahtarı eksikse ne ekleneceğini söyler', () => {
    expect(securityWarnings(security(['k'], []), {})).toEqual([
      expect.stringMatching(/INGEST_API_KEYS=dev-driver-key/),
    ]);
  });

  it("production'da sürücü anahtarı olmaması geçerli bir kurulumdur", () => {
    expect(
      securityWarnings(security(['k'], []), { NODE_ENV: 'production' }),
    ).toEqual([]);
  });

  it('iki anahtar da tanımlıysa uyarı yok', () => {
    expect(securityWarnings(security(['k'], ['d']), {})).toEqual([]);
  });
});
