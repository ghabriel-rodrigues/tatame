/**
 * CalendarMonth — P2 composed (ds-05 inventory): month grid with Sunday-first
 * layout, per-day class/event dots, selection state and the legend row.
 */

import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CalendarMonth, ThemeProvider } from '@tatame/design-system/native';

function renderMonth(
  props: Partial<ComponentProps<typeof CalendarMonth>> = {},
) {
  return render(
    <ThemeProvider>
      <CalendarMonth year={2026} month={8} testID="calendar" {...props} />
    </ThemeProvider>,
  );
}

describe('CalendarMonth', () => {
  it('renders every day of the given month', () => {
    renderMonth();
    for (const day of [1, 15, 31]) {
      expect(screen.getByLabelText(`Dia ${day}`)).toBeTruthy();
    }
    expect(screen.queryByLabelText('Dia 32')).toBeNull();
  });

  it('paints class and event dots from the marks map', () => {
    renderMonth({
      marks: { 3: { classDot: true }, 15: { classDot: true, eventDot: true } },
    });
    expect(screen.getByTestId('class-dot-3')).toBeTruthy();
    expect(screen.getByTestId('class-dot-15')).toBeTruthy();
    expect(screen.getByTestId('event-dot-15')).toBeTruthy();
    expect(screen.queryByTestId('event-dot-3')).toBeNull();
    expect(screen.queryByTestId('class-dot-4')).toBeNull();
  });

  it('exposes the selected day and reports taps', () => {
    const onSelectDay = jest.fn();
    renderMonth({ selectedDay: 2, onSelectDay });

    expect(
      screen.getByLabelText('Dia 2').props.accessibilityState.selected,
    ).toBe(true);
    expect(
      screen.getByLabelText('Dia 5').props.accessibilityState.selected,
    ).toBe(false);

    fireEvent.press(screen.getByLabelText('Dia 5'));
    expect(onSelectDay).toHaveBeenCalledWith(5);
  });

  it('renders the legend captions when given', () => {
    renderMonth({ legend: { classLabel: 'sua aula', eventLabel: 'evento' } });
    expect(screen.getByText('sua aula')).toBeTruthy();
    expect(screen.getByText('evento')).toBeTruthy();
    expect(screen.getByTestId('legend-class-dot')).toBeTruthy();
    expect(screen.getByTestId('legend-event-dot')).toBeTruthy();
  });

  it('renders no legend row by default', () => {
    renderMonth();
    expect(screen.queryByTestId('legend-class-dot')).toBeNull();
  });
});
