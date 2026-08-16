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
import { ConfiguracoesPage } from '../pages/admin/ConfiguracoesPage';
import { EventosPage } from '../pages/admin/EventosPage';
import { GraduationRulesPage } from '../pages/admin/GraduationRulesPage';
import { LojaPage } from '../pages/admin/LojaPage';
import { PermissoesPage } from '../pages/admin/PermissoesPage';
import { PlansPage } from '../pages/admin/PlansPage';
import { TurmaDetailPage } from '../pages/admin/TurmaDetailPage';
import { VisaoFinanceiraPage } from '../pages/admin/VisaoFinanceiraPage';
import { AcademiaDetailPage } from '../pages/plataforma/AcademiaDetailPage';
import { AcademiasPage } from '../pages/plataforma/AcademiasPage';
import { ContaPage, EquipePage, IntegracoesPage } from '../pages/plataforma/ContaPage';
import { PlanosPage } from '../pages/plataforma/PlanosPage';
import { PlataformaHome } from '../pages/plataforma/PlataformaHome';
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
          // CFG.9: the Configurações hub (admin-15, spec 011).
          { path: 'configuracoes', element: <ConfiguracoesPage /> },
          // EVT.9: the admin events console (admin-13, spec 008).
          { path: 'eventos', element: <EventosPage /> },
          { path: 'graduacao', element: <GraduationRulesPage /> },
          // STO.8-9: the admin Loja console (admin-03/04/05/06, spec 009).
          { path: 'loja', element: <LojaPage /> },
          // CFG.11: per-role permission toggles (admin-17, spec 011).
          { path: 'permissoes', element: <PermissoesPage /> },
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
          // PLT.10: Visão geral for owner/finance; support lands on Academias
          // (the API refuses it the overview, so a 403 is not a home).
          { index: true, element: <PlataformaHome /> },
          { path: 'academias', element: <AcademiasPage /> },
          { path: 'academias/:id', element: <AcademiaDetailPage /> },
          { path: 'planos', element: <PlanosPage /> },
          { path: 'conta', element: <ContaPage /> },
          { path: 'equipe', element: <EquipePage /> },
          { path: 'integracoes', element: <IntegracoesPage /> },
          // BIL.15: shipped with the billing phase, now reachable from Conta.
          { path: 'repasses', element: <RepassesPage /> },
          { path: '*', element: <UnderConstruction surfaceLabel="Console da plataforma" /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];
