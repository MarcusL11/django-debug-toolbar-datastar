import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { chromium } from "playwright";

const python = process.env.DJANGO_PYTHON;
const fixture = new URL("./", import.meta.url).pathname;
if (!python || !process.env.DATASTAR_FULL_BUNDLE || !process.env.DJANGO_CWD)
    throw new Error("Set DJANGO_PYTHON, DJANGO_CWD (outside checkout), and DATASTAR_FULL_BUNDLE.");

async function port() {
    const socket = createServer();
    await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
    const address = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    return address;
}

async function checkMode(browser, eager, shadow) {
    const number = await port();
    const base = `http://127.0.0.1:${number}`;
    const server = spawn(python, ["-m", "django", "runserver", `127.0.0.1:${number}`, "--noreload"], {
        cwd: process.env.DJANGO_CWD,
        env: { ...process.env, PYTHONPATH: fixture, DJANGO_SETTINGS_MODULE: "installed_settings", DJDT_EAGER: eager ? "1" : "0", DJDT_SHADOW: shadow ? "1" : "0" },
        stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    server.stderr.on("data", (chunk) => { stderr += chunk; });
    try {
        let ready = false;
        for (let attempt = 0; attempt < 80; attempt++) {
            if (server.exitCode !== null) break;
            try {
                const response = await fetch(`${base}/demo/`);
                if (response.ok && (await response.text()).includes("DatastarStorePanel")) {
                    ready = true;
                    break;
                }
            } catch { /* still starting */ }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.ok(ready, stderr);
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        try {
            await page.goto(`${base}/demo/`);
            const panel = page.locator("#djDebugRoot #DatastarStorePanel");
            if (!eager) await page.locator("#djDebugRoot a.DatastarStorePanel").click();
            await page.waitForFunction(() => {
                const host = document.querySelector("#djDebugRoot");
                return (host?.shadowRoot ?? host)?.querySelector("#DatastarStorePanel [data-datastar-store-output]")?.textContent.includes("Hello from installed wheel");
            });
            if (eager) await page.locator("#djDebugRoot a.DatastarStorePanel").click();
            assert.match(await panel.locator("[data-datastar-store-output]").textContent(), /"_private": "sample"/);
            assert.equal(await page.locator("[data-djdt-datastar-collector]").count(), 1);
            assert.equal(Math.round((await panel.boundingBox()).width), 400);
            const search = panel.locator("[data-datastar-store-search]");
            await search.fill("_private");
            assert.equal(await panel.locator(".djdt-datastar-match").count(), 1);
            await page.getByRole("button", { name: "Increment" }).click();
            await page.waitForFunction(() => document.querySelector("[data-djdt-datastar-collector]")?.textContent.includes('"count":2'));
            assert.match(await panel.locator("[data-datastar-store-output]").textContent(), /"count": 2/);
            assert.deepEqual(errors, []);
        } finally {
            await page.close();
        }
    } finally {
        server.kill("SIGTERM");
        await new Promise((resolve) => server.once("exit", resolve));
    }
}

const browser = await chromium.launch();
try {
    for (const eager of [false, true]) {
        for (const shadow of [false, true]) await checkMode(browser, eager, shadow);
    }
    console.log("Installed released-toolbar browser smoke: lazy/eager, shadow/light, static CSS/JS, live update OK");
} finally {
    await browser.close();
}
