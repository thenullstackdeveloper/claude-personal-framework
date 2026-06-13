#!/usr/bin/env node

import { buildCatalogPort } from './build-catalog.js';
import {
  formatDetectStackReport,
  formatDetectStackReportJson,
  runDetectStack,
} from './detect-stack.command.js';
import {
  type DetectCommandReport,
  formatDetectReport,
  formatDetectReportJson,
  runDetect,
} from './detect.command.js';
import { formatInitReport, formatInitReportJson, runInit } from './init.command.js';
import { formatInstallReport, formatInstallReportJson, runInstall } from './install.command.js';
import { formatListReport, formatListReportJson, runList } from './list.command.js';
import { formatStatusReport, formatStatusReportJson, runStatus } from './status.command.js';

type ParsedArgs = {
  readonly command: string;
  readonly framework: string | undefined;
  readonly catalogFolders: readonly string[];
  readonly noBuiltin: boolean;
  readonly project: string | undefined;
  readonly path: string | undefined;
  readonly preset: string | undefined;
  readonly json: boolean;
  readonly initGit: boolean;
};

const parseArgs = (argv: readonly string[]): ParsedArgs => {
  let command = '';
  let framework: string | undefined;
  const catalogFolders: string[] = [];
  let noBuiltin = false;
  let project: string | undefined;
  let path: string | undefined;
  let preset: string | undefined;
  let json = false;
  let initGit = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === '--framework') {
      framework = argv[++i];
    } else if (arg === '--catalog-folder') {
      const next = argv[++i];
      if (next) catalogFolders.push(next);
    } else if (arg === '--no-builtin') {
      noBuiltin = true;
    } else if (arg === '--project') {
      project = argv[++i];
    } else if (arg === '--path') {
      path = argv[++i];
    } else if (arg === '--preset') {
      preset = argv[++i];
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--init-git') {
      initGit = true;
    } else if (!arg.startsWith('--') && !command) {
      command = arg;
    }
  }

  return { command, framework, catalogFolders, noBuiltin, project, path, preset, json, initGit };
};

const printHelp = (): void => {
  const lines = [
    'Usage: claude-fw <command> [options]',
    '',
    'Commands:',
    '  init        Create .claude-fw.yaml in the project pointing at a preset',
    '  install     Materialize the configured preset into .claude/ of the project',
    '  list        List presets, agents, skills and commands in the catalog',
    '  status      Show drift between the catalog and the last install',
    '  detect      Report whether a path is a framework root and/or a project root',
    '  detect-stack  Rank catalog presets by how well their detects: rules match a project',
    '  help        Show this help',
    '',
    'Catalog sources (precedence: env > --catalog-folder > --framework > builtin):',
    '  --catalog-folder <path>  Add a folder catalog source. Repeatable. Earlier wins on collision.',
    '  --no-builtin             Exclude the embedded built-in catalog from the aggregation.',
    '  --framework <path>       [deprecated — use --catalog-folder] Single folder source.',
    '                           Falls back to $CLAUDE_FW_ROOT when no flag is given. The',
    '                           flag will be removed in the next major; see ADR-0003.',
    '  $CFW_CATALOG_PATH        Env var override; takes highest precedence when set.',
    '',
    'Other options:',
    '  --project <path>     Project root (default: cwd) — used by init, install, status',
    '  --preset <name>      Preset to use — required by init',
    '  --path <path>        Path to inspect — only used by detect',
    '  --json               Emit machine-readable JSON output instead of human text',
    "  --init-git           For 'init': run 'git init' in the project root automatically if it is",
    '                       not a git repository yet, then retry. Without this flag, init fails',
    '                       with NOT_A_GIT_REPO and exits non-zero so scripts can decide.',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
};

const resolveFrameworkFlag = (override: string | undefined): string | undefined => {
  if (override) return override;
  const legacy = process.env['CLAUDE_FW_ROOT'];
  if (legacy && legacy.length > 0) return legacy;
  return undefined;
};

const main = async (): Promise<void> => {
  const parsed = parseArgs(process.argv.slice(2));
  const { command, project, path, preset, json, initGit } = parsed;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'detect') {
    const report: DetectCommandReport = await runDetect({ path: path ?? process.cwd() });
    const output = json ? formatDetectReportJson(report) : formatDetectReport(report);
    process.stdout.write(`${output}\n`);
    return;
  }

  // Every other command needs a catalog. Compose it once and inject — the
  // commands themselves no longer know how the sources were resolved.
  const buildCatalog = () =>
    buildCatalogPort({
      frameworkFlag: resolveFrameworkFlag(parsed.framework),
      catalogFolders: parsed.catalogFolders,
      env: process.env,
      allowBuiltin: !parsed.noBuiltin,
    });

  if (command === 'init') {
    if (!preset) {
      process.stderr.write(
        "Error: 'init' requires --preset <name>. Run 'claude-fw list' to see the available presets.\n",
      );
      process.exit(1);
    }
    const report = await runInit({
      catalog: buildCatalog(),
      projectRoot: project ?? process.cwd(),
      presetName: preset,
      initGit,
    });
    const output = json ? formatInitReportJson(report) : formatInitReport(report);
    process.stdout.write(`${output}\n`);
    return;
  }

  if (command === 'install') {
    const report = await runInstall({
      catalog: buildCatalog(),
      projectRoot: project ?? process.cwd(),
    });
    const output = json ? formatInstallReportJson(report) : formatInstallReport(report);
    process.stdout.write(`${output}\n`);
    return;
  }

  if (command === 'list') {
    const report = await runList({ catalog: buildCatalog() });
    const output = json ? formatListReportJson(report) : formatListReport(report);
    process.stdout.write(`${output}\n`);
    return;
  }

  if (command === 'status') {
    const report = await runStatus({
      catalog: buildCatalog(),
      projectRoot: project ?? process.cwd(),
    });
    const output = json ? formatStatusReportJson(report) : formatStatusReport(report);
    process.stdout.write(`${output}\n`);
    return;
  }

  if (command === 'detect-stack') {
    const report = await runDetectStack({
      catalog: buildCatalog(),
      projectRoot: project ?? process.cwd(),
    });
    const output = json ? formatDetectStackReportJson(report) : formatDetectStackReport(report);
    process.stdout.write(`${output}\n`);
    return;
  }

  process.stderr.write(`Unknown command: "${command}"\n\n`);
  printHelp();
  process.exit(1);
};

main().catch((err) => {
  const json = process.argv.includes('--json');
  const e = err as Error & { code?: string; hookName?: string; projectRoot?: string };
  if (json) {
    const payload: {
      error: {
        code: string;
        message: string;
        hookName?: string;
        projectRoot?: string;
      };
    } = {
      error: { code: e.code ?? 'UNKNOWN', message: e.message },
    };
    // UnmanagedGitHookError carries the offending hookName so the UI can
    // name it; surface it explicitly in the JSON envelope.
    if (e.code === 'UNMANAGED_GIT_HOOK' && typeof e.hookName === 'string') {
      payload.error.hookName = e.hookName;
    }
    // NotAGitRepoError carries the projectRoot so the desktop modal
    // names the folder. Without it the UI would have to guess.
    if (e.code === 'NOT_A_GIT_REPO' && typeof e.projectRoot === 'string') {
      payload.error.projectRoot = e.projectRoot;
    }
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stderr.write(`Error: ${e.message}\n`);
  }
  process.exit(1);
});
