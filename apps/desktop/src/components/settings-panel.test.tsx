import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPanel } from './settings-panel';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

const userFolders = (folders: readonly string[] = []) => ({
  folders,
  add: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
});

const baseProps = () => ({
  userFolders: userFolders(),
  useBuiltin: true,
  setUseBuiltin: vi.fn(),
  envOverridePath: null,
  onRestartWizard: vi.fn(),
  onClose: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SettingsPanel', () => {
  it('renders the two sections with their headers', () => {
    render(<SettingsPanel {...baseProps()} />);
    expect(screen.getByRole('heading', { name: /catalog folders/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /welcome wizard/i })).toBeInTheDocument();
  });

  it('shows the built-in source with an enabled toggle by default', () => {
    render(<SettingsPanel {...baseProps()} />);
    const toggle = screen.getByRole('switch', { name: /use built-in catalog/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('calls setUseBuiltin when the built-in toggle is clicked', () => {
    const setUseBuiltin = vi.fn();
    render(<SettingsPanel {...baseProps()} setUseBuiltin={setUseBuiltin} />);
    fireEvent.click(screen.getByRole('switch', { name: /use built-in catalog/i }));
    expect(setUseBuiltin).toHaveBeenCalledWith(false);
  });

  it('lists user folders with a remove button each', () => {
    const userFoldersWithEntries = userFolders(['/home/angel/my-skills', '/etc/cfw']);
    render(<SettingsPanel {...baseProps()} userFolders={userFoldersWithEntries} />);
    expect(screen.getByText('my-skills')).toBeInTheDocument();
    expect(screen.getByText('cfw')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Remove /home/angel/my-skills'));
    expect(userFoldersWithEntries.remove).toHaveBeenCalledWith('/home/angel/my-skills');
  });

  it('renders the env override info row when envOverridePath is set', () => {
    render(<SettingsPanel {...baseProps()} envOverridePath="/tmp/dev-catalog" />);
    expect(screen.getByText('CFW_CATALOG_PATH')).toBeInTheDocument();
    expect(screen.getByText('/tmp/dev-catalog')).toBeInTheDocument();
  });

  it('omits the env override row when envOverridePath is null', () => {
    render(<SettingsPanel {...baseProps()} />);
    expect(screen.queryByText('CFW_CATALOG_PATH')).not.toBeInTheDocument();
  });

  it('calls onRestartWizard when the Restart welcome wizard button is clicked', () => {
    const onRestartWizard = vi.fn();
    render(<SettingsPanel {...baseProps()} onRestartWizard={onRestartWizard} />);
    fireEvent.click(screen.getByRole('button', { name: /restart welcome wizard/i }));
    expect(onRestartWizard).toHaveBeenCalledOnce();
  });

  it('calls onClose when the close (X) button is clicked', () => {
    const onClose = vi.fn();
    render(<SettingsPanel {...baseProps()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close settings/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(<SettingsPanel {...baseProps()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
