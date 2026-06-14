import { usePersistedState } from '../lib/persisted-state';

const STORAGE_KEY = 'cfw.useBuiltinCatalog';

/**
 * User preference for whether the embedded built-in catalog is part of
 * the aggregation. Default is `true` — the built-in catalog is the
 * out-of-the-box experience and most users never need to touch this.
 * The Settings panel (B7 / CLAUDEPERS-22) lets advanced users opt out
 * when they want their own folders to be the only source.
 *
 * The flag is passed through to every Tauri command (`allowBuiltin`),
 * which decides whether to inject the cache-extracted built-in folder
 * as a `--catalog-folder` argument.
 */
export const useBuiltinCatalogPref = (): {
  readonly useBuiltin: boolean;
  setUseBuiltin: (value: boolean) => void;
} => {
  const [useBuiltin, setUseBuiltin] = usePersistedState<boolean>(STORAGE_KEY, true);
  return { useBuiltin, setUseBuiltin };
};
