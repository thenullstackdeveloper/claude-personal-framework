/**
 * Shared filesystem helpers for adapters under `infrastructure/fs/`.
 *
 * Lives in infrastructure on purpose: the type it guards (`ErrnoException`)
 * is a Node.js concern, not a domain one. Keeping it here means the helper
 * is reachable by every fs adapter without crossing the domain boundary.
 */

/**
 * Narrows an unknown thrown value to `NodeJS.ErrnoException` so callers can
 * branch on `err.code === 'ENOENT'` (or similar) without resorting to
 * `as` casts. Treats any Error with a `code` property as one — Node-built-in
 * fs errors all satisfy this shape; userland errors that happen to add a
 * `code` field are also accepted by design (no over-narrowing).
 */
export const isErrnoException = (err: unknown): err is NodeJS.ErrnoException => {
  return err instanceof Error && 'code' in err;
};
