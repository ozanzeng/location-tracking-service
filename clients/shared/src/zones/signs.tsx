import type { AreaType } from '../api/types';

/** Levha ikonlarının SVG içerikleri (SignIcon). */
export const SIGNS: Record<AreaType, React.ReactNode> = {
  // Girilmez levhası
  NO_RIDE: (
    <>
      <circle cx="16" cy="16" r="15" fill="#D7263D" />
      <rect x="6.5" y="13" width="19" height="6" rx="1" fill="#fff" />
    </>
  ),
  // Azami hız levhası
  SLOW: (
    <>
      <circle cx="16" cy="16" r="15" fill="#D7263D" />
      <circle cx="16" cy="16" r="11.5" fill="#fff" />
      <text
        x="16"
        y="20.5"
        textAnchor="middle"
        fontSize="12.5"
        fontWeight="800"
        fill="#2B2F36"
        fontFamily="Overpass, sans-serif"
      >
        10
      </text>
    </>
  ),
  // Park etmek yasaktır levhası
  NO_PARKING: (
    <>
      <circle cx="16" cy="16" r="15" fill="#D7263D" />
      <circle cx="16" cy="16" r="11.5" fill="#1F5FAD" />
      <path d="M8 8 L24 24" stroke="#D7263D" strokeWidth="3.5" />
    </>
  ),
  // Park yeri levhası
  PARKING: (
    <>
      <rect x="2" y="2" width="28" height="28" rx="4" fill="#1F5FAD" />
      <text
        x="16"
        y="23.5"
        textAnchor="middle"
        fontSize="20"
        fontWeight="800"
        fill="#fff"
        fontFamily="Overpass, sans-serif"
      >
        P
      </text>
    </>
  ),
  // Bölge sınırı: kesik çizgili çevre
  SERVICE: (
    <>
      <rect
        x="3"
        y="3"
        width="26"
        height="26"
        rx="4"
        fill="#fff"
        stroke="#2B2F36"
        strokeWidth="2.5"
        strokeDasharray="3.5 3"
      />
      <circle cx="16" cy="16" r="4" fill="#2B2F36" />
    </>
  ),
};
