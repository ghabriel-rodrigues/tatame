/**
 * Aluno "Tema escuro" (CFG.13, aluno-21): the perfil switch flips the whole
 * shell to the dark token set, persists the preference in AsyncStorage, and
 * the status bar style follows the mode. Cold start with a persisted dark
 * preference renders the home already dark (hero, cards, glass tab bar).
 */

import {
  act,
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import * as AsyncStorageModule from '@react-native-async-storage/async-storage';
import { darkTokens, tokens } from '@tatame/design-system/native';
import { queryClient } from '../../src/session/api';
import {
  sessionTestApi,
  type SessionState,
} from '../../src/session/session-store';
import { THEME_MODE_KEY, themeTestApi } from '../../src/theme/theme-store';
import { installFetchMock, json, makeMe } from '../helpers/session';
import { makeAlunoHome } from '../helpers/attendance';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };
const storage = AsyncStorageModule as unknown as {
  __store: Map<string, string>;
  __reset: () => void;
};

const DARK_SURFACE = darkTokens.color.bg.surface;
const LIGHT_SURFACE = tokens.color.bg.surface;

function renderApp(state: SessionState) {
  sessionTestApi.seed(state);
  const utils = renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  return utils;
}

function statusBarStyle(): string {
  return screen.UNSAFE_getByType(StatusBar).props.style as string;
}

/** Flattened backgroundColor of a style prop (array or object). */
function backgroundOf(testID: string): string | undefined {
  const style = screen.getByTestId(testID).props.style as
    Array<Record<string, unknown>> | Record<string, unknown>;
  const flat = Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : (style ?? {});
  return flat.backgroundColor as string | undefined;
}

describe('aluno tema escuro', () => {
  beforeEach(() => {
    secure.__reset();
    storage.__reset();
    themeTestApi.reset();
    sessionTestApi.reset();
    queryClient.clear();
    installFetchMock(({ method, path }) =>
      method === 'GET' && path === '/v1/aluno/home'
        ? json(200, makeAlunoHome())
        : null,
    );
  });

  it('perfil switch flips the shell dark, persists, and moves the status bar', async () => {
    renderApp({ status: 'authed', session: makeMe({ role: 'student' }) });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Perfil'));
    });
    const row = screen.getByTestId('perfil-dark-theme-row');
    expect(row).toBeTruthy();
    expect(screen.getByText('Tema escuro')).toBeTruthy();
    expect(statusBarStyle()).toBe('dark'); // light mode after the splash

    await act(async () => {
      fireEvent(
        screen.getByTestId('perfil-dark-theme-switch'),
        'valueChange',
        true,
      );
    });

    // Mode persisted per device (survives relaunch via hydrateTheme).
    await waitFor(() =>
      expect(storage.__store.get(THEME_MODE_KEY)).toBe('dark'),
    );
    // The whole shell re-renders on the dark token set...
    expect(statusBarStyle()).toBe('light');
    expect(screen.getByTestId('perfil-dark-theme-switch').props.value).toBe(
      true,
    );

    // ...including the home surfaces when navigating back.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Início'));
    });
    await waitFor(() =>
      expect(backgroundOf('graduation-card')).toBe(DARK_SURFACE),
    );

    // Flipping back restores light + persists it.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Perfil'));
    });
    await act(async () => {
      fireEvent(
        screen.getByTestId('perfil-dark-theme-switch'),
        'valueChange',
        false,
      );
    });
    await waitFor(() =>
      expect(storage.__store.get(THEME_MODE_KEY)).toBe('light'),
    );
    expect(statusBarStyle()).toBe('dark');
  });

  it('cold start with the persisted dark preference renders the home dark (aluno-21)', async () => {
    storage.__store.set(THEME_MODE_KEY, 'dark');
    renderApp({ status: 'authed', session: makeMe({ role: 'student' }) });

    // hydrateTheme() runs in the root layout effect — wait for the flip.
    await waitFor(() => expect(statusBarStyle()).toBe('light'));

    // Home hero (brand gradient card) still renders; dark cards + tab bar.
    await waitFor(() => expect(screen.getByText('Open mat')).toBeTruthy());
    expect(screen.getByTestId('aluno-hero')).toBeTruthy();
    expect(backgroundOf('graduation-card')).toBe(DARK_SURFACE);
    expect(backgroundOf('tile-presenca')).toBe(DARK_SURFACE);
    expect(screen.getByTestId('glass-tab-bar')).toBeTruthy();
  });

  it('without a persisted preference the shell stays light', async () => {
    renderApp({ status: 'authed', session: makeMe({ role: 'student' }) });
    await waitFor(() => expect(screen.getByText('Open mat')).toBeTruthy());
    expect(statusBarStyle()).toBe('dark');
    expect(backgroundOf('graduation-card')).toBe(LIGHT_SURFACE);
  });
});
