import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  register as registerGlobalShortcut,
  unregisterAll as unregisterAllShortcuts,
} from "@tauri-apps/plugin-global-shortcut";
import {
  addBlock,
  addCommand,
  addPage,
  deleteBlock,
  deleteCommand,
  deletePage,
  moveBlockToEnd,
  renameBlock,
  renamePage,
  reorderPages,
  replaceAll,
  setActivePageById,
  updateCommand,
  updateBlockWidth,
  updateBlockHeight,
  updateBlockTitleColor,
  updateCommandNote,
} from "./actions";
import { render } from "./render";
import {
  getSelectedBlockId,
  isEditingCommand,
  resetUiState,
  setEditingCommand,
  setSelectedBlockId,
} from "./uiState";
import { getActivePage, getState, redo, undo, updateState } from "./store";
import { copyText, exportStateToFile, pickImportFile } from "./storage";
import { showToast } from "./toast";
import { isMacPlatform } from "./utils";
import { normalizeState } from "./types";
import { promptDialog, isDialogOpen, confirmDialog } from "./dialogs";
import { showDataDirInfo, changeDataDir, resetToDefaultDir } from "./settings";

type BlockContextTarget =
  | { type: "block"; blockId: string }
  | { type: "command"; blockId: string; cmdId: string };

type PageContextTarget = { pageId: string };

let blockContextTarget: BlockContextTarget | null = null;
let pageContextTarget: PageContextTarget | null = null;
let pageDragSourceId: string | null = null;

const COLOR_PRESETS = [
  "",
  "#38bdf8",
  "#f472b6",
  "#f59e0b",
  "#8b5cf6",
  "#10b981",
  "#ef4444",
];

type SearchScope = "global" | "page";

interface SearchResultItem {
  pageId: string;
  pageName: string;
  blockId: string;
  blockTitle: string;
  cmdId?: string;
  text: string;
}

let searchScope: SearchScope = "global";
let searchResults: SearchResultItem[] = [];
let activeSearchIndex = 0;
let globalShortcutsReady = false;
let lastShortcutAt = 0;

const blockContextOverlay = document.getElementById(
  "context"
) as HTMLDivElement | null;
const blockContextMenu = document.getElementById("menu") as HTMLDivElement | null;

const renameBlockBtn = blockContextMenu?.querySelector<HTMLButtonElement>(
  '[data-action="rename-block"]'
);
const addCmdBtn = blockContextMenu?.querySelector<HTMLButtonElement>(
  '[data-action="add-cmd"]'
);
const deleteBlockBtn = blockContextMenu?.querySelector<HTMLButtonElement>(
  '[data-action="delete-block"]'
);
const deleteCmdBtn = blockContextMenu?.querySelector<HTMLButtonElement>(
  '[data-action="delete-cmd"]'
);
const editNoteBtn = blockContextMenu?.querySelector<HTMLButtonElement>(
  '[data-action="edit-note"]'
);

const pageContextOverlay = document.getElementById(
  "pageContext"
) as HTMLDivElement | null;
const pageContextMenu = document.getElementById("pageMenu") as HTMLDivElement | null;
const deletePageBtn = pageContextMenu?.querySelector<HTMLButtonElement>(
  '[data-action="delete-page"]'
);

const searchOverlay = document.getElementById("searchOverlay") as HTMLDivElement | null;
const searchInput = document.getElementById("searchInput") as HTMLInputElement | null;
const searchResultsEl = document.getElementById("searchResults") as HTMLDivElement | null;
const searchScopeLabel = document.getElementById("searchScopeLabel") as HTMLSpanElement | null;


function isSearchOpen(): boolean {
  return searchOverlay?.classList.contains("open") ?? false;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMatch(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return escapeHtml(text);
  const before = escapeHtml(text.slice(0, idx));
  const hit = escapeHtml(text.slice(idx, idx + q.length));
  const after = escapeHtml(text.slice(idx + q.length));
  return `${before}<mark>${hit}</mark>${after}`;
}

function closeSearch(): void {
  if (!searchOverlay || !searchInput) return;
  searchOverlay.classList.remove("open");
  searchOverlay.setAttribute("aria-hidden", "true");
  searchInput.value = "";
}

function refreshSearchResults(query: string): void {
  if (!searchResultsEl) return;
  const normalized = query.trim().toLowerCase();
  const state = getState();
  const pageLimit = searchScope === "page" ? getActivePage()?.id : null;
  const all: SearchResultItem[] = [];

  for (const page of state.pages) {
    if (pageLimit && page.id !== pageLimit) continue;
    for (const block of page.blocks) {
      const blockHit = !normalized || block.title.toLowerCase().includes(normalized);
      if (blockHit) {
        all.push({
          pageId: page.id,
          pageName: page.name,
          blockId: block.id,
          blockTitle: block.title,
          text: block.title,
        });
      }
      for (const cmd of block.cmds) {
        const text = cmd.text;
        const note = cmd.note ?? "";
        if (
          !normalized ||
          text.toLowerCase().includes(normalized) ||
          note.toLowerCase().includes(normalized)
        ) {
          all.push({
            pageId: page.id,
            pageName: page.name,
            blockId: block.id,
            blockTitle: block.title,
            cmdId: cmd.id,
            text,
          });
        }
      }
    }
  }

  searchResults = all.slice(0, 80);
  if (!searchResults.length) {
    searchResultsEl.innerHTML = '<div class="muted" style="padding: 12px;">没有匹配结果</div>';
    return;
  }

  if (activeSearchIndex >= searchResults.length) {
    activeSearchIndex = searchResults.length - 1;
  }

  searchResultsEl.innerHTML = "";
  searchResults.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "search-item";
    if (index === activeSearchIndex) {
      div.classList.add("active");
    }

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${item.pageName} › ${item.blockTitle}${item.cmdId ? " · 命令" : " · 区块"}`;

    const title = document.createElement("div");
    title.className = "title";
    title.innerHTML = renderMatch(item.cmdId ? item.text : item.blockTitle, query);

    const match = document.createElement("div");
    match.className = "match";
    match.innerHTML = renderMatch(item.text, query);

    div.append(meta, title, match);
    div.dataset.index = String(index);
    div.addEventListener("click", () => {
      jumpToSearchResult(index);
    });

    searchResultsEl.appendChild(div);
  });
}

function openSearch(scope: SearchScope): void {
  if (!searchOverlay || !searchInput || !searchScopeLabel) return;
  searchScope = scope;
  searchScopeLabel.textContent = scope === "global" ? "全局" : "当前页";
  searchOverlay.classList.add("open");
  searchOverlay.setAttribute("aria-hidden", "false");
  searchInput.value = "";
  activeSearchIndex = 0;
  refreshSearchResults("");
  searchInput.focus();
}

function moveSearchHighlight(delta: number): void {
  if (!searchResults.length) return;
  activeSearchIndex = (activeSearchIndex + delta + searchResults.length) % searchResults.length;
  refreshSearchResults(searchInput?.value ?? "");
  const active = searchResultsEl?.querySelector<HTMLElement>(`.search-item[data-index="${activeSearchIndex}"]`);
  active?.scrollIntoView({ block: "nearest" });
}

function jumpToSearchResult(index: number): void {
  const target = searchResults[index];
  if (!target) return;
  closeSearch();
  setActivePageById(target.pageId);
  setSelectedBlockId(target.blockId);
  render();
  const grid = document.getElementById("grid") as HTMLDivElement | null;
  const card = grid?.querySelector<HTMLElement>(`.card[data-block-id="${target.blockId}"]`);
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("selected");
  }
  if (target.cmdId && card) {
    const row = card.querySelector<HTMLElement>(`.cmd[data-cmd-id="${target.cmdId}"]`);
    if (row) {
      row.classList.add("highlight-once");
      window.setTimeout(() => row.classList.remove("highlight-once"), 1400);
    }
  }
}

export function setupInteractions(): void {
  const grid = document.getElementById("grid") as HTMLDivElement | null;
  if (!grid) throw new Error("grid container not found");

  setupGrid(grid);
  setupPageMenu();
  setupToolbarAutohide();
  setupButtons();
  setupSearchUI();
  setupGlobalShortcut();
  setupKeyboardShortcuts();
  setupBlockContextMenu();
  setupPageContextMenu();
  setupSettingsMenu();
  setupResizeInteractions();
}

function setupGrid(grid: HTMLDivElement): void {
  grid.addEventListener("click", onGridClick);
  grid.addEventListener("dblclick", onGridDoubleClick);
  grid.addEventListener("contextmenu", onGridContextMenu);
  grid.addEventListener("dragover", (event) => event.preventDefault());
  grid.addEventListener("drop", onGridDrop);
}

function setupPageMenu(): void {
  const manageBtn = document.getElementById(
    "managePages"
  ) as HTMLButtonElement | null;
  const dropdown = document.getElementById("pageDropdown") as HTMLDivElement | null;
  const list = document.getElementById("pageList") as HTMLDivElement | null;
  if (!manageBtn || !dropdown || !list) {
    throw new Error("page management elements not found");
  }

  const positionMenu = () => {
    const rect = manageBtn.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.left = `${rect.left + rect.width / 2}px`;
  };

  const openMenu = () => {
    positionMenu();
    dropdown.classList.add("open");
  };

  const closeMenu = () => {
    dropdown.classList.remove("open");
    hidePageContextMenu();
    pageDragSourceId = null;
    list.querySelectorAll(".page-item").forEach((item) => {
      (item as HTMLElement).classList.remove("drop-target", "dragging");
    });
  };

  manageBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    hideBlockContextMenu();
    hidePageContextMenu();
    if (dropdown.classList.contains("open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  document.addEventListener("click", (event) => {
    if (!dropdown.classList.contains("open")) return;
    const target = event.target as Node;
    if (
      target === dropdown ||
      dropdown.contains(target) ||
      target === manageBtn
    ) {
      return;
    }
    closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dropdown.classList.contains("open")) {
      closeMenu();
    }
  });

  window.addEventListener("scroll", () => {
    if (!dropdown.classList.contains("open")) return;
    positionMenu();
  });

  window.addEventListener("resize", () => {
    if (!dropdown.classList.contains("open")) return;
    positionMenu();
  });

  list.addEventListener("click", async (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(".page-item");
    if (!target) return;
    const role = target.dataset.role;
    if (role === "page-new") {
      closeMenu();
      const name = await promptDialog({
        title: "新页面",
        placeholder: "请输入页面名称",
        defaultValue: "新建页",
        confirmLabel: "创建",
      });
      const trimmed = name?.trim();
      if (!trimmed) {
        return;
      }
      const newId = addPage(trimmed);
      closeMenu();
      setActivePageById(newId);
      render();
      showToast("新页面已创建");
      return;
    }
    if (role !== "page-item") return;
    const pageId = target.dataset.pageId;
    if (!pageId) return;
    closeMenu();
    setActivePageById(pageId);
    render();
  });

  list.addEventListener("contextmenu", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(".page-item");
    if (!target) return;
    const role = target.dataset.role;
    if (role !== "page-item") return;
    event.preventDefault();
    hideBlockContextMenu();
    const pageId = target.dataset.pageId;
    if (!pageId || !pageContextOverlay || !pageContextMenu) return;
    pageContextTarget = { pageId };
    togglePageContextMenu(event.clientX, event.clientY);
  });

  list.addEventListener("dragstart", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(".page-item");
    if (!target) return;
    const role = target.dataset.role;
    if (role !== "page-item") return;
    const pageId = target.dataset.pageId;
    if (!pageId) return;
    pageDragSourceId = pageId;
    event.dataTransfer?.setData("text/plain", pageId);
    event.dataTransfer?.setDragImage(target, 20, 20);
    event.dataTransfer!.effectAllowed = "move";
    target.classList.add("dragging");
  });

  list.addEventListener("dragend", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(".page-item");
    if (target) {
      target.classList.remove("dragging");
      target.classList.remove("drop-target");
    }
    pageDragSourceId = null;
  });

  list.addEventListener("dragover", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(".page-item");
    if (!target) return;
    const role = target.dataset.role;
    if (role !== "page-item") return;
    event.preventDefault();
    target.classList.add("drop-target");
  });

  list.addEventListener("dragleave", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(".page-item");
    if (!target) return;
    target.classList.remove("drop-target");
  });

  list.addEventListener("drop", (event) => {
    event.preventDefault();
    const target = (event.target as HTMLElement).closest<HTMLElement>(".page-item");
    const sourceId =
      pageDragSourceId ?? event.dataTransfer?.getData("text/plain") ?? null;
    if (!target || !sourceId) return;
    target.classList.remove("drop-target");
    const role = target.dataset.role;
    if (role !== "page-item") return;
    const targetId = target.dataset.pageId;
    if (!targetId || sourceId === targetId) return;
    const rect = target.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    reorderPages(sourceId, targetId, before ? "before" : "after");
  });
}

function onGridClick(event: MouseEvent): void {
  const dropdown = document.getElementById("pageDropdown") as HTMLDivElement | null;
  if (dropdown && dropdown.classList.contains("open")) {
    dropdown.classList.remove("open");
    pageDragSourceId = null;
  }
  const target = event.target as HTMLElement;
  const actionButton = target.closest<HTMLButtonElement>("button[data-action]");
  if (actionButton) {
    handleActionButton(actionButton);
    return;
  }

  if (isEditingCommand()) return;

  const cmdRow = target.closest<HTMLElement>(".cmd");
  if (!cmdRow) return;
  const blockId = cmdRow.dataset.blockId;
  const cmdId = cmdRow.dataset.cmdId;
  if (!blockId || !cmdId) return;
  const text = findCommandText(blockId, cmdId);
  if (!text) return;
  void copyText(text).then(
    () => showToast("已复制"),
    () => showToast("复制失败")
  );
}

function onGridDoubleClick(event: MouseEvent): void {
  const dropdown = document.getElementById("pageDropdown") as HTMLDivElement | null;
  if (dropdown && dropdown.classList.contains("open")) {
    dropdown.classList.remove("open");
    pageDragSourceId = null;
  }
  const target = event.target as HTMLElement;
  const cmdRow = target.closest<HTMLElement>(".cmd");
  if (!cmdRow) return;
  const blockId = cmdRow.dataset.blockId;
  const cmdId = cmdRow.dataset.cmdId;
  if (!blockId || !cmdId) return;
  startInlineEdit(blockId, cmdId, cmdRow);
}

function onGridContextMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const card = target.closest<HTMLElement>(".card");
  if (!card) return;
  event.preventDefault();
  const blockId = card.dataset.blockId;
  if (!blockId || !blockContextOverlay || !blockContextMenu) return;
  const dropdown = document.getElementById("pageDropdown") as HTMLDivElement | null;
  if (dropdown && dropdown.classList.contains("open")) {
    dropdown.classList.remove("open");
    pageDragSourceId = null;
  }
  hidePageContextMenu();

  const cmdRow = target.closest<HTMLElement>(".cmd");
  if (cmdRow) {
    const cmdId = cmdRow.dataset.cmdId;
    if (!cmdId) return;
    blockContextTarget = { type: "command", blockId, cmdId };
    toggleBlockContextMenu("command", event.clientX, event.clientY);
    return;
  }

  blockContextTarget = { type: "block", blockId };
  toggleBlockContextMenu("block", event.clientX, event.clientY);
}

function onGridDrop(event: DragEvent): void {
  event.preventDefault();
  const blockId = event.dataTransfer?.getData("text/plain");
  if (!blockId) return;
  moveBlockToEnd(blockId);
}

function handleActionButton(button: HTMLButtonElement): void {
  const action = button.dataset.action;
  const blockId = button.dataset.blockId;
  if (!action) return;
  if (action === "add-command" && !blockId) return;
  if (action === "toggle-color" && !blockId) return;

  if (action === "add-command" && blockId) {
    void (async () => {
      const text = await promptDialog({
        title: "添加命令",
        placeholder: "输入命令",
        multiline: true,
        confirmLabel: "保存",
      });
      if (text && text.trim()) {
        addCommand(blockId, text);
        showToast("命令已添加");
      }
    })();
    return;
  }

  if (action === "toggle-color" && blockId) {
    cycleBlockTitleColor(blockId);
  }
}

async function handleBlockContextAction(action: string): Promise<void> {
  if (!blockContextTarget) return;
  if (blockContextTarget.type === "block") {
    const blockId = blockContextTarget.blockId;
    if (action === "rename-block") {
      const info = findBlock(blockId);
      const original = info?.block.title ?? "";
      const name = await promptDialog({
        title: "区块名称",
        placeholder: "请输入区块名称",
        defaultValue: original,
        confirmLabel: "保存",
      });
      const trimmed = name?.trim();
      if (trimmed && renameBlock(blockId, trimmed)) {
        showToast("区块已重命名");
      }
    } else if (action === "add-cmd") {
      const text = await promptDialog({
        title: "添加命令",
        placeholder: "输入命令",
        multiline: true,
        confirmLabel: "保存",
      });
      if (text && text.trim()) {
        addCommand(blockId, text);
        showToast("命令已添加");
      }
    } else if (action === "delete-block") {
      if (confirm("确定删除该区块及其所有命令？")) {
        if (deleteBlock(blockId)) {
          if (getSelectedBlockId() === blockId) {
            setSelectedBlockId(null);
          }
          showToast("区块已删除");
        }
      }
    }
  } else if (blockContextTarget.type === "command") {
    const { blockId, cmdId } = blockContextTarget;
    if (action === "delete-cmd") {
      if (deleteCommand(blockId, cmdId)) {
        showToast("命令已删除");
      }
    } else if (action === "edit-note") {
      const command = findCommand(blockId, cmdId);
      const original = command?.note ?? "";
      const note = await promptDialog({
        title: "编辑注释",
        placeholder: "输入注释内容（可留空）",
        defaultValue: original,
        multiline: true,
        confirmLabel: "保存",
      });
      if (note !== null) {
        const trimmed = note.trim();
        updateCommandNote(blockId, cmdId, trimmed || undefined);
        showToast(trimmed ? "注释已保存" : "注释已清除");
      }
    }
  }
}

async function handlePageContextAction(action: string): Promise<void> {
  if (!pageContextTarget) return;
  const { pageId } = pageContextTarget;
  if (action === "rename-page") {
    const state = getState();
    const page = state.pages.find((item) => item.id === pageId);
    const original = page?.name ?? "";
    const name = await promptDialog({
      title: "页面名称",
      placeholder: "请输入页面名称",
      defaultValue: original,
      confirmLabel: "保存",
    });
    const trimmed = name?.trim();
    if (trimmed && renamePage(pageId, trimmed)) {
      showToast("页面已重命名");
    }
  } else if (action === "delete-page") {
    if (getState().pages.length <= 1) {
      showToast("至少保留一个页面");
      return;
    }
    const confirmed = await confirmDialog({
      title: "删除页面",
      message: "确定删除该页面及其所有区块？操作不可撤销。",
      confirmLabel: "删除",
      cancelLabel: "取消",
    });
    if (!confirmed) return;
    if (deletePage(pageId)) {
      showToast("页面已删除", {
        actionLabel: "撤销",
        onAction: () => {
          if (undo()) {
            render();
            showToast("已恢复页面");
          }
        },
      });
      const dropdown = document.getElementById("pageDropdown") as HTMLDivElement | null;
      if (dropdown) {
        dropdown.classList.remove("open");
      }
      pageDragSourceId = null;
    }
  }
}

function toggleBlockContextMenu(
  type: "block" | "command",
  x: number,
  y: number
): void {
  if (!blockContextOverlay || !blockContextMenu) return;
  if (renameBlockBtn && addCmdBtn && deleteBlockBtn && deleteCmdBtn && editNoteBtn) {
    if (type === "command") {
      renameBlockBtn.classList.add("hidden");
      addCmdBtn.classList.add("hidden");
      deleteBlockBtn.classList.add("hidden");
      deleteCmdBtn.classList.remove("hidden");
      editNoteBtn.classList.remove("hidden");
    } else {
      renameBlockBtn.classList.remove("hidden");
      addCmdBtn.classList.remove("hidden");
      deleteBlockBtn.classList.remove("hidden");
      deleteCmdBtn.classList.add("hidden");
      editNoteBtn.classList.add("hidden");
    }
  }
  blockContextOverlay.style.display = "block";
  blockContextMenu.style.left = `${x}px`;
  blockContextMenu.style.top = `${y}px`;
}

function togglePageContextMenu(x: number, y: number): void {
  if (!pageContextOverlay || !pageContextMenu) return;
  if (deletePageBtn) {
    const onlyOne = getState().pages.length <= 1;
    deletePageBtn.classList.toggle("hidden", onlyOne);
  }
  pageContextOverlay.style.display = "block";
  pageContextMenu.style.left = `${x}px`;
  pageContextMenu.style.top = `${y}px`;
}

function setupBlockContextMenu(): void {
  if (!blockContextOverlay || !blockContextMenu) return;
  blockContextOverlay.addEventListener("click", hideBlockContextMenu);
  blockContextMenu.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const action = target.dataset.action;
    if (!action) return;
    void handleBlockContextAction(action);
    hideBlockContextMenu();
  });
}

function setupPageContextMenu(): void {
  if (!pageContextOverlay || !pageContextMenu) return;
  pageContextOverlay.addEventListener("click", hidePageContextMenu);
  pageContextMenu.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const action = target.dataset.action;
    if (!action) return;
    void handlePageContextAction(action);
    hidePageContextMenu();
  });
}

function hideBlockContextMenu(): void {
  if (!blockContextOverlay) return;
  blockContextOverlay.style.display = "none";
  blockContextTarget = null;
}

function hidePageContextMenu(): void {
  if (!pageContextOverlay) return;
  pageContextOverlay.style.display = "none";
  pageContextTarget = null;
}

function setupButtons(): void {
  const addBlockBtn = document.getElementById("addBlock");
  const exportBtn = document.getElementById("exportFile");
  const importBtn = document.getElementById("importFile");
  const searchBtn = document.getElementById("searchBtn");
  const minimizeBtn = document.getElementById("minimizeBtn");

  addBlockBtn?.addEventListener("click", async () => {
    const name = await promptDialog({
      title: "新建区块",
      placeholder: "请输入区块名称",
      defaultValue: "新建区块",
      confirmLabel: "创建",
    });
    const trimmed = name?.trim();
    if (!trimmed) return;
    const id = addBlock(trimmed);
    if (id) {
      setSelectedBlockId(id);
      showToast("区块已创建");
    }
  });

  exportBtn?.addEventListener("click", async () => {
    const raw = JSON.stringify(getState(), null, 2);
    const result = await exportStateToFile(raw);
    if (result.status === "success") {
      showToast("已导出到文件");
    } else if (result.status === "error") {
      showToast(`导出失败：${result.error}`);
    }
  });

  importBtn?.addEventListener("click", async () => {
    const result = await pickImportFile();
    if (result.status === "cancelled") return;
    if (result.status === "error") {
      showToast(`导入失败：${result.error}`);
      return;
    }
    try {
      const parsed = JSON.parse(result.data);
      const normalized = normalizeState(parsed);
      if (!normalized) {
        showToast("导入失败：结构不正确");
        return;
      }
      resetUiState();
      replaceAll(normalized);
      render();
      showToast("导入成功");
    } catch (error) {
      console.warn("import parse error", error);
      showToast("导入失败：JSON 解析错误");
    }
  });

  searchBtn?.addEventListener("click", () => openSearch("global"));

  minimizeBtn?.addEventListener("click", async () => {
    await toggleMinimize();
  });
}

function setupSearchUI(): void {
  if (!searchOverlay || !searchInput || !searchResultsEl) return;
  const overlay = searchOverlay;

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeSearch();
    }
  });

  searchInput.addEventListener("input", () => {
    activeSearchIndex = 0;
    refreshSearchResults(searchInput.value);
  });
}

function setupGlobalShortcut(): void {
  const hasTauri = Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__);
  if (!hasTauri) return;
  if (globalShortcutsReady) return;
  const register = async (combo: string) => {
    try {
      await registerGlobalShortcut(combo, () => {
        const now = Date.now();
        if (now - lastShortcutAt < 200) return;
        lastShortcutAt = now;
        void toggleMinimize();
      });
    } catch (error) {
      console.warn(`register shortcut ${combo} failed`, error);
    }
  };

  void (async () => {
    try {
      await unregisterAllShortcuts();
    } catch (error) {
      console.warn("unregister shortcuts failed", error);
    }
    await register("CmdOrCtrl+M");
    await register("CmdOrCtrl+Shift+M");
    globalShortcutsReady = true;
  })();
}

function setupSettingsMenu(): void {
  const settingsBtn = document.getElementById("settingsBtn") as HTMLButtonElement | null;
  const dropdown = document.getElementById("settingsDropdown") as HTMLDivElement | null;

  if (!settingsBtn || !dropdown) return;

  const positionMenu = () => {
    const rect = settingsBtn.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.right = `${window.innerWidth - rect.right}px`;
  };

  const openMenu = () => {
    positionMenu();
    dropdown.classList.add("open");
  };

  // 导出关闭函数供外部调用
  (window as unknown as { closeSettingsMenu?: () => void }).closeSettingsMenu = () => {
    dropdown.classList.remove("open");
  };

  const closeMenu = () => {
    dropdown.classList.remove("open");
  };

  settingsBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    hideBlockContextMenu();
    hidePageContextMenu();
    if (dropdown.classList.contains("open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  document.addEventListener("click", (event) => {
    if (!dropdown.classList.contains("open")) return;
    const target = event.target as Node;
    if (target === dropdown || dropdown.contains(target) || target === settingsBtn) {
      return;
    }
    closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dropdown.classList.contains("open")) {
      closeMenu();
    }
  });

  dropdown.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const action = target.dataset.action;
    if (!action) return;
    closeMenu();

    if (action === "view-data-dir") {
      await showDataDirInfo();
    } else if (action === "change-data-dir") {
      await changeDataDir();
    } else if (action === "reset-data-dir") {
      await resetToDefaultDir();
    }
  });
}

function isSettingsMenuOpen(): boolean {
  const dropdown = document.getElementById("settingsDropdown");
  return dropdown?.classList.contains("open") ?? false;
}

function closeSettingsMenu(): void {
  const fn = (window as unknown as { closeSettingsMenu?: () => void }).closeSettingsMenu;
  if (fn) fn();
}

function isPageMenuOpen(): boolean {
  const dropdown = document.getElementById("pageDropdown");
  return dropdown?.classList.contains("open") ?? false;
}

function setupToolbarAutohide(): void {
  const toolbar = document.querySelector(".toolbar") as HTMLElement | null;
  if (!toolbar) return;
  const trigger = document.createElement("div");
  trigger.className = "toolbar-trigger-area";
  document.body.appendChild(trigger);

  let visible = false;
  let hideTimer: number | null = null;

  const show = () => {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (!visible) {
      visible = true;
      document.body.classList.add("toolbar-visible");
    }
  };

  const scheduleHide = () => {
    // 如果设置菜单或页面菜单打开，不隐藏工具栏
    if (isSettingsMenuOpen() || isPageMenuOpen()) {
      return;
    }
    if (hideTimer) {
      window.clearTimeout(hideTimer);
    }
    hideTimer = window.setTimeout(() => {
      // 再次检查设置菜单状态
      if (isSettingsMenuOpen() || isPageMenuOpen()) {
        return;
      }
      visible = false;
      document.body.classList.remove("toolbar-visible");
      // 同时关闭设置菜单
      closeSettingsMenu();
      hideTimer = null;
    }, 80);
  };

  document.addEventListener("mousemove", (event) => {
    const settingsDropdown = document.getElementById("settingsDropdown");
    // 如果鼠标在设置菜单区域内，不隐藏
    if (settingsDropdown && isSettingsMenuOpen()) {
      const rect = settingsDropdown.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.right &&
          event.clientY >= rect.top && event.clientY <= rect.bottom) {
        show();
        return;
      }
    }
    if (event.clientY <= 80) {
      show();
    } else {
      scheduleHide();
    }
  });

  trigger.addEventListener("mouseenter", show);
  trigger.addEventListener("mouseleave", scheduleHide);

  toolbar.addEventListener("mouseenter", show);
  toolbar.addEventListener("mouseleave", (event) => {
    const related = event.relatedTarget as Node | null;
    if (related && (related === trigger || trigger.contains(related))) return;
    // 检查是否移动到设置菜单
    const settingsDropdown = document.getElementById("settingsDropdown");
    if (related && settingsDropdown && (related === settingsDropdown || settingsDropdown.contains(related))) {
      return;
    }
    // 检查是否移动到页面菜单
    const pageDropdown = document.getElementById("pageDropdown");
    if (related && pageDropdown && (related === pageDropdown || pageDropdown.contains(related))) {
      return;
    }
    scheduleHide();
  });

  trigger.addEventListener("touchstart", () => {
    show();
    window.setTimeout(scheduleHide, 1200);
  });
}

function setupKeyboardShortcuts(): void {
  document.addEventListener("keydown", async (event) => {
    const isMac = isMacPlatform();
    const ctrl = isMac ? event.metaKey : event.ctrlKey;
    const active = document.activeElement as HTMLElement | null;
    const isInputActive =
      active &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable);

    if (isDialogOpen()) {
      return;
    }

    if (isSearchOpen()) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        jumpToSearchResult(activeSearchIndex);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSearchHighlight(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSearchHighlight(-1);
        return;
      }
      return;
    }

    if (ctrl && (event.key === "n" || event.key === "N")) {
      if (isInputActive) return;
      event.preventDefault();
      const name = await promptDialog({
        title: "新建区块",
        placeholder: "请输入区块名称",
        defaultValue: "新建区块",
        confirmLabel: "创建",
      });
      const trimmed = name?.trim();
      if (!trimmed) return;
      const id = addBlock(trimmed);
      if (id) {
        setSelectedBlockId(id);
        showToast("区块已创建");
      }
      return;
    }

    if (ctrl && event.key === "ArrowUp") {
      event.preventDefault();
      moveSelectedBlock(-1);
      return;
    }

    if (ctrl && event.key === "ArrowDown") {
      event.preventDefault();
      moveSelectedBlock(1);
      return;
    }

    if (ctrl && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }

    if (ctrl && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }

    if (ctrl && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch("global");
      return;
    }

    if (ctrl && event.key.toLowerCase() === "f") {
      event.preventDefault();
      openSearch("page");
      return;
    }

    if (ctrl && event.key === "Tab") {
      event.preventDefault();
      switchPage(event.shiftKey ? -1 : 1);
      return;
    }

  });
}

function startInlineEdit(blockId: string, cmdId: string, rowEl: HTMLElement): void {
  const command = findCommand(blockId, cmdId);
  if (!command) return;
  if (rowEl.querySelector("input.cmd-edit-input")) return;
  const textDiv = rowEl.querySelector<HTMLDivElement>(".text");
  if (!textDiv) return;

  setEditingCommand(true);

  const input = document.createElement("input");
  input.type = "text";
  input.value = command.text;
  input.className = "cmd-edit-input";
  input.style.userSelect = "text";

  const stopPropagation = (event: Event) => event.stopPropagation();
  input.addEventListener("pointerdown", stopPropagation);
  input.addEventListener("mousedown", stopPropagation);
  input.addEventListener("click", stopPropagation);

  rowEl.replaceChild(input, textDiv);
  input.focus();
  input.setSelectionRange(0, input.value.length);

  let done = false;
  const finish = async (commit: boolean) => {
    if (done) return;
    done = true;
    setEditingCommand(false);
    if (!commit) {
      render();
      return;
    }
    const newText = input.value;
    const changed = newText !== command.text;
    if (changed) {
      updateCommand(blockId, cmdId, newText);
    } else {
      render();
    }
    try {
      await copyText(newText);
      showToast("已保存并复制");
    } catch (error) {
      console.warn("copy after edit failed", error);
      showToast("已保存");
    }
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      finish(true);
    } else if (event.key === "Escape") {
      finish(false);
    }
  });

  input.addEventListener("blur", () => finish(true));
}

function findBlock(blockId: string) {
  const state = getState();
  for (const page of state.pages) {
    const block = page.blocks.find((item) => item.id === blockId);
    if (block) {
      return { page, block };
    }
  }
  return null;
}

function cycleBlockTitleColor(blockId: string): void {
  const info = findBlock(blockId);
  if (!info) return;
  const current = info.block.titleColor ?? "";
  const idx = COLOR_PRESETS.indexOf(current);
  const next = COLOR_PRESETS[(idx + 1) % COLOR_PRESETS.length];
  updateBlockTitleColor(blockId, next || null);
  render();
}

function findCommandText(blockId: string, cmdId: string): string | null {
  const info = findBlock(blockId);
  if (!info) return null;
  const command = info.block.cmds.find((item) => item.id === cmdId);
  return command ? command.text : null;
}

function findCommand(blockId: string, cmdId: string) {
  const info = findBlock(blockId);
  if (!info) return null;
  return info.block.cmds.find((item) => item.id === cmdId) ?? null;
}

function setupResizeInteractions(): void {
  let resizingBlockId: string | null = null;
  let startX = 0;
  let startY = 0;
  let startWidth = 0;
  let startHeight = 0;
  let card: HTMLElement | null = null;
  let mode: "width" | "height" | null = null;
  let latestWidth: number | null = null;
  let latestHeight: number | null = null;

  document.addEventListener("mousedown", (event) => {
    const target = event.target as HTMLElement;
    const direction = target.dataset.direction as "width" | "height" | undefined;
    if (!target.classList.contains("resize-handle") || !direction) return;

    const blockId = target.dataset.blockId;
    if (!blockId) return;

    resizingBlockId = blockId;
    mode = direction;
    startX = event.clientX;
    startY = event.clientY;
    card = target.closest(".card");
    latestWidth = null;
    latestHeight = null;
    if (card) {
      const rect = card.getBoundingClientRect();
      startWidth = rect.width;
      startHeight = rect.height;
      document.body.style.cursor = direction === "width" ? "ew-resize" : "ns-resize";
      card.classList.add("resizing");
    }

    // Prevent default drag behavior
    event.preventDefault();
  });

  document.addEventListener("mousemove", (event) => {
    if (!resizingBlockId || !card || !mode) return;
    if (mode === "width") {
      const dx = event.clientX - startX;
      const newWidth = Math.max(320, startWidth + dx);
      latestWidth = newWidth;
      card.style.width = `${newWidth}px`;
      card.style.flexGrow = "0";
      return;
    }

    const dy = event.clientY - startY;
    const minHeight = 180;
    const newHeight = Math.max(minHeight, startHeight + dy);
    latestHeight = newHeight;
    card.style.height = `${newHeight}px`;
    card.style.minHeight = `${minHeight}px`;
  });

  document.addEventListener("mouseup", () => {
    if (resizingBlockId && card && mode === "width" && latestWidth !== null) {
      updateBlockWidth(resizingBlockId, latestWidth);
    }
    if (resizingBlockId && card && mode === "height" && latestHeight !== null) {
      updateBlockHeight(resizingBlockId, latestHeight);
    }

    if (card) {
      card.classList.remove("resizing");
    }
    document.body.style.cursor = "";
    resizingBlockId = null;
    card = null;
    mode = null;
    latestWidth = null;
    latestHeight = null;
  });

  document.addEventListener("dblclick", (event) => {
    const target = event.target as HTMLElement;
    const direction = target.dataset.direction as "width" | "height" | undefined;
    if (!target.classList.contains("resize-handle") || !direction) return;
    const blockId = target.dataset.blockId;
    const host = target.closest<HTMLElement>(".card");
    if (!blockId) return;
    if (direction === "width") {
      updateBlockWidth(blockId, null);
      if (host) {
        host.style.width = "";
        host.style.flexGrow = "";
      }
    } else {
      updateBlockHeight(blockId, null);
      if (host) {
        host.style.height = "";
        host.style.minHeight = "";
      }
    }
  });
}

function moveSelectedBlock(direction: -1 | 1): void {
  const selected = getSelectedBlockId();
  if (!selected) return;
  const page = getActivePage();
  if (!page) return;
  const index = page.blocks.findIndex((block) => block.id === selected);
  if (index === -1) return;
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= page.blocks.length) return;
  updateState((draft) => {
    const targetPage = draft.pages.find((item) => item.id === page.id);
    if (!targetPage) return;
    const from = targetPage.blocks.findIndex((block) => block.id === selected);
    if (from === -1) return;
    const [item] = targetPage.blocks.splice(from, 1);
    targetPage.blocks.splice(targetIndex, 0, item);
  });
}

function switchPage(direction: -1 | 1): void {
  const state = getState();
  if (!state.pages.length) return;
  const active = getActivePage();
  const currentIndex = active ? state.pages.findIndex((page) => page.id === active.id) : 0;
  const nextIndex = (currentIndex + direction + state.pages.length) % state.pages.length;
  const target = state.pages[nextIndex];
  if (target) {
    setActivePageById(target.id);
    render();
  }
}

async function toggleMinimize(forceShow?: boolean): Promise<void> {
  const hasTauri = Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__);
  if (!hasTauri) {
    showToast("仅桌面版支持后台运行");
    return;
  }
  try {
    const win = getCurrentWindow();
    const visible = await win.isVisible();
    const focused = await win.isFocused();

    if (!forceShow && visible && focused) {
      await win.hide();
    } else {
      await win.unminimize();
      await win.show();
      await win.setFocus();
    }
  } catch (error) {
    console.warn("minimize toggle failed", error);
    showToast("后台切换失败");
  }
}
