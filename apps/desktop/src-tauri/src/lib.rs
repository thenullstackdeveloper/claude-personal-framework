use include_dir::{Dir, include_dir};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

/// The catalog dump produced by `build.rs` (presets/agents/skills/commands/
/// instructions/git-hooks). Embedded at compile time so the desktop app
/// ships with a working catalog out of the box (CLAUDEPERS-25).
static BUILTIN_CATALOG: Dir<'_> = include_dir!("$OUT_DIR/builtin-catalog");

/// Stable hash of the embedded catalog contents, computed by `build.rs`.
/// Used as the cache directory suffix so a new app build (with a new hash)
/// transparently invalidates the previous extraction.
const BUILTIN_CATALOG_HASH: &str = env!("BUILTIN_CATALOG_HASH");

static BUILTIN_CATALOG_PATH: OnceLock<PathBuf> = OnceLock::new();

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

/// Extracts the embedded catalog to `$XDG_CACHE_HOME/cfw/builtin-<hash>/`
/// the first time it is needed and returns the path. On subsequent calls
/// (within the same process) the cached `OnceLock` value is returned without
/// hitting disk.
///
/// Older `builtin-*` sibling directories are best-effort purged on every
/// fresh extraction so old app versions don't leave stale caches behind.
/// The current extraction's path is preserved (idempotency: re-running the
/// extractor against an already-populated target is a no-op for the user).
fn builtin_catalog_path() -> Result<PathBuf, CliError> {
    if let Some(p) = BUILTIN_CATALOG_PATH.get() {
        return Ok(p.clone());
    }
    let extracted = extract_builtin_catalog()?;
    let _ = BUILTIN_CATALOG_PATH.set(extracted.clone());
    Ok(extracted)
}

fn extract_builtin_catalog() -> Result<PathBuf, CliError> {
    let cache_root = dirs::cache_dir().ok_or_else(|| {
        CliError::failure("Could not determine the user cache directory".to_string())
    })?;
    let cfw_root = cache_root.join("cfw");
    let target = cfw_root.join(format!("builtin-{}", BUILTIN_CATALOG_HASH));

    // Best-effort purge of older builtin-* siblings. Failure is silent —
    // a leftover directory is annoying but not a correctness problem.
    if let Ok(entries) = std::fs::read_dir(&cfw_root) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with("builtin-") && entry.path() != target {
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }
    }

    if target.exists() {
        return Ok(target);
    }

    std::fs::create_dir_all(&target).map_err(|e| {
        CliError::failure(format!(
            "Failed to create builtin catalog cache dir at {}: {}",
            target.display(),
            e
        ))
    })?;
    BUILTIN_CATALOG.extract(&target).map_err(|e| {
        CliError::failure(format!(
            "Failed to extract embedded catalog into {}: {}",
            target.display(),
            e
        ))
    })?;
    Ok(target)
}

/// Runs the CLI with the given args, automatically wiring catalog source
/// precedence: env (handled by the CLI itself) > extra_folders (user-provided
/// from Settings) > whatever appears inside `args` (typically a legacy
/// `--framework <path>` flag) > the embedded built-in catalog.
///
/// `--catalog-folder` flags are processed in argv order by the CLI's
/// `buildCatalogPort`, so the order here matters: user folders FIRST (higher
/// precedence), built-in LAST (lowest).
///
/// When `include_builtin` is false, the embedded catalog is NOT injected at
/// all — this implements the "Use built-in catalog" toggle in Settings (B7).
/// The CLI still accepts the legacy `--no-builtin` flag for standalone use,
/// but the Rust side just skips the injection instead of relying on it.
fn run_cli(
    extra_folders: &[String],
    args: &[&str],
    include_builtin: bool,
) -> Result<String, CliError> {
    let builtin_str = if include_builtin {
        Some(builtin_catalog_path()?.to_string_lossy().into_owned())
    } else {
        None
    };
    let cli = cli_path();

    let mut full_args: Vec<&str> = Vec::with_capacity(args.len() + extra_folders.len() * 2 + 2);
    for folder in extra_folders {
        full_args.push("--catalog-folder");
        full_args.push(folder);
    }
    full_args.extend_from_slice(args);
    if let Some(ref builtin) = builtin_str {
        full_args.push("--catalog-folder");
        full_args.push(builtin);
    }

    let output = Command::new("node")
        .arg(&cli)
        .args(&full_args)
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
fn list_catalog(
    framework_root: Option<String>,
    catalog_folders: Option<Vec<String>>,
    allow_builtin: Option<bool>,
) -> Result<CatalogReport, CliError> {
    let folders = catalog_folders.unwrap_or_default();
    let framework = framework_root.unwrap_or_default();
    let mut args: Vec<&str> = vec!["list", "--json"];
    if !framework.is_empty() {
        args.push("--framework");
        args.push(&framework);
    }
    let output = run_cli(&folders, &args, allow_builtin.unwrap_or(true))?;
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
    // detect_path doesn't consume the catalog, so the built-in is irrelevant
    // — include it to keep the CLI invocation uniform with the other commands.
    let output = run_cli(&[], &["detect", "--path", &path, "--json"], true)?;
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
    catalog_folders: Option<Vec<String>>,
    allow_builtin: Option<bool>,
    project_root: String,
) -> Result<DetectStackReport, CliError> {
    let folders = catalog_folders.unwrap_or_default();
    let framework = framework_root.unwrap_or_default();
    let mut args: Vec<&str> = vec!["detect-stack", "--project", &project_root, "--json"];
    if !framework.is_empty() {
        args.push("--framework");
        args.push(&framework);
    }
    let output = run_cli(&folders, &args, allow_builtin.unwrap_or(true))?;
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
    framework_root: Option<String>,
    catalog_folders: Option<Vec<String>>,
    allow_builtin: Option<bool>,
    project_root: String,
    preset_name: String,
) -> Result<InitReport, CliError> {
    let folders = catalog_folders.unwrap_or_default();
    let framework = framework_root.unwrap_or_default();
    let mut args: Vec<&str> = vec![
        "init",
        "--project",
        &project_root,
        "--preset",
        &preset_name,
        "--json",
    ];
    if !framework.is_empty() {
        args.push("--framework");
        args.push(&framework);
    }
    let output = run_cli(&folders, &args, allow_builtin.unwrap_or(true))?;
    parse_cli_json("init", &output)
}

#[tauri::command]
fn install(
    framework_root: Option<String>,
    catalog_folders: Option<Vec<String>>,
    allow_builtin: Option<bool>,
    project_root: String,
) -> Result<InstallReport, CliError> {
    let folders = catalog_folders.unwrap_or_default();
    let framework = framework_root.unwrap_or_default();
    let mut args: Vec<&str> = vec!["install", "--project", &project_root, "--json"];
    if !framework.is_empty() {
        args.push("--framework");
        args.push(&framework);
    }
    let output = run_cli(&folders, &args, allow_builtin.unwrap_or(true))?;
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

/// Runs `mkdir -p` on the given path so a subsequent `initialize` /
/// `install` call no longer trips `ProjectDirMissingError`. Mirrors
/// `ensure_git_repo`: spawned here directly to skip a node process for
/// a one-line filesystem op.
#[tauri::command]
fn ensure_project_dir(path: String) -> Result<(), CliError> {
    std::fs::create_dir_all(&path).map_err(|e| {
        CliError::failure(format!("Failed to create project dir at {}: {}", path, e))
    })
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
fn status(
    framework_root: Option<String>,
    catalog_folders: Option<Vec<String>>,
    allow_builtin: Option<bool>,
    project_root: String,
) -> Result<StatusReport, CliError> {
    let folders = catalog_folders.unwrap_or_default();
    let framework = framework_root.unwrap_or_default();
    let mut args: Vec<&str> = vec!["status", "--project", &project_root, "--json"];
    if !framework.is_empty() {
        args.push("--framework");
        args.push(&framework);
    }
    let output = run_cli(&folders, &args, allow_builtin.unwrap_or(true))?;
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
            ensure_git_repo,
            ensure_project_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Contract tests guarding the JSON shape emitted by the CLI against the
/// Rust structs that deserialize it (ADR-0005). Each test pins one
/// command's report by way of a representative fixture. When a CLI field
/// changes shape, the matching test fails at `cargo test` time, prompting
/// a one-line struct update.
///
/// The fixtures are intentionally small and hand-written rather than
/// captured live: the point is to encode "what does this command's JSON
/// look like" so a sweep through CLI-side type changes surfaces here.
#[cfg(test)]
mod contract_tests {
    use super::*;

    #[test]
    fn install_report_deserializes() {
        let json = r#"{
            "presetName": "base",
            "agents": ["docs-manager"],
            "skills": ["commit-style"],
            "commands": [],
            "settings": false,
            "instructions": true,
            "gitHooks": ["commit-msg", "pre-commit"],
            "gitConfigActivated": true,
            "gitConfigCurrent": ".githooks",
            "gitConfigSkippedReason": null
        }"#;
        let parsed: InstallReport = serde_json::from_str(json).expect("install report");
        assert_eq!(parsed.preset_name, "base");
        assert_eq!(parsed.git_hooks.len(), 2);
        assert!(parsed.git_config_activated);
        assert_eq!(parsed.git_config_current.as_deref(), Some(".githooks"));
        assert!(parsed.git_config_skipped_reason.is_none());
    }

    #[test]
    fn status_report_deserializes() {
        let json = r#"{
            "presetName": "base",
            "hasLockfile": true,
            "added": [{"type": "agent", "id": "pr-creator"}],
            "updated": [{"type": "skill", "id": "x", "oldSha": "a", "newSha": "b"}],
            "removed": [],
            "unchanged": [],
            "settings": {"kind": "unchanged"},
            "instructions": {"kind": "updated", "oldSha": "a", "newSha": "b"}
        }"#;
        let parsed: StatusReport = serde_json::from_str(json).expect("status report");
        assert_eq!(parsed.preset_name, "base");
        assert!(parsed.has_lockfile);
        assert_eq!(parsed.added.len(), 1);
        assert_eq!(parsed.updated.len(), 1);
    }

    #[test]
    fn catalog_report_deserializes() {
        let json = r#"{
            "presets": [{
                "name": "base",
                "extends": [],
                "agents": ["a"],
                "skills": ["s"],
                "commands": [],
                "instructions": [],
                "gitHooks": ["pre-commit"]
            }],
            "agents": [{"id": "a", "description": "Agent A"}],
            "skills": [],
            "commands": [],
            "instructions": [],
            "gitHooks": [{"hookName": "pre-commit"}]
        }"#;
        let parsed: CatalogReport = serde_json::from_str(json).expect("catalog report");
        assert_eq!(parsed.presets.len(), 1);
        assert_eq!(parsed.git_hooks.len(), 1);
    }

    #[test]
    fn init_report_deserializes() {
        let json = r#"{
            "projectRoot": "/proj",
            "presetName": "base",
            "manifestPath": "/proj/.claude-fw.yaml"
        }"#;
        let parsed: InitReport = serde_json::from_str(json).expect("init report");
        assert_eq!(parsed.project_root, "/proj");
        assert_eq!(parsed.preset_name, "base");
    }

    #[test]
    fn detect_stack_report_deserializes() {
        let json = r#"{
            "projectRoot": "/proj",
            "matches": [
                {"preset": "tauri-rust-react", "specificity": 2},
                {"preset": "base", "specificity": 1}
            ]
        }"#;
        let parsed: DetectStackReport = serde_json::from_str(json).expect("detect-stack report");
        assert_eq!(parsed.matches.len(), 2);
        assert_eq!(parsed.matches[0].specificity, 2);
    }
}
