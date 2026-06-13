use serde::{Deserialize, Serialize};
use std::process::Command;

/// Structured error surfaced to the frontend instead of a plain string.
/// `code` mirrors error codes the CLI emits on stdout when `--json` is set
/// (e.g. `UNMANAGED_CLAUDE_MD`). `CLI_FAILURE` is the fallback when the CLI
/// died without producing the JSON error envelope (process crash, non-JSON
/// stderr, etc).
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CliError {
    pub code: String,
    pub message: String,
    /// Populated only when `code == "UNMANAGED_GIT_HOOK"`. Other errors leave
    /// this absent both in the JSON envelope and in the Rust struct — the
    /// frontend uses it to name the offending hook in the take-over banner.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hook_name: Option<String>,
    /// Populated only when `code == "NOT_A_GIT_REPO"`. The frontend modal
    /// uses it to name the folder in the prompt copy without parsing the
    /// message string.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_root: Option<String>,
}

#[derive(Deserialize)]
struct CliErrorEnvelope {
    error: CliError,
}

impl CliError {
    fn failure(message: impl Into<String>) -> Self {
        CliError {
            code: "CLI_FAILURE".to_string(),
            message: message.into(),
            hook_name: None,
            project_root: None,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListPreset {
    name: String,
    extends: Vec<String>,
    agents: Vec<String>,
    skills: Vec<String>,
    commands: Vec<String>,
    instructions: Vec<String>,
    git_hooks: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct ListArtifact {
    id: String,
    description: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitHookSummary {
    hook_name: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogReport {
    presets: Vec<ListPreset>,
    agents: Vec<ListArtifact>,
    skills: Vec<ListArtifact>,
    commands: Vec<ListArtifact>,
    instructions: Vec<ListArtifact>,
    git_hooks: Vec<GitHookSummary>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallReport {
    preset_name: String,
    agents: Vec<String>,
    skills: Vec<String>,
    commands: Vec<String>,
    settings: bool,
    instructions: bool,
    git_hooks: Vec<String>,
    git_config_activated: bool,
    git_config_current: Option<String>,
    git_config_skipped_reason: Option<String>,
}

fn cli_path() -> String {
    std::env::var("CLAUDE_FW_CLI_PATH").unwrap_or_else(|_| {
        // Dev fallback: the CLI is built at packages/cli/dist/index.js relative
        // to the repo root. CARGO_MANIFEST_DIR is apps/desktop/src-tauri.
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../packages/cli/dist/index.js"
        )
        .to_string()
    })
}

fn run_cli(args: &[&str]) -> Result<String, CliError> {
    let cli = cli_path();
    let output = Command::new("node")
        .arg(&cli)
        .args(args)
        .output()
        .map_err(|e| CliError::failure(format!("Failed to spawn node {}: {}", cli, e)))?;

    if !output.status.success() {
        // The CLI emits `{ "error": { "code, "message" } }` on stdout when
        // --json is set and the command rejects. Prefer that structured shape;
        // fall back to stderr (or a generic message) otherwise.
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Ok(envelope) = serde_json::from_str::<CliErrorEnvelope>(stdout.trim()) {
            return Err(envelope.error);
        }
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.trim();
        let message = if detail.is_empty() {
            format!("CLI exited with status {}", output.status)
        } else {
            detail.to_string()
        };
        return Err(CliError::failure(message));
    }

    String::from_utf8(output.stdout)
        .map_err(|e| CliError::failure(format!("CLI stdout is not valid UTF-8: {}", e)))
}

fn parse_cli_json<T: for<'de> Deserialize<'de>>(label: &str, raw: &str) -> Result<T, CliError> {
    serde_json::from_str(raw)
        .map_err(|e| CliError::failure(format!("Failed to parse {} JSON: {}", label, e)))
}

#[tauri::command]
fn list_catalog(framework_root: String) -> Result<CatalogReport, CliError> {
    let output = run_cli(&["list", "--framework", &framework_root, "--json"])?;
    parse_cli_json("list", &output)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PathDetection {
    is_framework: bool,
    is_project: bool,
}

// The rule for what makes a path a framework root or a project root lives in
// the engine (detect-path use case). Rust must not re-derive it — it asks the
// CLI, same as every other command.
#[tauri::command]
fn detect_path(path: String) -> Result<PathDetection, CliError> {
    let output = run_cli(&["detect", "--path", &path, "--json"])?;
    parse_cli_json("detect", &output)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetectStackMatch {
    preset: String,
    specificity: u32,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetectStackReport {
    project_root: String,
    matches: Vec<DetectStackMatch>,
}

/// Ranks catalog presets by how well their `detects:` rules match the
/// project at `project_root`. The wizard preselects `matches[0]` unless
/// `matches[0]` and `matches[1]` share specificity (a tie) — see
/// `formatDetectStackReport` and ADR-0004.
#[tauri::command]
fn detect_stack(
    framework_root: Option<String>,
    project_root: String,
) -> Result<DetectStackReport, CliError> {
    let framework = framework_root.unwrap_or_default();
    let args: Vec<&str> = if framework.is_empty() {
        vec!["detect-stack", "--project", &project_root, "--json"]
    } else {
        vec![
            "detect-stack",
            "--framework",
            &framework,
            "--project",
            &project_root,
            "--json",
        ]
    };
    let output = run_cli(&args)?;
    parse_cli_json("detect-stack", &output)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InitReport {
    project_root: String,
    preset_name: String,
    manifest_path: String,
}

#[tauri::command]
fn initialize(
    framework_root: String,
    project_root: String,
    preset_name: String,
) -> Result<InitReport, CliError> {
    let output = run_cli(&[
        "init",
        "--framework",
        &framework_root,
        "--project",
        &project_root,
        "--preset",
        &preset_name,
        "--json",
    ])?;
    parse_cli_json("init", &output)
}

#[tauri::command]
fn install(framework_root: String, project_root: String) -> Result<InstallReport, CliError> {
    let output = run_cli(&[
        "install",
        "--framework",
        &framework_root,
        "--project",
        &project_root,
        "--json",
    ])?;
    parse_cli_json("install", &output)
}

#[derive(Serialize, Deserialize)]
struct StatusArtifact {
    #[serde(rename = "type")]
    kind: String,
    id: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusUpdate {
    #[serde(rename = "type")]
    kind: String,
    id: String,
    old_sha: String,
    new_sha: String,
}

// Singleton drift outcome (Settings, Instructions). Matches the CLI shape:
// `{ "kind": "unchanged" | "added" | "removed" | "updated", oldSha?, newSha? }`.
// Field-level `rename` is preferred over an outer `rename_all = "camelCase"`
// because the tag-style enum already carries `rename_all = "lowercase"` for
// the kind discriminator — being explicit on the fields removes ambiguity.
#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum StatusSingleton {
    Unchanged,
    Added,
    Removed {
        #[serde(rename = "oldSha")]
        old_sha: String,
    },
    Updated {
        #[serde(rename = "oldSha")]
        old_sha: String,
        #[serde(rename = "newSha")]
        new_sha: String,
    },
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusReport {
    preset_name: String,
    has_lockfile: bool,
    added: Vec<StatusArtifact>,
    updated: Vec<StatusUpdate>,
    removed: Vec<StatusArtifact>,
    unchanged: Vec<StatusArtifact>,
    settings: StatusSingleton,
    instructions: StatusSingleton,
}

/// Runs `git init -q` in the given path so a subsequent `initialize`
/// call no longer trips `NotAGitRepoError`. Idempotent at the git level
/// (re-running on an already-initialised repo is a no-op for the user).
/// Spawned directly here instead of going through the CLI because (a)
/// the operation is trivial, (b) there's no engine logic to share, and
/// (c) we save a node process per click.
#[tauri::command]
fn ensure_git_repo(path: String) -> Result<(), CliError> {
    let output = Command::new("git")
        .args(["init", "-q"])
        .current_dir(&path)
        .output()
        .map_err(|e| CliError::failure(format!("Failed to spawn git init at {}: {}", path, e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.trim();
        let message = if detail.is_empty() {
            format!("git init at {} exited with status {}", path, output.status)
        } else {
            format!("git init at {} failed: {}", path, detail)
        };
        return Err(CliError::failure(message));
    }
    Ok(())
}

#[tauri::command]
fn status(framework_root: String, project_root: String) -> Result<StatusReport, CliError> {
    let output = run_cli(&[
        "status",
        "--framework",
        &framework_root,
        "--project",
        &project_root,
        "--json",
    ])?;
    parse_cli_json("status", &output)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_catalog,
            install,
            detect_path,
            detect_stack,
            initialize,
            status,
            ensure_git_repo
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
