export function setText(node, text) {
  // Write text only when it changes, so the DOM gets fewer changes.
  if (node && node.textContent !== text) node.textContent = text;
}

export function setStatus(panel, text) {
  // Set the status text and hide the line when it is empty.
  const status = panel?.querySelector("[data-datastar-store-status]");
  setText(status, text);
  if (status) status.hidden = !text;
}

export function renderProjection(panel, value) {
  // Build the new display before replacing the old display.
  const output = panel.querySelector("[data-datastar-store-output]");
  if (!output) return false;
  const fragment = document.createDocumentFragment();
  appendJsonValue(fragment, value, "", 0);
  output.replaceChildren(fragment);
  output.hidden = false;
  return true;
}

function appendJsonValue(parent, value, path, depth, marker) {
  // Walk the JSON value and add text and path markers to the display.
  if (!isBranch(value)) {
    appendPrimitive(parent, value, marker);
    return;
  }

  const array = Array.isArray(value);
  const children = entries(value);

  appendOpening(parent, array, marker);

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
  if (children.length) appendIndentNewline(parent, depth);
  appendClosing(parent, array);
}

function isBranch(value) {
  // Treat arrays and non-null objects as JSON branches.
  return value !== null && typeof value === "object";
}

function entries(value) {
  // Pair array items with indexes, or get object key-value pairs.
  return Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : Object.entries(value);
}

function displayPath(parent, key) {
  // Build a readable path for an object key or array index.
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
  // Mark a key with its path so search can find it.
  const marker = document.createElement("span");
  marker.dataset.datastarStorePath = path;
  marker.dataset.datastarStoreKey =
    typeof key === "number" ? `[${key}]` : key;
  return marker;
}

function appendPrimitive(parent, value, marker) {
  const text = JSON.stringify(value);
  if (marker) {
    marker.textContent = text;
    parent.append(marker);
  } else {
    parent.append(text);
  }
}

function appendOpening(parent, array, marker) {
  const opening = array ? "[" : "{";
  if (marker) {
    marker.textContent = opening;
    parent.append(marker);
  } else {
    parent.append(opening);
  }
}

function appendClosing(parent, array) {
  parent.append(array ? "]" : "}");
}

function appendIndentNewline(parent, depth) {
  parent.append("\n", "  ".repeat(depth));
}
