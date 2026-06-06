import { render, act } from '@testing-library/react';
import { LiveRegion, announce } from './LiveRegion';

function getLiveRegion(container: HTMLElement): HTMLElement {
  const region = container.querySelector('[aria-live="polite"]');
  if (!region) throw new Error('Live region not found');
  return region as HTMLElement;
}

describe('LiveRegion', () => {
  beforeEach(() => {
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders an aria-live region', () => {
    const { container } = render(<LiveRegion />);
    const region = getLiveRegion(container);
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
  });

  it('announces messages via the announce helper', () => {
    const { container } = render(<LiveRegion />);
    const region = getLiveRegion(container);

    act(() => {
      announce('Cell A1 selected');
    });

    expect(region).toHaveTextContent('Cell A1 selected');
  });

  it('replaces the previous announcement', () => {
    const { container } = render(<LiveRegion />);
    const region = getLiveRegion(container);

    act(() => {
      announce('first');
      announce('second');
    });

    expect(region).toHaveTextContent('second');
    expect(region).not.toHaveTextContent('first');
  });
});
