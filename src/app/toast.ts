interface ToastOptions {
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

let toastEl: HTMLElement | null = null;
let hideTimer: number | null = null;
let actionButton: HTMLButtonElement | null = null;
let currentAction: (() => void) | null = null;

function ensureToast(): HTMLElement | null {
  if (toastEl) return toastEl;
  toastEl = document.getElementById("toast");
  return toastEl;
}

function cleanupAction(): void {
  if (actionButton && currentAction) {
    actionButton.removeEventListener("click", currentAction);
  }
  actionButton = null;
  currentAction = null;
}

export function showToast(message: string, options: ToastOptions = {}): void {
  const el = ensureToast();
  if (!el) return;

  if (hideTimer) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
  cleanupAction();

  el.innerHTML = "";

  const textSpan = document.createElement("span");
  textSpan.textContent = message;
  el.appendChild(textSpan);

  if (options.actionLabel && options.onAction) {
    const button = document.createElement("button");
    button.className = "toast-action";
    button.type = "button";
    button.textContent = options.actionLabel;
    const handler = () => {
      options.onAction?.();
      hideToast();
    };
    currentAction = handler;
    actionButton = button;
    button.addEventListener("click", handler);
    el.appendChild(button);
  }

  el.style.display = "inline-flex";

  const duration = options.duration ?? (options.actionLabel ? 4000 : 1200);
  hideTimer = window.setTimeout(() => {
    hideToast();
  }, duration);
}

export function hideToast(): void {
  if (!toastEl) return;
  toastEl.style.display = "none";
  if (hideTimer) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
  cleanupAction();
}
