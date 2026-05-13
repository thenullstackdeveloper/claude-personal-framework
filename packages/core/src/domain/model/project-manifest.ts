import type { PresetName } from './identifiers.js';
import type { Override } from './override.js';

export type ProjectManifest = {
  readonly presetName: PresetName;
  readonly overrides: readonly Override[];
};
