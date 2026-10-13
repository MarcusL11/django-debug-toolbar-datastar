import { renderProjection, setStatus, setText } from "./display.js";
import { handleInput, handleKeyDown, resetSearch, updateMatches } from "./search.js";

const panelId = "DatastarStorePanel";
const waitMs = 2_000;
let toolbar;
let shellObserver;
let bodyObserver;
let collector;
let collectorObserver;
let pendingTimer;
let attachedContent;
let projectionText = "";

function sync() {
  // Attach to the current toolbar and keep one collector for its panel.
  // Checks whether the toolbar and our panel exist. It starts a collector 
  // for a new panel or stops the old one. If the panel already exists, it calls render(), 
  // which returns without changing the display when the JSON has not changed.
  const nextToolbar = currentToolbar();
  if (nextToolbar !== toolbar) {
    stopCollector();
    shellObserver?.disconnect();
    toolbar?.removeEventListener("djdt.panel.render", onPanelRender);
    toolbar?.removeEventListener("input", onInput);
    toolbar?.removeEventListener("keydown", onKeyDown);
    toolbar = nextToolbar;
    if (toolbar) {
      toolbar.addEventListener("djdt.panel.render", onPanelRender);
      toolbar.addEventListener("input", onInput);
      toolbar.addEventListener("keydown", onKeyDown);
      shellObserver = new MutationObserver(sync);
      shellObserver.observe(toolbar, { childList: true, subtree: true });
    }
  }
  const panel = content();
  if (!panel) {
    stopCollector();
    return;
  }
  if (panel !== attachedContent) {
    stopCollector();
    attachedContent = panel;
    startCollector();
  } else {
    render();
  }
}

function currentToolbar() {
  // Find the current Debug Toolbar in the host or its shadow root.
  const host = document.getElementById("djDebugRoot");
  return (host?.shadowRoot ?? host)?.querySelector("#djDebug") ?? null;
}

function content() {
  // Find this panel's content in the current toolbar.
  return (
    toolbar?.querySelector(`#${panelId} [data-datastar-store-panel]`) ??
    null
  );
}

function render() {
  // Read new collector text, parse it, and show the result or an error.
  const panel = content();
  if (!panel || !collector) return;
  const text = collector.textContent;
  if (!text || text === projectionText) return;
  let projection;
  try {
    projection = JSON.parse(text);
  } catch {
    projectionText = "";
    clearTimeout(pendingTimer);
    setStatus(
      panel,
      "Invalid JSON projection. The panel cleared the previous display."
    );
    setText(panel.querySelector("[data-datastar-store-output]"), "");
    updateMatches(panel, Boolean(projectionText));
    return;
  }
  projectionText = text;
  clearTimeout(pendingTimer);
  setStatus(panel, "");
  if (renderProjection(panel, projection))
    updateMatches(panel, Boolean(projectionText));
}

function onInput(event) {
  // Give search the active panel and its projection status.
  handleInput(event, content(), Boolean(projectionText));
}

function onKeyDown(event) {
  // Give search the active panel for keyboard navigation.
  handleKeyDown(event, content());
}

function stopCollector() {
  // Remove the collector and its observer, then clear panel state.
  clearTimeout(pendingTimer);
  collectorObserver?.disconnect();
  collectorObserver = null;
  collector?.remove();
  collector = null;
  attachedContent = null;
  projectionText = "";
  resetSearch();
}

function startCollector() {
  // Create the hidden JSON collector and watch it for changes.
  setStatus(content(), "Waiting for Datastar signal data…");
  collector = document.createElement("pre");
  collector.hidden = true;
  collector.setAttribute("data-json-signals__terse", "");
  collector.setAttribute("data-djdt-datastar-collector", "");
  // Datastar observes the host's light DOM, not the toolbar's shadow root.
  document.body.append(collector);
  collectorObserver = new MutationObserver(render);
  collectorObserver.observe(collector, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  pendingTimer = setTimeout(() => {
    if (collector && collector.textContent === "") {
      setStatus(
        content(),
        "Still waiting for Datastar signal data…"
      );
    }
  }, waitMs);
  render();
}

function onPanelRender(event) {
  // Check this panel when the toolbar adds its HTML.
  // If the ID is DatastarStorePanel, it calls sync()
  if (event.detail?.panelId === panelId) sync();
}

function watchBody() {
  // Watch for a body change, then ask sync() to find the toolbar
  bodyObserver?.disconnect();
  bodyObserver = new MutationObserver(sync);
  if (document.body) bodyObserver.observe(document.body, { childList: true });
  sync();
}

// Module scripts can execute before eager panel markup or after lazy render's event.
// Future patch history needs a listener before the first patch.
// Lazy panels can load this script after users open the panel, so this script cannot recover earlier patch events.
const documentObserver = new MutationObserver(watchBody);
documentObserver.observe(document.documentElement, { childList: true });
watchBody();
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", watchBody, { once: true });
