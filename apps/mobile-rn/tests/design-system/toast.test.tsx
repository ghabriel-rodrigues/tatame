/**
 * Toast — glass pill, auto-hide contract (~2.6s) (DS.7).
 */

import { act, render, screen } from '@testing-library/react-native';
import { Toast, ThemeProvider } from '@tatame/design-system/native';

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when closed', () => {
    render(<Toast open={false} message="Presença registrada" />);
    expect(screen.queryByText('Presença registrada')).toBeNull();
  });

  it('renders the glass pill with the message when open', () => {
    render(
      <ThemeProvider>
        <Toast open message="Presença registrada" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Presença registrada')).toBeTruthy();
    expect(screen.getByTestId('glass-blur')).toBeTruthy();
  });

  it('auto-hides after the default ~2.6s', () => {
    const onClose = jest.fn();
    render(<Toast open message="ok" onClose={onClose} />);
    act(() => {
      jest.advanceTimersByTime(2599);
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('honors a custom duration and cancels the timer on close', () => {
    const onClose = jest.fn();
    const view = render(
      <Toast open message="ok" onClose={onClose} duration={500} />,
    );
    view.rerender(
      <Toast open={false} message="ok" onClose={onClose} duration={500} />,
    );
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
