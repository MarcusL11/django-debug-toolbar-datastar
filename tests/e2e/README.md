# Full browser tests

These tests start a small Django site with the real Debug Toolbar panel.
They cover an eager shadow panel, a lazy shadow panel, and an eager light DOM panel.
The lazy test changes a signal before it opens the panel, then changes it again.

The site loads the pinned full Datastar bundle from `vendor/`.
The tests check the signal text, collector, and panel output.
They do not write JSON into the collector.

Install this Python package in a local environment.
Install the JavaScript dependencies and Chromium.
Then run the test:

```sh
npm ci
npx playwright install chromium
TEST_PYTHON=.venv/bin/python npm run test:e2e
```

The Python package does not include the test bundle.
The browser test uses the source checkout.
The wheel test checks an install in a separate environment.
