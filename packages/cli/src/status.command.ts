import { CatalogReader, FsManifestStore, LockfileStore, checkStatus } from '@claude-fw/core';

export type StatusCommandArgs = {
  readonly frameworkRoot: string;
  readonly projectRoot: string;
};

export type StatusArtifact = {
  readonly type: string;
  readonly id: string;
};

export type StatusUpdate = {
  readonly type: string;
  readonly id: string;
  readonly oldSha: string;
  readonly newSha: string;
};

export type StatusSingleton =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'added' }
  | { readonly kind: 'removed'; readonly oldSha: string }
  | { readonly kind: 'updated'; readonly oldSha: string; readonly newSha: string };

export type StatusCommandReport = {
  readonly presetName: string;
  readonly hasLockfile: boolean;
  readonly added: readonly StatusArtifact[];
  readonly updated: readonly StatusUpdate[];
  readonly removed: readonly StatusArtifact[];
  readonly unchanged: readonly StatusArtifact[];
  readonly settings: StatusSingleton;
  readonly instructions: StatusSingleton;
};

export const runStatus = async (args: StatusCommandArgs): Promise<StatusCommandReport> => {
  const manifestStore = new FsManifestStore(args.projectRoot);
  const manifest = await manifestStore.read();
  if (manifest === null) {
    throw new Error(
      `No .claude-fw.yaml found at ${args.projectRoot}. Run 'claude-fw init --preset <name>' first to create one.`,
    );
  }

  const catalog = new CatalogReader(args.frameworkRoot);
  const lockfileStore = new LockfileStore(args.projectRoot);

  const result = await checkStatus({
    manifest,
    projectPath: args.projectRoot,
    catalog,
    lockfileStore,
  });

  return {
    presetName: manifest.presetName.toString(),
    hasLockfile: result.hasLockfile,
    added: result.drift.added.map(refToWire),
    updated: result.drift.updated.map((u) => ({
      ...refToWire(u.ref),
      oldSha: u.oldSha.toString(),
      newSha: u.newSha.toString(),
    })),
    removed: result.drift.removed.map(refToWire),
    unchanged: result.drift.unchanged.map(refToWire),
    settings: toStatusSingleton(result.drift.settings),
    instructions: toStatusSingleton(result.drift.instructions),
  };
};

const refToWire = (
  ref:
    | { readonly type: 'agent' | 'skill' | 'command'; readonly id: { toString(): string } }
    | { readonly type: 'git-hook'; readonly hookName: string },
): { type: string; id: string } => {
  if (ref.type === 'git-hook') return { type: ref.type, id: ref.hookName };
  return { type: ref.type, id: ref.id.toString() };
};

const toStatusSingleton = (s: {
  kind: 'unchanged' | 'added' | 'removed' | 'updated';
  oldSha?: { toString(): string };
  newSha?: { toString(): string };
}): StatusSingleton => {
  if (s.kind === 'unchanged') return { kind: 'unchanged' };
  if (s.kind === 'added') return { kind: 'added' };
  if (s.kind === 'removed' && s.oldSha) return { kind: 'removed', oldSha: s.oldSha.toString() };
  if (s.kind === 'updated' && s.oldSha && s.newSha) {
    return { kind: 'updated', oldSha: s.oldSha.toString(), newSha: s.newSha.toString() };
  }
  return { kind: 'unchanged' };
};

const renderSection = (label: string, items: readonly StatusArtifact[], lines: string[]) => {
  if (items.length === 0) return;
  lines.push(`\n${label} (${items.length}):`);
  for (const item of items) lines.push(`  ${item.type}: ${item.id}`);
};

const renderUpdates = (items: readonly StatusUpdate[], lines: string[]) => {
  if (items.length === 0) return;
  lines.push(`\nUpdated (${items.length}):`);
  for (const item of items) {
    lines.push(`  ${item.type}: ${item.id}`);
    lines.push(`    ${item.oldSha.slice(0, 12)}…  →  ${item.newSha.slice(0, 12)}…`);
  }
};

export const formatStatusReport = (report: StatusCommandReport): string => {
  const lines: string[] = [];
  lines.push(`Preset: ${report.presetName}`);
  lines.push(
    report.hasLockfile
      ? 'Lockfile: present — drift computed against last install.'
      : 'Lockfile: missing — this would be the first install.',
  );

  renderSection('Added', report.added, lines);
  renderUpdates(report.updated, lines);
  renderSection('Removed', report.removed, lines);
  renderSection('Unchanged', report.unchanged, lines);
  renderSingletonDrift('Settings', '.claude/settings.json', report.settings, lines);
  renderSingletonDrift('Instructions', '.claude/CLAUDE.md', report.instructions, lines);

  const hasArtifactDrift =
    report.added.length > 0 || report.updated.length > 0 || report.removed.length > 0;
  const settingsChanged = report.settings.kind !== 'unchanged';
  const instructionsChanged = report.instructions.kind !== 'unchanged';
  if (!hasArtifactDrift && !settingsChanged && !instructionsChanged) {
    if (report.unchanged.length === 0) {
      lines.push('\n(no artifacts in the resolved preset)');
    } else {
      lines.push('\nNo drift — installed state matches the catalog.');
    }
  }

  return lines.join('\n');
};

const renderSingletonDrift = (label: string, path: string, s: StatusSingleton, lines: string[]) => {
  if (s.kind === 'unchanged') return;
  if (s.kind === 'added') {
    lines.push(`\n${label}: added (will write ${path}).`);
    return;
  }
  if (s.kind === 'removed') {
    lines.push(`\n${label}: removed (will delete ${path}).`);
    lines.push(`  was: ${s.oldSha.slice(0, 12)}…`);
    return;
  }
  // updated
  lines.push(`\n${label}: updated.`);
  lines.push(`  ${s.oldSha.slice(0, 12)}…  →  ${s.newSha.slice(0, 12)}…`);
};

export const formatStatusReportJson = (report: StatusCommandReport): string => {
  return JSON.stringify(report, null, 2);
};
