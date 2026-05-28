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
      const empty: InstallReportData = {
        presetName: 'empty',
        agents: [],
        skills: [],
        commands: [],
        settings: false,
        instructions: false,
      };
      render(<InstallReport status="success" data={empty} onDismiss={() => {}} />);
      expect(screen.getByText(/No artifacts to install\./)).toBeInTheDocument();
    });

    it('reports settings and instructions when they were written', () => {
      const data: InstallReportData = {
        presetName: 'nestjs',
        agents: [],
        skills: [],
        commands: [],
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
});
