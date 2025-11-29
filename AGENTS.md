# Repository Guidelines

## Project Structure & Module Organization
The Vite-based UI lives in `src/`, with `main.ts` wiring browser events to Tauri commands and `styles.css` handling global styling; shared icons sit under `src/assets/`. Native code resides in `src-tauri/`: `src/main.rs` launches the app, while `src/lib.rs` defines commands and plugins. Rust configuration stays inside `src-tauri/Cargo.toml` and Tauri window settings in `src-tauri/tauri.conf.json`. Keep new feature code close to the layer it touches (UI in `src/`, backend glue in `src-tauri/src/`).

## Build, Test, and Development Commands
- `npm install` – install TypeScript, Vite, and Tauri CLI toolchains.
- `npm run dev` – start the web preview server on localhost for rapid UI feedback.
- `npm run tauri dev` – launch the full desktop shell with the Rust backend active.
- `npm run build` – type-check via `tsc` and emit a production Vite bundle.
- `npm run preview` – serve the built assets locally for final validation.
- `cargo fmt` / `cargo clippy` from `src-tauri/` – format and lint Rust modules before submission.

## Coding Style & Naming Conventions
Use 2-space indentation in TypeScript and keep modules default-exported only when a component is standalone; prefer camelCase for variables, PascalCase for components, and kebab-case for asset filenames. Rust code should follow `rustfmt` defaults (4 spaces, `snake_case` functions). Avoid mixing UI logic and command invocations: place DOM helpers in `src/main.ts`, and expose new Tauri commands via `#[tauri::command]` in `src-tauri/src/lib.rs`.

## Security & Configuration Tips
Never commit secrets; load environment-specific values via Tauri’s secure APIs instead of embedding them in `tauri.conf.json`. When touching `capabilities/` or window permissions, document why the change is needed and validate the sandbox still launches with `npm run tauri dev`.
