import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBuiltinCatalogPref } from './use-builtin-catalog-pref';

describe('useBuiltinCatalogPref', () => {
  it('defaults to true when nothing is persisted', () => {
    const { result } = renderHook(() => useBuiltinCatalogPref());
    expect(result.current.useBuiltin).toBe(true);
  });

  it('hydrates from localStorage on mount', () => {
    localStorage.setItem('cfw.useBuiltinCatalog', JSON.stringify(false));
    const { result } = renderHook(() => useBuiltinCatalogPref());
    expect(result.current.useBuiltin).toBe(false);
  });

  it('setUseBuiltin persists the toggle', () => {
    const { result } = renderHook(() => useBuiltinCatalogPref());
    act(() => {
      result.current.setUseBuiltin(false);
    });
    expect(result.current.useBuiltin).toBe(false);
    expect(localStorage.getItem('cfw.useBuiltinCatalog')).toBe('false');
  });
});
