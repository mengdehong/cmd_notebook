import "./styles.css";
import { initApp } from "./app/app";

window.addEventListener("DOMContentLoaded", () => {
  initApp().catch((error) => {
    console.error("Failed to initialise application", error);
  });
});
