import { getActivePage, getState } from "./store";
import {
  getFocusedIndex,
  getSelectedBlockId,
  isFocusMode,
  setFocusedIndex,
  setFocusMode,
  setSelectedBlockId,
} from "./uiState";
import { clamp } from "./utils";
import { reorderBlocksWithinPage } from "./actions";

const MEASURE_WIDTH = 820;
const MIN_FOCUS_HEIGHT = 180;
const MAX_FOCUS_HEIGHT = 2000;
const MIN_FOCUS_WIDTH = 320;
const MAX_FOCUS_WIDTH = 1200;
const FOCUS_JITTER_TOLERANCE = 4;

const insertLine = document.createElement("div");
insertLine.className = "insert-line";
document.body.appendChild(insertLine);

let currentFocusHeight = 0;
let currentFocusWidth = 0;

export function render(): void {
  renderPageList();

  const grid = document.getElementById("grid") as HTMLDivElement | null;
  if (!grid) return;

  const activePage = getActivePage();
  const blocks = activePage?.blocks ?? [];
  const selectedId = getSelectedBlockId();
  if (selectedId && !blocks.some((b) => b.id === selectedId)) {
    setSelectedBlockId(null);
  }

  if (isFocusMode() && !blocks.length) {
    setFocusMode(false);
  }

  const focusIndex = getFocusedIndex();
  if (isFocusMode() && focusIndex >= blocks.length) {
    setFocusedIndex(Math.max(0, blocks.length - 1));
  }

  grid.innerHTML = "";

  const appEl = document.getElementById("app") as HTMLElement | null;
  if (isFocusMode()) {
    document.body.classList.add("single-view");
    if (appEl) {
      // appEl.style.maxWidth = "880px"; // Let CSS handle it via --focus-width
    }
  } else {
    document.body.classList.remove("single-view");
    if (appEl) {
      appEl.style.maxWidth = "";
    }
  }

  if (!activePage) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "暂无页面，点击「＋ 新建页」开始";
    grid.appendChild(empty);
    resetFocusSize();
    updateCardSelection(grid);
    return;
  }

  if (!blocks.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "暂无区块，点击「新建区块」开始";
    grid.appendChild(empty);
    resetFocusSize();
    updateCardSelection(grid);
    return;
  }

  blocks.forEach((block, index) => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.blockId = block.id;
    card.dataset.role = "block";
    card.draggable = true;
    card.tabIndex = 0;

    card.addEventListener("click", () => {
      setSelectedBlockId(block.id);
      updateCardSelection(grid);
    });

    card.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/plain", block.id);
      event.dataTransfer?.setDragImage(card, 20, 20);
      event.dataTransfer!.effectAllowed = "move";
      card.classList.add("dragging");
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      insertLine.style.display = "none";
      grid.querySelectorAll<HTMLElement>(".card").forEach((el) => {
        el.classList.remove("drop-target");
      });
    });

    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      const y = event.clientY;
      const mid = rect.top + rect.height / 2;
      insertLine.style.display = "block";
      insertLine.style.width = `${rect.width}px`;
      insertLine.style.left = `${rect.left}px`;
      if (y < mid) {
        insertLine.style.top = `${rect.top - 2}px`;
      } else {
        insertLine.style.top = `${rect.bottom - 1}px`;
      }
      card.classList.add("drop-target");
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("drop-target");
      insertLine.style.display = "none";
    });

    card.addEventListener("drop", (event) => {
      event.preventDefault();
      insertLine.style.display = "none";
      card.classList.remove("drop-target");
      const srcId = event.dataTransfer?.getData("text/plain");
      if (!srcId || srcId === block.id) return;
      const rect = card.getBoundingClientRect();
      const y = event.clientY;
      const mid = rect.top + rect.height / 2;
      const before = y < mid;
      reorderBlocksWithinPage(
        activePage.id,
        srcId,
        block.id,
        before ? "before" : "after"
      );
    });

    if (block.id === getSelectedBlockId()) {
      card.classList.add("selected");
    }

    if (block.width && !isFocusMode()) {
      card.style.width = `${block.width}px`;
      card.style.flexGrow = "0";
    }

    if (isFocusMode()) {
      card.classList.toggle("focused", index === getFocusedIndex());
    }

    // Resize handle
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "resize-handle";
    resizeHandle.dataset.blockId = block.id;
    card.appendChild(resizeHandle);

    const header = document.createElement("div");
    header.className = "card-header";

    const titleDiv = document.createElement("div");
    titleDiv.className = "card-title";
    titleDiv.textContent = block.title || "未命名区块";

    const headerActions = document.createElement("div");
    headerActions.style.display = "flex";
    headerActions.style.alignItems = "center";
    headerActions.style.gap = "8px";

    const navContainer = document.createElement("div");
    navContainer.className = "nav-arrows";
    navContainer.style.display = isFocusMode() ? "flex" : "none";

    const navLeft = document.createElement("button");
    navLeft.className = "nav-left";
    navLeft.dataset.action = "nav-left";
    navLeft.dataset.blockId = block.id;
    navLeft.title = "上一块";
    navLeft.textContent = "◀";

    const navRight = document.createElement("button");
    navRight.className = "nav-right";
    navRight.dataset.action = "nav-right";
    navRight.dataset.blockId = block.id;
    navRight.title = "下一块";
    navRight.textContent = "▶";

    navContainer.append(navLeft, navRight);

    const addCmd = document.createElement("button");
    addCmd.className = "add-cmd-btn";
    addCmd.dataset.action = "add-command";
    addCmd.dataset.blockId = block.id;
    addCmd.title = "添加命令";
    addCmd.textContent = "＋";

    headerActions.append(navContainer, addCmd);
    header.append(titleDiv, headerActions);

    const body = document.createElement("div");
    body.className = "card-body";

    if (!block.cmds.length) {
      const empty = document.createElement("div");
      empty.className = "empty muted";
      empty.textContent = "此区块还没有命令，右键这里添加";
      body.appendChild(empty);
    } else {
      for (const cmd of block.cmds) {
        const row = document.createElement("div");
        row.className = "cmd";
        row.dataset.blockId = block.id;
        row.dataset.cmdId = cmd.id;
        row.dataset.role = "command";

        const icon = document.createElement("small");
        icon.textContent = "⎘";

        const textDiv = document.createElement("div");
        textDiv.className = "text";
        textDiv.textContent = cmd.text;

        row.append(icon, textDiv);
        body.appendChild(row);
      }
    }

    card.append(header, body);
    grid.appendChild(card);
  });

  if (isFocusMode()) {
    requestAnimationFrame(() => measureFocusSize(grid));
  } else {
    resetFocusSize();
  }

  updateCardSelection(grid);
}

function updateCardSelection(grid: HTMLElement): void {
  const selected = getSelectedBlockId();
  grid.querySelectorAll<HTMLElement>(".card").forEach((card) => {
    card.classList.toggle(
      "selected",
      Boolean(selected) && card.dataset.blockId === selected
    );
  });
}

function resetFocusSize(): void {
  document.documentElement.style.removeProperty("--focus-height");
  document.documentElement.style.removeProperty("--focus-width");
  currentFocusHeight = 0;
  currentFocusWidth = 0;
}

function measureFocusSize(grid: HTMLElement): void {
  const cards = Array.from(grid.querySelectorAll<HTMLElement>(".card"));
  const focused =
    cards.find((card) => card.classList.contains("focused")) ??
    cards[getFocusedIndex()];
  if (!focused) return;

  const root = document.documentElement;
  
  // Measure Width
  const cloneW = focused.cloneNode(true) as HTMLElement;
  cloneW.style.position = "absolute";
  cloneW.style.visibility = "hidden";
  cloneW.style.display = "block";
  cloneW.style.width = "auto";
  cloneW.style.maxWidth = "none";
  cloneW.style.height = "auto";
  document.body.appendChild(cloneW);
  
  // Find max command length to estimate width
  const cmds = Array.from(cloneW.querySelectorAll(".cmd .text"));
  let maxTextWidth = 0;
  cmds.forEach(cmd => {
      const range = document.createRange();
      range.selectNodeContents(cmd);
      const rect = range.getBoundingClientRect();
      if (rect.width > maxTextWidth) maxTextWidth = rect.width;
  });
  
  // Add padding
  const estimatedWidth = maxTextWidth + 60; // padding + icon
  document.body.removeChild(cloneW);

  const measuredWidth = clamp(
      Math.round(estimatedWidth),
      MIN_FOCUS_WIDTH,
      MAX_FOCUS_WIDTH
  );

  if (Math.abs(measuredWidth - currentFocusWidth) > FOCUS_JITTER_TOLERANCE) {
      currentFocusWidth = measuredWidth;
      root.style.setProperty("--focus-width", `${currentFocusWidth}px`);
  }

  // Measure Height (using the calculated width)
  const appEl = document.getElementById("app") as HTMLElement | null;
  const containerWidth = appEl ? Math.floor(appEl.clientWidth) : MEASURE_WIDTH;
  // Use the calculated focus width if available, otherwise container width
  const measureWidth = currentFocusWidth || Math.min(MEASURE_WIDTH, containerWidth || MEASURE_WIDTH);

  const cloneH = focused.cloneNode(true) as HTMLElement;
  cloneH.style.position = "absolute";
  cloneH.style.visibility = "hidden";
  cloneH.style.display = "block";
  cloneH.style.width = `${measureWidth}px`;
  cloneH.style.left = "0";
  cloneH.style.top = "0";
  cloneH.style.minHeight = "0"; // Override min-height from class
  
  // Also reset children that might have min-height dependent on the variable
  const body = cloneH.querySelector('.card-body') as HTMLElement;
  if (body) {
      body.style.minHeight = "0";
  }

  document.body.appendChild(cloneH);
  const measuredHeightRaw = cloneH.getBoundingClientRect().height;
  document.body.removeChild(cloneH);

  const measuredHeight = clamp(
    Math.round(measuredHeightRaw || 0),
    MIN_FOCUS_HEIGHT,
    MAX_FOCUS_HEIGHT
  );

  if (Math.abs(measuredHeight - currentFocusHeight) > FOCUS_JITTER_TOLERANCE) {
    currentFocusHeight = measuredHeight;
    root.style.setProperty("--focus-height", `${currentFocusHeight}px`);
  }
}

function renderPageList(): void {
  const list = document.getElementById("pageList") as HTMLDivElement | null;
  if (!list) return;
  const state = getState();
  const activeId = state.activePageId;
  const prevScroll = list.scrollTop;
  list.innerHTML = "";

  const newItem = document.createElement("div");
  newItem.className = "page-item new";
  newItem.dataset.role = "page-new";
  newItem.textContent = "＋ 新建页面";
  list.appendChild(newItem);

  state.pages.forEach((page) => {
    const item = document.createElement("div");
    item.className = "page-item";
    item.dataset.pageId = page.id;
    item.dataset.role = "page-item";
    item.draggable = true;
    item.textContent = page.name || "未命名页";
    if (page.id === activeId) {
      item.classList.add("active");
    }
    list.appendChild(item);
  });

  list.scrollTop = prevScroll;
}
