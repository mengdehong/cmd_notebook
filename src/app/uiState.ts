let selectedBlockId: string | null = null;
let editingCommand = false;
let focusMode = false;
let focusedIndex = 0;

export function getSelectedBlockId(): string | null {
  return selectedBlockId;
}

export function setSelectedBlockId(id: string | null): void {
  selectedBlockId = id;
}

export function isEditingCommand(): boolean {
  return editingCommand;
}

export function setEditingCommand(value: boolean): void {
  editingCommand = value;
}

export function isFocusMode(): boolean {
  return focusMode;
}

export function setFocusMode(value: boolean): void {
  focusMode = value;
}

export function getFocusedIndex(): number {
  return focusedIndex;
}

export function setFocusedIndex(index: number): void {
  focusedIndex = index;
}

export function resetUiState(): void {
  selectedBlockId = null;
  editingCommand = false;
  focusMode = false;
  focusedIndex = 0;
}
