/**
 * The `/plataforma` index (PLT.10). Visão geral is owner/finance — support
 * would only ever see the API's 403 there, so its console home is Academias.
 * Routing the role rather than rendering a denial keeps every platform role
 * with a working landing screen.
 */
import { Navigate } from 'react-router';
import { useAuth } from '../../auth/auth-store';
import { VisaoGeralPage } from './VisaoGeralPage';

export function PlataformaHome() {
  const { session } = useAuth();
  if (session?.activeRole === 'support') {
    return <Navigate to="/plataforma/academias" replace />;
  }
  return <VisaoGeralPage />;
}

export default PlataformaHome;
