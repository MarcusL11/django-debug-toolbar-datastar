import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const site = fileURLToPath(new URL("./site.py", import.meta.url));

function startSite({ renderPanels, shadow }) {
  const server = spawn(process.env.TEST_PYTHON ?? "python3", [site], {
    cwd: repo,
    env: {
      ...process.env,
      TEST_RENDER_PANELS: renderPanels ? "1" : "0",
      TEST_SHADOW_DOM: shadow ? "1" : "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let errors = "";
  server.stderr.on("data", (chunk) => { errors += chunk; });
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Site did not start: ${errors}`)), 10_000);
    server.stdout.once("data", (chunk) => {
      clearTimeout(timeout);
      const port = Number(chunk.toString().trim());
      if (Number.isInteger(port) && port > 0) resolve(port);
      else reject(new Error(`Invalid site port: ${chunk}. ${errors}`));
    });
    server.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Site stopped with code ${code}: ${errors}`));
    });
    server.once("error", reject);
  });
  return { server, ready };
}

async function waitForPanelCount(page, count) {
  await page.waitForFunction((expected) => {
    const host = document.getElementById("djDebugRoot");
    const root = host?.shadowRoot ?? host;
    return root?.querySelector("#DatastarStorePanel [data-datastar-store-output]")
      ?.textContent.includes(`"count": ${expected}`);
  }, count);
}

async function checkLiveSignal({ renderPanels, shadow }) {
  const { server, ready } = startSite({ renderPanels, shadow });
  let browser;
  try {
    const port = await ready;
    browser = await chromium.launch();
    const page = await browser.newPage();
    const response = await page.goto(`http://127.0.0.1:${port}/`);
    assert.equal(response.status(), 200);
    assert.equal(
      await page.locator("#djDebugRoot").evaluate((host) => Boolean(host.shadowRoot)),
      shadow
    );

    let initialCount = 1;
    if (!renderPanels) {
      assert.equal(await page.locator("[data-djdt-datastar-collector]").count(), 0);
      assert.equal(await page.locator("#DatastarStorePanel [data-datastar-store-output]").count(), 0);
      await page.waitForFunction(() => document.querySelector("#signal-count")?.textContent === "1");
      await page.locator("#increment").click();
      await page.waitForFunction(() => document.querySelector("#signal-count")?.textContent === "2");
      initialCount = 2;
      const panelResponse = page.waitForResponse((result) =>
        result.url().includes("/render_panel/") && result.url().includes("DatastarStorePanel")
      );
      await page.locator("#djdt-DatastarStorePanel a").click();
      assert.equal((await panelResponse).status(), 200);
    }

    await waitForPanelCount(page, initialCount);
    const output = page.locator("#DatastarStorePanel [data-datastar-store-output]");
    assert.match(await output.textContent(), new RegExp(`"count": ${initialCount}`));
    assert.equal(await page.locator("[data-djdt-datastar-collector]").count(), 1);
    assert.equal(await page.locator("#signal-count").textContent(), String(initialCount));

    await page.locator("#increment").click();
    const nextCount = initialCount + 1;
    await waitForPanelCount(page, nextCount);
    assert.match(await output.textContent(), new RegExp(`"count": ${nextCount}`));
    assert.equal(await page.locator("#signal-count").textContent(), String(nextCount));
    assert.deepEqual(
      JSON.parse(await page.locator("[data-djdt-datastar-collector]").textContent()),
      { count: nextCount }
    );
  } finally {
    await browser?.close();
    server.kill();
    if (server.exitCode === null) await once(server, "exit");
  }
}

test("an eager shadow panel shows live signals", () =>
  checkLiveSignal({ renderPanels: true, shadow: true })
);

test("a lazy shadow panel reads current signals and tracks changes", () =>
  checkLiveSignal({ renderPanels: false, shadow: true })
);

test("an eager light DOM panel shows live signals", () =>
  checkLiveSignal({ renderPanels: true, shadow: false })
);
