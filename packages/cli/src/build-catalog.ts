import { AggregatedCatalog, type CatalogPort, FsCatalogReader } from '@claude-fw/core';

/**
 * Raised by {@link buildCatalogPort} when no source — no env override, no
 * `--catalog-folder`, no legacy `--framework` — has been configured. Carries
 * a stable `code` so the CLI JSON envelope tells callers (humans, scripts,
 * the desktop) which knob to turn instead of leaking a bare Error.
 */
export class NoCatalogSourceError extends Error {
  readonly code = 'NO_CATALOG_SOURCE';
}

export type BuildCatalogInput = {
  /**
   * Legacy `--framework <path>` flag. When set, behaves as a single folder
   * source with the same precedence as a user-provided `--catalog-folder`,
   * placed AFTER explicit `--catalog-folder` flags.
   *
   * @deprecated Prefer `catalogFolders`. The flag stays for back-compat
   * until the next major; see ADR-0003.
   */
  readonly frameworkFlag?: string | undefined;

  /**
   * User-provided catalog folder paths, in order of appearance on the
   * command line. Earlier paths win over later ones in the aggregation.
   */
  readonly catalogFolders: readonly string[];

  /**
   * Process env, injected for testability. The helper reads `CFW_CATALOG_PATH`
   * from it; when set, that path becomes the highest-precedence source.
   */
  readonly env: NodeJS.ProcessEnv;

  /**
   * When false, the built-in embedded catalog (CLAUDEPERS-25) is excluded
   * from the aggregation. Today no built-in source exists yet — the flag is
   * accepted so the desktop can already opt out from Settings; once the
   * embedded source lands it will be appended last when this is true.
   */
  readonly allowBuiltin: boolean;
};

/**
 * Composition root for the CLI's CatalogPort. Resolves precedence:
 *
 *   1. `CFW_CATALOG_PATH` env var (highest) — when set and non-empty
 *   2. `--catalog-folder <path>` flags, in the order they were passed
 *   3. legacy `--framework <path>` flag (single folder)
 *   4. embedded built-in catalog (lowest) — wired in by CLAUDEPERS-25
 *
 * Returns an `AggregatedCatalog` when more than one source is configured,
 * a single `FsCatalogReader` when there is exactly one, and throws when
 * there are none — the CLI cannot read a catalog from nowhere.
 */
export const buildCatalogPort = (input: BuildCatalogInput): CatalogPort => {
  const folders: string[] = [];

  const envOverride = input.env['CFW_CATALOG_PATH'];
  if (envOverride && envOverride.trim().length > 0) {
    folders.push(envOverride);
  }

  for (const path of input.catalogFolders) {
    folders.push(path);
  }

  if (input.frameworkFlag && input.frameworkFlag.trim().length > 0) {
    folders.push(input.frameworkFlag);
  }

  // `allowBuiltin` is accepted now so the desktop's Settings toggle has
  // somewhere to land already, but the built-in source itself is not
  // wired yet (it lands with the embed work in CLAUDEPERS-25). Once that
  // exists, append it here when `allowBuiltin === true`.

  const sources = folders.map((path) => new FsCatalogReader(path));
  const [first, ...rest] = sources;
  if (!first) {
    throw new NoCatalogSourceError(
      'No catalog source configured. Pass --catalog-folder <path>, --framework <path>, or set CFW_CATALOG_PATH.',
    );
  }
  return rest.length === 0 ? first : new AggregatedCatalog([first, ...rest]);
};
