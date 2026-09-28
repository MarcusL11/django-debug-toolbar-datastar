import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const directory = new URL('./', import.meta.url);
const fullPath = process.env.DATASTAR_FULL_BUNDLE;
const corePath = process.env.DATASTAR_CORE_BUNDLE;
if (!fullPath || !corePath) {
    throw new Error('Set DATASTAR_FULL_BUNDLE and DATASTAR_CORE_BUNDLE to official v1.0.4 files.');
}
const expectedFullHash = '727844adfc825ee651fb93c544a2a739986f9a21820a94524b35f0cac470cf91';
const expectedCoreHash = '61f9ae773757947f2e938ce21d3d8f3e82c5b8d5b45dcaf714b76cdfbef9d462';
let browser;
let server;
let origin;

function verifyBundle(contents, hash, banner) {
    assert.equal(createHash('sha256').update(contents).digest('hex'), hash);
    assert.ok(contents.toString().startsWith(banner));
    return contents;
}

before(async () => {
    const [fixture, full, core] = await Promise.all([
        readFile(new URL('collector-fixture.html', directory)),
        readFile(fullPath),
        readFile(corePath),
    ]);
    const routes = new Map([
        ['/fixture', [fixture, 'text/html; charset=utf-8']],
        ['/full.js', [verifyBundle(full, expectedFullHash, '// Datastar v1.0.4'), 'text/javascript; charset=utf-8']],
        ['/core.js', [verifyBundle(core, expectedCoreHash, '// Datastar Core v1.0.4'), 'text/javascript; charset=utf-8']],
    ]);
    server = createServer((request, response) => {
        const route = routes.get(request.url);
        response.writeHead(route ? 200 : 404, { 'Content-Type': route?.[1] ?? 'text/plain' });
        response.end(route?.[0] ?? 'Not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
});

after(async () => {
    await browser?.close();
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

async function openFixture({ seeded = true } = {}) {
    const page = await browser.newPage();
    await page.goto(`${origin}/fixture`);
    if (!seeded) await page.evaluate(() => document.documentElement.removeAttribute('data-signals'));
    return page;
}

async function load(page, bundle = 'full') {
    await page.addScriptTag({ url: `${origin}/${bundle}.js`, type: 'module' });
    if (bundle === 'full') await page.waitForFunction(() => window.datastarReadyEvents === 1);
}

async function insert(page, location = 'body') {
    return page.evaluate((where) => {
        const node = document.createElement('pre');
        node.setAttribute('data-json-signals__terse', '');
        if (where === 'body') document.body.append(node);
        if (where === 'ignored') {
            const parent = document.createElement('section');
            parent.setAttribute('data-ignore', '');
            document.body.append(parent);
            parent.append(node);
        }
        if (where === 'shadow') {
            const host = document.createElement('section');
            document.body.append(host);
            host.attachShadow({ mode: 'open' }).append(node);
        }
        window.collector = node;
        return node.textContent;
    }, location);
}

async function raw(page) {
    return page.evaluate(() => window.collector.textContent);
}

async function expectSnapshot(page, predicate) {
    await page.waitForFunction((check) => {
        const text = window.collector.textContent;
        if (!text) return false;
        try {
            const value = JSON.parse(text);
            return check.every(([path, expected]) => {
                const found = path.reduce((acc, key) => acc?.[key], value);
                return found === expected;
            });
        } catch { return false; }
    }, predicate, { timeout: 4000 });
    return JSON.parse(await raw(page));
}

// This classification intentionally cannot diagnose why a collector stayed empty.
async function classify(page, timeoutMs = 120) {
    const deadline = Date.now() + timeoutMs;
    do {
        const text = await raw(page);
        if (text !== '') {
            try { return { state: 'valid', value: JSON.parse(text) }; }
            catch { return { state: 'unavailable', cause: 'unknown' }; }
        }
        await page.waitForTimeout(20);
    } while (Date.now() < deadline);
    return { state: 'unavailable', cause: 'unknown' };
}

test('late built-in collector sees earlier state, mutations, and silent deletions', async () => {
    const page = await openFixture();
    try {
        assert.equal(page.url(), `${origin}/fixture`);
        await load(page);
        assert.equal(await page.evaluate(() => window.datastarReadyEvents), 1);
        assert.equal(await insert(page), '');
        const initial = await expectSnapshot(page, [[['preexisting'], 'before']]);
        assert.equal(initial._private, 'top-secret');
        assert.equal(initial.items[0]._private, 'array-secret');
        assert.match(await raw(page), /array-secret/);
        assert.equal(await page.locator('pre[data-json-signals__terse]').count(), 1);

        assert.equal(await page.evaluate(async () => (await import('/full.js')).root.preexisting), 'before');
        await page.evaluate(async () => {
            const { root, mergePatch } = await import('/full.js');
            root.preexisting = 'after';
            root.added = 42;
            mergePatch({ items: [{ _private: 'updated-array' }] });
        });
        await expectSnapshot(page, [[['preexisting'], 'after'], [['added'], 42], [['items', 0, '_private'], 'updated-array']]);
        await page.evaluate(() => {
            window.patchEvents = [];
            document.addEventListener('datastar-signal-patch', (event) => window.patchEvents.push(event.detail));
        });
        await page.evaluate(async () => {
            const { root, mergePatch } = await import('/full.js');
            delete root.added;
            mergePatch({ preexisting: null });
        });
        const deleted = await expectSnapshot(page, [[['items', 0, '_private'], 'updated-array']]);
        assert.equal(Object.hasOwn(deleted, 'added'), false);
        assert.equal(Object.hasOwn(deleted, 'preexisting'), false);
        assert.deepEqual(await page.evaluate(() => window.patchEvents), []);
    } finally { await page.close(); }
});

test('attribute removal/re-add and node removal/reinsert independently dispose and restart', async () => {
    const page = await openFixture();
    try {
        await load(page);
        await insert(page);
        await expectSnapshot(page, [[['preexisting'], 'before']]);
        await page.evaluate(() => window.collector.removeAttribute('data-json-signals__terse'));
        await page.waitForTimeout(50);
        const oldAttributeText = await raw(page);
        await page.evaluate(async () => { (await import('/full.js')).root.preexisting = 'while-attribute-removed'; });
        await page.waitForTimeout(50);
        assert.equal(await raw(page), oldAttributeText);
        await page.evaluate(() => window.collector.setAttribute('data-json-signals__terse', ''));
        await expectSnapshot(page, [[['preexisting'], 'while-attribute-removed']]);
        await page.evaluate(() => window.collector.remove());
        await page.waitForTimeout(50);
        const detachedText = await raw(page);
        await page.evaluate(async () => { (await import('/full.js')).root.preexisting = 'while-detached'; });
        await page.waitForTimeout(50);
        assert.equal(await raw(page), detachedText);
        await page.evaluate(() => document.body.append(window.collector));
        await expectSnapshot(page, [[['preexisting'], 'while-detached']]);
        assert.equal(await page.locator('pre[data-json-signals__terse]').count(), 1);
        await page.evaluate(() => window.collector.remove());
    } finally { await page.close(); }
});

test('empty valid object and delayed load are distinct from pending empty text', async () => {
    const page = await openFixture({ seeded: false });
    try {
        assert.equal(await insert(page), '');
        assert.deepEqual(await classify(page), { state: 'unavailable', cause: 'unknown' });
        assert.equal(await page.evaluate(() => window.datastarReadyEvents), 0);
        await load(page);
        assert.deepEqual(await classify(page), { state: 'valid', value: {} });
    } finally { await page.close(); }
});

test('core-only exports a store and plugin API but does not process built-in collector', async () => {
    const page = await openFixture();
    try {
        await load(page, 'core');
        assert.equal(await page.evaluate(() => window.datastarReadyEvents), 0);
        assert.equal(await insert(page), '');
        assert.equal(await page.evaluate(async () => {
            const module = await import('/core.js');
            module.mergePatch({ coreValue: 17 });
            return typeof module.attribute === 'function' && module.root.coreValue === 17;
        }), true);
        assert.deepEqual(await classify(page), { state: 'unavailable', cause: 'unknown' });
    } finally { await page.close(); }
});

test('ignored light-DOM subtree and unobserved shadow root do not initialize collector', async () => {
    for (const location of ['ignored', 'shadow']) {
        const page = await openFixture();
        try {
            await load(page);
            await insert(page, location);
            assert.deepEqual(await classify(page), { state: 'unavailable', cause: 'unknown' });
            await insert(page);
            await expectSnapshot(page, [[['preexisting'], 'before']]);
        } finally { await page.close(); }
    }
});

test('later throwing serialization can leave old valid JSON; modest large value is fully copied', async () => {
    const page = await openFixture();
    try {
        await load(page);
        await insert(page);
        await expectSnapshot(page, [[['preexisting'], 'before']]);
        const oldText = await raw(page);
        const thrown = await page.evaluate(async () => {
            try { (await import('/full.js')).root.unserializable = 1n; }
            catch (error) { return error.message; }
            return null;
        });
        assert.match(thrown, /BigInt/);
        await page.waitForTimeout(80);
        assert.equal(await raw(page), oldText);
        assert.equal((await classify(page)).state, 'valid');
    } finally { await page.close(); }

    const largePage = await openFixture();
    try {
        await load(largePage);
        await insert(largePage);
        await expectSnapshot(largePage, [[['preexisting'], 'before']]);
        await largePage.evaluate(async () => { (await import('/full.js')).root.large = 'x'.repeat(100_000); });
        await largePage.waitForFunction(() => window.collector.textContent.length > 100_000);
        assert.equal((await raw(largePage)).length > 100_000, true);
    } finally { await largePage.close(); }
});
