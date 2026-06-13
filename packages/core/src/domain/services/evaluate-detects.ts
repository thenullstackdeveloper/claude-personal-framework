import type { DetectRule } from '../model/detect-rule.js';
import type { ProjectInspection } from '../model/project-inspection.js';

/**
 * Outcome of evaluating a Preset's `detects:` rules against a project
 * inspection.
 *
 * `specificity` is the number of patterns matched in the WINNING rule (the
 * highest-scoring AND chain). It is used by the wizard to order multiple
 * matching presets — more specific wins. When `matched` is false,
 * specificity is always 0.
 */
export type DetectMatch = {
  readonly matched: boolean;
  readonly specificity: number;
};

/**
 * Evaluates a list of {@link DetectRule}s as OR. Inside each rule all
 * present fields must match (AND). The winning rule (highest specificity)
 * sets the returned specificity. An empty rule never matches.
 *
 * Returns `{ matched: false, specificity: 0 }` for presets without any
 * matching rule — that includes presets without a `detects:` block at all,
 * which is the explicit way to mark a preset as a fallback that the wizard
 * must never preselect.
 */
export const evaluateDetects = (
  rules: readonly DetectRule[],
  inspection: ProjectInspection,
): DetectMatch => {
  let best: DetectMatch = { matched: false, specificity: 0 };
  for (const rule of rules) {
    const result = evaluateRule(rule, inspection);
    if (result.matched && result.specificity > best.specificity) {
      best = result;
    }
  }
  return best;
};

const evaluateRule = (rule: DetectRule, inspection: ProjectInspection): DetectMatch => {
  const deps = rule.dependencies ?? [];
  const files = rule.files ?? [];

  if (deps.length === 0 && files.length === 0) {
    return { matched: false, specificity: 0 };
  }

  const depsMatch = deps.every((d) => inspection.dependencies.includes(d));
  if (!depsMatch) return { matched: false, specificity: 0 };

  const filesMatch = files.every((f) => inspection.files.includes(stripTrailingSlash(f)));
  if (!filesMatch) return { matched: false, specificity: 0 };

  return { matched: true, specificity: deps.length + files.length };
};

const stripTrailingSlash = (name: string): string =>
  name.endsWith('/') ? name.slice(0, -1) : name;
