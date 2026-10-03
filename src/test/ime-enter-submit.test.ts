import { describe, expect, it } from 'vitest';
import { isEnterSubmit, isImeComposing } from '@/lib/utils';

function fakeKeyEvent(partial: {
  key: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}) {
  const native = {
    isComposing: partial.isComposing ?? false,
    keyCode: partial.keyCode ?? (partial.key === 'Enter' ? 13 : 0),
  };
  return {
    key: partial.key,
    shiftKey: partial.shiftKey ?? false,
    nativeEvent: native as unknown as Event,
  };
}

describe('isEnterSubmit / IME Enter protection', () => {
  it('submits English Enter', () => {
    expect(isEnterSubmit(fakeKeyEvent({ key: 'Enter' }))).toBe(true);
  });

  it('does not submit while IME is composing (Chinese confirm)', () => {
    expect(isEnterSubmit(fakeKeyEvent({ key: 'Enter', isComposing: true, keyCode: 229 }))).toBe(false);
  });

  it('still submits Enter when keyCode is 229 but composition already ended', () => {
    // Some CJK mobile keyboards keep reporting 229 after composition;
    // gating only on isComposing keeps zh/en Enter-to-save working.
    expect(isEnterSubmit(fakeKeyEvent({ key: 'Enter', isComposing: false, keyCode: 229 }))).toBe(true);
  });

  it('ignores Shift+Enter', () => {
    expect(isEnterSubmit(fakeKeyEvent({ key: 'Enter', shiftKey: true }))).toBe(false);
  });

  it('isImeComposing still detects legacy keyCode 229 for non-Enter guards', () => {
    expect(isImeComposing({ isComposing: false, keyCode: 229 })).toBe(true);
    expect(isImeComposing({ isComposing: true, keyCode: 13 })).toBe(true);
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false);
  });
});
