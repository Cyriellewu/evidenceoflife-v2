import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/hooks/useLanguage';

vi.mock('@/components/SideNav', () => ({ SideNav: () => null }));
import { MobileNavChrome } from '@/components/MobileNavChrome';

function setup() {
  const onOpenChange = vi.fn();
  render(
    <LanguageProvider>
      <MobileNavChrome open={false} onOpenChange={onOpenChange} activeTab="today" onTabChange={vi.fn()} />
    </LanguageProvider>,
  );
  return onOpenChange;
}

const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });

describe('MobileNavChrome edge swipe', () => {
  it('opens when swiping right from the left edge', () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    const onOpenChange = setup();
    fireEvent.touchStart(document, touch(8, 300));
    fireEvent.touchMove(document, touch(90, 305));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('ignores swipes that start away from the edge or go mostly vertical', () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    const onOpenChange = setup();
    fireEvent.touchStart(document, touch(120, 300));
    fireEvent.touchMove(document, touch(220, 300));
    fireEvent.touchStart(document, touch(8, 300));
    fireEvent.touchMove(document, touch(40, 420));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
