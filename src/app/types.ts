export interface CommandItem {
  id: string;
  text: string;
}

export interface CommandBlock {
  id: string;
  title: string;
  cmds: CommandItem[];
}

export interface CommandPage {
  id: string;
  name: string;
  blocks: CommandBlock[];
}

export interface AppState {
  version: number;
  pages: CommandPage[];
  activePageId: string | null;
}

export const STATE_VERSION = 2;

export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function createDefaultState(): AppState {
  const defaultBlocks: CommandBlock[] = [
    {
      id: uid(),
      title: "Conda 环境管理",
      cmds: [
        { id: uid(), text: "conda create -n name python=3.9" },
        { id: uid(), text: "conda activate <env>" },
        { id: uid(), text: "conda install -c <channel> package" },
        { id: uid(), text: "conda env export > environment.yml" },
        { id: uid(), text: "conda env list" },
        { id: uid(), text: "conda create --name new --clone original  # 克隆环境" },
        { id: uid(), text: "conda env remove --name <env>" },
      ],
    },
    {
      id: uid(),
      title: "Linux 常用命令",
      cmds: [
        { id: uid(), text: "ls -l" },
        { id: uid(), text: "cd /path/to/dir" },
        { id: uid(), text: "cp file1 file2" },
        { id: uid(), text: "mv old new" },
        { id: uid(), text: "rm -rf dir/" },
        { id: uid(), text: "chmod +x script.sh" },
        { id: uid(), text: "ps aux | grep process" },
      ],
    },
  ];

  const defaultPage: CommandPage = {
    id: uid(),
    name: "默认页",
    blocks: defaultBlocks,
  };

  return {
    version: STATE_VERSION,
    pages: [defaultPage],
    activePageId: defaultPage.id,
  };
}

type UnknownRecord = Record<string, unknown>;

function coerceString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function sanitizeBlocks(input: unknown): CommandBlock[] {
  if (!Array.isArray(input)) return [];
  const blocks: CommandBlock[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as UnknownRecord;
    const id = coerceString(record.id, uid()) || uid();
    const title = coerceString(record.title, "");
    const cmdsInput = Array.isArray(record.cmds) ? record.cmds : [];
    const cmds: CommandItem[] = [];
    for (const cmdRaw of cmdsInput) {
      if (!cmdRaw || typeof cmdRaw !== "object") continue;
      const cmdRecord = cmdRaw as UnknownRecord;
      const cmdId = coerceString(cmdRecord.id, uid()) || uid();
      const text = coerceString(cmdRecord.text, "");
      cmds.push({ id: cmdId, text });
    }
    blocks.push({ id, title, cmds });
  }
  return blocks;
}

interface LegacyStateV1 {
  version?: number;
  blocks?: CommandBlock[];
}

export function normalizeState(input: unknown): AppState | null {
  if (!input || typeof input !== "object") return null;
  const record = input as UnknownRecord;

  const rawPages = record.pages;
  let pages: CommandPage[] = [];

  if (Array.isArray(rawPages)) {
    pages = rawPages
      .map((pageRaw) => {
        if (!pageRaw || typeof pageRaw !== "object") return null;
        const pageRecord = pageRaw as UnknownRecord;
        const id = coerceString(pageRecord.id, uid()) || uid();
        const name = coerceString(pageRecord.name, "未命名页").trim() || "未命名页";
        const blocks = sanitizeBlocks(pageRecord.blocks);
        return { id, name, blocks };
      })
      .filter((page): page is CommandPage => Boolean(page && page.blocks));
  } else if (Array.isArray((record as LegacyStateV1).blocks)) {
    const blocks = sanitizeBlocks((record as LegacyStateV1).blocks);
    pages = [
      {
        id: uid(),
        name: "默认页",
        blocks,
      },
    ];
  }

  if (!pages.length) {
    return null;
  }

  const activeCandidate = coerceString(record.activePageId, "");
  const activePage = pages.find((page) => page.id === activeCandidate);
  const activePageId = activePage ? activePage.id : pages[0]?.id ?? null;

  return {
    version: STATE_VERSION,
    pages,
    activePageId,
  };
}
