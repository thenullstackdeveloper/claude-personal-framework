import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useActiveProject } from './use-active-project';

describe('useActiveProject', () => {
  it('starts with no active project when nothing is persisted', () => {
    const { result } = renderHook(() => useActiveProject());
    expect(result.current.activeProject).toBeNull();
  });

  it('hydrates from localStorage on mount', () => {
    localStorage.setItem('cfw.activeProject', JSON.stringify({ path: '/some/proj' }));
    const { result } = renderHook(() => useActiveProject());
    expect(result.current.activeProject).toEqual({ path: '/some/proj' });
  });

  it('setActiveProject persists the new value', () => {
    const { result } = renderHook(() => useActiveProject());
    act(() => {
      result.current.setActiveProject({ path: '/my/proj' });
    });
    expect(result.current.activeProject).toEqual({ path: '/my/proj' });
    expect(localStorage.getItem('cfw.activeProject')).toBe(JSON.stringify({ path: '/my/proj' }));
  });

  it('setActiveProject(null) clears the active project and persists null', () => {
    localStorage.setItem('cfw.activeProject', JSON.stringify({ path: '/old' }));
    const { result } = renderHook(() => useActiveProject());
    act(() => {
      result.current.setActiveProject(null);
    });
    expect(result.current.activeProject).toBeNull();
    expect(localStorage.getItem('cfw.activeProject')).toBe('null');
  });

  it('switching to a different path replaces the previous active project', () => {
    const { result } = renderHook(() => useActiveProject());
    act(() => {
      result.current.setActiveProject({ path: '/a' });
    });
    act(() => {
      result.current.setActiveProject({ path: '/b' });
    });
    expect(result.current.activeProject).toEqual({ path: '/b' });
  });
});
