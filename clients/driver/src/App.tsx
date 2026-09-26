import { DriverScreen } from './DriverScreen';

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="brand__mark" aria-hidden="true" />
          Bölge Takip
          <span className="brand__role">Sürücü</span>
        </span>
      </header>
      <main>
        <DriverScreen />
      </main>
    </div>
  );
}
