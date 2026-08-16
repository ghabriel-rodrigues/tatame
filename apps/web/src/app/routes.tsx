/**
 * Route tree (web-02): react-router v7 library mode. Path prefix per persona
 * surface; tenant comes from the session, never the URL. Guards are UX only.
 *
 * RLS.6 — code-split per web-01: one dynamic `import()` per persona surface
 * (login/public, Convite, shared console shell, admin, plataforma) behind
 * `React.lazy`, so the public Convite flow never downloads console code and
 * vice-versa. Literal import paths only (bundle-analyzable-paths); guards
 * stay static — they gate before any chunk is fetched.
 */
import { Suspense } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { Navigate, Outlet, type RouteObject } from 'react-router';
import { RequireSurface, RootRedirect } from '../auth/guards';
import { createSurface } from './lazy-surface';

const publicSurface = createSurface(() => import('./surfaces/public'));
const conviteSurface = createSurface(() => import('../pages/InvitePage'));
const shellSurface = createSurface(() => import('../shells/ConsoleShell'));
const adminSurface = createSurface(() => import('./surfaces/admin'));
const plataformaSurface = createSurface(() => import('./surfaces/plataforma'));

// Login/public bundle.
const LoginPage = publicSurface.component('LoginPage');
const ForgotPasswordPage = publicSurface.component('ForgotPasswordPage');
const DownloadAppPage = publicSurface.component('DownloadAppPage');

// Convite flow bundle (public, brandable — must stay console-free).
const InvitePage = conviteSurface.component('InvitePage');

// Console shell bundle (shared by both console surfaces, not by Convite).
const ConsoleShell = shellSurface.component('ConsoleShell');
const UnderConstruction = shellSurface.component('UnderConstruction');

// Admin console pages bundle.
const CadastrosPage = adminSurface.component('CadastrosPage');
const CalendarioPage = adminSurface.component('CalendarioPage');
const ConfiguracoesPage = adminSurface.component('ConfiguracoesPage');
const EventosPage = adminSurface.component('EventosPage');
const GraduationRulesPage = adminSurface.component('GraduationRulesPage');
const LojaPage = adminSurface.component('LojaPage');
const PermissoesPage = adminSurface.component('PermissoesPage');
const PlansPage = adminSurface.component('PlansPage');
const RelatoriosPage = adminSurface.component('RelatoriosPage');
const ReportPrintPage = adminSurface.component('ReportPrintPage');
const TurmaDetailPage = adminSurface.component('TurmaDetailPage');
const VisaoFinanceiraPage = adminSurface.component('VisaoFinanceiraPage');

// Plataforma console pages bundle.
const AcademiaDetailPage = plataformaSurface.component('AcademiaDetailPage');
const AcademiasPage = plataformaSurface.component('AcademiasPage');
const ContaPage = plataformaSurface.component('ContaPage');
const EquipePage = plataformaSurface.component('EquipePage');
const IntegracoesPage = plataformaSurface.component('IntegracoesPage');
const PlanosPage = plataformaSurface.component('PlanosPage');
const PlataformaHome = plataformaSurface.component('PlataformaHome');
const RepassesPage = plataformaSurface.component('RepassesPage');

/** Suspense fallback — simple centered DS-themed spinner while a chunk loads. */
function SurfaceFallback() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-app)',
      }}
    >
      <CircularProgress size={26} aria-label="Carregando" />
    </Box>
  );
}

/** Single Suspense boundary above every lazy surface. */
function SuspenseBoundary() {
  return (
    <Suspense fallback={<SurfaceFallback />}>
      <Outlet />
    </Suspense>
  );
}

export const appRoutes: RouteObject[] = [
  {
    element: <SuspenseBoundary />,
    children: [
      { path: '/', element: <RootRedirect /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/esqueci-senha', element: <ForgotPasswordPage /> },
      { path: '/baixe-o-app', element: <DownloadAppPage /> },
      { path: '/convite/:token', element: <InvitePage /> },
      {
        path: '/admin',
        element: <RequireSurface surface="admin" />,
        children: [
          // REP.9: the print-friendly report view the PDF button opens in a new
          // tab — under the admin guard but outside the shell (paper, no chrome).
          { path: 'relatorios/:report/imprimir', element: <ReportPrintPage /> },
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
              // REP.9: the five admin-18 report rows (spec 013), reached from
              // the Relatórios header entry on the Visão financeira.
              { path: 'relatorios', element: <RelatoriosPage /> },
              { path: 'turmas/:id', element: <TurmaDetailPage /> },
              {
                path: '*',
                element: (
                  <UnderConstruction surfaceLabel="Painel da academia" />
                ),
              },
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
              {
                path: '*',
                element: (
                  <UnderConstruction surfaceLabel="Console da plataforma" />
                ),
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];
