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
let matches = [];
let currentMatch = 0;

function currentToolbar() {
  const host = document.getElementById("djDebugRoot");
  return (host?.shadowRoot ?? host)?.querySelector("#djDebug") ?? null;
}

function content() {
  return (
    toolbar?.querySelector(`#${panelId} [data-datastar-store-panel]`) ??
    null
  );
}

function setText(node, text) {
  if (node && node.textContent !== text) node.textContent = text;
}

function setStatus(panel, text) {
  const status = panel?.querySelector("[data-datastar-store-status]");
  setText(status, text);
  if (status) status.hidden = !text;
}

function isBranch(value) {
  return value !== null && typeof value === "object";
}

function entries(value) {
  return Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : Object.entries(value);
}

function displayPath(parent, key) {
  if (typeof key === "number") return `${parent}[${key}]`;
  const part = /^[a-zA-Z_$][\w$]*$/.test(key)
    ? key
    : `[${JSON.stringify(key)}]`;
  return parent
    ? part.startsWith("[")
      ? `${parent}${part}`
      : `${parent}.${part}`
    : part;
}

function keyMarker(key, path) {
  const marker = document.createElement("span");
  marker.dataset.datastarStorePath = path;
  marker.dataset.datastarStoreKey =
    typeof key === "number" ? `[${key}]` : key;
  return marker;
}

function appendJsonValue(parent, value, path, depth, marker) {
  if (!isBranch(value)) {
    const text = JSON.stringify(value);
    if (marker) {
      marker.textContent = text;
      parent.append(marker);
    } else {
      parent.append(text);
    }
    return;
  }

  const array = Array.isArray(value);
  const children = entries(value);
  const opening = array ? "[" : "{";
  if (marker) {
    marker.textContent = opening;
    parent.append(marker);
  } else {
    parent.append(opening);
  }
  for (const [index, [key, child]] of children.entries()) {
    const childPath = displayPath(path, key);
    const childMarker = keyMarker(key, childPath);
    parent.append("\n", "  ".repeat(depth + 1));
    if (array) {
      appendJsonValue(parent, child, childPath, depth + 1, childMarker);
    } else {
      childMarker.textContent = JSON.stringify(key);
      parent.append(childMarker, ": ");
      appendJsonValue(parent, child, childPath, depth + 1);
    }
    if (index < children.length - 1) parent.append(",");
  }
  if (children.length) parent.append("\n", "  ".repeat(depth));
  parent.append(array ? "]" : "}");
}

function showCurrentMatch(panel) {
  for (const match of matches)
    match.classList.remove("djdt-datastar-current-match");
  const count = panel.querySelector("[data-datastar-store-match-count]");
  setText(
    count,
    matches.length
      ? `${currentMatch + 1} of ${matches.length} matching paths (Enter for next)`
      : "No matching signal names or paths."
  );
  if (matches.length) {
    matches[currentMatch].classList.add("djdt-datastar-current-match");
    if (panel.getClientRects().length)
      matches[currentMatch].scrollIntoView({ block: "nearest" });
  }
}

function updateMatches(panel) {
  const count = panel.querySelector("[data-datastar-store-match-count]");
  const query = panel
    .querySelector("[data-datastar-store-search]")
    ?.value.trim()
    .toLocaleLowerCase();
  matches = [];
  currentMatch = 0;
  if (count) count.hidden = !query || !projectionText;
  for (const marker of panel.querySelectorAll("[data-datastar-store-path]")) {
    const matchesQuery =
      Boolean(query) &&
      (marker.dataset.datastarStorePath
        .toLocaleLowerCase()
        .includes(query) ||
        marker.dataset.datastarStoreKey
          .toLocaleLowerCase()
          .includes(query));
    marker.classList.toggle("djdt-datastar-match", matchesQuery);
    marker.classList.remove("djdt-datastar-current-match");
    if (matchesQuery) matches.push(marker);
  }
  if (query && projectionText) showCurrentMatch(panel);
}

function renderProjection(panel, value) {
  const output = panel.querySelector("[data-datastar-store-output]");
  if (!output) return;
  const fragment = document.createDocumentFragment();
  appendJsonValue(fragment, value, "", 0);
  output.replaceChildren(fragment);
  output.hidden = false;
  updateMatches(panel);
}

function render() {
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
      "Projection unavailable (cause unknown). The previous display has been cleared."
    );
    setText(panel.querySelector("[data-datastar-store-output]"), "");
    updateMatches(panel);
    return;
  }
  projectionText = text;
  clearTimeout(pendingTimer);
  setStatus(panel, "");
  renderProjection(panel, projection);
}

function onInput(event) {
  const panel = content();
  if (event.target === panel?.querySelector("[data-datastar-store-search]"))
    updateMatches(panel);
}

function onKeyDown(event) {
  const panel = content();
  if (
    event.key !== "Enter" ||
    event.target !== panel?.querySelector("[data-datastar-store-search]") ||
    !matches.length
  )
    return;
  event.preventDefault();
  currentMatch =
    (currentMatch + (event.shiftKey ? -1 : 1) + matches.length) %
    matches.length;
  showCurrentMatch(panel);
}

function stopCollector() {
  clearTimeout(pendingTimer);
  collectorObserver?.disconnect();
  collectorObserver = null;
  collector?.remove();
  collector = null;
  attachedContent = null;
  projectionText = "";
  matches = [];
  currentMatch = 0;
}

function startCollector() {
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
        "Projection unavailable (cause unknown). Datastar may not have processed this element."
      );
    }
  }, waitMs);
  render();
}

function sync() {
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

function onPanelRender(event) {
  if (event.detail?.panelId === panelId) sync();
}

function watchBody() {
  bodyObserver?.disconnect();
  bodyObserver = new MutationObserver(sync);
  if (document.body) bodyObserver.observe(document.body, { childList: true });
  sync();
}

// Module scripts can execute before eager panel markup or after lazy render's event.
const documentObserver = new MutationObserver(watchBody);
documentObserver.observe(document.documentElement, { childList: true });
watchBody();
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", watchBody, { once: true });
