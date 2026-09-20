/**
 * Aluno certificado (REP.12, spec 013 — aluno-09): "Ver certificado" is
 * unlocked exactly on certificateAvailable (belt-promotion) timeline
 * entries and opens the branded certificate view — academy name, student
 * name, the belt (BeltBar + belt token), award date and the professor
 * signature line — with the OS share action (React Native Share API).
 */

import { Share } from 'react-native';
import {
  act,
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe } from '../helpers/session';
import { makeAlunoHome } from '../helpers/attendance';
import { makeAlunoGraduation } from '../helpers/graduation';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

function renderAluno(): void {
  installFetchMock((request) => {
    if (request.method === 'GET' && request.path === '/v1/aluno/home') {
      return json(200, makeAlunoHome());
    }
    if (request.method === 'GET' && request.path === '/v1/aluno/graduation') {
      return json(200, makeAlunoGraduation());
    }
    return null;
  });
  sessionTestApi.seed({
    status: 'authed',
    session: makeMe({ role: 'student' }),
  });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
}

async function openGraduacao(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByLabelText('Sua graduação')).toBeTruthy(),
  );
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Sua graduação'));
  });
  await waitFor(() => expect(screen.getByText('Faixa atual')).toBeTruthy());
}

describe('aluno certificado (REP.12)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('unlocks Ver certificado only on the belt-promotion entry', async () => {
    renderAluno();
    await openGraduacao();

    // One certificateAvailable entry in the fixture (faixa azul) — degree
    // and initial-belt entries keep no button (story 30).
    const buttons = screen.getAllByText('Ver certificado');
    expect(buttons).toHaveLength(1);
  });

  it('opens the branded certificate view from the timeline entry', async () => {
    renderAluno();
    await openGraduacao();

    await act(async () => {
      fireEvent.press(screen.getByText('Ver certificado'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('certificate-card')).toBeTruthy(),
    );
    expect(screen.getByText('Certificado de graduação')).toBeTruthy();
    expect(screen.getByText('Lucas Almeida')).toBeTruthy();
    // Belt line + academy name from the session (branded composition).
    expect(screen.getByText('faixa azul')).toBeTruthy();
    expect(screen.getByText(/Alpha Jiu-Jitsu/)).toBeTruthy();
    expect(screen.getByTestId('certificate-belt')).toBeTruthy();
    expect(screen.getByTestId('certificate-logo')).toBeTruthy();
    // Award date + professor signature line.
    expect(screen.getByText('20 de novembro de 2024')).toBeTruthy();
    expect(screen.getByText('Rafael Nunes')).toBeTruthy();
    expect(screen.getByText('Professor')).toBeTruthy();
  });

  it('Compartilhar hands the certificate to the OS share sheet', async () => {
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.dismissedAction });
    renderAluno();
    await openGraduacao();

    await act(async () => {
      fireEvent.press(screen.getByText('Ver certificado'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('certificate-share')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('certificate-share'));
    });

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const payload = shareSpy.mock.calls[0]?.[0] as {
      title?: string;
      message?: string;
    };
    expect(payload.title).toBe('Certificado de graduação');
    expect(payload.message).toContain('Lucas Almeida');
    expect(payload.message).toContain('faixa azul');
    expect(payload.message).toContain('Alpha Jiu-Jitsu');
    expect(payload.message).toContain('Rafael Nunes');
    shareSpy.mockRestore();
  });
});
