import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

type FilePickerAcceptType = {
  description?: string;
  accept: Record<string, string[]>;
};

type FallbackSaveFilePickerOptions = {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
};

type FallbackOpenFilePickerOptions = {
  multiple?: boolean;
  types?: FilePickerAcceptType[];
};

type FileSaveDialog = typeof window & {
  showSaveFilePicker?: (
    options?: FallbackSaveFilePickerOptions
  ) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (
    options?: FallbackOpenFilePickerOptions
  ) => Promise<FileSystemFileHandle[]>;
};

export async function loadPersistedState(): Promise<string | null> {
  try {
    const result = await invoke<string | null>("load_state");
    return typeof result === "string" ? result : null;
  } catch (error) {
    console.warn("load_state failed", error);
    return null;
  }
}

export async function savePersistedState(raw: string): Promise<void> {
  try {
    await invoke("save_state", { data: raw });
  } catch (error) {
    console.warn("save_state failed", error);
  }
}

export type ImportResult =
  | { status: "success"; data: string }
  | { status: "cancelled" }
  | { status: "error"; error: string };

export async function pickImportFile(): Promise<ImportResult> {
  try {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "JSON",
          extensions: ["json"],
        },
      ],
    });
    if (!selected) {
      return { status: "cancelled" };
    }
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) {
      return { status: "cancelled" };
    }
    const fileContents = await readTextFile(path);
    return { status: "success", data: fileContents };
  } catch (pluginError) {
    console.warn("tauri plugin dialog/fs import failed", pluginError);
    const fallback = await fallbackImport();
    if (fallback) return fallback;
    const message =
      pluginError instanceof Error
        ? pluginError.message
        : "unknown import failure";
    return { status: "error", error: message };
  }
}

async function fallbackImport(): Promise<ImportResult | null> {
  if (typeof window === "undefined") return null;
  const win = window as FileSaveDialog;
  if (!win.showOpenFilePicker) return null;
  try {
    const handles = await win.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "JSON",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    if (!handles || !handles.length) {
      return { status: "cancelled" };
    }
    const [handle] = handles;
    const file = await handle.getFile();
    const text = await file.text();
    return { status: "success", data: text };
  } catch (error) {
    if (isAbortError(error)) {
      return { status: "cancelled" };
    }
    console.warn("fallback import failed", error);
    const message = error instanceof Error ? error.message : "导入失败";
    return { status: "error", error: message };
  }
}

export type ExportResult =
  | { status: "success"; path: string }
  | { status: "cancelled" }
  | { status: "error"; error: string };

export async function exportStateToFile(raw: string): Promise<ExportResult> {
  try {
    const destination = await save({
      defaultPath: "command-wall.json",
      filters: [
        {
          name: "JSON",
          extensions: ["json"],
        },
      ],
    });
    if (!destination) {
      return { status: "cancelled" };
    }
    await writeTextFile(destination, raw);
    return { status: "success", path: destination };
  } catch (pluginError) {
    console.warn("tauri plugin dialog/fs export failed", pluginError);
    const fallback = await fallbackExport(raw);
    if (fallback) return fallback;
    const message =
      pluginError instanceof Error
        ? pluginError.message
        : "unknown export failure";
    return { status: "error", error: message };
  }
}

async function fallbackExport(raw: string): Promise<ExportResult | null> {
  if (typeof window === "undefined") return null;
  const win = window as FileSaveDialog;
  if (!win.showSaveFilePicker) return null;
  try {
    const handle = await win.showSaveFilePicker({
      suggestedName: "command-wall.json",
      types: [
        {
          description: "JSON",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(raw);
    await writable.close();
    return { status: "success", path: handle.name };
  } catch (error) {
    if (isAbortError(error)) {
      return { status: "cancelled" };
    }
    console.warn("fallback export failed", error);
    const message = error instanceof Error ? error.message : "导出失败";
    return { status: "error", error: message };
  }
}

export async function copyText(text: string): Promise<void> {
  try {
    await writeText(text);
    return;
  } catch (pluginError) {
    console.warn("clipboard plugin write failed", pluginError);
  }
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (clipboardError) {
    console.warn("navigator.clipboard write failed", clipboardError);
  }
  legacyCopy(text);
}

function legacyCopy(text: string): void {
  if (typeof document === "undefined") return;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function isAbortError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}
