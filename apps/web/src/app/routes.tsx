/**
 * Route tree (web-02): react-router v7 library mode. Path prefix per persona
 * surface; tenant comes from the session, never the URL. Guards are UX only.
 */
import { Navigate, type RouteObject } from 'react-router';
import { RequireSurface, RootRedirect } from '../auth/guards';
import { ConsoleShell, UnderConstruction } from '../shells/ConsoleShell';
import { DownloadAppPage } from '../pages/DownloadAppPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { InvitePage } from '../pages/InvitePage';
import { LoginPage } from '../pages/LoginPage';
import { CadastrosPage } from '../pages/admin/CadastrosPage';
import { CalendarioPage } from '../pages/admin/CalendarioPage';
import { GraduationRulesPage } from '../pages/admin/GraduationRulesPage';
import { PlansPage } from '../pages/admin/PlansPage';
import { TurmaDetailPage } from '../pages/admin/TurmaDetailPage';
import { VisaoFinanceiraPage } from '../pages/admin/VisaoFinanceiraPage';
import { RepassesPage } from '../pages/plataforma/RepassesPage';

export const appRoutes: RouteObject[] = [
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/esqueci-senha', element: <ForgotPasswordPage /> },
  { path: '/baixe-o-app', element: <DownloadAppPage /> },
  { path: '/convite/:token', element: <InvitePage /> },
  {
    path: '/admin',
    element: <RequireSurface surface="admin" />,
    children: [
      {
        element: <ConsoleShell surface="/admin" />,
        children: [
          // BIL.13: the console home is the Visão financeira per admin-02.
          { index: true, element: <VisaoFinanceiraPage /> },
          { path: 'cadastros', element: <CadastrosPage /> },
          // AGD.4: the admin console month calendar (admin-14, spec 007).
          { path: 'calendario', element: <CalendarioPage /> },
          { path: 'graduacao', element: <GraduationRulesPage /> },
          { path: 'planos', element: <PlansPage /> },
          { path: 'turmas/:id', element: <TurmaDetailPage /> },
          { path: '*', element: <UnderConstruction surfaceLabel="Painel da academia" /> },
        ],
      },
    ],
  },
  {
    path: '/plataforma',
    element: <RequireSurface surface="plataforma" />,
    children: [
      {
        element: <ConsoleShell surface="/plataforma" />,
        children: [
          // BIL.15: the platform console's first real screen (plataforma-09).
          { index: true, element: <RepassesPage /> },
          { path: '*', element: <UnderConstruction surfaceLabel="Visão geral" /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];
