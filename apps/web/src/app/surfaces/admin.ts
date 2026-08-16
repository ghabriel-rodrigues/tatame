/**
 * RLS.6 — admin console surface chunk (every page under `/admin`). Only
 * ever imported via the dynamic `import()` in `app/routes.tsx` — a static
 * import anywhere would fold this chunk back into the entry bundle (this
 * is a chunk boundary, not a barrel for general consumption).
 */
export { CadastrosPage } from '../../pages/admin/CadastrosPage';
export { CalendarioPage } from '../../pages/admin/CalendarioPage';
export { ConfiguracoesPage } from '../../pages/admin/ConfiguracoesPage';
export { EventosPage } from '../../pages/admin/EventosPage';
export { GraduationRulesPage } from '../../pages/admin/GraduationRulesPage';
export { LojaPage } from '../../pages/admin/LojaPage';
export { PermissoesPage } from '../../pages/admin/PermissoesPage';
export { PlansPage } from '../../pages/admin/PlansPage';
export { RelatoriosPage } from '../../pages/admin/RelatoriosPage';
export { ReportPrintPage } from '../../pages/admin/ReportPrintPage';
export { TurmaDetailPage } from '../../pages/admin/TurmaDetailPage';
export { VisaoFinanceiraPage } from '../../pages/admin/VisaoFinanceiraPage';
