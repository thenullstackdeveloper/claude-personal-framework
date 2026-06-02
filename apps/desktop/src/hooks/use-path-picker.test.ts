import { open } from '@tauri-apps/plugin-dialog';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePathPicker } from './use-path-picker';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

const mockedOpen = vi.mocked(open);

describe('usePathPicker', () => {
  beforeEach(() => {
    mockedOpen.mockReset();
  });

  it('browseFramework returns the picked path on success', async () => {
    mockedOpen.mockResolvedValueOnce('/path/to/framework');

    const { result } = renderHook(() => usePathPicker());
    const picked = await result.current.browseFramework('');

    expect(picked).toBe('/path/to/framework');
    expect(mockedOpen).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: 'Select framework root',
    });
  });

  it('browseFramework returns null when the user cancels', async () => {
    mockedOpen.mockResolvedValueOnce(null);

    const { result } = renderHook(() => usePathPicker());
    const picked = await result.current.browseFramework('');

    expect(picked).toBeNull();
  });

  it('browseFramework returns null when the picker returns an array (multiple=false guard)', async () => {
    mockedOpen.mockResolvedValueOnce(['/path/a', '/path/b']);

    const { result } = renderHook(() => usePathPicker());
    const picked = await result.current.browseFramework('');

    expect(picked).toBeNull();
  });

  it('browseFramework passes defaultPath when non-empty', async () => {
    mockedOpen.mockResolvedValueOnce(null);

    const { result } = renderHook(() => usePathPicker());
    await result.current.browseFramework('/cached/path');

    expect(mockedOpen).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: 'Select framework root',
      defaultPath: '/cached/path',
    });
  });

  it('browseFramework omits defaultPath when empty', async () => {
    mockedOpen.mockResolvedValueOnce(null);

    const { result } = renderHook(() => usePathPicker());
    await result.current.browseFramework('');

    const args = mockedOpen.mock.calls[0]?.[0];
    expect(args).not.toHaveProperty('defaultPath');
  });

  it('browseProject uses its own title and otherwise mirrors browseFramework', async () => {
    mockedOpen.mockResolvedValueOnce('/path/to/project');

    const { result } = renderHook(() => usePathPicker());
    const picked = await result.current.browseProject('/cached/proj');

    expect(picked).toBe('/path/to/project');
    expect(mockedOpen).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: 'Select project root',
      defaultPath: '/cached/proj',
    });
  });
});
