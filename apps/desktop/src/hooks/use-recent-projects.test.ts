import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecentProjects } from './use-recent-projects';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-14T10:00:00Z'));
});

describe('useRecentProjects', () => {
  it('starts with an empty list when nothing is persisted', () => {
    const { result } = renderHook(() => useRecentProjects());
    expect(result.current.recent).toEqual([]);
  });

  it('hydrates from localStorage on mount', () => {
    const seeded = [{ path: '/a', presetName: 'base', lastUsed: '2026-06-13T10:00:00.000Z' }];
    localStorage.setItem('cfw.recentProjects', JSON.stringify(seeded));
    const { result } = renderHook(() => useRecentProjects());
    expect(result.current.recent).toEqual(seeded);
  });

  describe('add', () => {
    it('prepends the new entry with an ISO timestamp', () => {
      const { result } = renderHook(() => useRecentProjects());
      act(() => {
        result.current.add({ path: '/a', presetName: 'base' });
      });
      expect(result.current.recent).toEqual([
        { path: '/a', presetName: 'base', lastUsed: '2026-06-14T10:00:00.000Z' },
      ]);
    });

    it('moves an existing entry to the front and updates timestamp + presetName', () => {
      localStorage.setItem(
        'cfw.recentProjects',
        JSON.stringify([
          { path: '/a', presetName: 'old', lastUsed: '2026-06-10T10:00:00.000Z' },
          { path: '/b', presetName: 'base', lastUsed: '2026-06-12T10:00:00.000Z' },
        ]),
      );
      const { result } = renderHook(() => useRecentProjects());
      act(() => {
        result.current.add({ path: '/a', presetName: 'nestjs' });
      });
      expect(result.current.recent).toEqual([
        { path: '/a', presetName: 'nestjs', lastUsed: '2026-06-14T10:00:00.000Z' },
        { path: '/b', presetName: 'base', lastUsed: '2026-06-12T10:00:00.000Z' },
      ]);
    });

    it('caps the list at 5 entries, evicting the oldest', () => {
      const seeded = Array.from({ length: 5 }, (_, i) => ({
        path: `/p${i}`,
        presetName: 'base',
        lastUsed: `2026-06-1${i}T10:00:00.000Z`,
      }));
      localStorage.setItem('cfw.recentProjects', JSON.stringify(seeded));
      const { result } = renderHook(() => useRecentProjects());
      act(() => {
        result.current.add({ path: '/p-new', presetName: 'base' });
      });
      expect(result.current.recent).toHaveLength(5);
      expect(result.current.recent[0]?.path).toBe('/p-new');
      // The previously-oldest entry (/p4 last in the seeded list) is gone.
      expect(result.current.recent.find((r) => r.path === '/p4')).toBeUndefined();
    });

    it('persists the updated list to localStorage', () => {
      const { result } = renderHook(() => useRecentProjects());
      act(() => {
        result.current.add({ path: '/a', presetName: 'base' });
      });
      const stored = JSON.parse(localStorage.getItem('cfw.recentProjects') ?? '[]');
      expect(stored).toEqual([
        { path: '/a', presetName: 'base', lastUsed: '2026-06-14T10:00:00.000Z' },
      ]);
    });
  });

  describe('remove', () => {
    it('removes the specified path', () => {
      localStorage.setItem(
        'cfw.recentProjects',
        JSON.stringify([
          { path: '/a', presetName: 'base', lastUsed: '2026-06-13T10:00:00.000Z' },
          { path: '/b', presetName: 'base', lastUsed: '2026-06-13T10:00:00.000Z' },
        ]),
      );
      const { result } = renderHook(() => useRecentProjects());
      act(() => {
        result.current.remove('/a');
      });
      expect(result.current.recent.map((r) => r.path)).toEqual(['/b']);
    });

    it('is a no-op when the path is not in the list', () => {
      localStorage.setItem(
        'cfw.recentProjects',
        JSON.stringify([{ path: '/a', presetName: 'base', lastUsed: '2026-06-13T10:00:00.000Z' }]),
      );
      const { result } = renderHook(() => useRecentProjects());
      act(() => {
        result.current.remove('/nope');
      });
      expect(result.current.recent.map((r) => r.path)).toEqual(['/a']);
    });
  });

  describe('clear', () => {
    it('empties the list', () => {
      localStorage.setItem(
        'cfw.recentProjects',
        JSON.stringify([{ path: '/a', presetName: 'base', lastUsed: '2026-06-13T10:00:00.000Z' }]),
      );
      const { result } = renderHook(() => useRecentProjects());
      act(() => {
        result.current.clear();
      });
      expect(result.current.recent).toEqual([]);
    });
  });
});
