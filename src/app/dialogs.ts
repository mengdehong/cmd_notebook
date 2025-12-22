interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  multiline?: boolean;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  showCancel?: boolean;
}

interface ChoiceOptions {
  title: string;
  message: string;
  choices: { label: string; value: string; primary?: boolean }[];
}

let isOpen = false;
let resolveRef: ((value: string | null) => void) | null = null;

let overlay: HTMLDivElement | null = null;
let titleEl: HTMLElement | null = null;
let messageEl: HTMLElement | null = null;
let bodyEl: HTMLElement | null = null;
let cancelBtn: HTMLButtonElement | null = null;
let confirmBtn: HTMLButtonElement | null = null;
let backdropEl: HTMLElement | null = null;

let confirmListener: ((event: MouseEvent) => void) | null = null;
let cancelListener: ((event: Event) => void) | null = null;
let backdropListener: ((event: Event) => void) | null = null;

export function isDialogOpen(): boolean {
  return isOpen;
}

function removeListeners(): void {
  if (confirmListener && confirmBtn) {
    confirmBtn.removeEventListener("click", confirmListener);
  }
  if (cancelListener && cancelBtn) {
    cancelBtn.removeEventListener("click", cancelListener);
  }
  if (backdropListener && backdropEl) {
    backdropEl.removeEventListener("click", backdropListener);
  }
  confirmListener = null;
  cancelListener = null;
  backdropListener = null;
}

function ensureElements(): boolean {
  if (
    !overlay ||
    !titleEl ||
    !messageEl ||
    !bodyEl ||
    !cancelBtn ||
    !confirmBtn
  ) {
    overlay = document.getElementById("dialogOverlay") as HTMLDivElement | null;
    titleEl = document.getElementById("dialogTitle") as HTMLElement | null;
    messageEl = document.getElementById("dialogMessage") as HTMLElement | null;
    bodyEl = document.getElementById("dialogBody") as HTMLElement | null;
    cancelBtn = document.getElementById("dialogCancel") as HTMLButtonElement | null;
    confirmBtn = document.getElementById("dialogConfirm") as HTMLButtonElement | null;
    backdropEl = overlay?.querySelector<HTMLElement>("[data-modal-dismiss]") ?? null;
  }
  return Boolean(overlay && titleEl && messageEl && bodyEl && cancelBtn && confirmBtn);
}

function closeDialog(value: string | null): void {
  if (!overlay) return;
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
  removeListeners();
  document.removeEventListener("keydown", handleKeydown, true);
  if (resolveRef) {
    const resolved = value && value.trim().length ? value : null;
    resolveRef(resolved);
  }
  resolveRef = null;
  isOpen = false;
}

function handleKeydown(event: KeyboardEvent): void {
  if (!isOpen) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeDialog(null);
  } else if (event.key === "Enter") {
    const field = bodyEl?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea"
    );
    if (field && field.tagName === "TEXTAREA" && event.shiftKey) {
      return;
    }
    event.preventDefault();
    confirmCurrent();
  }
}

function confirmCurrent(): void {
  const field = bodyEl?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    "input, textarea"
  );
  const value = field ? field.value : "";
  closeDialog(value);
}

function cancelCurrent(): void {
  closeDialog(null);
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
  if (!ensureElements() || isOpen) {
    return Promise.resolve(null);
  }

  overlay!.classList.add("open");
  overlay!.setAttribute("aria-hidden", "false");

  titleEl!.textContent = options.title;

  if (options.message) {
    messageEl!.textContent = options.message;
    messageEl!.classList.remove("hidden");
  } else {
    messageEl!.textContent = "";
    messageEl!.classList.add("hidden");
  }

  bodyEl!.innerHTML = "";

  const field = options.multiline
    ? (document.createElement("textarea") as HTMLTextAreaElement)
    : (document.createElement("input") as HTMLInputElement);

  if (!options.multiline) {
    (field as HTMLInputElement).type = "text";
  }

  field.placeholder = options.placeholder ?? "";
  field.value = options.defaultValue ?? "";
  bodyEl!.appendChild(field);

  confirmBtn!.textContent = options.confirmLabel ?? "确定";
  cancelBtn!.textContent = options.cancelLabel ?? "取消";

  removeListeners();

  confirmListener = () => {
    confirmCurrent();
  };

  cancelListener = () => {
    cancelCurrent();
  };

  backdropListener = () => {
    cancelCurrent();
  };

  confirmBtn!.addEventListener("click", confirmListener, { once: true });
  cancelBtn!.addEventListener("click", cancelListener, { once: true });
  if (backdropEl) {
    backdropEl.addEventListener("click", backdropListener, { once: true });
  }

  field.focus();
  if (field instanceof HTMLInputElement) {
    field.setSelectionRange(0, field.value.length);
  } else {
    field.selectionStart = 0;
    field.selectionEnd = field.value.length;
  }

  isOpen = true;

  const promise = new Promise<string | null>((resolve) => {
    resolveRef = (value) => {
      removeListeners();
      resolve(value);
    };
  });

  document.addEventListener("keydown", handleKeydown, true);

  return promise;
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (!ensureElements() || isOpen) {
    return Promise.resolve(false);
  }

  overlay!.classList.add("open");
  overlay!.setAttribute("aria-hidden", "false");

  titleEl!.textContent = options.title;
  messageEl!.textContent = options.message;
  messageEl!.classList.remove("hidden");

  bodyEl!.innerHTML = "";

  confirmBtn!.textContent = options.confirmLabel ?? "确定";
  cancelBtn!.textContent = options.cancelLabel ?? "取消";

  if (options.showCancel === false) {
    cancelBtn!.classList.add("hidden");
  } else {
    cancelBtn!.classList.remove("hidden");
  }

  removeListeners();

  let result = false;

  confirmListener = () => {
    result = true;
    closeDialogConfirm();
  };

  cancelListener = () => {
    closeDialogConfirm();
  };

  backdropListener = () => {
    closeDialogConfirm();
  };

  confirmBtn!.addEventListener("click", confirmListener, { once: true });
  cancelBtn!.addEventListener("click", cancelListener, { once: true });
  if (backdropEl) {
    backdropEl.addEventListener("click", backdropListener, { once: true });
  }

  isOpen = true;

  return new Promise<boolean>((resolve) => {
    resolveRef = () => {
      removeListeners();
      cancelBtn!.classList.remove("hidden");
      resolve(result);
    };
  });

  function closeDialogConfirm(): void {
    if (!overlay) return;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    removeListeners();
    if (resolveRef) {
      resolveRef(null);
    }
    resolveRef = null;
    isOpen = false;
  }
}

export function choiceDialog(options: ChoiceOptions): Promise<string | null> {
  if (!ensureElements() || isOpen) {
    return Promise.resolve(null);
  }

  overlay!.classList.add("open");
  overlay!.setAttribute("aria-hidden", "false");

  titleEl!.textContent = options.title;
  messageEl!.textContent = options.message;
  messageEl!.classList.remove("hidden");

  bodyEl!.innerHTML = "";

  // 隐藏默认按钮
  confirmBtn!.classList.add("hidden");
  cancelBtn!.classList.add("hidden");

  removeListeners();

  let result: string | null = null;
  const buttonListeners: { btn: HTMLButtonElement; handler: () => void }[] = [];

  // 创建选项按钮
  const btnContainer = document.createElement("div");
  btnContainer.className = "choice-buttons";

  for (const choice of options.choices) {
    const btn = document.createElement("button");
    btn.textContent = choice.label;
    btn.className = choice.primary ? "primary" : "";
    const handler = () => {
      result = choice.value;
      closeChoiceDialog();
    };
    btn.addEventListener("click", handler, { once: true });
    buttonListeners.push({ btn, handler });
    btnContainer.appendChild(btn);
  }

  bodyEl!.appendChild(btnContainer);

  backdropListener = () => {
    closeChoiceDialog();
  };

  if (backdropEl) {
    backdropEl.addEventListener("click", backdropListener, { once: true });
  }

  isOpen = true;

  return new Promise<string | null>((resolve) => {
    resolveRef = () => {
      // 清理按钮监听
      for (const { btn, handler } of buttonListeners) {
        btn.removeEventListener("click", handler);
      }
      removeListeners();
      confirmBtn!.classList.remove("hidden");
      cancelBtn!.classList.remove("hidden");
      resolve(result);
    };
  });

  function closeChoiceDialog(): void {
    if (!overlay) return;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    if (resolveRef) {
      resolveRef(null);
    }
    resolveRef = null;
    isOpen = false;
  }
}
