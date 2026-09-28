from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from django_datastar_toolbar.panels import DatastarStorePanel

from debug_toolbar.store import get_store
from debug_toolbar.toolbar import DebugToolbar

PANEL_PATH = "django_datastar_toolbar.panels.DatastarStorePanel"
PANELS = ["debug_toolbar.panels.history.HistoryPanel", PANEL_PATH]


@override_settings(DEBUG=True, DEBUG_TOOLBAR_PANELS=PANELS)
class DatastarStorePanelTests(SimpleTestCase):
    def request_with_toolbar(self, *, eager=False, disabled=False):
        created = []

        def on_toolbar_created(sender, toolbar, *, _created=created, **kwargs):
            _created.append(toolbar)

        DebugToolbar._created.connect(on_toolbar_created)
        try:
            with override_settings(
                DEBUG_TOOLBAR_CONFIG={
                    "RENDER_PANELS": eager,
                    "DISABLE_PANELS": {PANEL_PATH} if disabled else set(),
                }
            ):
                response = self.client.get("/demo/", REMOTE_ADDR="127.0.0.1")
        finally:
            DebugToolbar._created.disconnect(on_toolbar_created)
        self.assertEqual(len(created), 1)
        return response, created[0]

    def test_deferred_panel_has_server_only_marker_and_registered_assets(self):
        response, toolbar = self.request_with_toolbar()
        panel = toolbar.get_panel_by_id(DatastarStorePanel.panel_id)
        self.assertTrue(panel.enabled)
        self.assertFalse(panel.is_historical)
        self.assertEqual(panel.get_stats(), {"available": True})
        self.assertNotIn(b"data-datastar-store-output", response.content)
        stored = DebugToolbar.fetch(toolbar.request_id).get_panel_by_id(panel.panel_id)
        self.assertIsNone(stored.toolbar.request)
        self.assertTrue(stored.enabled)
        deferred = self.client.get(
            reverse("djdt:render_panel"),
            {"request_id": toolbar.request_id, "panel_id": panel.panel_id},
            REMOTE_ADDR="127.0.0.1",
        ).json()
        self.assertIn("data-datastar-store-output", deferred["content"])
        self.assertIn("django_datastar_toolbar/css/datastar_store.css", deferred["content"])
        self.assertEqual(
            deferred["scripts"], ["/static/django_datastar_toolbar/js/datastar_store.js"]
        )

    def test_eager_panel_renders_frozen_interface(self):
        response, toolbar = self.request_with_toolbar(eager=True)
        self.assertContains(response, "data-datastar-store-output")
        self.assertContains(response, "data-datastar-store-search")
        self.assertContains(response, "data-datastar-store-match-count")
        self.assertNotContains(response, "values may contain sensitive data")
        self.assertNotContains(response, "data-datastar-store-tree")
        self.assertNotContains(response, "data-datastar-store-view")
        self.assertContains(response, 'src="/static/django_datastar_toolbar/js/datastar_store.js"')
        self.assertContains(response, "/static/django_datastar_toolbar/css/datastar_store.css")
        self.assertEqual(
            toolbar.get_panel_by_id(DatastarStorePanel.panel_id).get_stats(),
            {"available": True},
        )

    def test_disabled_panel_has_no_stats_or_shell(self):
        response, toolbar = self.request_with_toolbar(disabled=True)
        self.assertNotIn(b'id="DatastarStorePanel"', response.content)
        self.assertEqual(toolbar.get_panel_by_id(DatastarStorePanel.panel_id).get_stats(), {})

    def test_history_excludes_only_when_requested(self):
        _, toolbar = self.request_with_toolbar()
        url = reverse("djdt:history_sidebar")
        excluded = self.client.get(
            url, {"request_id": toolbar.request_id, "exclude_history": True},
            REMOTE_ADDR="127.0.0.1",
        ).json()
        included = self.client.get(
            url, {"request_id": toolbar.request_id}, REMOTE_ADDR="127.0.0.1"
        ).json()
        self.assertNotIn(DatastarStorePanel.panel_id, excluded)
        self.assertIn(DatastarStorePanel.panel_id, included)
        self.assertEqual(
            get_store().panel(toolbar.request_id, DatastarStorePanel.panel_id),
            {"available": True},
        )

    async def test_async_request_keeps_panel_enabled(self):
        created = []

        def on_toolbar_created(sender, toolbar, *, _created=created, **kwargs):
            _created.append(toolbar)

        DebugToolbar._created.connect(on_toolbar_created)
        try:
            response = await self.async_client.get("/demo/")
        finally:
            DebugToolbar._created.disconnect(on_toolbar_created)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(created), 1)
        panel = created[0].get_panel_by_id(DatastarStorePanel.panel_id)
        self.assertTrue(panel.enabled)
        self.assertEqual(panel.get_stats(), {"available": True})
