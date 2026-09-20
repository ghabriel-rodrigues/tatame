/**
 * Notifications pure logic (NOT.8-9, spec 010 testing decisions): the
 * relative PT-BR timestamp formatter and the semantic-route → shell-route
 * map per persona.
 */

import { relativeDayPt } from '../../src/features/notifications/format';
import { shellRouteFor } from '../../src/features/notifications/routes';

describe('relativeDayPt (aluno-20 trailing label)', () => {
  // Monday 2026-08-10 12:00 local.
  const now = new Date(2026, 7, 10, 12, 0, 0);

  it('renders Hoje for the same calendar day', () => {
    expect(relativeDayPt(new Date(2026, 7, 10, 0, 5).toISOString(), now)).toBe(
      'Hoje',
    );
    expect(
      relativeDayPt(new Date(2026, 7, 10, 11, 59).toISOString(), now),
    ).toBe('Hoje');
  });

  it('renders Ontem for the previous calendar day', () => {
    expect(relativeDayPt(new Date(2026, 7, 9, 23, 59).toISOString(), now)).toBe(
      'Ontem',
    );
  });

  it('renders the short weekday within the last week', () => {
    // 2026-08-08 was a Saturday, 2026-08-04 a Tuesday.
    expect(relativeDayPt(new Date(2026, 7, 8, 10, 0).toISOString(), now)).toBe(
      'Sáb',
    );
    expect(relativeDayPt(new Date(2026, 7, 4, 10, 0).toISOString(), now)).toBe(
      'Ter',
    );
  });

  it('renders the month abbreviation beyond a week', () => {
    expect(relativeDayPt(new Date(2026, 5, 20, 10, 0).toISOString(), now)).toBe(
      'Jun',
    );
    expect(
      relativeDayPt(new Date(2025, 11, 24, 10, 0).toISOString(), now),
    ).toBe('Dez');
  });
});

describe('shellRouteFor (semantic hint → shell navigation)', () => {
  it('maps the aluno vocabulary onto the aluno shell', () => {
    expect(shellRouteFor('aluno', 'wallet')).toBe('/carteira');
    expect(shellRouteFor('aluno', 'event/abc-123')).toBe('/evento/abc-123');
    expect(shellRouteFor('aluno', 'graduation')).toBe('/graduacao');
    expect(shellRouteFor('aluno', 'orders')).toBe('/loja/pedidos');
    expect(shellRouteFor('aluno', 'store')).toBe('/loja');
  });

  it('maps professor hints — no financial surface, events land on the calendário', () => {
    expect(shellRouteFor('professor', 'event/abc-123')).toBe('/calendario');
    expect(shellRouteFor('professor', 'orders')).toBe('/loja/pedidos');
    expect(shellRouteFor('professor', 'store')).toBe('/loja');
    expect(shellRouteFor('professor', 'wallet')).toBeNull();
    expect(shellRouteFor('professor', 'graduation')).toBeNull();
  });

  it('maps guardian hints onto Pagamentos / dependents / Eventos', () => {
    expect(shellRouteFor('responsavel', 'wallet')).toBe('/pagamentos');
    expect(shellRouteFor('responsavel', 'graduation')).toBe('/');
    expect(shellRouteFor('responsavel', 'event/abc-123')).toBe('/eventos');
    expect(shellRouteFor('responsavel', 'orders')).toBeNull();
    expect(shellRouteFor('responsavel', 'store')).toBeNull();
  });

  it('treats null and unknown hints as inert', () => {
    expect(shellRouteFor('aluno', null)).toBeNull();
    expect(shellRouteFor('aluno', undefined)).toBeNull();
    expect(shellRouteFor('aluno', '')).toBeNull();
    expect(shellRouteFor('aluno', 'mystery/42')).toBeNull();
    expect(shellRouteFor('aluno', 'event')).toBeNull();
  });
});
