import { invoke } from '@tauri-apps/api/core';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatusReport } from '../lib/api';
import { useStatusFlow } from './use-status-flow';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

const emptyReport: StatusReport = {
  presetName: 'base',
  hasLockfile: true,
  added: [],
  updated: [],
  removed: [],
  unchanged: [],
  settings: { kind: 'unchanged' },
  instructions: { kind: 'unchanged' },
};

const driftedReport: StatusReport = {
  ...emptyReport,
  added: [{ type: 'agent', id: 'new-agent' }],
};

describe('useStatusFlow', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it('initial state is empty with no check in flight and no auto-trigger on mount', () => {
    const { result } = renderHook(() =>
      useStatusFlow({ frameworkRoot: '/fw', projectRoot: '/proj' }),
    );
    expect(result.current.report).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.checking).toBe(false);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('check() fetches and stores the status report', async () => {
    mockedInvoke.mockResolvedValueOnce(emptyReport);

    const { result } = renderHook(() =>
      useStatusFlow({ frameworkRoot: '/fw', projectRoot: '/proj' }),
    );
    await act(async () => {
      await result.current.check();
    });

    expect(result.current.report).toEqual(emptyReport);
    expect(result.current.error).toBeNull();
    expect(result.current.checking).toBe(false);
    expect(mockedInvoke).toHaveBeenCalledWith('status', {
      frameworkRoot: '/fw',
      projectRoot: '/proj',
    });
  });

  it('sets checking=true during the call and clears it after', async () => {
    let resolve: (value: StatusReport) => void = () => {};
    mockedInvoke.mockReturnValueOnce(
      new Promise<StatusReport>((r) => {
        resolve = r;
      }) as unknown as Promise<unknown>,
    );

    const { result } = renderHook(() =>
      useStatusFlow({ frameworkRoot: '/fw', projectRoot: '/proj' }),
    );
    act(() => {
      void result.current.check();
    });
    await waitFor(() => expect(result.current.checking).toBe(true));

    await act(async () => {
      resolve(emptyReport);
    });
    expect(result.current.checking).toBe(false);
  });

  it('stores the error and clears the report on CLI failure', async () => {
    mockedInvoke.mockRejectedValueOnce({ code: 'CLI_FAILURE', message: 'no manifest' });

    const { result } = renderHook(() =>
      useStatusFlow({ frameworkRoot: '/fw', projectRoot: '/proj' }),
    );
    await act(async () => {
      await result.current.check();
    });

    expect(result.current.report).toBeNull();
    expect(result.current.error).toEqual({ code: 'CLI_FAILURE', message: 'no manifest' });
  });

  it('error after success clears the previous report', async () => {
    mockedInvoke
      .mockResolvedValueOnce(driftedReport)
      .mockRejectedValueOnce({ code: 'X', message: 'fail' });

    const { result } = renderHook(() =>
      useStatusFlow({ frameworkRoot: '/fw', projectRoot: '/proj' }),
    );
    await act(async () => {
      await result.current.check();
    });
    expect(result.current.report).toEqual(driftedReport);

    await act(async () => {
      await result.current.check();
    });
    expect(result.current.report).toBeNull();
    expect(result.current.error).toEqual({ code: 'X', message: 'fail' });
  });

  it('dismiss() clears both report and error', async () => {
    mockedInvoke.mockResolvedValueOnce(driftedReport);

    const { result } = renderHook(() =>
      useStatusFlow({ frameworkRoot: '/fw', projectRoot: '/proj' }),
    );
    await act(async () => {
      await result.current.check();
    });
    expect(result.current.report).toEqual(driftedReport);

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.report).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('checkSilently() updates report on success', async () => {
    mockedInvoke.mockResolvedValueOnce(driftedReport);

    const { result } = renderHook(() =>
      useStatusFlow({ frameworkRoot: '/fw', projectRoot: '/proj' }),
    );
    await act(async () => {
      await result.current.checkSilently();
    });

    expect(result.current.report).toEqual(driftedReport);
    expect(result.current.error).toBeNull();
  });

  it('checkSilently() leaves report and error untouched on failure', async () => {
    // Prime an existing report and error
    mockedInvoke.mockResolvedValueOnce(driftedReport);
    const { result } = renderHook(() =>
      useStatusFlow({ frameworkRoot: '/fw', projectRoot: '/proj' }),
    );
    await act(async () => {
      await result.current.check();
    });
    expect(result.current.report).toEqual(driftedReport);

    // Now a silent check fails — neither report nor error change
    mockedInvoke.mockRejectedValueOnce({ code: 'X', message: 'boom' });
    await act(async () => {
      await result.current.checkSilently();
    });
    expect(result.current.report).toEqual(driftedReport);
    expect(result.current.error).toBeNull();
  });

  it('check() uses the latest paths after a rerender', async () => {
    mockedInvoke.mockResolvedValueOnce(emptyReport);

    const { result, rerender } = renderHook(
      ({ fw, proj }) => useStatusFlow({ frameworkRoot: fw, projectRoot: proj }),
      { initialProps: { fw: '/old-fw', proj: '/old-proj' } },
    );
    rerender({ fw: '/new-fw', proj: '/new-proj' });
    await act(async () => {
      await result.current.check();
    });

    expect(mockedInvoke).toHaveBeenCalledWith('status', {
      frameworkRoot: '/new-fw',
      projectRoot: '/new-proj',
    });
  });
});
