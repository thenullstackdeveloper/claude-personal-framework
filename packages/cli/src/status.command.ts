import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CatalogReader, LockfileStore, checkStatus, parseProjectManifest } from '@claude-fw/core';

const MANIFEST_FILENAME = '.claude-fw.yaml';

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

export type StatusCommandReport = {
  readonly presetName: string;
  readonly hasLockfile: boolean;
  readonly added: readonly StatusArtifact[];
  readonly updated: readonly StatusUpdate[];
  readonly removed: readonly StatusArtifact[];
  readonly unchanged: readonly StatusArtifact[];
};

export const runStatus = async (args: StatusCommandArgs): Promise<StatusCommandReport> => {
  const manifestYaml = await readFile(join(args.projectRoot, MANIFEST_FILENAME), 'utf-8');
  const manifest = parseProjectManifest(manifestYaml);

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
    added: result.drift.added.map((r) => ({ type: r.type, id: r.id.toString() })),
    updated: result.drift.updated.map((u) => ({
      type: u.ref.type,
      id: u.ref.id.toString(),
      oldSha: u.oldSha.toString(),
      newSha: u.newSha.toString(),
    })),
    removed: result.drift.removed.map((r) => ({ type: r.type, id: r.id.toString() })),
    unchanged: result.drift.unchanged.map((r) => ({ type: r.type, id: r.id.toString() })),
  };
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

  if (report.added.length === 0 && report.updated.length === 0 && report.removed.length === 0) {
    if (report.unchanged.length === 0) {
      lines.push('\n(no artifacts in the resolved preset)');
    } else {
      lines.push('\nNo drift — installed state matches the catalog.');
    }
  }

  return lines.join('\n');
};

export const formatStatusReportJson = (report: StatusCommandReport): string => {
  return JSON.stringify(report, null, 2);
};
