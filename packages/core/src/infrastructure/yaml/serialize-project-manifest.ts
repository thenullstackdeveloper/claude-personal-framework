import { stringify as stringifyYaml } from 'yaml';
import type { ArtifactRef } from '../../domain/model/artifact-ref.js';
import type { Override } from '../../domain/model/override.js';
import type { ProjectManifest } from '../../domain/model/project-manifest.js';

const refToString = (ref: ArtifactRef): string => `${ref.type}:${ref.id.toString()}`;

const serializeOverride = (o: Override): Record<string, unknown> => {
  if (o.kind === 'disable') return { disable: refToString(o.target) };
  if (o.kind === 'add') return { add: refToString(o.target) };
  // patch
  return { patch: refToString(o.target), content: o.content };
};

/**
 * Serializes a {@link ProjectManifest} to the YAML format consumed by
 * {@link parseProjectManifest}. The two functions are inverses on the
 * value domain (string formatting may differ — equality is checked
 * at the parsed-value level, not byte level).
 */
export const serializeProjectManifest = (manifest: ProjectManifest): string => {
  const obj: Record<string, unknown> = {
    preset: manifest.presetName.toString(),
  };
  if (manifest.overrides.length > 0) {
    obj['overrides'] = manifest.overrides.map(serializeOverride);
  }
  return stringifyYaml(obj);
};
