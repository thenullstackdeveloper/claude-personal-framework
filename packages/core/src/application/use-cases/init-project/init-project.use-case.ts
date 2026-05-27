import { PresetNotFoundError } from '../../../domain/errors/domain-error.js';
import type { PresetName } from '../../../domain/model/identifiers.js';
import type { ProjectManifest } from '../../../domain/model/project-manifest.js';
import type { CatalogPort, ManifestStorePort } from '../../ports/index.js';
import { ManifestAlreadyExistsError } from './errors.js';

export type InitProjectInput = {
  readonly presetName: PresetName;
  readonly catalog: CatalogPort;
  readonly manifestStore: ManifestStorePort;
};

export type InitProjectResult = {
  readonly manifest: ProjectManifest;
};

/**
 * Creates a project manifest pointing at the given preset.
 *
 * - Refuses to overwrite an existing manifest (no `force` in the MVP —
 *   if the user wants to switch preset, that is a different use case).
 * - Validates that the preset exists in the catalog before writing,
 *   so the resulting manifest is guaranteed to be installable.
 */
export const initProject = async (input: InitProjectInput): Promise<InitProjectResult> => {
  const { presetName, catalog, manifestStore } = input;

  const existing = await manifestStore.read();
  if (existing !== null) {
    throw new ManifestAlreadyExistsError();
  }

  const presets = await catalog.listPresets();
  const exists = presets.some((p) => p.name.equals(presetName));
  if (!exists) {
    throw new PresetNotFoundError(`preset "${presetName.toString()}" not found in catalog`);
  }

  const manifest: ProjectManifest = {
    presetName,
    overrides: [],
  };

  await manifestStore.write(manifest);
  return { manifest };
};
