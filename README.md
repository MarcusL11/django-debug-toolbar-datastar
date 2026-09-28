# Datastar Signals for Django Debug Toolbar (development package)

A **opt-in third-party panel** that appears inside Django Debug Toolbar. It displays a browser-side JSON projection of the current page-global Datastar signal store. It is not maintained or supported by Django Debug Toolbar's maintainers. This independent package's repository is [MarcusL11/django-debug-toolbar-datastar](https://github.com/MarcusL11/django-debug-toolbar-datastar); its code is licensed under [BSD-3-Clause](LICENSE). It has not been released to PyPI; version `0.1.0.dev0` is a development build, not a compatibility or release promise. Report issues in this repository, not the Django Debug Toolbar issue tracker.

## AI-assisted development

Large language models (LLMs) were used to help generate portions of this
project's code and documentation. All LLM-assisted content was reviewed and
approved by the author, who remains responsible for the final work.

## Install and configure

Install the built wheel in a development environment with Django Debug Toolbar 8.0.0 or newer. Then add the app to `INSTALLED_APPS`:

```python
INSTALLED_APPS = [
    # existing apps, including django.contrib.staticfiles and debug_toolbar
    "django_datastar_toolbar",
]
```

Add `"django_datastar_toolbar.panels.DatastarStorePanel"` to your project's **existing complete ordered** `DEBUG_TOOLBAR_PANELS` list. If you have not set that option, setting it replaces the toolbar defaults; include every other panel you want to keep. There is no automatic registration. Keep the toolbar's normal middleware, URL, `DEBUG` and internal-IP setup, and enable Django's app-directory template loader (`APP_DIRS=True`). The panel needs the official **full** Datastar bundle on the page; Datastar core by itself does not register the built-in `data-json-signals` plugin. The package does not ship or inject a Datastar bundle or any Datastar Pro/Inspector assets.

## What it displays

The collector uses the full bundle's built-in `data-json-signals__terse` attribute on an add-on-owned, hidden light-DOM element. This is a live JSON **projection**, not a lossless inventory, request snapshot, or view-specific store. Every projected JSON value, including underscore paths, is shown. Search highlights names and paths; it does not hide values. A valid result may be stale if later serialization fails, and neither collector serialization nor rendering is size-bounded. The full raw projection remains in the host DOM and can be read by page scripts. Use only for local/development work with non-real data; do not treat the panel or search as redaction. The frozen interface has no in-panel warning, tree collapse, or view toggle. Django stores only a shell-availability marker, never browser signal values.

## Standalone installed-distribution fixture

Build in this directory with `python -m build`. Install the resulting wheel in a clean Python environment (alongside its dependencies), change to a directory **outside this repository**, and set `PYTHONPATH` to this directory's `example/` only. For example:

```sh
DJANGO_SETTINGS_MODULE=installed_settings python -m django check
DJANGO_SETTINGS_MODULE=installed_settings python -m django findstatic django_datastar_toolbar/js/datastar_store.js
DJANGO_SETTINGS_MODULE=installed_settings python -m django collectstatic --noinput
DJANGO_SETTINGS_MODULE=installed_settings python /path/to/example/smoke.py
```

Set `DJDT_STATIC_ROOT` to a temporary directory before `collectstatic`; set `DJDT_MANIFEST=1` to check hashed/manifest static processing as well. The `addon_tests/` directory is in the sdist, not the wheel: from an external working directory set `PYTHONPATH` to this add-on's root and `example/` (not `src/`), then run `DJANGO_SETTINGS_MODULE=installed_settings python -m django test addon_tests --noinput` to test the installed wheel and released toolbar. To view the demo, set `DATASTAR_FULL_BUNDLE` to a SHA-256-verified official v1.0.4 `datastar.js` file and run `DJANGO_SETTINGS_MODULE=installed_settings python -m django runserver 127.0.0.1:8002 --noreload`; visit `/demo/`. Install the browser test dependencies with `npm ci` and a Chromium binary with `npx playwright install chromium` to run the repository's Playwright harness `example/browser-smoke.mjs`. It accepts `DJANGO_PYTHON` (the clean venv), `DJANGO_CWD` (outside this checkout), and `DATASTAR_FULL_BUNDLE` and exercises eager/lazy, shadow/light DOM and live updates. No installation in your own Django project is necessary to inspect the package.

The deeper installed-wheel lifecycle suite (`example/browser-lifecycle.test.mjs`) tests delayed Datastar load (`/demo/?datastar=late`), panel replacement/cleanup, live mutation, stale and invalid projections, search, escaping, and sidecar layout. From this repository, with the clean wheel installed in the external environment:

```sh
DJANGO_PYTHON=/path/to/clean-venv/bin/python DJANGO_CWD=/path/outside/this/repo \
  DATASTAR_FULL_BUNDLE=/path/to/official/datastar-v1.0.4-full.js npm run test:lifecycle
```

The separate browser-only collector semantics suite (`example/collector-probe.test.mjs`) does **not** prove wheel integration. It tests the official full and core v1.0.4 bundles; neither is included in this package. Both suites verify bundle SHA-256 before use:

```sh
DATASTAR_FULL_BUNDLE=/path/to/official/datastar-v1.0.4-full.js \
  DATASTAR_CORE_BUNDLE=/path/to/official/datastar-v1.0.4-core.js npm run test:collector
```

CI builds a wheel and runs Django checks, tests, asset discovery, and static collection against Django Debug Toolbar 8.0.0. The browser smoke is currently run manually. The installed-wheel smoke must use a fresh interpreter and cwd outside this source tree, or an editable/source checkout could mask missing files. The sidecar CSS targets toolbar-owned DOM selectors; the toolbar documents no public CSS API, so this styling needs retesting on upgrades. The selected `>=8.0.0` toolbar minimum is a tested baseline, not a claim that every future toolbar release, browser or Datastar version works. Before a PyPI release, check distribution-name ownership, review asset/provenance notices, and run a supported-version/asset/browser matrix.
