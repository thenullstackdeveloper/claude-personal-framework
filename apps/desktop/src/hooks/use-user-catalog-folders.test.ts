import { invoke } from '@tauri-apps/api/core';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserCatalogFolders } from './use-user-catalog-folders';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

const catalogReport = (presetCount: number) => ({
  presets: Array.from({ length: presetCount }, (_, i) => ({
    name: `p${i}`,
    extends: [],
    agents: [],
    skills: [],
    commands: [],
    instructions: [],
    gitHooks: [],
  })),
  agents: [],
  skills: [],
  commands: [],
  instructions: [],
  gitHooks: [],
});

beforeEach(() => {
  mockedInvoke.mockReset();
});

describe('useUserCatalogFolders', () => {
  it('starts with an empty folder list when nothing is persisted', () => {
    const { result } = renderHook(() => useUserCatalogFolders());
    expect(result.current.folders).toEqual([]);
  });

  it('hydrates from localStorage on mount', () => {
    localStorage.setItem('cfw.catalogFolders', JSON.stringify(['/a', '/b']));
    const { result } = renderHook(() => useUserCatalogFolders());
    expect(result.current.folders).toEqual(['/a', '/b']);
  });

  describe('add', () => {
    it('rejects an empty path without invoking the engine', async () => {
      const { result } = renderHook(() => useUserCatalogFolders());
      let outcome: Awaited<ReturnType<typeof result.current.add>> | undefined;
      await act(async () => {
        outcome = await result.current.add('   ');
      });
      expect(outcome).toEqual({ ok: false, reason: 'Path is empty.' });
      expect(mockedInvoke).not.toHaveBeenCalled();
      expect(result.current.folders).toEqual([]);
    });

    it('rejects a folder that is already in the list', async () => {
      localStorage.setItem('cfw.catalogFolders', JSON.stringify(['/dupe']));
      const { result } = renderHook(() => useUserCatalogFolders());
      let outcome: Awaited<ReturnType<typeof result.current.add>> | undefined;
      await act(async () => {
        outcome = await result.current.add('/dupe');
      });
      expect(outcome).toEqual({ ok: false, reason: 'This folder is already in the list.' });
      expect(mockedInvoke).not.toHaveBeenCalled();
    });

    it('persists and returns the contributed preset count on success', async () => {
      // first call: candidate listing (built-in + user folder) → 3 presets
      // second call: built-in-only → 2 presets
      // diff = 1 → folder contributes 1 preset.
      mockedInvoke.mockResolvedValueOnce(catalogReport(3)).mockResolvedValueOnce(catalogReport(2));
      const { result } = renderHook(() => useUserCatalogFolders());
      let outcome: Awaited<ReturnType<typeof result.current.add>> | undefined;
      await act(async () => {
        outcome = await result.current.add('/skills');
      });
      expect(outcome).toEqual({ ok: true, presetCount: 1 });
      expect(result.current.folders).toEqual(['/skills']);
      expect(localStorage.getItem('cfw.catalogFolders')).toBe(JSON.stringify(['/skills']));
    });

    it('rejects when the folder contributes nothing over the built-in', async () => {
      // candidate listing = built-in listing → folder contributes 0 presets.
      mockedInvoke.mockResolvedValueOnce(catalogReport(2)).mockResolvedValueOnce(catalogReport(2));
      const { result } = renderHook(() => useUserCatalogFolders());
      let outcome: Awaited<ReturnType<typeof result.current.add>> | undefined;
      await act(async () => {
        outcome = await result.current.add('/not-a-catalog');
      });
      expect(outcome?.ok).toBe(false);
      if (outcome && !outcome.ok) {
        expect(outcome.reason).toMatch(/does not look like a Claude Framework catalog/);
      }
      expect(result.current.folders).toEqual([]);
    });

    it('surfaces the engine error when listCatalog throws on the candidate', async () => {
      mockedInvoke.mockRejectedValueOnce({ code: 'NO_CATALOG_SOURCE', message: 'boom' });
      const { result } = renderHook(() => useUserCatalogFolders());
      let outcome: Awaited<ReturnType<typeof result.current.add>> | undefined;
      await act(async () => {
        outcome = await result.current.add('/broken');
      });
      expect(outcome?.ok).toBe(false);
      if (outcome && !outcome.ok) {
        expect(outcome.reason).toContain('boom');
      }
      expect(result.current.folders).toEqual([]);
    });

    it('falls back to permissive validation when the built-in listing fails', async () => {
      // candidate listing succeeds with some presets, built-in listing
      // fails — the hook trusts the candidate and lets it in.
      mockedInvoke
        .mockResolvedValueOnce(catalogReport(2))
        .mockRejectedValueOnce(new Error('builtin broken'));
      const { result } = renderHook(() => useUserCatalogFolders());
      let outcome: Awaited<ReturnType<typeof result.current.add>> | undefined;
      await act(async () => {
        outcome = await result.current.add('/maybe-ok');
      });
      expect(outcome).toEqual({ ok: true, presetCount: 2 });
      expect(result.current.folders).toEqual(['/maybe-ok']);
    });
  });

  describe('remove', () => {
    it('removes the specified folder and persists the change', () => {
      localStorage.setItem('cfw.catalogFolders', JSON.stringify(['/a', '/b', '/c']));
      const { result } = renderHook(() => useUserCatalogFolders());
      act(() => {
        result.current.remove('/b');
      });
      expect(result.current.folders).toEqual(['/a', '/c']);
      expect(localStorage.getItem('cfw.catalogFolders')).toBe(JSON.stringify(['/a', '/c']));
    });

    it('is a no-op when the path is not in the list', () => {
      localStorage.setItem('cfw.catalogFolders', JSON.stringify(['/a']));
      const { result } = renderHook(() => useUserCatalogFolders());
      act(() => {
        result.current.remove('/nope');
      });
      expect(result.current.folders).toEqual(['/a']);
    });
  });

  describe('clear', () => {
    it('empties the folder list', () => {
      localStorage.setItem('cfw.catalogFolders', JSON.stringify(['/a', '/b']));
      const { result } = renderHook(() => useUserCatalogFolders());
      act(() => {
        result.current.clear();
      });
      expect(result.current.folders).toEqual([]);
      expect(localStorage.getItem('cfw.catalogFolders')).toBe(JSON.stringify([]));
    });
  });
});
