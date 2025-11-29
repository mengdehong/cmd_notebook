let selectedBlockId: string | null = null;
let editingCommand = false;

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

export function resetUiState(): void {
  selectedBlockId = null;
  editingCommand = false;
}
