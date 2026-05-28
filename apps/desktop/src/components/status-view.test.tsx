import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StatusReport } from '../lib/api';
import { StatusView } from './status-view';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

const baseReport = (overrides: Partial<StatusReport> = {}): StatusReport => ({
  presetName: 'react-native',
  hasLockfile: true,
  added: [],
  updated: [],
  removed: [],
  unchanged: [],
  settings: { kind: 'unchanged' },
  instructions: { kind: 'unchanged' },
  ...overrides,
});

describe('<StatusView />', () => {
  it('reports "matches the catalog" when nothing drifted', () => {
    render(<StatusView report={baseReport()} onDismiss={() => {}} />);
    expect(screen.getByText(/Installed state matches the catalog\./)).toBeInTheDocument();
  });

  it('counts artifact drift in the header', () => {
    render(
      <StatusView
        report={baseReport({
          added: [{ type: 'agent', id: 'docs-manager' }],
          updated: [{ type: 'skill', id: 'rn-hex', oldSha: SHA_A, newSha: SHA_B }],
        })}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/2 pending changes\./)).toBeInTheDocument();
  });

  it('counts singleton drift (settings + instructions) in the header', () => {
    render(
      <StatusView
        report={baseReport({
          settings: { kind: 'added' },
          instructions: { kind: 'updated', oldSha: SHA_A, newSha: SHA_B },
        })}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/2 pending changes\./)).toBeInTheDocument();
  });

  it('renders Settings and Instructions rows with their drift kind', () => {
    render(
      <StatusView
        report={baseReport({
          settings: { kind: 'added' },
          instructions: { kind: 'updated', oldSha: SHA_A, newSha: SHA_B },
        })}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Instructions')).toBeInTheDocument();
    expect(screen.getByText('.claude/settings.json')).toBeInTheDocument();
    expect(screen.getByText('.claude/CLAUDE.md')).toBeInTheDocument();
    expect(screen.getByText('added')).toBeInTheDocument();
    expect(screen.getByText('updated')).toBeInTheDocument();
    expect(screen.getByText(/aaaaaaaaaaaa… → bbbbbbbbbbbb…/)).toBeInTheDocument();
  });

  it('shows the old sha when a singleton was removed', () => {
    render(
      <StatusView
        report={baseReport({ instructions: { kind: 'removed', oldSha: SHA_A } })}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/was aaaaaaaaaaaa…/)).toBeInTheDocument();
  });

  it('truncates artifact update shas to 12 chars + ellipsis', () => {
    render(
      <StatusView
        report={baseReport({
          updated: [{ type: 'agent', id: 'docs-manager', oldSha: SHA_A, newSha: SHA_B }],
        })}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/aaaaaaaaaaaa… → bbbbbbbbbbbb…/)).toBeInTheDocument();
  });
});
