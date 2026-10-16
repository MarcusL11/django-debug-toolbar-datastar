import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const collectorSelector = "[data-djdt-datastar-collector]";

function panelFixture() {
  const container = document.createElement("div");
  container.id = "DatastarStorePanel";
  container.innerHTML = `
    <div data-datastar-store-panel>
      <p data-datastar-store-status hidden></p>
      <input data-datastar-store-search>
      <span data-datastar-store-match-count hidden></span>
      <pre data-datastar-store-output></pre>
    </div>
  `;
  return container;
}

function toolbarFixture({ shadow = false, panel = true } = {}) {
  const host = document.createElement("div");
  host.id = "djDebugRoot";
  const root = shadow ? host.attachShadow({ mode: "open" }) : host;
  const toolbar = document.createElement("div");
  toolbar.id = "djDebug";
  if (panel) toolbar.append(panelFixture());
  root.append(toolbar);
  document.body.append(host);
  return { host, toolbar };
}

function outputOf(toolbar) {
  return toolbar.querySelector("[data-datastar-store-output]");
}

async function collector() {
  await vi.waitFor(() => {
    expect(document.querySelectorAll(collectorSelector)).toHaveLength(1);
  });
  return document.querySelector(collectorSelector);
}

async function sendProjection(value) {
  const node = await collector();
  node.textContent = JSON.stringify(value);
}

beforeAll(async () => {
  await import("../../src/django_datastar_toolbar/static/django_datastar_toolbar/js/datastar_store.js");
});

afterEach(async () => {
  document.getElementById("djDebugRoot")?.remove();
  await vi.waitFor(() => {
    expect(document.querySelector(collectorSelector)).toBeNull();
  });
});

describe("datastar_store.js", () => {
  it("renders collector changes and updates the search results", async () => {
    const { toolbar } = toolbarFixture();
    const input = toolbar.querySelector("[data-datastar-store-search]");
    const count = toolbar.querySelector("[data-datastar-store-match-count]");

    await collector();
    expect(toolbar.querySelector("[data-datastar-store-status]").textContent).toBe(
      "Waiting for Datastar signal data…"
    );
    await sendProjection({ count: 1 });
    await vi.waitFor(() =>
      expect(outputOf(toolbar).textContent).toContain('"count": 1')
    );
    input.value = "count";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(count.textContent).toContain("1 of 1");

    await sendProjection({ count: 2, countExtra: 3 });
    await vi.waitFor(() => expect(outputOf(toolbar).textContent).toContain('"countExtra": 3'));
    expect(count.textContent).toContain("1 of 2");
    expect(document.querySelectorAll(collectorSelector)).toHaveLength(1);
  });

  it("starts when a lazy panel arrives after the toolbar", async () => {
    const { toolbar } = toolbarFixture({ panel: false });
    expect(document.querySelector(collectorSelector)).toBeNull();

    toolbar.append(panelFixture());
    toolbar.dispatchEvent(new CustomEvent("djdt.panel.render", {
      detail: { panelId: "DatastarStorePanel" },
    }));
    await sendProjection({ late: true });

    await vi.waitFor(() => expect(outputOf(toolbar).textContent).toContain('"late": true'));
  });

  it("finds a toolbar in a shadow root", async () => {
    const { toolbar } = toolbarFixture({ shadow: true });
    await sendProjection({ shadow: "visible" });

    expect(document.body.contains(await collector())).toBe(true);
    await vi.waitFor(() =>
      expect(outputOf(toolbar).textContent).toContain('"shadow": "visible"')
    );
  });

  it("clears invalid JSON and shows a status", async () => {
    const { toolbar } = toolbarFixture();
    await sendProjection({ valid: true });
    await vi.waitFor(() => expect(outputOf(toolbar).textContent).toContain('"valid": true'));

    (await collector()).textContent = "{";
    const status = toolbar.querySelector("[data-datastar-store-status]");
    await vi.waitFor(() => expect(status.textContent).toContain("Invalid JSON projection"));
    expect(status.hidden).toBe(false);
    expect(outputOf(toolbar).textContent).toBe("");
  });

  it("replaces the collector when the panel changes", async () => {
    const { toolbar } = toolbarFixture();
    const oldCollector = await collector();
    const oldPanel = toolbar.querySelector("#DatastarStorePanel");
    oldPanel.replaceWith(panelFixture());

    await vi.waitFor(() => {
      expect(document.querySelectorAll(collectorSelector)).toHaveLength(1);
      expect(document.querySelector(collectorSelector)).not.toBe(oldCollector);
    });
    await sendProjection({ newPanel: true });
    await vi.waitFor(() => expect(outputOf(toolbar).textContent).toContain('"newPanel": true'));
  });
});
