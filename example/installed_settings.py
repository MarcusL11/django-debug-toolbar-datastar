"""Minimal installed-distribution smoke fixture; no imports from this checkout."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SECRET_KEY = "test-only-datastar-panel-fixture"
DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]
INTERNAL_IPS = ["127.0.0.1"]
ROOT_URLCONF = "installed_urls"
INSTALLED_APPS = ["django.contrib.staticfiles", "debug_toolbar", "django_datastar_toolbar"]
MIDDLEWARE = ["django.middleware.common.CommonMiddleware", "debug_toolbar.middleware.DebugToolbarMiddleware"]
TEMPLATES = [{"BACKEND": "django.template.backends.django.DjangoTemplates", "APP_DIRS": True}]
STATIC_URL = "/static/"
STATIC_ROOT = os.environ.get("DJDT_STATIC_ROOT", str(BASE_DIR / "collected-static"))
DEBUG_TOOLBAR_PANELS = [
    "debug_toolbar.panels.history.HistoryPanel",
    "django_datastar_toolbar.panels.DatastarStorePanel",
]
DEBUG_TOOLBAR_CONFIG = {
    "RENDER_PANELS": os.environ.get("DJDT_EAGER") == "1",
    "USE_SHADOW_DOM": os.environ.get("DJDT_SHADOW", "1") == "1",
}
if os.environ.get("DJDT_MANIFEST") == "1":
    STORAGES = {
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.ManifestStaticFilesStorage"},
    }
