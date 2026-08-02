/**
 * BrandLogo — belt mark drawn with Views: bar + tip + 2 stripes (DS.7).
 */

import { render, screen } from '@testing-library/react-native';
import { BrandLogo, ThemeProvider } from '@tatame/design-system/native';

describe('BrandLogo', () => {
  it('draws the frozen belt anatomy: bar, tip, two stripes', () => {
    render(
      <ThemeProvider>
        <BrandLogo testID="logo" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('brandlogo-belt')).toBeTruthy();
    expect(screen.getByTestId('brandlogo-tip')).toBeTruthy();
    expect(screen.getAllByTestId('brandlogo-stripe')).toHaveLength(2);
  });

  it('is an accessible image labeled "Tatame" by default', () => {
    render(<BrandLogo />);
    expect(screen.getByLabelText('Tatame')).toBeTruthy();
  });

  it('boxed by default; bare renders the belt without the badge', () => {
    const boxed = render(<BrandLogo testID="logo" />);
    const boxedStyle = boxed.getByTestId('logo').props.style;
    expect(JSON.stringify(boxedStyle)).toContain('"width":56');
    boxed.unmount();

    render(<BrandLogo boxed={false} label="Academia X" testID="bare" />);
    expect(screen.getByLabelText('Academia X')).toBeTruthy();
    expect(JSON.stringify(screen.getByTestId('bare').props.style)).not.toContain('"width":56');
  });
});
