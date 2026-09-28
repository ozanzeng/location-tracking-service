import L from 'leaflet';

// Tek ikon: rengi değiştirmek için ikonu yenilemek Leaflet'te sürüklemeyi keser,
// bu yüzden bölge bilgisi elemana data-zone olarak yazılır.
export const RIDER_ICON = L.divIcon({
  className: 'rider',
  html: '<span></span>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});
