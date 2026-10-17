import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const site = fileURLToPath(new URL("./site.py", import.meta.url));

function startSite() {
  const server = spawn(process.env.TEST_PYTHON ?? "python3", [site], {
    cwd: repo,
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

test("a Datastar signal reaches the installed Debug Toolbar panel", async () => {
  const { server, ready } = startSite();
  let browser;
  try {
    const port = await ready;
    browser = await chromium.launch();
    const page = await browser.newPage();
    const response = await page.goto(`http://127.0.0.1:${port}/`);
    assert.equal(response.status(), 200);

    const output = page.locator("#DatastarStorePanel [data-datastar-store-output]");
    await page.waitForFunction(() => {
      const panel = document.querySelector("#djDebugRoot")?.shadowRoot;
      return panel?.querySelector("#DatastarStorePanel [data-datastar-store-output]")
        ?.textContent.includes('"count": 1');
    });
    assert.match(await output.textContent(), /"count": 1/);
    assert.equal(await page.locator("[data-djdt-datastar-collector]").count(), 1);
    assert.equal(await page.locator("#signal-count").textContent(), "1");

    await page.locator("#increment").click();
    await page.waitForFunction(() => {
      const panel = document.querySelector("#djDebugRoot")?.shadowRoot;
      return panel?.querySelector("#DatastarStorePanel [data-datastar-store-output]")
        ?.textContent.includes('"count": 2');
    });
    assert.match(await output.textContent(), /"count": 2/);
    assert.equal(await page.locator("#signal-count").textContent(), "2");
    assert.deepEqual(
      JSON.parse(await page.locator("[data-djdt-datastar-collector]").textContent()),
      { count: 2 }
    );
  } finally {
    await browser?.close();
    server.kill();
    if (server.exitCode === null) await once(server, "exit");
  }
});
