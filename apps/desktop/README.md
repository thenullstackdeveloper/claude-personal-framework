# @claude-fw/desktop

Desktop UI for the [claude-personal-framework](../../README.md). Same engine
as the CLI — this is a second port over the use cases, not a different
implementation.

## Stack

- **Tauri 2** — Rust backend, native webview frontend, native folder dialogs.
- **React 19 + Vite 6 + TypeScript strict** — frontend.
- **Tailwind 4** via `@tailwindcss/vite` — styling.
- **lucide-react** — icons.

## How it talks to the engine

The Rust backend doesn't reimplement the engine. It spawns the CLI as a
subprocess and parses its JSON output:

```
React → invoke('list_catalog' | 'install', { … })
     → Tauri IPC
     → Rust handler (src-tauri/src/lib.rs)
     → std::process::Command: node packages/cli/dist/index.js <cmd> --json
     → serde_json::from_str
     → back to React, typed
```

CLI path resolution:

- In development, falls back to `CARGO_MANIFEST_DIR + ../../../packages/cli/dist/index.js`.
- For an explicit override, set `CLAUDE_FW_CLI_PATH` to the absolute path of
  `index.js`. Used in CI / packaged builds.

## Development

From the repo root:

```fish
pnpm install
pnpm -r build              # builds @claude-fw/core and @claude-fw/cli
pnpm -C apps/desktop tauri:dev
```

First `tauri dev` takes 2–5 minutes — Rust is compiling Tauri + all its
deps. Subsequent runs are ~10 s.

### Linux / Wayland gotcha

If `tauri dev` fails with `Gdk-Message: Error 71 (Protocol error)
dispatching to Wayland display`, prepend the environment variable:

```fish
WEBKIT_DISABLE_DMABUF_RENDERER=1 pnpm -C apps/desktop tauri:dev
```

WebKitGTK tries DMA-BUF rendering and that path conflicts with some
Wayland compositors / drivers. Disabling it forces a stable path. The flag
is harmless on macOS and Windows.

## Other commands

```fish
pnpm -C apps/desktop typecheck       # tsc --noEmit, strict
pnpm -C apps/desktop build           # vite build → dist/
pnpm -C apps/desktop tauri:build     # full bundle (.deb / .AppImage / .dmg / …)
```

## Project layout

```
apps/desktop/
├── index.html                # Vite entry
├── vite.config.ts            # Vite config (port 1420 for Tauri)
├── tsconfig.json
├── components.json           # shadcn config
├── src/
│   ├── main.tsx              # React entry
│   ├── App.tsx               # Top-level state orchestration
│   ├── index.css             # Tailwind 4 entry
│   ├── components/
│   │   ├── setup-form.tsx    # Paths + buttons
│   │   ├── catalog-view.tsx  # 4-card grid
│   │   └── install-report.tsx
│   └── lib/
│       ├── api.ts            # invoke<T> wrappers
│       ├── persisted-state.ts
│       └── utils.ts          # cn helper
└── src-tauri/                # Rust backend
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/default.json
    ├── icons/                # placeholder violet squares (TODO: real logo)
    └── src/
        ├── main.rs
        └── lib.rs            # commands: list_catalog, install, detect_path
```

## Tauri commands exposed to the frontend

| Command | Args | Returns |
|---|---|---|
| `list_catalog` | `frameworkRoot: string` | `CatalogReport` (presets, agents, skills, commands) |
| `install` | `frameworkRoot, projectRoot: string` | `InstallReport` (written ids per kind) |
| `detect_path` | `path: string` | `{ isFramework, isProject }` — used by smart-fill in the UI |

The TypeScript shape of each report lives in [`src/lib/api.ts`](src/lib/api.ts).

## What's intentionally not here yet

- **Real app icons** — current ones are 32 / 128 / 256 solid violet PNGs.
  Replace with branded artwork via `pnpm tauri icon path/to/logo.png`.
- **Sidecar bundling of Node + CLI** — production builds currently assume
  `node` is on `$PATH` and the CLI is reachable via `$CLAUDE_FW_CLI_PATH`.
  A proper distribution bundles both inside the app.
- **Sync view** — once the engine grows a lockfile (Fase 2 of the roadmap),
  this app should show drift vs catalog and allow selective updates.
