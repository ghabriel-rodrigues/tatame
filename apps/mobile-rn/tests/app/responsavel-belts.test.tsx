/**
 * Responsável dependent belts (GRD.17, story 34, responsavel-02): each
 * dependent card draws the child's belt with degrees plus the faixa stat
 * tile, and the detail's Graduação card renders the real belt (the phase
 * placeholder remains only when no belt payload arrives — covered by the
 * ENR.19 suite).
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
import { installFetchMock, json, makeMe, problem } from '../helpers/session';
import { makeDependents } from '../helpers/enrollment';
import { BELT_IDS, makeBeltView } from '../helpers/graduation';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

function makeBeltedDependents() {
  const [pedro, julia] = makeDependents();
  return [
    {
      ...pedro!,
      belt: makeBeltView({
        beltId: BELT_IDS.cinza,
        name: 'Cinza',
        colorSlug: 'belt.gray',
        degrees: 3,
      }),
    },
    {
      ...julia!,
      belt: makeBeltView({
        beltId: BELT_IDS.amarela,
        name: 'Amarela',
        colorSlug: 'belt.yellow',
        degrees: 1,
      }),
    },
  ];
}

function renderResponsavel(): void {
  const dependents = makeBeltedDependents();
  installFetchMock((request) => {
    const { method, path } = request;
    if (method === 'GET' && path === '/v1/responsavel/dependents') {
      return json(200, { dependents });
    }
    const match = /^\/v1\/responsavel\/dependents\/([0-9a-f-]+)$/.exec(path);
    if (method === 'GET' && match) {
      const dependent = dependents.find((item) => item.id === match[1]);
      return dependent
        ? json(200, { dependent })
        : problem(404, 'resource.not_found');
    }
    return null;
  });
  sessionTestApi.seed({
    status: 'authed',
    session: makeMe({ role: 'guardian', fullName: 'Fernanda Silveira' }),
  });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
}

describe('responsável dependent belts (GRD.17)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('draws each child belt on the panel card with the faixa tile', async () => {
    renderResponsavel();
    await waitFor(() =>
      expect(screen.getByText('Pedro Silveira')).toBeTruthy(),
    );

    const dependents = makeBeltedDependents();
    expect(
      screen.getByTestId(`dependent-belt-${dependents[0]!.id}`),
    ).toBeTruthy();
    expect(
      screen.getByTestId(`dependent-belt-${dependents[1]!.id}`),
    ).toBeTruthy();

    // Faixa tiles: "Cinza / 3 graus" and "Amarela / 1 grau" (responsavel-02).
    expect(screen.getByText('Cinza')).toBeTruthy();
    expect(screen.getByText('3 graus')).toBeTruthy();
    expect(screen.getByText('Amarela')).toBeTruthy();
    expect(screen.getByText('1 grau')).toBeTruthy();
    expect(screen.queryByText('Em breve')).toBeNull();
  });

  it('renders the real belt in the dependent detail Graduação card', async () => {
    renderResponsavel();
    await waitFor(() =>
      expect(screen.getByText('Pedro Silveira')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Pedro Silveira'));
    });
    await waitFor(() => expect(screen.getByText('Graduação')).toBeTruthy());

    expect(screen.getByTestId('dependent-detail-belt')).toBeTruthy();
    expect(screen.getByText('Faixa cinza · 3 graus')).toBeTruthy();
    expect(
      screen.queryByText(
        'A evolução de faixa e graus chega na fase de graduação.',
      ),
    ).toBeNull();
  });
});
