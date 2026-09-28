import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import '@shared/styles/index.css';
import './styles/driver.css';
import { App } from './App';
import { loadRoadNetwork } from './roads/loadRoads';

// Yol ağı (~280 KB) ilk çizimi beklemeden inmeye başlasın; bileşen aynı isteği kullanır.
// Hata burada yutulur, bileşen gösterir. İstek bileşen açılmadan başarısız olduysa bileşen
// yeniden dener; açıldıktan sonra başarısız olursa aynı hatayı alır (önceden de böyleydi).
loadRoadNetwork().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
