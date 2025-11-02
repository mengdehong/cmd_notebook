import {
  AppState,
  CommandPage,
  createDefaultState,
  normalizeState,
  uid,
} from "./types";
import { deepClone } from "./utils";
import { loadPersistedState, savePersistedState } from "./storage";

type Listener = (state: AppState) => void;

const MAX_HISTORY = 200;

let state: AppState = createDefaultState();
const history: AppState[] = [];
const future: AppState[] = [];
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) {
    listener(state);
  }
}

export function getState(): AppState {
  return state;
}

export async function loadInitialState(): Promise<void> {
  let loaded = false;
  try {
    const raw = await loadPersistedState();
    if (raw) {
      const parsed = JSON.parse(raw);
      const normalized = normalizeState(parsed);
      if (normalized) {
        state = normalized;
        loaded = true;
      }
    }
  } catch (error) {
    console.warn("loadInitialState parse failed", error);
  }

  if (!loaded) {
    state = createDefaultState();
    await saveState();
  }
  ensureActivePage();
  history.length = 0;
  future.length = 0;
  notify();
}

export interface UpdateOptions {
  recordHistory?: boolean;
  persist?: boolean;
}

export function updateState(
  mutator: (draft: AppState) => void,
  options: UpdateOptions = {}
): void {
  const { recordHistory = true, persist = true } = options;
  if (recordHistory) {
    history.push(deepClone(state));
    if (history.length > MAX_HISTORY) {
      history.shift();
    }
    future.length = 0;
  }
  mutator(state);
  ensureActivePage();
  notify();
  if (persist) {
    void saveState();
  }
}

export function undo(): boolean {
  if (!history.length) return false;
  future.push(deepClone(state));
  const previous = history.pop();
  if (!previous) return false;
  state = previous;
  ensureActivePage();
  notify();
  void saveState();
  return true;
}

export function redo(): boolean {
  if (!future.length) return false;
  history.push(deepClone(state));
  const next = future.pop();
  if (!next) return false;
  state = next;
  ensureActivePage();
  notify();
  void saveState();
  return true;
}

export async function saveState(): Promise<void> {
  const raw = JSON.stringify(state);
  await savePersistedState(raw);
}

export function replaceState(next: AppState, persist = true): void {
  state = next;
  ensureActivePage();
  history.length = 0;
  future.length = 0;
  notify();
  if (persist) {
    void saveState();
  }
}

export function getActivePage(): CommandPage | null {
  if (!state.pages.length) return null;
  const page =
    state.pages.find((item) => item.id === state.activePageId) ?? state.pages[0];
  return page ?? null;
}

export function getActivePageIndex(): number {
  const page = getActivePage();
  if (!page) return -1;
  return state.pages.findIndex((item) => item.id === page.id);
}

export function setActivePage(pageId: string, persist = true): void {
  if (!state.pages.some((page) => page.id === pageId)) return;
  state.activePageId = pageId;
  notify();
  if (persist) {
    void saveState();
  }
}

function ensureActivePage(): void {
  if (!state.pages.length) {
    const fallbackPage: CommandPage = {
      id: uid(),
      name: "新建页 1",
      blocks: [],
    };
    state.pages = [fallbackPage];
    state.activePageId = fallbackPage.id;
    return;
  }
  const exists = state.pages.some((page) => page.id === state.activePageId);
  if (!exists) {
    state.activePageId = state.pages[0].id;
  }
}
