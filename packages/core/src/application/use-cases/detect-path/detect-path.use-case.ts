import type { PathProbePort } from '../../ports/path-probe.port.js';

// Layout that defines what a framework root and a project root look like.
// This is the single source of truth for that rule — ports (CLI, desktop)
// must not re-derive it.
const PRESETS_DIR = 'presets';
const AGENTS_DIR = 'agents';
const PROJECT_MANIFEST = '.claude-fw.yaml';

export type DetectPathInput = {
  readonly path: string;
  readonly probe: PathProbePort;
};

export type DetectPathResult = {
  /** True when the path holds a framework catalog (presets/ + agents/). */
  readonly isFramework: boolean;
  /** True when the path holds a consumer project (.claude-fw.yaml). */
  readonly isProject: boolean;
};

export const detectPath = async (input: DetectPathInput): Promise<DetectPathResult> => {
  const { path, probe } = input;
  const [presets, agents, manifest] = await Promise.all([
    probe.inspect(path, PRESETS_DIR),
    probe.inspect(path, AGENTS_DIR),
    probe.inspect(path, PROJECT_MANIFEST),
  ]);
  return {
    isFramework: presets === 'directory' && agents === 'directory',
    isProject: manifest === 'file',
  };
};
