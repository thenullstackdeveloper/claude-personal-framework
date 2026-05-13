#!/usr/bin/env node

import { formatInstallReport, formatInstallReportJson, runInstall } from './install.command.js';
import { formatListReport, formatListReportJson, runList } from './list.command.js';

type ParsedArgs = {
  readonly command: string;
  readonly framework: string | undefined;
  readonly project: string | undefined;
  readonly json: boolean;
};

const parseArgs = (argv: readonly string[]): ParsedArgs => {
  let command = '';
  let framework: string | undefined;
  let project: string | undefined;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === '--framework') {
      framework = argv[++i];
    } else if (arg === '--project') {
      project = argv[++i];
    } else if (arg === '--json') {
      json = true;
    } else if (!arg.startsWith('--') && !command) {
      command = arg;
    }
  }

  return { command, framework, project, json };
};

const printHelp = (): void => {
  const lines = [
    'Usage: claude-fw <command> [options]',
    '',
    'Commands:',
    '  install     Materialize the configured preset into .claude/ of the project',
    '  list        List presets, agents, skills and commands in the catalog',
    '  help        Show this help',
    '',
    'Options:',
    '  --framework <path>   Framework catalog root (default: $CLAUDE_FW_ROOT or cwd)',
    '  --project <path>     Project root holding .claude-fw.yaml (default: cwd)',
    '                       — only used by install',
    '  --json               Emit machine-readable JSON output instead of human text',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
};

const resolveFrameworkRoot = (override: string | undefined): string => {
  return override ?? process.env['CLAUDE_FW_ROOT'] ?? process.cwd();
};

const main = async (): Promise<void> => {
  const { command, framework, project, json } = parseArgs(process.argv.slice(2));

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'install') {
    const report = await runInstall({
      frameworkRoot: resolveFrameworkRoot(framework),
      projectRoot: project ?? process.cwd(),
    });
    const output = json ? formatInstallReportJson(report) : formatInstallReport(report);
    process.stdout.write(`${output}\n`);
    return;
  }

  if (command === 'list') {
    const report = await runList({ frameworkRoot: resolveFrameworkRoot(framework) });
    const output = json ? formatListReportJson(report) : formatListReport(report);
    process.stdout.write(`${output}\n`);
    return;
  }

  process.stderr.write(`Unknown command: "${command}"\n\n`);
  printHelp();
  process.exit(1);
};

main().catch((err) => {
  process.stderr.write(`Error: ${(err as Error).message}\n`);
  process.exit(1);
});
