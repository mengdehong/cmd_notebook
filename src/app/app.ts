import { render } from "./render";
import { loadInitialState, subscribe } from "./store";
import { setupInteractions } from "./interactions";

let unsubscribe: (() => void) | null = null;

export async function initApp(): Promise<void> {
  await loadInitialState();
  render();
  if (unsubscribe) {
    unsubscribe();
  }
  unsubscribe = subscribe(render);
  setupInteractions();
}
