import { type CatalogPort, FsStackInspector, detectStack } from '@claude-fw/core';

export type DetectStackCommandArgs = {
  readonly catalog: CatalogPort;
  readonly projectRoot: string;
};

export type DetectStackMatch = {
  readonly preset: string;
  readonly specificity: number;
};

export type DetectStackCommandReport = {
  readonly projectRoot: string;
  /**
   * Matching presets ordered by descending specificity. When the wizard
   * preselects a preset, it picks `matches[0]` unless the top two share
   * the same specificity (a tie) — in that case the user picks manually.
   */
  readonly matches: readonly DetectStackMatch[];
};

export const runDetectStack = async (
  args: DetectStackCommandArgs,
): Promise<DetectStackCommandReport> => {
  const inspector = new FsStackInspector();
  const result = await detectStack({
    projectRoot: args.projectRoot,
    catalog: args.catalog,
    inspector,
  });
  return {
    projectRoot: args.projectRoot,
    matches: result.matches.map((m) => ({
      preset: m.preset.name.toString(),
      specificity: m.specificity,
    })),
  };
};

export const formatDetectStackReport = (report: DetectStackCommandReport): string => {
  const lines: string[] = [`Project: ${report.projectRoot}`];
  if (report.matches.length === 0) {
    lines.push('No preset matched. The wizard will let the user pick manually.');
    return lines.join('\n');
  }
  const top = report.matches[0];
  if (!top) return lines.join('\n');
  const tie = report.matches.length >= 2 && report.matches[1]?.specificity === top.specificity;
  if (tie) {
    lines.push('Multiple presets tied for highest specificity — wizard will not preselect.');
  } else {
    lines.push(`Suggested preset: ${top.preset} (specificity ${top.specificity})`);
  }
  lines.push('');
  lines.push(`Matches (${report.matches.length}):`);
  for (const m of report.matches) {
    lines.push(`  - ${m.preset} (specificity ${m.specificity})`);
  }
  return lines.join('\n');
};

export const formatDetectStackReportJson = (report: DetectStackCommandReport): string => {
  return JSON.stringify(report, null, 2);
};
