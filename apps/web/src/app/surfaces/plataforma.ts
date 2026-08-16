/**
 * RLS.6 — plataforma console surface chunk (every page under
 * `/plataforma`). Only ever imported via the dynamic `import()` in
 * `app/routes.tsx` — a static import anywhere would fold this chunk back
 * into the entry bundle (this is a chunk boundary, not a barrel for
 * general consumption).
 */
export { AcademiaDetailPage } from '../../pages/plataforma/AcademiaDetailPage';
export { AcademiasPage } from '../../pages/plataforma/AcademiasPage';
export {
  ContaPage,
  EquipePage,
  IntegracoesPage,
} from '../../pages/plataforma/ContaPage';
export { PlanosPage } from '../../pages/plataforma/PlanosPage';
export { PlataformaHome } from '../../pages/plataforma/PlataformaHome';
export { RepassesPage } from '../../pages/plataforma/RepassesPage';
