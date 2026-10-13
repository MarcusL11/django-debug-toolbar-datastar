import { setText } from "./display.js";

let matches = [];
let currentMatch = 0;

export function updateMatches(panel, hasProjection) {
  // Mark matching names and paths without hiding other values.
  const count = panel.querySelector("[data-datastar-store-match-count]");
  const query = panel
    .querySelector("[data-datastar-store-search]")
    ?.value.trim()
    .toLocaleLowerCase();
  matches = [];
  currentMatch = 0;
  if (count) count.hidden = !query || !hasProjection;
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
  if (query && hasProjection) showCurrentMatch(panel);
}

export function handleInput(event, panel, hasProjection) {
  // Refresh the search results only when the search field changes.
  if (event.target === panel?.querySelector("[data-datastar-store-search]"))
    updateMatches(panel, hasProjection);
}

export function handleKeyDown(event, panel) {
  // Use Enter to move through matches, and Shift+Enter to move back.
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

export function resetSearch() {
  // Clear matches when the toolbar changes or removes the panel.
  matches = [];
  currentMatch = 0;
}
function showCurrentMatch(panel) {
  // Mark the selected match, show its count, and scroll to it.
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


