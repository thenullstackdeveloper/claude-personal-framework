import { open } from '@tauri-apps/plugin-dialog';
import { useCallback } from 'react';

/**
 * Wraps the native folder picker from `@tauri-apps/plugin-dialog` into a
 * stateless hook. Each browse function returns the picked path or null
 * when the user cancels. The hook does NOT own the framework/project
 * state — the caller decides what to do with the returned path
 * (typically setState + cross-flow detection autofill in the
 * composition root).
 *
 * Behavior preserved verbatim from the previous inline handleBrowse*
 * functions in App.tsx. The cross-path autofill logic (pick framework
 * → if project is empty and the framework folder ALSO looks like a
 * project, fill project) stays in App.tsx as composition-root concern.
 */
export const usePathPicker = (): {
  browseFramework: (defaultPath: string) => Promise<string | null>;
  browseProject: (defaultPath: string) => Promise<string | null>;
} => {
  const browseFramework = useCallback(async (defaultPath: string): Promise<string | null> => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select framework root',
      ...(defaultPath && { defaultPath }),
    });
    return typeof selected === 'string' ? selected : null;
  }, []);

  const browseProject = useCallback(async (defaultPath: string): Promise<string | null> => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select project root',
      ...(defaultPath && { defaultPath }),
    });
    return typeof selected === 'string' ? selected : null;
  }, []);

  return { browseFramework, browseProject };
};
