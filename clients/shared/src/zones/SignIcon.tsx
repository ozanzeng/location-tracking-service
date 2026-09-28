import type { AreaType } from '../api/types';
import { SIGNS } from './signs';

/** Her bölge tipi için gerçek trafik levhasından uyarlanmış ikon. */
export function SignIcon({ type, size = 28 }: { type: AreaType; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="sign-icon">
      {SIGNS[type]}
    </svg>
  );
}
