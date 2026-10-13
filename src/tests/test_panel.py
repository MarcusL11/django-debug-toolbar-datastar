import unittest
from types import SimpleNamespace
from unittest.mock import Mock

import django
from django.conf import settings

if not settings.configured:
    settings.configure(
        SECRET_KEY="test-only",
        STATIC_URL="/static/",
        INSTALLED_APPS=[
            "django.contrib.staticfiles",
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

from django.http import HttpRequest, HttpResponse, QueryDict
from django.templatetags.static import static

from django_datastar_toolbar.panels import DatastarStorePanel


class PanelTests(unittest.TestCase):
    def setUp(self):
        self.store = Mock(spec=["save_panel"])
        self.toolbar = SimpleNamespace(
            stats={}, store=self.store, request_id="request-1"
        )
        self.panel = DatastarStorePanel(self.toolbar, lambda request: HttpResponse())

    def test_generate_stats_saves_only_availability(self):
        request = HttpRequest()
        request.GET = QueryDict("signal=private-example")
        response = HttpResponse("private-example")

        self.panel.generate_stats(request, response)

        self.assertEqual(self.panel.get_stats(), {"available": True})
        self.store.save_panel.assert_called_once_with(
            "request-1", "DatastarStorePanel", {"available": True}
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
