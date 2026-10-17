# Full browser test

This test starts a small Django site with the real Debug Toolbar panel.
It loads the pinned full Datastar bundle from `vendor/`.
A click changes a Datastar signal.
The test checks both the signal text and the panel output.
It does not write JSON into the collector.

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
