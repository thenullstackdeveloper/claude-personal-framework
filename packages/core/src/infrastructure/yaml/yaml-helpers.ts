/**
 * YAML-specific helpers. Type guards reused by JSON parsers too live in
 * `_shared/object-guards.ts`; this module re-exports them so existing
 * `import { isObject, isStringArray } from './yaml-helpers.js';` consumers
 * keep working without a sweep.
 */
export { isObject, isStringArray } from '../_shared/object-guards.js';

/**
 * Coerce a YAML scalar that can be either a string or a list of strings
 * into a uniform `readonly string[]`. YAML-specific because JSON has no
 * "string masquerading as a single-element array" convention.
 */
import { isStringArray as _isStringArray } from '../_shared/object-guards.js';

export const asStringOrArray = (v: unknown): readonly string[] | null => {
  if (typeof v === 'string') return [v];
  if (_isStringArray(v)) return v;
  return null;
};
