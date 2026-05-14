use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Serialize, Deserialize)]
struct ListPreset {
    name: String,
    extends: Vec<String>,
    agents: Vec<String>,
    skills: Vec<String>,
    commands: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct ListArtifact {
    id: String,
    description: String,
}

#[derive(Serialize, Deserialize)]
struct CatalogReport {
    presets: Vec<ListPreset>,
    agents: Vec<ListArtifact>,
    skills: Vec<ListArtifact>,
    commands: Vec<ListArtifact>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallReport {
    preset_name: String,
    agents: Vec<String>,
    skills: Vec<String>,
    commands: Vec<String>,
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

fn run_cli(args: &[&str]) -> Result<String, String> {
    let cli = cli_path();
    let output = Command::new("node")
        .arg(&cli)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to spawn node {}: {}", cli, e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "CLI exited with status {}: {}",
            output.status,
            stderr.trim()
        ));
    }

    String::from_utf8(output.stdout)
        .map_err(|e| format!("CLI stdout is not valid UTF-8: {}", e))
}

#[tauri::command]
fn list_catalog(framework_root: String) -> Result<CatalogReport, String> {
    let output = run_cli(&["list", "--framework", &framework_root, "--json"])?;
    serde_json::from_str(&output).map_err(|e| format!("Failed to parse list JSON: {}", e))
}

#[tauri::command]
fn install(framework_root: String, project_root: String) -> Result<InstallReport, String> {
    let output = run_cli(&[
        "install",
        "--framework",
        &framework_root,
        "--project",
        &project_root,
        "--json",
    ])?;
    serde_json::from_str(&output).map_err(|e| format!("Failed to parse install JSON: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![list_catalog, install])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
