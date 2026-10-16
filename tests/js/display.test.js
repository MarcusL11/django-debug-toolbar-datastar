import { afterEach, describe, expect, it } from "vitest";
import {
  renderProjection,
  setStatus,
  setText,
} from "../../src/django_datastar_toolbar/static/django_datastar_toolbar/js/display.js";

const panels = [];

function panelFixture() {
  const panel = document.createElement("div");
  panel.innerHTML = `
    <p data-datastar-store-status hidden></p>
    <pre data-datastar-store-output hidden></pre>
  `;
  document.body.append(panel);
  panels.push(panel);
  return panel;
}

afterEach(() => {
  panels.splice(0).forEach((panel) => panel.remove());
});

describe("display.js", () => {
  it("renders nested values with searchable paths", () => {
    const panel = panelFixture();
    const output = panel.querySelector("[data-datastar-store-output]");

    expect(
      renderProjection(panel, {
        people: [{ name: "Ada", active: true }, null],
        "space key": { count: 0 },
      })
    ).toBe(true);

    expect(output.hidden).toBe(false);
    expect(output.textContent.startsWith("{")).toBe(true);
    expect(output.textContent.trimEnd().endsWith("}")).toBe(true);
    expect(output.textContent).toContain('"people": [');
    expect(output.textContent).toContain('"space key": {');
    expect(output.textContent).toContain('"active": true');
    expect(output.textContent).toContain("null");
    const markers = [...output.querySelectorAll("[data-datastar-store-path]")];
    const textAt = (path) =>
      markers.find((marker) => marker.dataset.datastarStorePath === path)?.textContent;
    expect(textAt("people[0].name")).toBe('"name"');
    expect(textAt("people[1]")).toBe("null");
    expect(textAt('["space key"].count')).toBe('"count"');
  });

  it("writes HTML-like values as text", () => {
    const panel = panelFixture();
    const output = panel.querySelector("[data-datastar-store-output]");
    const value = '<img src=x onerror="alert(1)">';

    renderProjection(panel, { value });

    expect(output.textContent).toContain(JSON.stringify(value));
    expect(output.querySelector("img")).toBeNull();
  });

  it("updates status text and returns false without output", () => {
    const panel = panelFixture();
    const status = panel.querySelector("[data-datastar-store-status]");

    setStatus(panel, "Waiting for data");
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe("Waiting for data");

    setStatus(panel, "");
    expect(status.hidden).toBe(true);
    setText(null, "ignored");
    panel.querySelector("[data-datastar-store-output]").remove();
    expect(renderProjection(panel, { a: 1 })).toBe(false);
  });
});
