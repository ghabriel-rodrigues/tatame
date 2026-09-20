/**
 * Events pure logic (EVT.10-11, spec 008 testing decisions): PT-BR labels,
 * the detail button state machine (free/paid × none/pending/confirmed), the
 * self-cancel rule, the responsável chip action map and the calendar
 * day-bucketing of month events.
 */

import {
  canCancel,
  confirmadosLine,
  dateSquare,
  dependentChipAction,
  detailAction,
  eventDateLine,
  eventDayMap,
  eventShortLine,
  eventStateChip,
  payLabel,
  priceLabel,
} from '../../src/features/events/format';
import {
  makeCalendarEvent,
  makePendingRegistration,
  makeRegistration,
} from '../helpers/events';

describe('events format (EVT.10-11)', () => {
  it('priceLabel: null = Gratuito, cents = BRL', () => {
    expect(priceLabel(null)).toBe('Gratuito');
    expect(priceLabel(undefined)).toBe('Gratuito');
    expect(priceLabel(6_000)).toBe('R$ 60,00');
  });

  it('dateSquare renders the aluno-11 "15 / AGO" square', () => {
    expect(dateSquare('2026-08-15')).toEqual({ day: '15', month: 'AGO' });
    expect(dateSquare('2026-09-03')).toEqual({ day: '3', month: 'SET' });
  });

  it('eventDateLine: full PT-BR weekday, "Data a definir" guard, time join', () => {
    expect(eventDateLine('2026-08-15', '10:00')).toBe(
      'Sábado, 15 de agosto · 10:00',
    );
    expect(eventDateLine('2026-08-15', null)).toBe('Sábado, 15 de agosto');
    expect(eventDateLine(null, null)).toBe('Data a definir');
  });

  it('eventShortLine matches responsavel-06 ("Dom, 13 de setembro · 09:30 · local")', () => {
    expect(eventShortLine('2026-09-13', '09:30', 'Ginásio Municipal')).toBe(
      'Dom, 13 de setembro · 09:30 · Ginásio Municipal',
    );
    expect(eventShortLine('2026-08-15', '10:00', null)).toBe(
      'Sáb, 15 de agosto · 10:00',
    );
    expect(eventShortLine(null)).toBe('Data a definir');
  });

  it('eventStateChip: own state wins over the valor chip', () => {
    expect(eventStateChip(6_000, makeRegistration())).toEqual({
      label: 'Confirmado',
      tone: 'success',
    });
    expect(eventStateChip(6_000, makePendingRegistration())).toEqual({
      label: 'Pagamento pendente',
      tone: 'warning',
    });
    expect(eventStateChip(6_000, null)).toEqual({
      label: 'R$ 60,00',
      tone: 'neutral',
    });
    expect(eventStateChip(null, null)).toEqual({
      label: 'Gratuito',
      tone: 'brand',
    });
    // Canceled rows behave as none — the row is reused on re-register.
    expect(
      eventStateChip(null, makeRegistration({ status: 'canceled' })),
    ).toEqual({
      label: 'Gratuito',
      tone: 'brand',
    });
  });

  it('detailAction: the free/paid × none/pending/confirmed machine', () => {
    expect(detailAction(null, null)).toEqual({
      kind: 'confirm',
      label: 'Confirmar presença',
    });
    // Spec 008 fixed copy: "Pagar inscrição · R$ X".
    expect(detailAction(6_000, null)).toEqual({
      kind: 'pay',
      label: 'Pagar inscrição · R$ 60,00',
    });
    expect(detailAction(6_000, makePendingRegistration())).toEqual({
      kind: 'pending',
      label: 'Pagar inscrição · R$ 60,00',
    });
    expect(detailAction(null, makeRegistration())).toEqual({
      kind: 'confirmed',
    });
    expect(detailAction(6_000, makeRegistration())).toEqual({
      kind: 'confirmed',
    });
    expect(
      detailAction(6_000, makeRegistration({ status: 'canceled' })),
    ).toEqual({
      kind: 'pay',
      label: payLabel(6_000),
    });
  });

  it('canCancel: free or not-yet-paid only (story 15)', () => {
    expect(canCancel(null, makeRegistration())).toBe(true);
    expect(canCancel(6_000, makePendingRegistration())).toBe(true);
    // Settled inscription: only the audited admin refund undoes it.
    expect(canCancel(6_000, makeRegistration())).toBe(false);
    expect(canCancel(null, null)).toBe(false);
    expect(canCancel(6_000, makeRegistration({ status: 'canceled' }))).toBe(
      false,
    );
  });

  it('dependentChipAction: free toggle, paid pay/resume, settled inert (stories 18-21)', () => {
    expect(dependentChipAction(null, null)).toBe('confirm');
    expect(dependentChipAction(null, makeRegistration())).toBe('cancel');
    expect(dependentChipAction(6_000, null)).toBe('pay');
    expect(dependentChipAction(6_000, makePendingRegistration())).toBe(
      'resume-payment',
    );
    expect(dependentChipAction(6_000, makeRegistration())).toBe('none');
    expect(
      dependentChipAction(6_000, makeRegistration({ status: 'canceled' })),
    ).toBe('pay');
  });

  it('confirmadosLine renders the professor dashboard list line (story 22)', () => {
    expect(confirmadosLine(32, null)).toBe('32 confirmados · gratuito');
    expect(confirmadosLine(18, 12_000)).toBe('18 confirmados · R$ 120,00');
  });

  it('eventDayMap buckets only the rendered month, sorted by time', () => {
    const map = eventDayMap(
      [
        makeCalendarEvent({ id: 'b', date: '2026-08-15', time: '14:00' }),
        makeCalendarEvent({ id: 'a', date: '2026-08-15', time: '10:00' }),
        makeCalendarEvent({ id: 'c', date: '2026-09-13', time: '09:30' }),
        makeCalendarEvent({ id: 'd', date: null }),
      ],
      '2026-08',
    );
    expect(Object.keys(map)).toEqual(['15']);
    expect(map[15]!.map((event) => event.id)).toEqual(['a', 'b']);
  });
});
