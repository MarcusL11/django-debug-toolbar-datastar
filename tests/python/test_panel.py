import unittest

import django
from django.conf import settings

if not settings.configured:
    settings.configure(
        SECRET_KEY="test-only",
        STATIC_URL="/static/",
        INSTALLED_APPS=[
            "django.contrib.staticfiles",
            "debug_toolbar",
            "django_datastar_toolbar",
        ],
        TEMPLATES=[
            {
                "BACKEND": "django.template.backends.django.DjangoTemplates",
                "APP_DIRS": True,
            }
        ],
    )
django.setup()

from django.http import HttpResponse
from django.templatetags.static import static
from django.test import RequestFactory, SimpleTestCase, override_settings

from debug_toolbar.store import MemoryStore
from debug_toolbar.toolbar import DebugToolbar


@override_settings(
    DEBUG_TOOLBAR_PANELS=["django_datastar_toolbar.panels.DatastarStorePanel"],
    DEBUG_TOOLBAR_CONFIG={"TOOLBAR_STORE_CLASS": "debug_toolbar.store.MemoryStore"},
)
class PanelTests(SimpleTestCase):
    def setUp(self):
        MemoryStore.clear()
        self.request = RequestFactory().get("/?signal=private-example")
        self.toolbar = DebugToolbar(self.request, lambda request: HttpResponse())
        self.panel = self.toolbar.get_panel_by_id("DatastarStorePanel")

    def tearDown(self):
        MemoryStore.clear()

    def test_generate_stats_saves_only_availability(self):
        response = HttpResponse("private-example")

        self.panel.generate_stats(self.request, response)

        self.assertEqual(self.panel.get_stats(), {"available": True})
        self.assertEqual(
            self.toolbar.store.panel(self.toolbar.request_id, self.panel.panel_id),
            {"available": True},
        )

    def test_panel_properties(self):
        self.assertFalse(self.panel.is_historical)
        self.assertTrue(self.panel.is_async)
        self.assertEqual(self.panel.panel_id, "DatastarStorePanel")
        self.assertEqual(
            self.panel.scripts,
            [static("django_datastar_toolbar/js/datastar_store.js")],
        )

    def test_template_contains_display_elements(self):
        html = self.panel.content

        self.assertIsNotNone(html)
        expected = [
            "data-datastar-store-panel",
            "data-datastar-store-status",
            "data-datastar-store-output",
            "data-datastar-store-search",
        ]
        for s in expected:
            with self.subTest(substr=s):
                self.assertIn(s, html)


if __name__ == "__main__":
    unittest.main()
