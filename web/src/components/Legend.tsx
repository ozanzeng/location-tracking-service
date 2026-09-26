import type { AreaType } from '../api';
import { ZONES, ZONE_ORDER } from '../zones';
import { SignIcon } from './SignIcon';

export function Legend({ counts }: { counts?: Partial<Record<AreaType, number>> }) {
  return (
    <ul className="legend">
      {ZONE_ORDER.map((type) => (
        <li key={type}>
          <SignIcon type={type} size={22} />
          <span>{ZONES[type].label}</span>
          {counts ? <b className="num">{counts[type] ?? 0}</b> : null}
        </li>
      ))}
    </ul>
  );
}
