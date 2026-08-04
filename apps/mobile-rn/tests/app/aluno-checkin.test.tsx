/**
 * Check-in sheet (ATT.15/16, aluno-04/05): FAB → sheet with the 3-method
 * segmented control; camera-less environments degrade QR to code entry;
 * code and manual methods post to /v1/aluno/checkins; success pop with the
 * streak line (hidden when gamification is off), the distinct
 * already-checked-in state, PT-BR error mapping and the hero flip fed by
 * the invalidated home query.
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe, problem, type FetchHandler } from '../helpers/session';
import {
  OPEN_MAT_CLASS_ID,
  makeAlunoHome,
  makeCheckinResponse,
} from '../helpers/attendance';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

interface CheckinLog {
  bodies: unknown[];
}

function renderWithCheckin(override?: FetchHandler): CheckinLog {
  const log: CheckinLog = { bodies: [] };
  let checkedIn = false;
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (request.method === 'GET' && request.path === '/v1/aluno/home') {
      return json(200, makeAlunoHome({ checkedIn }));
    }
    if (request.method === 'POST' && request.path === '/v1/aluno/checkins') {
      log.bodies.push(request.body);
      checkedIn = true;
      return json(200, makeCheckinResponse());
    }
    return null;
  });
  sessionTestApi.seed({ status: 'authed', session: makeMe({ role: 'student' }) });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  return log;
}

async function openSheet(): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Check-in'));
  });
  await waitFor(() => expect(screen.getByTestId('checkin-sheet')).toBeTruthy());
}

async function submitCode(code = '4729'): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Código'));
  });
  fireEvent.changeText(screen.getByLabelText('Código da chamada'), code);
  await act(async () => {
    fireEvent.press(screen.getByText('Confirmar código'));
  });
}

describe('aluno check-in sheet (ATT.15/16)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('opens from the FAB with the today-class title and the 3 methods', async () => {
    renderWithCheckin();
    await openSheet();

    await waitFor(() => expect(screen.getByText('Check-in · Open mat')).toBeTruthy());
    expect(screen.getByText('Hoje, 10:00 – 12:00 · 120 min')).toBeTruthy();
    for (const method of ['QR Code', 'Código', 'Manual']) {
      expect(screen.getByLabelText(method)).toBeTruthy();
    }
  });

  it('degrades QR to code entry when the camera is unavailable', async () => {
    renderWithCheckin();
    await openSheet();

    // jest/simulator: no camera — the QR pane explains and offers the code.
    expect(screen.getByText(/Câmera indisponível/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Usar código'));
    });
    expect(screen.getByLabelText('Código da chamada')).toBeTruthy();
  });

  it('checks in by 4-digit code and celebrates with the streak line', async () => {
    const log = renderWithCheckin();
    await openSheet();
    await submitCode();

    await waitFor(() => expect(screen.getByTestId('checkin-success-pop')).toBeTruthy());
    expect(log.bodies).toContainEqual({ method: 'code', code: '4729' });
    // Sheet result title (the hero chip may render the same copy post-flip).
    expect(screen.getAllByText('Presença registrada').length).toBeGreaterThan(0);
    expect(screen.getByText('Essa é a sua 7ª aula seguida. Bom treino!')).toBeTruthy();
  });

  it('hides the streak line when gamification is off (streak null)', async () => {
    renderWithCheckin(({ method, path }) =>
      method === 'POST' && path === '/v1/aluno/checkins'
        ? json(200, makeCheckinResponse({}, { streak: null }))
        : null,
    );
    await openSheet();
    await submitCode();

    await waitFor(() => expect(screen.getByTestId('checkin-success-pop')).toBeTruthy());
    expect(screen.queryByText(/aula seguida/)).toBeNull();
  });

  it('lands the duplicate attempt on the distinct already-registered state', async () => {
    renderWithCheckin(({ method, path }) =>
      method === 'POST' && path === '/v1/aluno/checkins'
        ? json(200, makeCheckinResponse({ status: 'already_checked_in' }))
        : null,
    );
    await openSheet();
    await submitCode();

    await waitFor(() =>
      expect(screen.getByText(/já tinha feito check-in nesta aula/)).toBeTruthy(),
    );
    expect(screen.getAllByText('Presença registrada').length).toBeGreaterThan(0);
    // Never an error toast for the duplicate state.
    expect(screen.queryByText(/Algo deu errado/)).toBeNull();
  });

  it('maps checkin.code_invalid to the PT-BR inline error', async () => {
    renderWithCheckin(({ method, path }) =>
      method === 'POST' && path === '/v1/aluno/checkins'
        ? problem(422, 'checkin.code_invalid')
        : null,
    );
    await openSheet();
    await submitCode('9999');

    await waitFor(() =>
      expect(screen.getByText(/Código inválido ou expirado/)).toBeTruthy(),
    );
    expect(screen.queryByTestId('checkin-success-pop')).toBeNull();
  });

  it('manual method posts the today class with the location stub note', async () => {
    const log = renderWithCheckin();
    await openSheet();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Manual'));
    });
    expect(screen.getByText(/Verificação de localização em breve/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Registrar presença'));
    });

    await waitFor(() => expect(screen.getByTestId('checkin-success-pop')).toBeTruthy());
    expect(log.bodies).toContainEqual({ method: 'manual', classId: OPEN_MAT_CLASS_ID });
  });

  it('flips the home hero after closing the success state', async () => {
    renderWithCheckin();
    await openSheet();
    await submitCode();

    await waitFor(() => expect(screen.getByTestId('checkin-success-pop')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Fechar'));
    });

    await waitFor(() => expect(screen.getByTestId('hero-checked-in-chip')).toBeTruthy());
    expect(screen.queryByText('Fazer check-in')).toBeNull();
  });
});
