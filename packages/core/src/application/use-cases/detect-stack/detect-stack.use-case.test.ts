import { describe, expect, it } from 'vitest';
import { ArtifactNotFoundError } from '../../../domain/errors/domain-error.js';
import type { DetectRule } from '../../../domain/model/detect-rule.js';
import { PresetName } from '../../../domain/model/identifiers.js';
import { Preset } from '../../../domain/model/preset.js';
import type { ProjectInspection } from '../../../domain/model/project-inspection.js';
import type { CatalogPort } from '../../ports/catalog.port.js';
import type { StackInspectorPort } from '../../ports/stack-inspector.port.js';
import { detectStack } from './detect-stack.use-case.js';

const stubCatalog = (presets: readonly Preset[]): CatalogPort => ({
  listPresets: async () => presets,
  listAgents: async () => [],
  listSkills: async () => [],
  listCommands: async () => [],
  listInstructions: async () => [],
  listGitHooks: async () => [],
  readAgent: async () => {
    throw new ArtifactNotFoundError('not used');
  },
  readSkill: async () => {
    throw new ArtifactNotFoundError('not used');
  },
  readCommand: async () => {
    throw new ArtifactNotFoundError('not used');
  },
  readInstructions: async () => {
    throw new ArtifactNotFoundError('not used');
  },
  readGitHook: async () => {
    throw new ArtifactNotFoundError('not used');
  },
});

const stubInspector = (inspection: ProjectInspection): StackInspectorPort => ({
  inspect: async () => inspection,
});

const preset = (name: string, detects: readonly DetectRule[] = []): Preset =>
  Preset.of({ name: PresetName.of(name), detects });

describe('detectStack', () => {
  it('returns no matches when the catalog has only presets without detects', async () => {
    const result = await detectStack({
      projectRoot: '/proj',
      catalog: stubCatalog([preset('base')]),
      inspector: stubInspector({ dependencies: ['react'], files: [] }),
    });
    expect(result.matches).toEqual([]);
  });

  it('returns the matching preset when its rule is satisfied', async () => {
    const reactPreset = preset('react-app', [{ dependencies: ['react'] }]);
    const result = await detectStack({
      projectRoot: '/proj',
      catalog: stubCatalog([reactPreset]),
      inspector: stubInspector({ dependencies: ['react'], files: [] }),
    });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.preset.name.toString()).toBe('react-app');
    expect(result.matches[0]?.specificity).toBe(1);
  });

  it('orders matches by descending specificity (most specific wins)', async () => {
    const broad = preset('react-app', [{ dependencies: ['react'] }]);
    const specific = preset('tauri-rust-react', [
      { dependencies: ['react'], files: ['src-tauri/'] },
    ]);
    const result = await detectStack({
      projectRoot: '/proj',
      catalog: stubCatalog([broad, specific]),
      inspector: stubInspector({ dependencies: ['react'], files: ['src-tauri'] }),
    });
    expect(result.matches.map((m) => m.preset.name.toString())).toEqual([
      'tauri-rust-react',
      'react-app',
    ]);
    expect(result.matches[0]?.specificity).toBe(2);
    expect(result.matches[1]?.specificity).toBe(1);
  });

  it('preserves catalog order when two presets tie on specificity', async () => {
    // Both presets match with specificity 1 — neither is "more specific" so
    // the consumer (wizard) should detect the tie and prompt without
    // preselecting. detectStack itself just preserves catalog order.
    const first = preset('first', [{ dependencies: ['react'] }]);
    const second = preset('second', [{ dependencies: ['react'] }]);
    const result = await detectStack({
      projectRoot: '/proj',
      catalog: stubCatalog([first, second]),
      inspector: stubInspector({ dependencies: ['react'], files: [] }),
    });
    expect(result.matches.map((m) => m.preset.name.toString())).toEqual(['first', 'second']);
    expect(result.matches[0]?.specificity).toBe(result.matches[1]?.specificity);
  });

  it('filters out presets whose rules do not match', async () => {
    const matching = preset('match', [{ dependencies: ['react'] }]);
    const notMatching = preset('miss', [{ dependencies: ['vue'] }]);
    const fallback = preset('base');
    const result = await detectStack({
      projectRoot: '/proj',
      catalog: stubCatalog([matching, notMatching, fallback]),
      inspector: stubInspector({ dependencies: ['react'], files: [] }),
    });
    expect(result.matches.map((m) => m.preset.name.toString())).toEqual(['match']);
  });

  it('reads the inspection from the given projectRoot', async () => {
    let askedFor: string | null = null;
    const inspector: StackInspectorPort = {
      inspect: async (root) => {
        askedFor = root;
        return { dependencies: [], files: [] };
      },
    };
    await detectStack({
      projectRoot: '/specific/path',
      catalog: stubCatalog([preset('base')]),
      inspector,
    });
    expect(askedFor).toBe('/specific/path');
  });
});
