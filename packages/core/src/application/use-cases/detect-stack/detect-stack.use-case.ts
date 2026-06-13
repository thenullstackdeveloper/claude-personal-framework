import type { Preset } from '../../../domain/model/preset.js';
import { evaluateDetects } from '../../../domain/services/evaluate-detects.js';
import type { CatalogPort } from '../../ports/catalog.port.js';
import type { StackInspectorPort } from '../../ports/stack-inspector.port.js';

export type DetectStackInput = {
  readonly projectRoot: string;
  readonly catalog: CatalogPort;
  readonly inspector: StackInspectorPort;
};

export type PresetMatch = {
  readonly preset: Preset;
  readonly specificity: number;
};

export type DetectStackResult = {
  /**
   * Matching presets ordered by descending specificity. The first entry is
   * the most specific match — the wizard preselects it when present. Presets
   * with no `detects:` block, or whose rules do not match, are excluded.
   *
   * Specificity ties between two matches preserve catalog order
   * (insertion order of `catalog.listPresets()`), which mirrors the
   * "no preselection on ties" wizard rule: the consumer can still detect
   * a tie by comparing the first two specificities.
   */
  readonly matches: readonly PresetMatch[];
};

/**
 * Inspects the project root and ranks every preset in the catalog by how
 * well its `detects:` rules match. Pure orchestration over two ports —
 * the matching logic lives in the domain (`evaluateDetects`).
 */
export const detectStack = async (input: DetectStackInput): Promise<DetectStackResult> => {
  const [presets, inspection] = await Promise.all([
    input.catalog.listPresets(),
    input.inspector.inspect(input.projectRoot),
  ]);

  const matches: PresetMatch[] = [];
  for (const preset of presets) {
    const evaluation = evaluateDetects(preset.detects, inspection);
    if (evaluation.matched) {
      matches.push({ preset, specificity: evaluation.specificity });
    }
  }

  // Stable sort by descending specificity. JavaScript's Array.sort is stable
  // since ES2019 / V8 7.0, so equal-specificity matches keep catalog order.
  matches.sort((a, b) => b.specificity - a.specificity);

  return { matches };
};
