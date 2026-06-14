import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useWelcomeWizardFlag } from './use-welcome-wizard-flag';

describe('useWelcomeWizardFlag', () => {
  it('defaults to "not completed" so first-time users see the wizard', () => {
    const { result } = renderHook(() => useWelcomeWizardFlag());
    expect(result.current.completed).toBe(false);
  });

  it('hydrates from localStorage', () => {
    localStorage.setItem('cfw.welcomeWizardCompleted', JSON.stringify(true));
    const { result } = renderHook(() => useWelcomeWizardFlag());
    expect(result.current.completed).toBe(true);
  });

  it('markCompleted sets the flag and persists', () => {
    const { result } = renderHook(() => useWelcomeWizardFlag());
    act(() => {
      result.current.markCompleted();
    });
    expect(result.current.completed).toBe(true);
    expect(localStorage.getItem('cfw.welcomeWizardCompleted')).toBe('true');
  });

  it('reset clears the flag and persists', () => {
    localStorage.setItem('cfw.welcomeWizardCompleted', JSON.stringify(true));
    const { result } = renderHook(() => useWelcomeWizardFlag());
    act(() => {
      result.current.reset();
    });
    expect(result.current.completed).toBe(false);
    expect(localStorage.getItem('cfw.welcomeWizardCompleted')).toBe('false');
  });
});
