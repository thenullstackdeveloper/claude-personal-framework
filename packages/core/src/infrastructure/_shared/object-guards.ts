/**
 * Type guards reused across YAML and JSON parsers. Lives here so the two
 * sides can share a single source of truth without one having to depend on
 * the other.
 */

export const isObject = (v: unknown): v is Record<string, unknown> => {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
};

export const isStringArray = (v: unknown): v is readonly string[] => {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
};
