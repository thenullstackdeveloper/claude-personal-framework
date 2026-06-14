import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogReport } from '../lib/api';
import { WelcomeWizard } from './welcome-wizard';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  confirm: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const mockedOpen = vi.mocked(openDialog);

const catalogReport: CatalogReport = {
  presets: [
    {
      name: 'base',
      extends: [],
      agents: [],
      skills: [],
      commands: [],
      instructions: [],
      gitHooks: [],
    },
    {
      name: 'nestjs',
      extends: ['base'],
      agents: [],
      skills: [],
      commands: [],
      instructions: [],
      gitHooks: [],
    },
    {
      name: 'tauri-rust-react',
      extends: ['base'],
      agents: [],
      skills: [],
      commands: [],
      instructions: [],
      gitHooks: [],
    },
  ],
  agents: [],
  skills: [],
  commands: [],
  instructions: [],
  gitHooks: [],
};

const baseProps = () => ({
  catalog: catalogReport,
  catalogError: null,
  catalogFolders: [] as readonly string[],
  allowBuiltin: true,
  onComplete: vi.fn(),
  onSkip: vi.fn(),
  onOpenSettings: vi.fn(),
});

beforeEach(() => {
  mockedInvoke.mockReset();
  mockedOpen.mockReset();
});

describe('WelcomeWizard', () => {
  it('renders step 1 with the title and step indicator', () => {
    render(<WelcomeWizard {...baseProps()} />);
    expect(screen.getByText(/welcome to claude framework/i)).toBeInTheDocument();
    expect(screen.getByText(/choose project/i)).toBeInTheDocument();
    expect(screen.getByText(/^set up$/i)).toBeInTheDocument();
  });

  it('Skip button calls onSkip', () => {
    const onSkip = vi.fn();
    render(<WelcomeWizard {...baseProps()} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('Next is disabled until a project path AND a preset are picked', async () => {
    // detect-stack returns no matches, leaving the dropdown without preselection.
    mockedInvoke.mockResolvedValue({ projectRoot: '/proj', matches: [] });

    render(<WelcomeWizard {...baseProps()} />);
    const next = screen.getByRole('button', { name: /next/i });
    expect(next).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('/path/to/project'), {
      target: { value: '/proj' },
    });
    await waitFor(() => expect(next).toBeDisabled()); // still no preset

    // Pick a preset manually.
    await waitFor(() => screen.getByLabelText(/preset/i));
    fireEvent.change(screen.getByLabelText(/preset/i), { target: { value: 'base' } });
    expect(next).not.toBeDisabled();
  });

  it('auto-preselects the most specific detected preset', async () => {
    mockedInvoke.mockResolvedValue({
      projectRoot: '/proj',
      matches: [{ preset: 'tauri-rust-react', specificity: 2 }],
    });

    render(<WelcomeWizard {...baseProps()} />);
    fireEvent.change(screen.getByPlaceholderText('/path/to/project'), {
      target: { value: '/proj' },
    });
    await waitFor(() => expect(screen.getByLabelText(/preset/i)).toHaveValue('tauri-rust-react'));
    expect(screen.getByText(/preselected automatically/i, { selector: 'p' })).toBeInTheDocument();
  });

  it('does not preselect when the top two matches share specificity (tie)', async () => {
    mockedInvoke.mockResolvedValue({
      projectRoot: '/proj',
      matches: [
        { preset: 'nestjs', specificity: 1 },
        { preset: 'tauri-rust-react', specificity: 1 },
      ],
    });

    render(<WelcomeWizard {...baseProps()} />);
    fireEvent.change(screen.getByPlaceholderText('/path/to/project'), {
      target: { value: '/proj' },
    });
    await waitFor(() => expect(screen.getByLabelText(/preset/i)).toHaveValue(''));
    expect(screen.getByText(/several presets matched equally/i)).toBeInTheDocument();
  });

  it('Next advances to step 2 and renders the summary', async () => {
    mockedInvoke.mockResolvedValue({
      projectRoot: '/proj',
      matches: [{ preset: 'base', specificity: 1 }],
    });

    render(<WelcomeWizard {...baseProps()} />);
    fireEvent.change(screen.getByPlaceholderText('/path/to/project'), {
      target: { value: '/proj' },
    });
    await waitFor(() => expect(screen.getByLabelText(/preset/i)).toHaveValue('base'));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText(/^summary$/i)).toBeInTheDocument();
    expect(screen.getByText('/proj')).toBeInTheDocument();
    expect(screen.getByText('base')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set up project/i })).toBeInTheDocument();
  });

  it('Back from step 2 preserves the picked project and preset (decision A3)', async () => {
    mockedInvoke.mockResolvedValue({
      projectRoot: '/proj',
      matches: [{ preset: 'base', specificity: 1 }],
    });

    render(<WelcomeWizard {...baseProps()} />);
    fireEvent.change(screen.getByPlaceholderText('/path/to/project'), {
      target: { value: '/proj' },
    });
    await waitFor(() => expect(screen.getByLabelText(/preset/i)).toHaveValue('base'));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));

    // Back at step 1 with both values intact.
    expect(screen.getByPlaceholderText('/path/to/project')).toHaveValue('/proj');
    expect(screen.getByLabelText(/preset/i)).toHaveValue('base');
  });

  it('Browse opens the Tauri folder picker and sets the chosen path', async () => {
    mockedInvoke.mockResolvedValue({ projectRoot: '/picked', matches: [] });
    mockedOpen.mockResolvedValue('/picked');

    render(<WelcomeWizard {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /^browse$/i }));
    await waitFor(() =>
      expect(screen.getByPlaceholderText('/path/to/project')).toHaveValue('/picked'),
    );
  });
});
