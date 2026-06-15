import { parse as parseYaml } from 'yaml';
import { InvalidProjectManifestError } from '../../domain/errors/domain-error.js';
import { ArtifactRef } from '../../domain/model/artifact-ref.js';
import { AgentId, CommandId, PresetName, SkillId } from '../../domain/model/identifiers.js';
import { Override } from '../../domain/model/override.js';
import type { ProjectManifest } from '../../domain/model/project-manifest.js';
import { isObject } from './yaml-helpers.js';

const parseArtifactRef = (ref: string): ArtifactRef => {
  const idx = ref.indexOf(':');
  if (idx < 0) {
    throw new InvalidProjectManifestError(
      `invalid artifact reference "${ref}" — expected "agent:id", "skill:id" or "command:id"`,
    );
  }
  const type = ref.slice(0, idx);
  const id = ref.slice(idx + 1);
  if (!type || !id) {
    throw new InvalidProjectManifestError(`invalid artifact reference "${ref}"`);
  }
  if (type === 'agent') return ArtifactRef.agent(AgentId.of(id));
  if (type === 'skill') return ArtifactRef.skill(SkillId.of(id));
  if (type === 'command') return ArtifactRef.command(CommandId.of(id));
  // git-hook is a valid ArtifactRef.type at the domain level (the serializer
  // emits it defensively), but the override system treats every git-hook
  // target as a no-op (CLAUDEPERS-9). Rather than parsing a ref that nothing
  // downstream can act on, refuse it here with a message naming the rule.
  if (type === 'git-hook') {
    throw new InvalidProjectManifestError(
      `git-hook overrides are not supported in project manifests — git-hook targets ("${ref}") cannot be disabled, added or patched from a project`,
    );
  }
  throw new InvalidProjectManifestError(`unknown artifact type "${type}" in reference "${ref}"`);
};

const parseOverride = (raw: unknown, index: number): Override => {
  if (!isObject(raw)) {
    throw new InvalidProjectManifestError(
      `override #${index}: must be a map with one of "disable", "add", "patch"`,
    );
  }

  if (typeof raw['disable'] === 'string') {
    return Override.disable(parseArtifactRef(raw['disable']));
  }
  if (typeof raw['add'] === 'string') {
    return Override.add(parseArtifactRef(raw['add']));
  }
  if (typeof raw['patch'] === 'string') {
    const content = raw['content'];
    if (typeof content !== 'string') {
      throw new InvalidProjectManifestError(
        `override #${index}: "patch" requires a sibling "content" string`,
      );
    }
    return Override.patch(parseArtifactRef(raw['patch']), content);
  }

  throw new InvalidProjectManifestError(
    `override #${index}: must contain one of "disable", "add" or "patch"`,
  );
};

export const parseProjectManifest = (yamlText: string): ProjectManifest => {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    throw new InvalidProjectManifestError(
      `failed to parse project manifest YAML — ${(err as Error).message}`,
    );
  }

  if (!isObject(raw)) {
    throw new InvalidProjectManifestError('project manifest YAML root must be a map');
  }

  const presetRaw = raw['preset'];
  if (typeof presetRaw !== 'string' || !presetRaw) {
    throw new InvalidProjectManifestError(
      'project manifest must declare a "preset" name (non-empty string)',
    );
  }
  const presetName = PresetName.of(presetRaw);

  const overridesRaw = raw['overrides'];
  let overrides: readonly Override[] = [];
  if (overridesRaw !== undefined) {
    if (!Array.isArray(overridesRaw)) {
      throw new InvalidProjectManifestError('"overrides" must be a list');
    }
    overrides = overridesRaw.map((item, i) => parseOverride(item, i));
  }

  return { presetName, overrides };
};
