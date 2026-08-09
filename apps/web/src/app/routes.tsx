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
import { GraduationRulesPage } from '../pages/admin/GraduationRulesPage';
import { TurmaDetailPage } from '../pages/admin/TurmaDetailPage';

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
          { index: true, element: <UnderConstruction surfaceLabel="Painel da academia" /> },
          { path: 'cadastros', element: <CadastrosPage /> },
          { path: 'graduacao', element: <GraduationRulesPage /> },
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
          { index: true, element: <UnderConstruction surfaceLabel="Visão geral" /> },
          { path: '*', element: <UnderConstruction surfaceLabel="Visão geral" /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];
