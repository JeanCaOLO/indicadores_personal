import { useAccesoController } from '../views/acceso/hooks/use-acceso-controller';
import { LoginPage } from '../views/acceso/pages/login-page';
import { IndicadoresPage } from '../views/indicadores/pages/indicadores-page';

/** El sistema exige login (igual que el original): sin sesión, pantalla de acceso; con sesión, el tablero. */
export function App() {
  const acceso = useAccesoController();
  if (acceso.status === 'loading') return null;
  if (acceso.status === 'signed-out' || !acceso.session) return <LoginPage controller={acceso} />;
  return <IndicadoresPage session={acceso.session} onLogout={acceso.logout} />;
}
