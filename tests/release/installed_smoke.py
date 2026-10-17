import sys
from pathlib import Path

import django
from django.conf import settings

settings.configure(
    SECRET_KEY="test-only",
    STATIC_URL="/static/",
    INSTALLED_APPS=["django.contrib.staticfiles", "debug_toolbar", "django_datastar_toolbar"],
    TEMPLATES=[
        {"BACKEND": "django.template.backends.django.DjangoTemplates", "APP_DIRS": True}
    ],
)
django.setup()

from django.contrib.staticfiles import finders
from django.http import HttpResponse
from django.test import RequestFactory, override_settings
from debug_toolbar.store import MemoryStore
from debug_toolbar.toolbar import DebugToolbar
import django_datastar_toolbar


package_path = Path(django_datastar_toolbar.__file__).resolve()
assert package_path.is_relative_to(Path(sys.argv[1]).resolve()), package_path

for name in (
    "css/datastar_store.css",
    "img/rocket.svg",
    "js/datastar_store.js",
    "js/display.js",
    "js/search.js",
):
    assert finders.find(f"django_datastar_toolbar/{name}"), name

with override_settings(
    DEBUG_TOOLBAR_PANELS=["django_datastar_toolbar.panels.DatastarStorePanel"]
):
    request = RequestFactory().get("/")
    toolbar = DebugToolbar(request, lambda request: HttpResponse())
    panel = toolbar.get_panel_by_id("DatastarStorePanel")
    assert "data-datastar-store-output" in panel.content
    assert "django_datastar_toolbar/js/datastar_store.js" in panel.scripts[0]
    panel.generate_stats(request, HttpResponse())
    assert toolbar.store.panel(toolbar.request_id, panel.panel_id) == {"available": True}
    MemoryStore.clear()

print(f"Installed wheel smoke test passed: {package_path}")
