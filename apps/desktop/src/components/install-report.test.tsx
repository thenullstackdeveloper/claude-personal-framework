import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CliError, InstallReport as InstallReportData } from '../lib/api';
import { InstallReport } from './install-report';

const sampleData: InstallReportData = {
  presetName: 'react-native',
  agents: ['docs-manager', 'pr-creator'],
  skills: ['hexagonal-rn'],
  commands: [],
  settings: false,
  instructions: false,
  gitHooks: [],
  gitConfigActivated: false,
  gitConfigCurrent: null,
  gitConfigSkippedReason: null,
};

const emptyData: InstallReportData = {
  presetName: 'empty',
  agents: [],
  skills: [],
  commands: [],
  settings: false,
  instructions: false,
  gitHooks: [],
  gitConfigActivated: false,
  gitConfigCurrent: null,
  gitConfigSkippedReason: null,
};

describe('<InstallReport />', () => {
  describe('success', () => {
    it('renders the preset name and artifact counts', () => {
      render(<InstallReport status="success" data={sampleData} onDismiss={() => {}} />);
      expect(screen.getByText(/Installed preset "react-native"/)).toBeInTheDocument();
      expect(screen.getByText(/3 artifacts written to .claude\//)).toBeInTheDocument();
      expect(screen.getByText(/docs-manager, pr-creator/)).toBeInTheDocument();
      expect(screen.getByText(/hexagonal-rn/)).toBeInTheDocument();
    });

    it('says "No artifacts to install" when everything is empty', () => {
      render(<InstallReport status="success" data={emptyData} onDismiss={() => {}} />);
      expect(screen.getByText(/No artifacts to install\./)).toBeInTheDocument();
    });

    it('reports settings and instructions when they were written', () => {
      const data: InstallReportData = {
        ...emptyData,
        presetName: 'nestjs',
        settings: true,
        instructions: true,
      };
      render(<InstallReport status="success" data={data} onDismiss={() => {}} />);
      expect(screen.queryByText(/No artifacts to install\./)).not.toBeInTheDocument();
      expect(screen.getByText(/Settings:/)).toBeInTheDocument();
      expect(screen.getByText('.claude/settings.json')).toBeInTheDocument();
      expect(screen.getByText(/Instructions:/)).toBeInTheDocument();
      expect(screen.getByText('.claude/CLAUDE.md')).toBeInTheDocument();
    });

    it('reports git hooks and core.hooksPath when activated', () => {
      const data: InstallReportData = {
        ...emptyData,
        presetName: 'base',
        gitHooks: ['commit-msg', 'pre-commit'],
        gitConfigActivated: true,
        gitConfigCurrent: '.githooks',
      };
      render(<InstallReport status="success" data={data} onDismiss={() => {}} />);
      expect(screen.getByText(/Git hooks:/)).toBeInTheDocument();
      expect(screen.getByText(/commit-msg, pre-commit/)).toBeInTheDocument();
      expect(screen.getByText('core.hooksPath = .githooks')).toBeInTheDocument();
      expect(screen.getByText(/\(set by install\)/)).toBeInTheDocument();
    });

    it('header counts .claude/ and .githooks/ separately when both are present', () => {
      const data: InstallReportData = {
        ...emptyData,
        presetName: 'base',
        agents: ['hexagonal-architect', 'pr-creator', 'plane-pm'],
        skills: ['commit-style', 'typescript-hexagonal-rules', 'hexagonal-testing-strategy'],
        gitHooks: ['commit-msg', 'pre-commit', 'pre-push'],
      };
      render(<InstallReport status="success" data={data} onDismiss={() => {}} />);
      expect(
        screen.getByText('6 artifacts written to .claude/, 3 git hooks to .githooks/'),
      ).toBeInTheDocument();
    });

    it('header says only git hooks when no .claude/ artifacts were written', () => {
      const data: InstallReportData = {
        ...emptyData,
        presetName: 'hooks-only',
        gitHooks: ['commit-msg', 'pre-commit', 'pre-push'],
      };
      render(<InstallReport status="success" data={data} onDismiss={() => {}} />);
      expect(screen.getByText('3 git hooks written to .githooks/')).toBeInTheDocument();
    });

    it('header pluralizes correctly for singular counts', () => {
      const data: InstallReportData = {
        ...emptyData,
        presetName: 'singular',
        agents: ['hexagonal-architect'],
        gitHooks: ['commit-msg'],
      };
      render(<InstallReport status="success" data={data} onDismiss={() => {}} />);
      expect(
        screen.getByText('1 artifact written to .claude/, 1 git hook to .githooks/'),
      ).toBeInTheDocument();
    });

    it('reports the existing core.hooksPath when it was respected (not overwritten)', () => {
      const data: InstallReportData = {
        ...emptyData,
        presetName: 'base',
        gitHooks: ['commit-msg'],
        gitConfigActivated: false,
        gitConfigCurrent: '.my-hooks',
      };
      render(<InstallReport status="success" data={data} onDismiss={() => {}} />);
      expect(screen.getByText('core.hooksPath = .my-hooks')).toBeInTheDocument();
      expect(screen.getByText(/\(left as is — already set\)/)).toBeInTheDocument();
    });

    it('reports the skipped-not-a-git-repo case with a guidance line', () => {
      const data: InstallReportData = {
        ...emptyData,
        presetName: 'base',
        gitHooks: ['commit-msg'],
        gitConfigActivated: false,
        gitConfigCurrent: null,
        gitConfigSkippedReason: 'not-a-git-repo',
      };
      render(<InstallReport status="success" data={data} onDismiss={() => {}} />);
      expect(screen.getByText(/project is not a git repository/)).toBeInTheDocument();
      expect(screen.getByText('git init')).toBeInTheDocument();
      // Sanity: the other two git-config lines should not also render.
      expect(screen.queryByText(/set by install/)).not.toBeInTheDocument();
      expect(screen.queryByText(/left as is — already set/)).not.toBeInTheDocument();
    });

    it('renders a gitignore line when the managed block was updated', () => {
      const data: InstallReportData = {
        ...sampleData,
        gitignore: { status: 'updated', path: '/proj/.gitignore' },
      };
      render(<InstallReport status="success" data={data} onDismiss={() => {}} />);
      expect(screen.getByText(/managed block updated/)).toBeInTheDocument();
    });

    it('flags a block-conflict in amber with a fix-manually hint', () => {
      const data: InstallReportData = {
        ...sampleData,
        gitignore: { status: 'block-conflict', path: '/proj/.gitignore' },
      };
      render(<InstallReport status="success" data={data} onDismiss={() => {}} />);
      expect(screen.getByText(/multiple managed blocks/)).toBeInTheDocument();
      expect(screen.getByText(/fix\s+manually/)).toBeInTheDocument();
    });

    it('does not render a gitignore line when the status is unchanged or null', () => {
      const data: InstallReportData = { ...sampleData, gitignore: null };
      render(<InstallReport status="success" data={data} onDismiss={() => {}} />);
      expect(screen.queryByText(/Gitignore:/)).not.toBeInTheDocument();
    });

    it('invokes onDismiss when the Dismiss button is clicked', async () => {
      const onDismiss = vi.fn();
      const user = userEvent.setup();
      render(<InstallReport status="success" data={sampleData} onDismiss={onDismiss} />);
      await user.click(screen.getByRole('button', { name: /dismiss/i }));
      expect(onDismiss).toHaveBeenCalledOnce();
    });
  });

  describe('error', () => {
    it('renders the error message when status is error', () => {
      const error: CliError = { code: 'CLI_FAILURE', message: 'something blew up' };
      render(<InstallReport status="error" error={error} onDismiss={() => {}} />);
      expect(screen.getByText(/Install failed/)).toBeInTheDocument();
      expect(screen.getByText(/something blew up/)).toBeInTheDocument();
    });

    it('falls back to "Unknown error" if error prop is missing', () => {
      render(<InstallReport status="error" onDismiss={() => {}} />);
      expect(screen.getByText(/Unknown error/)).toBeInTheDocument();
    });
  });

  describe('take-over (UNMANAGED_CLAUDE_MD)', () => {
    const takeoverError: CliError = {
      code: 'UNMANAGED_CLAUDE_MD',
      message: '.claude/CLAUDE.md exists but is not managed by this framework.',
    };

    it('renders the take-over banner instead of the generic error', () => {
      render(<InstallReport status="error" error={takeoverError} onDismiss={() => {}} />);
      expect(screen.getByText(/Project has an unmanaged CLAUDE\.md/)).toBeInTheDocument();
      expect(screen.queryByText(/Install failed/)).not.toBeInTheDocument();
      expect(screen.getByText(/Move or delete it manually, then retry/)).toBeInTheDocument();
    });

    it('shows the Retry button only when onRetry is provided', () => {
      const { rerender } = render(
        <InstallReport status="error" error={takeoverError} onDismiss={() => {}} />,
      );
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();

      rerender(
        <InstallReport
          status="error"
          error={takeoverError}
          onDismiss={() => {}}
          onRetry={() => {}}
        />,
      );
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('invokes onRetry when Retry is clicked', async () => {
      const onRetry = vi.fn();
      const user = userEvent.setup();
      render(
        <InstallReport
          status="error"
          error={takeoverError}
          onDismiss={() => {}}
          onRetry={onRetry}
        />,
      );
      await user.click(screen.getByRole('button', { name: /retry/i }));
      expect(onRetry).toHaveBeenCalledOnce();
    });
  });

  describe('take-over (UNMANAGED_GIT_HOOK)', () => {
    const takeoverError: CliError = {
      code: 'UNMANAGED_GIT_HOOK',
      message: '.githooks/commit-msg exists but is not managed by this framework.',
      hookName: 'commit-msg',
    };

    it('renders the take-over banner naming the offending hook', () => {
      render(<InstallReport status="error" error={takeoverError} onDismiss={() => {}} />);
      expect(screen.getByText(/Project has an unmanaged git hook/)).toBeInTheDocument();
      expect(screen.getByText('.githooks/commit-msg')).toBeInTheDocument();
      expect(screen.queryByText(/Install failed/)).not.toBeInTheDocument();
    });

    it('falls back to <unknown> when hookName is missing from the error', () => {
      const noHookName: CliError = {
        code: 'UNMANAGED_GIT_HOOK',
        message: '...',
      };
      render(<InstallReport status="error" error={noHookName} onDismiss={() => {}} />);
      expect(screen.getByText('.githooks/<unknown>')).toBeInTheDocument();
    });
  });
});
