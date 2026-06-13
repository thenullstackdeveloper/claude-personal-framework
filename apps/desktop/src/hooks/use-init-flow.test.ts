import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInitFlow } from './use-init-flow';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const mockedConfirm = vi.mocked(confirm);

const successResponse = {
  projectRoot: '/proj',
  presetName: 'base',
  manifestPath: '/proj/.claude-fw.yaml',
};

describe('useInitFlow', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedConfirm.mockReset();
  });

  it('initial outcome is idle with no init in flight and no auto-trigger on mount', () => {
    const { result } = renderHook(() =>
      useInitFlow({ frameworkRoot: '/fw', projectRoot: '/proj' }),
    );
    expect(result.current.outcome).toEqual({ status: 'idle' });
    expect(result.current.initializing).toBe(false);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('initialize() with success transitions outcome to success with preset + manifest', async () => {
    mockedInvoke.mockResolvedValueOnce(successResponse);

    const { result } = renderHook(() =>
      useInitFlow({ frameworkRoot: '/fw', projectRoot: '/proj' }),
    );
    await act(async () => {
      await result.current.initialize('base');
    });

    expect(result.current.outcome).toEqual({
      status: 'success',
      presetName: 'base',
      manifestPath: '/proj/.claude-fw.yaml',
    });
    expect(result.current.initializing).toBe(false);
    expect(mockedInvoke).toHaveBeenCalledWith('initialize', {
      frameworkRoot: '/fw',
      projectRoot: '/proj',
      presetName: 'base',
    });
  });

  it('initialize() success fires the onSuccess callback once', async () => {
    mockedInvoke.mockResolvedValueOnce(successResponse);
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useInitFlow({ frameworkRoot: '/fw', projectRoot: '/proj', onSuccess }),
    );
    await act(async () => {
      await result.current.initialize('base');
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('initialize() with CLI error sets outcome to error and does NOT fire onSuccess', async () => {
    mockedInvoke.mockRejectedValueOnce({ code: 'MANIFEST_EXISTS', message: 'already there' });
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useInitFlow({ frameworkRoot: '/fw', projectRoot: '/proj', onSuccess }),
    );
    await act(async () => {
      await result.current.initialize('base');
    });

    expect(result.current.outcome).toEqual({
      status: 'error',
      error: { code: 'MANIFEST_EXISTS', message: 'already there' },
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('sets initializing=true during the call and clears it after', async () => {
    let resolve: (value: typeof successResponse) => void = () => {};
    mockedInvoke.mockReturnValueOnce(
      new Promise<typeof successResponse>((r) => {
        resolve = r;
      }) as unknown as Promise<unknown>,
    );

    const { result } = renderHook(() =>
      useInitFlow({ frameworkRoot: '/fw', projectRoot: '/proj' }),
    );
    act(() => {
      void result.current.initialize('base');
    });
    await waitFor(() => expect(result.current.initializing).toBe(true));

    await act(async () => {
      resolve(successResponse);
    });
    expect(result.current.initializing).toBe(false);
  });

  it('clears a previous error outcome when initialize() is called again', async () => {
    mockedInvoke
      .mockRejectedValueOnce({ code: 'X', message: 'first' })
      .mockResolvedValueOnce(successResponse);

    const { result } = renderHook(() =>
      useInitFlow({ frameworkRoot: '/fw', projectRoot: '/proj' }),
    );
    await act(async () => {
      await result.current.initialize('base');
    });
    expect(result.current.outcome.status).toBe('error');

    await act(async () => {
      await result.current.initialize('base');
    });
    expect(result.current.outcome.status).toBe('success');
  });

  it('dismiss() resets the outcome back to idle', async () => {
    mockedInvoke.mockResolvedValueOnce(successResponse);

    const { result } = renderHook(() =>
      useInitFlow({ frameworkRoot: '/fw', projectRoot: '/proj' }),
    );
    await act(async () => {
      await result.current.initialize('base');
    });
    expect(result.current.outcome.status).toBe('success');

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.outcome).toEqual({ status: 'idle' });
  });

  describe('NOT_A_GIT_REPO take-over', () => {
    const notAGitRepoError = {
      code: 'NOT_A_GIT_REPO',
      message: 'the folder at /proj is not a git repository',
      projectRoot: '/proj',
    };

    it('runs git init and retries on confirm', async () => {
      mockedConfirm.mockResolvedValueOnce(true);
      // 1: initialize() rejects with NOT_A_GIT_REPO.
      // 2: ensure_git_repo() resolves (void).
      // 3: initialize() retry resolves with the success response.
      mockedInvoke
        .mockRejectedValueOnce(notAGitRepoError)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(successResponse);

      const onSuccess = vi.fn();
      const { result } = renderHook(() =>
        useInitFlow({ frameworkRoot: '/fw', projectRoot: '/proj', onSuccess }),
      );
      await act(async () => {
        await result.current.initialize('base');
      });

      expect(mockedConfirm).toHaveBeenCalledOnce();
      expect(mockedInvoke).toHaveBeenNthCalledWith(2, 'ensure_git_repo', { path: '/proj' });
      expect(result.current.outcome).toEqual({
        status: 'success',
        presetName: 'base',
        manifestPath: '/proj/.claude-fw.yaml',
      });
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('returns to idle on cancel (no banner, no retry)', async () => {
      mockedConfirm.mockResolvedValueOnce(false);
      mockedInvoke.mockRejectedValueOnce(notAGitRepoError);

      const onSuccess = vi.fn();
      const { result } = renderHook(() =>
        useInitFlow({ frameworkRoot: '/fw', projectRoot: '/proj', onSuccess }),
      );
      await act(async () => {
        await result.current.initialize('base');
      });

      expect(mockedConfirm).toHaveBeenCalledOnce();
      // Only the original initialize call — no ensure_git_repo, no retry.
      expect(mockedInvoke).toHaveBeenCalledOnce();
      expect(result.current.outcome).toEqual({ status: 'idle' });
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('surfaces a retry failure as a regular error outcome', async () => {
      mockedConfirm.mockResolvedValueOnce(true);
      mockedInvoke
        .mockRejectedValueOnce(notAGitRepoError)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce({ code: 'CLI_FAILURE', message: 'second attempt blew up' });

      const { result } = renderHook(() =>
        useInitFlow({ frameworkRoot: '/fw', projectRoot: '/proj' }),
      );
      await act(async () => {
        await result.current.initialize('base');
      });

      expect(result.current.outcome).toEqual({
        status: 'error',
        error: { code: 'CLI_FAILURE', message: 'second attempt blew up' },
      });
    });

    it('falls back to the hook projectRoot when the error envelope omits it', async () => {
      mockedConfirm.mockResolvedValueOnce(false);
      mockedInvoke.mockRejectedValueOnce({
        code: 'NOT_A_GIT_REPO',
        message: 'no projectRoot here',
      });

      const { result } = renderHook(() =>
        useInitFlow({ frameworkRoot: '/fw', projectRoot: '/fallback-proj' }),
      );
      await act(async () => {
        await result.current.initialize('base');
      });

      expect(mockedConfirm).toHaveBeenCalledWith(
        expect.stringContaining('/fallback-proj'),
        expect.any(Object),
      );
    });
  });

  it('initialize() uses the latest paths after a rerender', async () => {
    mockedInvoke.mockResolvedValueOnce(successResponse);

    const { result, rerender } = renderHook(
      ({ fw, proj }) => useInitFlow({ frameworkRoot: fw, projectRoot: proj }),
      { initialProps: { fw: '/old-fw', proj: '/old-proj' } },
    );
    rerender({ fw: '/new-fw', proj: '/new-proj' });
    await act(async () => {
      await result.current.initialize('base');
    });

    expect(mockedInvoke).toHaveBeenCalledWith('initialize', {
      frameworkRoot: '/new-fw',
      projectRoot: '/new-proj',
      presetName: 'base',
    });
  });
});
