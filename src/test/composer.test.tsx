import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Composer } from '@/components/composer/Composer';
import { composerHeight } from '@/components/composer/composerLayout';

const setPointer = (coarse: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: coarse && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

describe('composerHeight', () => {
  it('grows with content and caps at maxRows, then scrolls', () => {
    expect(composerHeight(22, 4)).toEqual({ height: 22, scrolls: false });
    expect(composerHeight(66, 4)).toEqual({ height: 66, scrolls: false });
    expect(composerHeight(200, 4)).toEqual({ height: 88, scrolls: true });
  });
});

describe('Composer keys', () => {
  afterEach(() => setPointer(false));

  it('desktop: Enter sends, Shift+Enter does not, IME composing does not', () => {
    setPointer(false);
    const onSubmit = vi.fn();
    render(<Composer value="hello" onChange={() => {}} onSubmit={onSubmit} placeholder="Write" />);
    const box = screen.getByPlaceholderText('Write');
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('touch: Enter adds a line; the send button sends', () => {
    setPointer(true);
    const onSubmit = vi.fn();
    render(<Composer value="hello" onChange={() => {}} onSubmit={onSubmit} placeholder="Write" sendLabel="Send" />);
    fireEvent.keyDown(screen.getByPlaceholderText('Write'), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('send is disabled with no text or when canSubmit is false', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<Composer value="  " onChange={() => {}} onSubmit={onSubmit} sendLabel="Send" />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    rerender(<Composer value="x" canSubmit={false} onChange={() => {}} onSubmit={onSubmit} sendLabel="Send" />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
