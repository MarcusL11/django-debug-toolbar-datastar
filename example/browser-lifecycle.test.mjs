import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const python = process.env.DJANGO_PYTHON;
const djangoCwd = process.env.DJANGO_CWD;
const bundlePath = process.env.DATASTAR_FULL_BUNDLE;
if (!python || !djangoCwd || !bundlePath) {
    throw new Error("Set DJANGO_PYTHON, DJANGO_CWD (outside this repo), and DATASTAR_FULL_BUNDLE.");
}
const fixture = fileURLToPath(new URL("./", import.meta.url));
const bundle = await readFile(bundlePath);

assert.equal(
    createHash("sha256").update(bundle).digest("hex"),
    "727844adfc825ee651fb93c544a2a739986f9a21820a94524b35f0cac470cf91"
);

let browser;
before(async () => {
    browser = await chromium.launch();
});
after(async () => {
    await browser?.close();
});

async function availablePort() {
    const socket = createServer();
    await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
    const port = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    return port;
}

async function stop(server) {
    if (server.exitCode !== null) return;
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    await exited;
}

async function withDjango(eager, check) {
    const port = await availablePort();
    const base = `http://127.0.0.1:${port}`;
    const server = spawn(
        python,
        ["-m", "django", "runserver", `127.0.0.1:${port}`, "--noreload"],
        {
            cwd: djangoCwd,
            env: {
                ...process.env,
                DJANGO_SETTINGS_MODULE: "installed_settings",
                DJDT_EAGER: eager ? "1" : "0",
                DJDT_SHADOW: "1",
                PYTHONPATH: fixture,
            },
            stdio: ["ignore", "pipe", "pipe"],
        }
    );
    let errors = "";
    server.stderr.on("data", (data) => {
        errors += data;
    });
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
            } catch {
                // The Django development server is still starting.
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.ok(ready, `Django failed to serve the installed panel: ${errors}`);
        const page = await browser.newPage();
        try {
            await check(page, base);
        } finally {
            await page.close();
        }
    } finally {
        await stop(server);
    }
}

async function seed(page, base) {
    await page.goto(`${base}/demo/?datastar=late`);
    await page.evaluate(() => {
        document.documentElement.setAttribute(
            "data-signals",
            "{alreadyHere: 'earlier', _private: 'browser-secret', items: [{_private: 'inside-array'}]}"
        );
        window.readyEvents = 0;
        document.addEventListener("datastar-ready", () => {
            window.readyEvents++;
        });
    });
    await page.addScriptTag({ url: `${base}/__datastar_full.js`, type: "module" });
    await page.waitForFunction(() => window.readyEvents === 1);
}

async function snapshot(page, expected) {
    await page.waitForFunction((value) => {
        const root = document.querySelector("#djDebugRoot")?.shadowRoot;
        return root
            ?.querySelector("#DatastarStorePanel [data-datastar-store-output]")
            ?.textContent.includes(value);
    }, expected);
    return page
        .locator("#djDebugRoot #DatastarStorePanel [data-datastar-store-output]")
        .textContent();
}

test("lazy installed panel loads after Datastar, stays live and singleton on repeated opens", async () => {
    await withDjango(false, async (page, base) => {
        await seed(page, base);
        assert.equal(await page.locator("[data-djdt-datastar-collector]").count(), 0);
        await page.locator("#djDebugRoot a.DatastarStorePanel").click();
        assert.match(await snapshot(page, "earlier"), /browser-secret/);
        assert.equal(await page.locator("[data-djdt-datastar-collector]").count(), 1);
        await page.evaluate(async () => {
            const { root, mergePatch } = await import("/__datastar_full.js");
            root.alreadyHere = "changed";
            mergePatch({ _private: null });
        });
        assert.match(await snapshot(page, "changed"), /inside-array/);
        assert.doesNotMatch(await snapshot(page, "changed"), /browser-secret/);
        await page.locator("#djDebugRoot a.DatastarStorePanel").click();
        await page.locator("#djDebugRoot a.DatastarStorePanel").click();
        assert.equal(await page.locator("[data-djdt-datastar-collector]").count(), 1);
        assert.match(await snapshot(page, "changed"), /changed/);
    });
});

test("late Datastar load recovers from unknown unavailability and parses an empty store", async () => {
    await withDjango(false, async (page, base) => {
        await page.goto(`${base}/demo/?datastar=late`);
        await page.evaluate(() => document.documentElement.removeAttribute("data-signals"));
        await page.locator("#djDebugRoot a.DatastarStorePanel").click();
        await page
            .locator("#djDebugRoot [data-datastar-store-status]")
            .getByText("Projection unavailable (cause unknown)", { exact: false })
            .waitFor();
        assert.equal(await page.locator("[data-djdt-datastar-collector]").count(), 1);
        await page.addScriptTag({ url: `${base}/__datastar_full.js`, type: "module" });
        await page.waitForFunction(
            () => document.querySelector("[data-djdt-datastar-collector]")?.textContent === "{}"
        );
        assert.equal(await snapshot(page, "{}"), "{}");
        assert.equal(await page.locator("#djDebugRoot [data-datastar-store-status]").isVisible(), false);
    });
});

test("history-style replacement rebinds without extra installed collectors", async () => {
    await withDjango(false, async (page, base) => {
        await seed(page, base);
        await page.locator("#djDebugRoot a.DatastarStorePanel").click();
        await snapshot(page, "earlier");
        const requestId = await page.evaluate(async () => {
            const debug = document.querySelector("#djDebugRoot").shadowRoot.querySelector("#djDebug");
            const requestId = debug.dataset.requestId;
            const response = await fetch(`/__debug__/history_sidebar/?request_id=${requestId}`);
            const html = (await response.json()).DatastarStorePanel;
            const { replaceToolbarState } = await import("/static/debug_toolbar/js/utils.js");
            replaceToolbarState(requestId, { DatastarStorePanel: html });
            return requestId;
        });
        assert.ok(requestId);
        await page.waitForFunction(() => !document.querySelector("[data-djdt-datastar-collector]"));
        await page.locator("#djDebugRoot a.DatastarStorePanel").click();
        assert.match(await snapshot(page, "earlier"), /earlier/);
        assert.equal(await page.locator("[data-djdt-datastar-collector]").count(), 1);
        await page.evaluate(async () => {
            (await import("/__datastar_full.js")).root.alreadyHere = "after-replacement";
        });
        assert.match(await snapshot(page, "after-replacement"), /after-replacement/);
    });
});

test("large projection remains valid when later serialization fails", async () => {
    await withDjango(true, async (page, base) => {
        await seed(page, base);
        await snapshot(page, "earlier");
        await page.evaluate(async () => {
            (await import("/__datastar_full.js")).root.large = "x".repeat(100_000);
        });
        await page.waitForFunction(
            () => document.querySelector("[data-djdt-datastar-collector]")?.textContent.length > 100_000
        );
        const panel = page.locator("#djDebugRoot #DatastarStorePanel");
        await page.locator("#djDebugRoot a.DatastarStorePanel").click();
        assert.equal((await panel.locator("[data-datastar-store-output]").textContent()).length > 100_000, true);
        const oldRaw = await page.locator("[data-djdt-datastar-collector]").textContent();
        const error = await page.evaluate(async () => {
            try {
                (await import("/__datastar_full.js")).root.problem = 1n;
            } catch (cause) {
                return cause.message;
            }
        });
        assert.match(error, /BigInt/);
        assert.equal(await page.locator("[data-djdt-datastar-collector]").textContent(), oldRaw);
        assert.equal(await panel.locator("[data-datastar-store-status]").isVisible(), false);
        assert.deepEqual(
            JSON.parse(await panel.locator("[data-datastar-store-output]").textContent()),
            JSON.parse(oldRaw)
        );
    });
});

test("invalid projection clears JSON and shows an error until valid text returns", async () => {
    await withDjango(true, async (page, base) => {
        await seed(page, base);
        await snapshot(page, "earlier");
        await page.locator("#djDebugRoot a.DatastarStorePanel").click();
        const panel = page.locator("#djDebugRoot #DatastarStorePanel");
        const oldRaw = await page.locator("[data-djdt-datastar-collector]").textContent();
        await page.evaluate(() => {
            document.querySelector("[data-djdt-datastar-collector]").removeAttribute("data-json-signals__terse");
        });
        await page.waitForTimeout(60);
        await page.evaluate(() => {
            document.querySelector("[data-djdt-datastar-collector]").textContent = "invalid-json";
        });
        await panel
            .locator("[data-datastar-store-status]")
            .getByText("Projection unavailable", { exact: false })
            .waitFor();
        assert.equal(await panel.locator("[data-datastar-store-output]").textContent(), "");
        await page.evaluate((text) => {
            document.querySelector("[data-djdt-datastar-collector]").textContent = text;
        }, oldRaw);
        await snapshot(page, "earlier");
        assert.equal(await panel.locator("[data-datastar-store-status]").isVisible(), false);
    });
});

test("pretty JSON keeps values while path search highlights, navigates, and escapes HTML", async () => {
    await withDjango(true, async (page, base) => {
        await seed(page, base);
        const panel = page.locator("#djDebugRoot #DatastarStorePanel");
        const output = panel.locator("[data-datastar-store-output]");
        const search = panel.locator("[data-datastar-store-search]");
        await snapshot(page, "earlier");
        await page.locator("#djDebugRoot a.DatastarStorePanel").click();
        const raw = await page.locator("[data-djdt-datastar-collector]").textContent();
        assert.equal(await output.textContent(), JSON.stringify(JSON.parse(raw), null, 2));
        assert.match(await output.textContent(), /\n {2}"items": \[\n/);
        assert.equal(await panel.locator("[data-datastar-store-status]").isVisible(), false);
        assert.equal(await panel.locator("[data-datastar-store-tree], [data-datastar-store-view]").count(), 0);

        await search.fill("items[0]._private");
        assert.equal(await output.locator(".djdt-datastar-match").count(), 1);
        assert.equal(await output.locator(".djdt-datastar-match").textContent(), '"_private"');
        assert.match(await output.textContent(), /browser-secret/);
        await search.fill("browser-secret");
        assert.equal(await output.locator(".djdt-datastar-match").count(), 0);
        assert.match(await panel.locator("[data-datastar-store-match-count]").textContent(), /No matching/);

        await page.evaluate(async () => {
            const { root } = await import("/__datastar_full.js");
            root["dash-key"] = 7;
            root.items = [{ _private: "updated-array" }];
        });
        await search.fill("dash-key");
        await page.waitForFunction(
            () => document.querySelector("[data-djdt-datastar-collector]")?.textContent.includes("dash-key")
        );
        assert.equal(await output.locator(".djdt-datastar-match").textContent(), '"dash-key"');
        await search.fill("items[0]._private");
        assert.match(await output.textContent(), /updated-array/);
        await search.fill("_private");
        assert.equal(await output.locator(".djdt-datastar-match").count(), 2);
        await search.press("Enter");
        assert.match(await panel.locator("[data-datastar-store-match-count]").textContent(), /2 of 2/);
        await search.press("Shift+Enter");
        assert.match(await panel.locator("[data-datastar-store-match-count]").textContent(), /1 of 2/);
        await search.fill("");
        assert.equal(await panel.locator("[data-datastar-store-match-count]").isVisible(), false);
        assert.deepEqual(JSON.parse(await output.textContent()).items, [{ _private: "updated-array" }]);

        await page.evaluate(async () => {
            (await import("/__datastar_full.js")).root.alreadyHere = "<img src=x onerror=alert(1)>";
        });
        assert.match(await snapshot(page, "<img"), /<img src=x onerror=alert\(1\)>/);
        assert.equal(await output.locator("img").count(), 0);
        assert.equal(await page.locator("[data-djdt-datastar-collector]").count(), 1);
    });
});

test("Datastar is a sidecar, page remains usable, and another panel closes it", async () => {
    await withDjango(false, async (page, base) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await seed(page, base);
        await page.evaluate(() => {
            const button = document.createElement("button");
            button.textContent = "Change a page signal";
            button.addEventListener("click", async () => {
                (await import("/__datastar_full.js")).root.alreadyHere = "from-page";
            });
            document.body.prepend(button);
        });
        await page.locator("#djDebugRoot a.DatastarStorePanel").click();
        await snapshot(page, "earlier");
        const panel = page.locator("#djDebugRoot #DatastarStorePanel");
        const bounds = await panel.boundingBox();
        assert.ok(bounds.x >= 600 && bounds.width <= 400);
        assert.ok(Math.abs(bounds.x + bounds.width - 1040) < 2);
        await page.getByRole("button", { name: "Change a page signal" }).click();
        assert.match(await snapshot(page, "from-page"), /from-page/);
        await page.setViewportSize({ width: 600, height: 800 });
        const narrowBounds = await panel.boundingBox();
        assert.ok(Math.abs(narrowBounds.x - 200) < 2);
        assert.ok(Math.abs(narrowBounds.width - 400) < 2);
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.locator("#djDebugRoot a.HistoryPanel").click();
        assert.equal(await panel.isVisible(), false);
        const history = page.locator("#djDebugRoot #HistoryPanel");
        assert.equal(await history.isVisible(), true);
        const historyBounds = await history.boundingBox();
        assert.ok(historyBounds.x < 2 && historyBounds.width > 1000);
    });
});

test("a cached older panel shell still displays JSON", async () => {
    await withDjango(true, async (page, base) => {
        await seed(page, base);
        await snapshot(page, "earlier");
        await page.evaluate(() => {
            const panel = document
                .querySelector("#djDebugRoot")
                .shadowRoot.querySelector("[data-datastar-store-panel]");
            const oldShell = document.createElement("div");
            oldShell.setAttribute("data-datastar-store-panel", "");
            oldShell.innerHTML = "<p data-datastar-store-status></p><pre data-datastar-store-output></pre>";
            panel.replaceWith(oldShell);
        });
        await page.waitForFunction(() =>
            document
                .querySelector("#djDebugRoot")
                .shadowRoot.querySelector("[data-datastar-store-output]")
                ?.textContent.includes("earlier")
        );
        assert.equal(await page.locator("[data-djdt-datastar-collector]").count(), 1);
    });
});

test("eager shadow panel works, and shell removal disposes its raw collector", async () => {
    await withDjango(true, async (page, base) => {
        await seed(page, base);
        assert.match(await snapshot(page, "earlier"), /inside-array/);
        assert.equal(await page.locator("[data-djdt-datastar-collector]").count(), 1);
        await page.evaluate(() => {
            document.querySelector("#djDebugRoot").shadowRoot.querySelector("#DatastarStorePanel").remove();
        });
        await page.waitForFunction(() => !document.querySelector("[data-djdt-datastar-collector]"));
        assert.equal(await page.locator("[data-djdt-datastar-collector]").count(), 0);
    });
});
