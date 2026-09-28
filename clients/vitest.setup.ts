import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest'in globals'ı kapalı olduğu için Testing Library otomatik temizlik kurmaz: bir testte
// render edilen hook'un efektleri (zamanlayıcı, abonelik) sonraki teste taşınmasın.
afterEach(() => cleanup());
