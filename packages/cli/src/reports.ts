/**
 * Public report DTOs emitted by the CLI as JSON (`--json` flag) and
 * deserialized at the consumer side. The CLI is the source of truth for
 * this shape — Rust deserializes it on its way to the desktop, and the
 * desktop's `api.ts` imports these types directly so a field added here
 * surfaces in the desktop UI without an additional copy.
 *
 * The names are aliased to match the desktop's previous local names so
 * the migration doesn't require touching every call site. See ADR-0005
 * for the rationale.
 */

export type {
  DetectStackCommandReport as DetectStackReport,
  DetectStackMatch,
} from './detect-stack.command.js';
export type { InitCommandReport as InitReport } from './init.command.js';
export type { InstallCommandReport as InstallReport } from './install.command.js';
export type {
  ListCommandArtifact as ListArtifact,
  ListCommandGitHook as GitHookSummary,
  ListCommandPreset as ListPreset,
  ListCommandReport as CatalogReport,
} from './list.command.js';
export type {
  StatusArtifact,
  StatusCommandReport as StatusReport,
  StatusSingleton,
  StatusUpdate,
} from './status.command.js';
