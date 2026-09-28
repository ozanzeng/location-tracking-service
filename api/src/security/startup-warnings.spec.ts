import { loadConfig } from '../config/configuration.js';
import { securityWarnings } from './startup-warnings.js';

const security = (apiKeys: string[]) => ({
  ...loadConfig({}).security,
  apiKeys,
});

describe('securityWarnings', () => {
  it('anahtar tanımlı değilse doğrulamanın kapalı olduğunu uyarır', () => {
    expect(securityWarnings(security([]))).toEqual([
      expect.stringMatching(/kimlik doğrulama kapalı/),
    ]);
  });

  it('anahtar tanımlıysa uyarı yok', () => {
    expect(securityWarnings(security(['k']))).toEqual([]);
  });
});
