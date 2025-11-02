import type { AppState, CommandPage } from "./types";
import { uid } from "./types";
import {
  getActivePage,
  getState,
  replaceState,
  setActivePage,
  updateState,
} from "./store";
import { deepClone } from "./utils";

function findPageContainingBlock(
  state: AppState,
  blockId: string
): CommandPage | null {
  for (const page of state.pages) {
    if (page.blocks.some((block) => block.id === blockId)) {
      return page;
    }
  }
  return null;
}

export function addPage(name?: string): string {
  const trimmed = (name ?? "").trim();
  const state = getState();
  const nextIndex = state.pages.length + 1;
  const pageName = trimmed.length ? trimmed : `新建页 ${nextIndex}`;
  const id = uid();
  updateState((draft) => {
    draft.pages.push({
      id,
      name: pageName,
      blocks: [],
    });
    draft.activePageId = id;
  });
  return id;
}

export function renamePage(pageId: string, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed.length) return false;
  let changed = false;
  updateState((draft) => {
    const page = draft.pages.find((item) => item.id === pageId);
    if (!page) return;
    if (page.name === trimmed) return;
    page.name = trimmed;
    changed = true;
  });
  return changed;
}

export function deletePage(pageId: string): boolean {
  const state = getState();
  if (state.pages.length <= 1) {
    return false;
  }
  const index = state.pages.findIndex((page) => page.id === pageId);
  if (index === -1) return false;
  updateState((draft) => {
    const idx = draft.pages.findIndex((page) => page.id === pageId);
    if (idx === -1) return;
    draft.pages.splice(idx, 1);
    if (draft.activePageId === pageId) {
      const fallback = draft.pages[idx] ?? draft.pages[idx - 1] ?? draft.pages[0];
      draft.activePageId = fallback?.id ?? null;
    }
  });
  return true;
}

export function reorderPages(
  sourceId: string,
  targetId: string,
  position: "before" | "after"
): boolean {
  if (sourceId === targetId) return false;
  const { pages } = getState();
  const srcIdx = pages.findIndex((page) => page.id === sourceId);
  const dstIdx = pages.findIndex((page) => page.id === targetId);
  if (srcIdx === -1 || dstIdx === -1) return false;
  updateState((draft) => {
    const from = draft.pages.findIndex((page) => page.id === sourceId);
    if (from === -1) return;
    const [item] = draft.pages.splice(from, 1);
    const targetIndex = draft.pages.findIndex((page) => page.id === targetId);
    if (targetIndex === -1) {
      draft.pages.splice(from, 0, item);
      return;
    }
    const insertAt =
      position === "before" ? targetIndex : Math.min(targetIndex + 1, draft.pages.length);
    draft.pages.splice(insertAt, 0, item);
  });
  return true;
}

export function setActivePageById(pageId: string): void {
  setActivePage(pageId, true);
}

export function addBlock(title: string): string | null {
  const page = getActivePage();
  if (!page) return null;
  const trimmed = title.trim() || "未命名区块";
  const id = uid();
  updateState((draft) => {
    const target = draft.pages.find((item) => item.id === page.id);
    if (!target) return;
    target.blocks.push({
      id,
      title: trimmed,
      cmds: [],
    });
  });
  return id;
}

export function renameBlock(blockId: string, title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed.length) return false;
  const state = getState();
  const page = findPageContainingBlock(state, blockId);
  if (!page) return false;
  let changed = false;
  updateState((draft) => {
    const targetPage = draft.pages.find((item) => item.id === page.id);
    if (!targetPage) return;
    const block = targetPage.blocks.find((item) => item.id === blockId);
    if (!block) return;
    if (block.title === trimmed) return;
    block.title = trimmed;
    changed = true;
  });
  return changed;
}

export function deleteBlock(blockId: string): boolean {
  const state = getState();
  const page = findPageContainingBlock(state, blockId);
  if (!page) return false;
  const idx = page.blocks.findIndex((block) => block.id === blockId);
  if (idx === -1) return false;
  updateState((draft) => {
    const targetPage = draft.pages.find((item) => item.id === page.id);
    if (!targetPage) return;
    targetPage.blocks.splice(idx, 1);
  });
  return true;
}

export function addCommand(blockId: string, text: string): string | null {
  const state = getState();
  const page = findPageContainingBlock(state, blockId);
  if (!page) return null;
  const block = page.blocks.find((item) => item.id === blockId);
  if (!block) return null;
  const id = uid();
  updateState((draft) => {
    const targetPage = draft.pages.find((item) => item.id === page.id);
    if (!targetPage) return;
    const targetBlock = targetPage.blocks.find((item) => item.id === blockId);
    if (!targetBlock) return;
    targetBlock.cmds.push({ id, text });
  });
  return id;
}

export function updateCommand(
  blockId: string,
  cmdId: string,
  text: string
): boolean {
  const state = getState();
  const page = findPageContainingBlock(state, blockId);
  if (!page) return false;
  const block = page.blocks.find((item) => item.id === blockId);
  if (!block) return false;
  const command = block.cmds.find((cmd) => cmd.id === cmdId);
  if (!command) return false;
  updateState((draft) => {
    const targetPage = draft.pages.find((item) => item.id === page.id);
    if (!targetPage) return;
    const targetBlock = targetPage.blocks.find((item) => item.id === blockId);
    if (!targetBlock) return;
    const targetCmd = targetBlock.cmds.find((cmd) => cmd.id === cmdId);
    if (!targetCmd) return;
    targetCmd.text = text;
  });
  return true;
}

export function deleteCommand(blockId: string, cmdId: string): boolean {
  const state = getState();
  const page = findPageContainingBlock(state, blockId);
  if (!page) return false;
  const block = page.blocks.find((item) => item.id === blockId);
  if (!block) return false;
  const index = block.cmds.findIndex((cmd) => cmd.id === cmdId);
  if (index === -1) return false;
  updateState((draft) => {
    const targetPage = draft.pages.find((item) => item.id === page.id);
    if (!targetPage) return;
    const targetBlock = targetPage.blocks.find((item) => item.id === blockId);
    if (!targetBlock) return;
    targetBlock.cmds.splice(index, 1);
  });
  return true;
}

export function moveBlockToEnd(blockId: string): boolean {
  const state = getState();
  const page = findPageContainingBlock(state, blockId);
  if (!page) return false;
  const index = page.blocks.findIndex((block) => block.id === blockId);
  if (index === -1) return false;
  updateState((draft) => {
    const targetPage = draft.pages.find((item) => item.id === page.id);
    if (!targetPage) return;
    const idx = targetPage.blocks.findIndex((block) => block.id === blockId);
    if (idx === -1) return;
    const [item] = targetPage.blocks.splice(idx, 1);
    targetPage.blocks.push(item);
  });
  return true;
}

export function reorderBlocksWithinPage(
  pageId: string,
  sourceId: string,
  targetId: string,
  position: "before" | "after"
): boolean {
  if (sourceId === targetId) return false;
  const state = getState();
  const page = state.pages.find((item) => item.id === pageId);
  if (!page) return false;
  const srcIdx = page.blocks.findIndex((block) => block.id === sourceId);
  const dstIdx = page.blocks.findIndex((block) => block.id === targetId);
  if (srcIdx === -1 || dstIdx === -1) return false;
  updateState((draft) => {
    const targetPage = draft.pages.find((item) => item.id === pageId);
    if (!targetPage) return;
    const from = targetPage.blocks.findIndex((block) => block.id === sourceId);
    if (from === -1) return;
    const [item] = targetPage.blocks.splice(from, 1);
    const targetIndex = targetPage.blocks.findIndex(
      (block) => block.id === targetId
    );
    if (targetIndex === -1) {
      targetPage.blocks.splice(from, 0, item);
      return;
    }
    const insertAt =
      position === "before"
        ? targetIndex
        : Math.min(targetIndex + 1, targetPage.blocks.length);
    targetPage.blocks.splice(insertAt, 0, item);
  });
  return true;
}

export function replaceAll(state: AppState): void {
  const snapshot: AppState = deepClone(state);
  replaceState(snapshot, true);
}
