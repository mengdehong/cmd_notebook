import { getActivePage, getState } from "./store";
import {
  getSelectedBlockId,
  setSelectedBlockId,
} from "./uiState";
import { reorderBlocksWithinPage, reorderCommandsWithinBlock } from "./actions";

const insertLine = document.createElement("div");
insertLine.className = "insert-line";
document.body.appendChild(insertLine);

let draggingCommand: { blockId: string; cmdId: string } | null = null;
let draggingBlock: {
  pageId: string;
  blockId: string;
  targetId: string | null;
  position: "before" | "after";
  grid: HTMLElement;
  sourceCard: HTMLElement;
} | null = null;
let dragContext: {
  blockId: string;
  cmdId: string;
  body: HTMLElement;
  sourceRow: HTMLElement;
  targetCmdId: string | null;
  position: "before" | "after";
} | null = null;

function resetDragContext(): void {
  draggingCommand = null;
  dragContext = null;
  insertLine.style.display = "none";
  document.removeEventListener("pointermove", handleCommandPointerMove);
}

function handleCommandPointerMove(event: PointerEvent): void {
  if (!dragContext) return;
  const { body, cmdId } = dragContext;
  const rows = Array.from(body.querySelectorAll<HTMLElement>(".cmd"));
  let targetCmdId: string | null = null;
  let position: "before" | "after" = "after";

  for (const row of rows) {
    const id = row.dataset.cmdId;
    if (!id || id === cmdId) continue;
    const rect = row.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (event.clientY < mid) {
      targetCmdId = id;
      position = "before";
      insertLine.style.top = `${rect.top - 2}px`;
      insertLine.style.left = `${rect.left}px`;
      insertLine.style.width = `${rect.width}px`;
      insertLine.style.display = "block";
      break;
    }
    targetCmdId = id;
    position = "after";
    insertLine.style.top = `${rect.bottom - 1}px`;
    insertLine.style.left = `${rect.left}px`;
    insertLine.style.width = `${rect.width}px`;
    insertLine.style.display = "block";
  }

  dragContext.targetCmdId = targetCmdId;
  dragContext.position = position;
}

function resetBlockDrag(): void {
  if (draggingBlock) {
    draggingBlock.sourceCard.classList.remove("dragging");
  }
  draggingBlock = null;
  insertLine.style.display = "none";
  document.removeEventListener("pointermove", handleBlockPointerMove);
  document.body.classList.remove("dragging-block");
  const grid = document.getElementById("grid");
  grid?.classList.remove("block-dragging");
  document.querySelectorAll<HTMLElement>(".card").forEach((el) => {
    el.classList.remove("drop-target");
  });
}

function handleBlockPointerMove(event: PointerEvent): void {
  if (!draggingBlock) return;
  const { grid, blockId } = draggingBlock;
  const cards = Array.from(grid.querySelectorAll<HTMLElement>(".card"))
    .filter((card) => card.dataset.blockId && card.dataset.blockId !== blockId);

  if (!cards.length) {
    insertLine.style.display = "none";
    draggingBlock.targetId = null;
    return;
  }

  let targetId: string | null = null;
  let position: "before" | "after" = "after";

  const first = cards[0];
  const last = cards[cards.length - 1];
  const firstRect = first.getBoundingClientRect();
  const lastRect = last.getBoundingClientRect();

  if (event.clientY < firstRect.top) {
    targetId = first.dataset.blockId ?? null;
    position = "before";
    insertLine.style.top = `${firstRect.top - 2}px`;
    insertLine.style.left = `${firstRect.left}px`;
    insertLine.style.width = `${firstRect.width}px`;
    insertLine.style.display = "block";
  } else if (event.clientY > lastRect.bottom) {
    targetId = last.dataset.blockId ?? null;
    position = "after";
    insertLine.style.top = `${lastRect.bottom - 1}px`;
    insertLine.style.left = `${lastRect.left}px`;
    insertLine.style.width = `${lastRect.width}px`;
    insertLine.style.display = "block";
  } else {
    for (const card of cards) {
      const id = card.dataset.blockId;
      if (!id) continue;
      const rect = card.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (event.clientY < mid) {
        targetId = id;
        position = "before";
        insertLine.style.top = `${rect.top - 2}px`;
        insertLine.style.left = `${rect.left}px`;
        insertLine.style.width = `${rect.width}px`;
        insertLine.style.display = "block";
        break;
      }
      targetId = id;
      position = "after";
      insertLine.style.top = `${rect.bottom - 1}px`;
      insertLine.style.left = `${rect.left}px`;
      insertLine.style.width = `${rect.width}px`;
      insertLine.style.display = "block";
    }
  }

  draggingBlock.targetId = targetId;
  draggingBlock.position = position;
}

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

  grid.innerHTML = "";

  if (!activePage) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "暂无页面，点击「＋ 新建页」开始";
    grid.appendChild(empty);
    updateCardSelection(grid);
    return;
  }

  if (!blocks.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "暂无区块，点击「新建区块」开始";
    grid.appendChild(empty);
    updateCardSelection(grid);
    return;
  }

  blocks.forEach((block) => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.blockId = block.id;
    card.dataset.role = "block";
    card.draggable = false;
    card.tabIndex = 0;

    card.addEventListener("click", () => {
      setSelectedBlockId(block.id);
      updateCardSelection(grid);
    });

    card.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || draggingCommand) return;
      const target = event.target as HTMLElement;
      if (
        target.closest(".resize-handle") ||
        target.closest("button") ||
        target.closest(".cmd")
      ) {
        return;
      }
      event.preventDefault();
      draggingBlock = {
        pageId: activePage.id,
        blockId: block.id,
        targetId: null,
        position: "after",
        grid,
        sourceCard: card,
      };
      card.classList.add("dragging");
      document.body.classList.add("dragging-block");
      grid.classList.add("block-dragging");
      document.addEventListener("pointermove", handleBlockPointerMove);

      const handlePointerUp = () => {
        if (draggingBlock && draggingBlock.targetId && draggingBlock.targetId !== draggingBlock.blockId) {
          reorderBlocksWithinPage(
            draggingBlock.pageId,
            draggingBlock.blockId,
            draggingBlock.targetId,
            draggingBlock.position
          );
        }
        resetBlockDrag();
      };

      document.addEventListener("pointerup", handlePointerUp, { once: true });
    });

    if (block.id === getSelectedBlockId()) {
      card.classList.add("selected");
    }

    if (typeof block.width === "number") {
      card.style.width = `${block.width}px`;
      card.style.flexGrow = "0";
    }

    if (typeof block.height === "number") {
      card.style.height = `${block.height}px`;
      card.style.minHeight = `${block.height}px`;
    }

    // Resize handles
    const resizeHandleX = document.createElement("div");
    resizeHandleX.className = "resize-handle resize-handle-x";
    resizeHandleX.dataset.blockId = block.id;
    resizeHandleX.dataset.direction = "width";
    card.appendChild(resizeHandleX);

    const resizeHandleY = document.createElement("div");
    resizeHandleY.className = "resize-handle resize-handle-y";
    resizeHandleY.dataset.blockId = block.id;
    resizeHandleY.dataset.direction = "height";
    card.appendChild(resizeHandleY);

    const header = document.createElement("div");
    header.className = "card-header";

    const titleWrap = document.createElement("div");
    titleWrap.style.display = "flex";
    titleWrap.style.alignItems = "center";
    titleWrap.style.gap = "6px";

    const titleDiv = document.createElement("div");
    titleDiv.className = "card-title";
    titleDiv.textContent = block.title || "未命名区块";
    if (block.titleColor) {
      titleDiv.style.color = block.titleColor;
    }

    const colorBtn = document.createElement("button");
    colorBtn.className = "color-toggle compact";
    colorBtn.dataset.action = "toggle-color";
    colorBtn.dataset.blockId = block.id;
    colorBtn.title = "切换标题颜色";
    if (block.titleColor) {
      colorBtn.style.background = block.titleColor;
      colorBtn.style.borderColor = block.titleColor;
    }

    titleWrap.append(colorBtn, titleDiv);

    const headerActions = document.createElement("div");
    headerActions.style.display = "flex";
    headerActions.style.alignItems = "center";
    headerActions.style.gap = "8px";

    const addCmd = document.createElement("button");
    addCmd.className = "add-cmd-btn";
    addCmd.dataset.action = "add-command";
    addCmd.dataset.blockId = block.id;
    addCmd.title = "添加命令";
    addCmd.textContent = "＋";

    headerActions.append(addCmd);
    header.append(titleWrap, headerActions);

    const body = document.createElement("div");
    body.className = "card-body";

    // Body drag handlers are unused with custom pointer-based drag

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
        row.draggable = true;

        const icon = document.createElement("small");
        icon.textContent = "⎘";

        const textDiv = document.createElement("div");
        textDiv.className = "text";
        textDiv.textContent = cmd.text;

        row.append(icon, textDiv);

        if (cmd.note) {
          const noteDiv = document.createElement("div");
          noteDiv.className = "cmd-note";
          noteDiv.textContent = cmd.note;
          row.appendChild(noteDiv);
        }

        row.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          const bodyEl = row.closest<HTMLElement>(".card-body");
          if (!bodyEl) return;
          event.preventDefault();
          draggingCommand = { blockId: block.id, cmdId: cmd.id };
          dragContext = {
            blockId: block.id,
            cmdId: cmd.id,
            body: bodyEl,
            sourceRow: row,
            targetCmdId: null,
            position: "after",
          };
          card.draggable = false;
          row.classList.add("dragging");

          const handlePointerUp = (e: PointerEvent) => {
            const ctx = dragContext;
            if (ctx && ctx.targetCmdId && ctx.targetCmdId !== ctx.cmdId) {
              reorderCommandsWithinBlock(ctx.blockId, ctx.cmdId, ctx.targetCmdId, ctx.position);
            }
            row.classList.remove("dragging");
            insertLine.style.display = "none";
            card.draggable = true;
            resetDragContext();
            e.stopPropagation();
          };

          document.addEventListener("pointermove", handleCommandPointerMove);
          document.addEventListener("pointerup", handlePointerUp, { once: true });
        });

        body.appendChild(row);
      }
    }

    card.append(header, body);
    grid.appendChild(card);
  });

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
