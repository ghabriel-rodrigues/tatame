/**
 * Aluno Dados pessoais (REP.10, spec 013 — aluno-18): screen reached from
 * the perfil row, sections IDENTIFICAÇÃO/CONTATO/ENDEREÇO/EMERGÊNCIA,
 * locked CPF/RG dashed boxes (editable while unset), read-only email and
 * birth date, Cidade / UF single input parsed on save, Trocar foto
 * placeholder and the Salvar round trip with per-field PT-BR 422 mapping.
 */

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
import {
  installFetchMock,
  json,
  makeMe,
  type FetchHandler,
} from '../helpers/session';
import { makeAlunoHome } from '../helpers/attendance';
import { makeAlunoProfile, makeEmptyAlunoProfile } from '../helpers/profile';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

function renderAluno(override?: FetchHandler): jest.Mock {
  const mock = installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (request.method === 'GET' && request.path === '/v1/aluno/home') {
      return json(200, makeAlunoHome());
    }
    if (request.method === 'GET' && request.path === '/v1/aluno/profile') {
      return json(200, makeAlunoProfile());
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
  return mock;
}

async function openDadosPessoais(): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText('Perfil')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Perfil'));
  });
  await waitFor(() =>
    expect(screen.getByTestId('perfil-dados-row')).toBeTruthy(),
  );
  await act(async () => {
    fireEvent.press(screen.getByTestId('perfil-dados-row'));
  });
  await waitFor(() => expect(screen.getByText('Dados pessoais')).toBeTruthy());
}

describe('aluno Dados pessoais (REP.10)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('renders the aluno-18 sections with locked documents and read-only identity', async () => {
    renderAluno();
    await openDadosPessoais();

    await waitFor(() => expect(screen.getByText('Identificação')).toBeTruthy());
    expect(screen.getByText('Contato')).toBeTruthy();
    expect(screen.getByText('Endereço')).toBeTruthy();
    expect(screen.getByText('Contato de emergência')).toBeTruthy();

    // Locked CPF/RG: dashed boxes with the mask, no editable inputs.
    expect(screen.getByTestId('cpf-locked')).toBeTruthy();
    expect(screen.getByText('CPF · 123.456.789-00')).toBeTruthy();
    expect(screen.getByTestId('rg-locked')).toBeTruthy();
    expect(screen.getByText('RG · 12.345.678-9')).toBeTruthy();
    expect(screen.queryByTestId('campo-cpf')).toBeNull();
    expect(screen.queryByTestId('campo-rg')).toBeNull();

    // Read-only identity facts.
    expect(screen.getByDisplayValue('lucas.almeida@email.com')).toBeTruthy();
    expect(screen.getByDisplayValue('14/03/1998')).toBeTruthy();

    // Cidade / UF combined field + CEP mask, emergência filled.
    expect(screen.getByDisplayValue('São Paulo / SP')).toBeTruthy();
    expect(screen.getByDisplayValue('01310-100')).toBeTruthy();
    expect(screen.getByDisplayValue('Carla Almeida')).toBeTruthy();

    // Trocar foto stays a disabled placeholder (avatars are initials).
    const trocarFoto = screen.getByTestId('trocar-foto');
    expect(trocarFoto.props.accessibilityState?.disabled).toBe(true);
  });

  it('renders editable CPF/RG inputs while the documents are unset', async () => {
    renderAluno(({ method, path }) =>
      method === 'GET' && path === '/v1/aluno/profile'
        ? json(200, makeEmptyAlunoProfile())
        : null,
    );
    await openDadosPessoais();

    await waitFor(() => expect(screen.getByTestId('campo-cpf')).toBeTruthy());
    expect(screen.getByTestId('campo-rg')).toBeTruthy();
    expect(screen.queryByTestId('cpf-locked')).toBeNull();
    expect(screen.queryByTestId('rg-locked')).toBeNull();
  });

  it('Salvar PUTs the parsed payload and shows the saved toast', async () => {
    let putBody: Record<string, unknown> | null = null;
    renderAluno(({ method, path, body }) => {
      if (method === 'PUT' && path === '/v1/aluno/profile') {
        putBody = body as Record<string, unknown>;
        return json(200, makeAlunoProfile({ fullName: 'Lucas A. Silva' }));
      }
      return null;
    });
    await openDadosPessoais();
    await waitFor(() =>
      expect(screen.getByLabelText('Nome completo')).toBeTruthy(),
    );

    fireEvent.changeText(
      screen.getByLabelText('Nome completo'),
      'Lucas A. Silva',
    );
    fireEvent.changeText(screen.getByLabelText('Cidade / UF'), 'Campinas / sp');
    await act(async () => {
      fireEvent.press(screen.getByTestId('dados-salvar'));
    });

    await waitFor(() =>
      expect(screen.getByText('Dados pessoais salvos.')).toBeTruthy(),
    );
    expect(putBody).not.toBeNull();
    expect(putBody).toMatchObject({
      fullName: 'Lucas A. Silva',
      addressCity: 'Campinas',
      addressState: 'SP',
      addressZip: '01310100',
    });
    // Locked documents are never resent.
    expect(putBody).not.toHaveProperty('cpf');
    expect(putBody).not.toHaveProperty('rg');
    // Read-only identity facts are never sent.
    expect(putBody).not.toHaveProperty('email');
    expect(putBody).not.toHaveProperty('birthDate');
  });

  it('maps profile.field_locked onto the CPF field in PT-BR', async () => {
    renderAluno(({ method, path }) => {
      if (method === 'GET' && path === '/v1/aluno/profile') {
        return json(200, makeEmptyAlunoProfile());
      }
      if (method === 'PUT' && path === '/v1/aluno/profile') {
        return json(422, {
          status: 422,
          code: 'profile.field_locked',
          detail: 'CPF não pode ser alterado após definido',
          errors: [{ field: 'cpf', messages: ['locked'] }],
        });
      }
      return null;
    });
    await openDadosPessoais();
    await waitFor(() => expect(screen.getByTestId('campo-cpf')).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText('CPF'), '52998224725');
    await act(async () => {
      fireEvent.press(screen.getByTestId('dados-salvar'));
    });

    await waitFor(() =>
      expect(
        screen.getByText('CPF não pode ser alterado após definido.'),
      ).toBeTruthy(),
    );
    expect(screen.getByTestId('dados-error')).toBeTruthy();
  });

  it('maps validation.failed per-field messages onto the inputs', async () => {
    renderAluno(({ method, path }) =>
      method === 'PUT' && path === '/v1/aluno/profile'
        ? json(422, {
            status: 422,
            code: 'validation.failed',
            detail: 'Request validation failed',
            errors: [
              {
                field: 'addressZip',
                messages: ['CEP inválido — use 8 dígitos'],
              },
              { field: 'phone', messages: ['Telefone inválido'] },
            ],
          })
        : null,
    );
    await openDadosPessoais();
    await waitFor(() => expect(screen.getByLabelText('CEP')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('dados-salvar'));
    });

    await waitFor(() =>
      expect(screen.getByText('CEP inválido — use 8 dígitos')).toBeTruthy(),
    );
    expect(screen.getByText('Telefone inválido')).toBeTruthy();
    expect(screen.getByText('Revise os campos destacados.')).toBeTruthy();
  });
});
