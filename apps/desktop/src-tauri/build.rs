use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

/// Catalog subdirectories at the workspace root that ship inside the desktop
/// binary as the built-in source (CLAUDEPERS-25). Keep this list in sync with
/// the engine's `FsCatalogReader` expectations: every name here must match a
/// directory the reader can resolve.
const CATALOG_DIRS: &[&str] = &[
    "presets",
    "agents",
    "skills",
    "commands",
    "instructions",
    "git-hooks",
];

fn main() {
    // First: do the Tauri build dance. If it fails the rest is moot.
    tauri_build::build();

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));

    // CARGO_MANIFEST_DIR = apps/desktop/src-tauri → workspace root is three up.
    let workspace_root = manifest_dir
        .join("..")
        .join("..")
        .join("..")
        .canonicalize()
        .expect("workspace root must exist relative to apps/desktop/src-tauri");

    let dest = out_dir.join("builtin-catalog");

    // Always rebuild from scratch — partial state is worse than a clean copy.
    let _ = fs::remove_dir_all(&dest);
    fs::create_dir_all(&dest).expect("create builtin-catalog dest");

    let mut hasher = Sha256::new();

    for dir_name in CATALOG_DIRS {
        let src = workspace_root.join(dir_name);
        if src.is_dir() {
            copy_dir_recursive(&src, &dest.join(dir_name), &mut hasher).unwrap_or_else(|e| {
                panic!("failed to copy catalog dir {}: {}", src.display(), e);
            });
            // Trigger a rebuild when any tracked source file changes.
            println!("cargo:rerun-if-changed={}", src.display());
        }
    }

    let digest = hasher.finalize();
    // First 16 hex chars is more than enough for a cache directory name —
    // collisions for cache invalidation are not security-sensitive.
    let short_hash: String = digest.iter().take(8).map(|b| format!("{:02x}", b)).collect();

    println!("cargo:rustc-env=BUILTIN_CATALOG_HASH={}", short_hash);

    // Re-run if the build script itself changes (catches edits to this file).
    println!("cargo:rerun-if-changed=build.rs");
}

fn copy_dir_recursive(src: &Path, dest: &Path, hasher: &mut Sha256) -> std::io::Result<()> {
    fs::create_dir_all(dest)?;

    // Sort entries to make the hash deterministic across filesystems.
    let mut entries: Vec<_> = fs::read_dir(src)?.collect::<Result<_, _>>()?;
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let ty = entry.file_type()?;
        let entry_dest = dest.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &entry_dest, hasher)?;
        } else if ty.is_file() {
            let content = fs::read(entry.path())?;
            // Hash the relative file name AND the content so a rename without
            // content change still bumps the hash.
            hasher.update(entry.file_name().as_encoded_bytes());
            hasher.update(b"\0");
            hasher.update(&content);
            fs::write(&entry_dest, &content)?;

            // Preserve the executable bit on Unix so git-hooks stay runnable
            // after extraction at runtime.
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mode = entry.metadata()?.permissions().mode();
                fs::set_permissions(&entry_dest, fs::Permissions::from_mode(mode))?;
            }
        }
        // Symlinks and other entry kinds are skipped — the catalog should not
        // contain them, and silently dropping them keeps the build robust.
    }

    Ok(())
}
