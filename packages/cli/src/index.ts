#!/usr/bin/env node

import { formatInstallReport, runInstall } from './install.command.js';

type ParsedArgs = {
  readonly command: string;
  readonly framework: string | undefined;
  readonly project: string | undefined;
};

const parseArgs = (argv: readonly string[]): ParsedArgs => {
  let command = '';
  let framework: string | undefined;
  let project: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === '--framework') {
      framework = argv[++i];
    } else if (arg === '--project') {
      project = argv[++i];
    } else if (!arg.startsWith('--') && !command) {
      command = arg;
    }
  }

  return { command, framework, project };
};

const printHelp = (): void => {
  const lines = [
    'Usage: claude-fw <command> [options]',
    '',
    'Commands:',
    '  install     Materialize the configured preset into .claude/ of the project',
    '  help        Show this help',
    '',
    'Options for install:',
    '  --framework <path>   Framework catalog root (default: $CLAUDE_FW_ROOT or cwd)',
    '  --project <path>     Project root holding .claude-fw.yaml (default: cwd)',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
};

const main = async (): Promise<void> => {
  const { command, framework, project } = parseArgs(process.argv.slice(2));

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'install') {
    const frameworkRoot = framework ?? process.env['CLAUDE_FW_ROOT'] ?? process.cwd();
    const projectRoot = project ?? process.cwd();
    const report = await runInstall({ frameworkRoot, projectRoot });
    process.stdout.write(`${formatInstallReport(report)}\n`);
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
