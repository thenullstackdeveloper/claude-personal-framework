import { type CatalogPort, listCatalog } from '@claude-fw/core';

export type ListCommandArgs = {
  readonly catalog: CatalogPort;
};

export type ListCommandPreset = {
  readonly name: string;
  readonly extends: readonly string[];
  readonly agents: readonly string[];
  readonly skills: readonly string[];
  readonly commands: readonly string[];
  readonly instructions: readonly string[];
  readonly gitHooks: readonly string[];
};

export type ListCommandArtifact = {
  readonly id: string;
  readonly description: string;
};

export type ListCommandGitHook = {
  readonly hookName: string;
};

export type ListCommandReport = {
  readonly presets: readonly ListCommandPreset[];
  readonly agents: readonly ListCommandArtifact[];
  readonly skills: readonly ListCommandArtifact[];
  readonly commands: readonly ListCommandArtifact[];
  readonly instructions: readonly ListCommandArtifact[];
  readonly gitHooks: readonly ListCommandGitHook[];
};

export const runList = async (args: ListCommandArgs): Promise<ListCommandReport> => {
  const result = await listCatalog({ catalog: args.catalog });

  return {
    presets: result.presets.map((p) => ({
      name: p.name.toString(),
      extends: p.extends_.map(String),
      agents: p.agentIds.map(String),
      skills: p.skillIds.map(String),
      commands: p.commandIds.map(String),
      instructions: p.instructionsIds.map(String),
      gitHooks: p.gitHookNames.map(String),
    })),
    agents: result.agents.map((a) => ({
      id: a.id.toString(),
      description: a.description,
    })),
    skills: result.skills.map((s) => ({
      id: s.id.toString(),
      description: s.description,
    })),
    commands: result.commands.map((c) => ({
      id: c.id.toString(),
      description: c.description,
    })),
    instructions: result.instructions.map((i) => ({
      id: i.id.toString(),
      description: i.description,
    })),
    gitHooks: result.gitHooks.map((h) => ({
      hookName: h.hookName,
    })),
  };
};

const renderArtifactList = (
  label: string,
  items: readonly ListCommandArtifact[],
  lines: string[],
) => {
  if (items.length === 0) return;
  lines.push(`\n${label} (${items.length}):`);
  for (const item of items) {
    const desc = item.description ? ` — ${item.description}` : '';
    lines.push(`  - ${item.id}${desc}`);
  }
};

const renderGitHookList = (items: readonly ListCommandGitHook[], lines: string[]) => {
  if (items.length === 0) return;
  lines.push(`\nGit hooks (${items.length}):`);
  for (const item of items) lines.push(`  - ${item.hookName}`);
};

export const formatListReport = (report: ListCommandReport): string => {
  const lines: string[] = [];

  if (report.presets.length > 0) {
    lines.push(`Presets (${report.presets.length}):`);
    for (const preset of report.presets) {
      const extendsPart =
        preset.extends.length > 0 ? ` (extends ${preset.extends.join(', ')})` : '';
      const counts: string[] = [];
      if (preset.agents.length > 0) counts.push(`${preset.agents.length} agents`);
      if (preset.skills.length > 0) counts.push(`${preset.skills.length} skills`);
      if (preset.commands.length > 0) counts.push(`${preset.commands.length} commands`);
      if (preset.instructions.length > 0) {
        counts.push(`${preset.instructions.length} instructions`);
      }
      if (preset.gitHooks.length > 0) counts.push(`${preset.gitHooks.length} git-hooks`);
      const summary = counts.length > 0 ? `: ${counts.join(', ')}` : '';
      lines.push(`  - ${preset.name}${extendsPart}${summary}`);
    }
  }

  renderArtifactList('Agents', report.agents, lines);
  renderArtifactList('Skills', report.skills, lines);
  renderArtifactList('Commands', report.commands, lines);
  renderArtifactList('Instructions', report.instructions, lines);
  renderGitHookList(report.gitHooks, lines);

  if (
    report.presets.length === 0 &&
    report.agents.length === 0 &&
    report.skills.length === 0 &&
    report.commands.length === 0 &&
    report.instructions.length === 0 &&
    report.gitHooks.length === 0
  ) {
    lines.push('(empty catalog)');
  }

  return lines.join('\n');
};

export const formatListReportJson = (report: ListCommandReport): string => {
  return JSON.stringify(report, null, 2);
};
