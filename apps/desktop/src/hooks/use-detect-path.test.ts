import { invoke } from '@tauri-apps/api/core';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDetectPath } from './use-detect-path';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

describe('useDetectPath', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it('returns null and skips invoke when projectRoot is null', () => {
    const { result } = renderHook(() => useDetectPath(null));
    expect(result.current.detection).toBeNull();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('returns null and skips invoke when projectRoot is an empty string', () => {
    const { result } = renderHook(() => useDetectPath(''));
    expect(result.current.detection).toBeNull();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('calls detect_path and stores the result on initial mount', async () => {
    mockedInvoke.mockResolvedValueOnce({ isFramework: false, isProject: true });
    const { result } = renderHook(() => useDetectPath('/some/path'));
    await waitFor(() => {
      expect(result.current.detection).toEqual({ isFramework: false, isProject: true });
    });
    expect(mockedInvoke).toHaveBeenCalledWith('detect_path', { path: '/some/path' });
  });

  it('re-detects when projectRoot changes', async () => {
    mockedInvoke
      .mockResolvedValueOnce({ isFramework: true, isProject: false })
      .mockResolvedValueOnce({ isFramework: false, isProject: true });
    const { result, rerender } = renderHook(({ path }) => useDetectPath(path), {
      initialProps: { path: '/path-a' as string | null },
    });
    await waitFor(() =>
      expect(result.current.detection).toEqual({ isFramework: true, isProject: false }),
    );
    rerender({ path: '/path-b' });
    await waitFor(() =>
      expect(result.current.detection).toEqual({ isFramework: false, isProject: true }),
    );
    expect(mockedInvoke).toHaveBeenCalledTimes(2);
  });

  it('clears detection silently on CLI error', async () => {
    mockedInvoke.mockResolvedValueOnce({ isFramework: true, isProject: false });
    const { result, rerender } = renderHook(({ path }) => useDetectPath(path), {
      initialProps: { path: '/path' as string | null },
    });
    await waitFor(() =>
      expect(result.current.detection).toEqual({ isFramework: true, isProject: false }),
    );

    mockedInvoke.mockRejectedValueOnce({ code: 'CLI_FAILURE', message: 'fail' });
    rerender({ path: '/other-path' });
    await waitFor(() => expect(result.current.detection).toBeNull());
  });

  it('clears detection when projectRoot becomes null after a successful detection', async () => {
    mockedInvoke.mockResolvedValueOnce({ isFramework: false, isProject: true });
    const { result, rerender } = renderHook(({ path }) => useDetectPath(path), {
      initialProps: { path: '/path' as string | null },
    });
    await waitFor(() =>
      expect(result.current.detection).toEqual({ isFramework: false, isProject: true }),
    );
    rerender({ path: null });
    await waitFor(() => expect(result.current.detection).toBeNull());
  });

  it('refresh() triggers a new detection without changing the path', async () => {
    mockedInvoke
      .mockResolvedValueOnce({ isFramework: false, isProject: false })
      .mockResolvedValueOnce({ isFramework: false, isProject: true });
    const { result } = renderHook(() => useDetectPath('/path'));
    await waitFor(() =>
      expect(result.current.detection).toEqual({ isFramework: false, isProject: false }),
    );
    act(() => {
      result.current.refresh();
    });
    await waitFor(() =>
      expect(result.current.detection).toEqual({ isFramework: false, isProject: true }),
    );
    expect(mockedInvoke).toHaveBeenCalledTimes(2);
  });
});
