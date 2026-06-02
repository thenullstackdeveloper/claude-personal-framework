import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallReport as InstallReportData, StatusReport } from '../lib/api';
import { useInstallFlow } from './use-install-flow';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const mockedAsk = vi.mocked(ask);

const successData: InstallReportData = {
  presetName: 'base',
  agents: ['docs-manager'],
  skills: [],
  commands: [],
  settings: false,
  instructions: false,
};

const sampleStatus: StatusReport = {
  presetName: 'base',
  hasLockfile: true,
  added: [],
  updated: [],
  removed: [],
  unchanged: [],
  settings: { kind: 'unchanged' },
  instructions: { kind: 'unchanged' },
};

const render = (
  overrides: {
    statusReport?: StatusReport | null;
    onSuccess?: () => void | Promise<void>;
  } = {},
) =>
  renderHook(() =>
    useInstallFlow({
      frameworkRoot: '/fw',
      projectRoot: '/proj',
      statusReport: overrides.statusReport ?? null,
      ...(overrides.onSuccess !== undefined && { onSuccess: overrides.onSuccess }),
    }),
  );

describe('useInstallFlow', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedAsk.mockReset();
  });

  it('initial state is idle with no install in flight and no auto-trigger on mount', () => {
    const { result } = render();
    expect(result.current.outcome).toEqual({ status: 'idle' });
    expect(result.current.installing).toBe(false);
    expect(mockedAsk).not.toHaveBeenCalled();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('shows the confirmation dialog and aborts when the user cancels', async () => {
    mockedAsk.mockResolvedValueOnce(false);

    const { result } = render();
    await act(async () => {
      await result.current.install();
    });

    expect(mockedAsk).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).not.toHaveBeenCalled();
    expect(result.current.outcome).toEqual({ status: 'idle' });
    expect(result.current.installing).toBe(false);
  });

  it('install() with confirmation + success transitions outcome and fires onSuccess', async () => {
    mockedAsk.mockResolvedValueOnce(true);
    mockedInvoke.mockResolvedValueOnce(successData);
    const onSuccess = vi.fn();

    const { result } = render({ onSuccess });
    await act(async () => {
      await result.current.install();
    });

    expect(result.current.outcome).toEqual({ status: 'success', data: successData });
    expect(result.current.installing).toBe(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledWith('install', {
      frameworkRoot: '/fw',
      projectRoot: '/proj',
    });
  });

  it('install() with CLI error sets outcome to error and does NOT fire onSuccess', async () => {
    mockedAsk.mockResolvedValueOnce(true);
    mockedInvoke.mockRejectedValueOnce({ code: 'CLI_FAILURE', message: 'something broke' });
    const onSuccess = vi.fn();

    const { result } = render({ onSuccess });
    await act(async () => {
      await result.current.install();
    });

    expect(result.current.outcome).toEqual({
      status: 'error',
      error: { code: 'CLI_FAILURE', message: 'something broke' },
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('take-over error propagates as a regular error outcome with code UNMANAGED_CLAUDE_MD', async () => {
    mockedAsk.mockResolvedValueOnce(true);
    mockedInvoke.mockRejectedValueOnce({
      code: 'UNMANAGED_CLAUDE_MD',
      message: '.claude/CLAUDE.md exists but is not managed.',
    });

    const { result } = render();
    await act(async () => {
      await result.current.install();
    });

    // The outcome shape is unchanged — the consumer (InstallReport)
    // branches on error.code to render the amber take-over banner.
    expect(result.current.outcome).toEqual({
      status: 'error',
      error: {
        code: 'UNMANAGED_CLAUDE_MD',
        message: '.claude/CLAUDE.md exists but is not managed.',
      },
    });
  });

  it('sets installing=true during the call and clears it after', async () => {
    mockedAsk.mockResolvedValueOnce(true);
    let resolve: (value: InstallReportData) => void = () => {};
    mockedInvoke.mockReturnValueOnce(
      new Promise<InstallReportData>((r) => {
        resolve = r;
      }) as unknown as Promise<unknown>,
    );

    const { result } = render();
    act(() => {
      void result.current.install();
    });
    await waitFor(() => expect(result.current.installing).toBe(true));

    await act(async () => {
      resolve(successData);
    });
    expect(result.current.installing).toBe(false);
  });

  it('clears a previous error outcome when install() is called again successfully', async () => {
    mockedAsk.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    mockedInvoke
      .mockRejectedValueOnce({ code: 'X', message: 'first' })
      .mockResolvedValueOnce(successData);

    const { result } = render();
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.outcome.status).toBe('error');

    await act(async () => {
      await result.current.install();
    });
    expect(result.current.outcome.status).toBe('success');
  });

  it('dismiss() resets the outcome back to idle', async () => {
    mockedAsk.mockResolvedValueOnce(true);
    mockedInvoke.mockResolvedValueOnce(successData);

    const { result } = render();
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.outcome.status).toBe('success');

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.outcome).toEqual({ status: 'idle' });
  });

  it('builds the confirm message using the passed-in statusReport', async () => {
    mockedAsk.mockResolvedValueOnce(false);

    const { result } = render({ statusReport: sampleStatus });
    await act(async () => {
      await result.current.install();
    });

    const [confirmMsg] = mockedAsk.mock.calls[0] ?? [];
    expect(confirmMsg).toContain('All artifacts already match the catalog');
  });

  it('install() uses the latest paths after a rerender', async () => {
    mockedAsk.mockResolvedValueOnce(true);
    mockedInvoke.mockResolvedValueOnce(successData);

    const { result, rerender } = renderHook(
      ({ fw, proj }) =>
        useInstallFlow({ frameworkRoot: fw, projectRoot: proj, statusReport: null }),
      { initialProps: { fw: '/old-fw', proj: '/old-proj' } },
    );
    rerender({ fw: '/new-fw', proj: '/new-proj' });
    await act(async () => {
      await result.current.install();
    });

    expect(mockedInvoke).toHaveBeenCalledWith('install', {
      frameworkRoot: '/new-fw',
      projectRoot: '/new-proj',
    });
  });
});
