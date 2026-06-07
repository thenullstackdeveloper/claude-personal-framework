import { useCallback, useState } from 'react';
import { type CatalogReport, type CliError, listCatalog, toCliError } from '../lib/api';

/**
 * Encapsulates the load-catalog flow: fetches the framework's catalog
 * (presets + agents + skills + commands + instructions) on demand and
 * holds the loading / error / data state.
 *
 * No auto-load on mount: catalog loading is user-initiated (button
 * click). The caller wires `load` to the trigger.
 *
 * Behavior preserved verbatim from the previous inline state +
 * `handleLoadCatalog` in App.tsx. The hook does NOT short-circuit on
 * empty frameworkRoot — the CLI is the source of truth on whether the
 * path is valid; defensive short-circuiting here would diverge from
 * what App.tsx does today and is tracked as a UX TODO.
 */
export const useCatalogFlow = (
  frameworkRoot: string,
): {
  catalog: CatalogReport | null;
  error: CliError | null;
  loading: boolean;
  load: () => Promise<void>;
  dismissError: () => void;
} => {
  const [catalog, setCatalog] = useState<CatalogReport | null>(null);
  const [error, setError] = useState<CliError | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCatalog(frameworkRoot);
      setCatalog(data);
    } catch (e) {
      setCatalog(null);
      setError(toCliError(e));
    } finally {
      setLoading(false);
    }
  }, [frameworkRoot]);

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  return { catalog, error, loading, load, dismissError };
};
