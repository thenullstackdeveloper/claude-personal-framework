export const isObject = (v: unknown): v is Record<string, unknown> => {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
};

export const isStringArray = (v: unknown): v is readonly string[] => {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
};

export const asStringOrArray = (v: unknown): readonly string[] | null => {
  if (typeof v === 'string') return [v];
  if (isStringArray(v)) return v;
  return null;
};
