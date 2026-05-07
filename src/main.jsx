import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";

async function disableLegacyServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
  } catch (_) {
    // Ignore cleanup errors; app should continue booting.
  }
}

disableLegacyServiceWorkers();

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <App />
  );
}
