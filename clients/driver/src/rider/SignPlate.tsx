import type { AreaType, EventType } from '@shared/api/types';
import { riderMessage } from './riderMessages';
import { SignIcon } from '@shared/zones/SignIcon';

export interface PlateItem {
  key: string;
  type: AreaType;
  eventType: EventType;
  areaName: string;
}

/** Sürücü bildirimi: bölge tipine göre renklenen levha. */
export function SignPlate({ item, onClose }: { item: PlateItem; onClose: () => void }) {
  const { title, body } = riderMessage(item.type, item.eventType);
  return (
    <div className={`plate plate--${item.type} plate--${item.eventType}`} role="status">
      <SignIcon type={item.type} size={40} />
      <div className="plate__text">
        <strong>{title}</strong>
        <span>{body}</span>
        <small>{item.areaName}</small>
      </div>
      <button type="button" className="plate__close" onClick={onClose} aria-label="Bildirimi kapat">
        ×
      </button>
    </div>
  );
}
