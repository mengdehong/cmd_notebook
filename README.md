# Command Notebook

Command Notebook is a Tauri v2 desktop application that helps you organise shell snippets in themed pages and blocks. The UI is a lightweight Vite/TypeScript project that mirrors the original web layout, while the Rust backend handles persistence, import/export, and clipboard access.

## Features

- Multiple pages of command blocks with drag-to-reorder support
- Single-click copy, double-click edit, and context-menu delete interactions
- JSON import/export using Tauri’s dialog and filesystem plugins
- Local JSON persistence across restarts

## Getting Started

### Prerequisites

- Node.js 20+
- Rust toolchain (stable)
- Tauri prerequisites for your platform <https://tauri.app/start/prerequisites/>

### Installation & Development

```bash
npm install
npm run dev            # Vite dev server
npm run tauri dev      # Full Tauri shell with Rust backend
```

### Building

```bash
npm run build          # Type-check and bundle frontend
npm run tauri build    # Produce desktop bundles
```

## Testing & CI

GitHub Actions workflows live in `.github/workflows/`:

- `ci.yml` runs `cargo fmt --check` (Rust) and `npm run build` (frontend) on pushes and pull requests.
- `release.yml` builds Tauri bundles for Linux, macOS, and Windows when a `v*` tag is pushed or the workflow is triggered manually.

To run the same checks locally:

```bash
# Rust formatting check
(cd src-tauri && cargo fmt --all -- --check)

# Frontend build (ensures TypeScript passes)
npm run build
```

For releases, configure the required signing environment variables (`TAURI_PRIVATE_KEY`, `TAURI_KEY_PASSWORD`, etc.) as GitHub secrets before pushing a release tag.

## Project Structure

```
├─ index.html          # Vite entry that mirrors the legacy HTML structure
├─ src/                # TypeScript UI logic and shared styles
├─ src-tauri/          # Rust commands, Tauri config, and plugin wiring
└─ .github/workflows/  # Continuous integration and release pipelines
```

## License

MIT
