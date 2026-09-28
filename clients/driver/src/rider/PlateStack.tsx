import { SignPlate } from './SignPlate';
import type { PlateItem } from './rider.types';

/** Haritanın üstündeki bildirim levhaları; en yenisi en üstte. */
export function PlateStack({ plates, onDismiss }: { plates: PlateItem[]; onDismiss: (key: string) => void }) {
  return (
    <div className="plates" aria-live="polite">
      {plates.map((item) => (
        <SignPlate key={item.key} item={item} onClose={() => onDismiss(item.key)} />
      ))}
    </div>
  );
}
