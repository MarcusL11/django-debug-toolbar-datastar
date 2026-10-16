import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderProjection } from "../../src/django_datastar_toolbar/static/django_datastar_toolbar/js/display.js";
import {
  handleInput,
  handleKeyDown,
  resetSearch,
  updateMatches,
} from "../../src/django_datastar_toolbar/static/django_datastar_toolbar/js/search.js";

let panel;
let input;
let count;

beforeEach(() => {
  resetSearch();
  panel = document.createElement("div");
  panel.innerHTML = `
    <input data-datastar-store-search>
    <span data-datastar-store-match-count hidden></span>
    <pre data-datastar-store-output></pre>
  `;
  document.body.append(panel);
  input = panel.querySelector("[data-datastar-store-search]");
  count = panel.querySelector("[data-datastar-store-match-count]");
  renderProjection(panel, {
    people: [{ name: "Ada" }, { name: "Bob" }],
    theme: "dark",
  });
  panel.addEventListener("input", (event) => handleInput(event, panel, true));
  panel.addEventListener("keydown", (event) => handleKeyDown(event, panel));
});

afterEach(() => {
  resetSearch();
  panel.remove();
});

function search(query) {
  input.value = query;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function currentPath() {
  return panel.querySelector(".djdt-datastar-current-match")?.dataset
    .datastarStorePath;
}

describe("search.js", () => {
  it("marks names and paths without hiding the other values", () => {
    search("  NAME  ");

    expect(count.hidden).toBe(false);
    expect(count.textContent).toContain("1 of 2");
    expect(currentPath()).toBe("people[0].name");
    expect(panel.querySelectorAll(".djdt-datastar-match")).toHaveLength(2);
    expect(panel.querySelector("[data-datastar-store-output]").textContent).toContain("dark");

    search("people[1]");
    expect(panel.querySelectorAll(".djdt-datastar-match")).toHaveLength(2);
    expect(currentPath()).toBe("people[1]");
  });

  it("moves through results with Enter and Shift+Enter", () => {
    search("name");

    const next = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(next);
    expect(next.defaultPrevented).toBe(true);
    expect(currentPath()).toBe("people[1].name");
    expect(count.textContent).toContain("2 of 2");

    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect(currentPath()).toBe("people[0].name");
  });

  it("clears results when the query is empty or has no matches", () => {
    search("missing");
    expect(count.textContent).toBe("No matching signal names or paths.");
    expect(panel.querySelectorAll(".djdt-datastar-match")).toHaveLength(0);

    search(" ");
    expect(count.hidden).toBe(true);
    expect(currentPath()).toBeUndefined();
  });

  it("hides the count when no projection exists", () => {
    input.value = "name";
    updateMatches(panel, false);

    expect(count.hidden).toBe(true);
  });
});
