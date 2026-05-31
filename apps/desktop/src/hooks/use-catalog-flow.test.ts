import { invoke } from '@tauri-apps/api/core';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogReport } from '../lib/api';
import { useCatalogFlow } from './use-catalog-flow';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

const emptyCatalog: CatalogReport = {
  presets: [],
  agents: [],
  skills: [],
  commands: [],
  instructions: [],
};

const sampleCatalog: CatalogReport = {
  presets: [
    {
      name: 'base',
      extends: [],
      agents: ['a'],
      skills: [],
      commands: [],
      instructions: [],
    },
  ],
  agents: [{ id: 'a', description: 'agent' }],
  skills: [],
  commands: [],
  instructions: [],
};

describe('useCatalogFlow', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it('initial state is empty with no loading / error and no auto-load on mount', () => {
    const { result } = renderHook(() => useCatalogFlow('/framework'));
    expect(result.current.catalog).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('load() fetches and stores the catalog', async () => {
    mockedInvoke.mockResolvedValueOnce(sampleCatalog);

    const { result } = renderHook(() => useCatalogFlow('/framework'));
    await act(async () => {
      await result.current.load();
    });

    expect(result.current.catalog).toEqual(sampleCatalog);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockedInvoke).toHaveBeenCalledWith('list_catalog', { frameworkRoot: '/framework' });
  });

  it('sets loading=true during the call and clears it after', async () => {
    let resolve: (value: CatalogReport) => void = () => {};
    mockedInvoke.mockReturnValueOnce(
      new Promise<CatalogReport>((r) => {
        resolve = r;
      }) as unknown as Promise<unknown>,
    );

    const { result } = renderHook(() => useCatalogFlow('/framework'));

    act(() => {
      void result.current.load();
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    await act(async () => {
      resolve(emptyCatalog);
    });
    expect(result.current.loading).toBe(false);
  });

  it('stores the error and clears the catalog on CLI failure', async () => {
    mockedInvoke.mockRejectedValueOnce({ code: 'CLI_FAILURE', message: 'boom' });

    const { result } = renderHook(() => useCatalogFlow('/framework'));
    await act(async () => {
      await result.current.load();
    });

    expect(result.current.catalog).toBeNull();
    expect(result.current.error).toEqual({ code: 'CLI_FAILURE', message: 'boom' });
    expect(result.current.loading).toBe(false);
  });

  it('clears a previous error when load() is called again', async () => {
    mockedInvoke
      .mockRejectedValueOnce({ code: 'X', message: 'first' })
      .mockResolvedValueOnce(emptyCatalog);

    const { result } = renderHook(() => useCatalogFlow('/framework'));
    await act(async () => {
      await result.current.load();
    });
    expect(result.current.error).toEqual({ code: 'X', message: 'first' });

    await act(async () => {
      await result.current.load();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.catalog).toEqual(emptyCatalog);
  });

  it('uses the updated frameworkRoot when rerendered with a new value', async () => {
    mockedInvoke.mockResolvedValueOnce(emptyCatalog);

    const { result, rerender } = renderHook(({ fw }) => useCatalogFlow(fw), {
      initialProps: { fw: '/old' },
    });
    rerender({ fw: '/new' });
    await act(async () => {
      await result.current.load();
    });

    expect(mockedInvoke).toHaveBeenCalledWith('list_catalog', { frameworkRoot: '/new' });
  });
});
