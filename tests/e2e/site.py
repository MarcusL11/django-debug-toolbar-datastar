import os
from pathlib import Path

import django
from django.conf import settings
from django.http import FileResponse, HttpResponse
from django.urls import path
from django.core.wsgi import get_wsgi_application
from django.contrib.staticfiles.handlers import StaticFilesHandler
from wsgiref.simple_server import make_server

settings.configure(
    SECRET_KEY="test-only",
    DEBUG=True,
    ALLOWED_HOSTS=["127.0.0.1"],
    INTERNAL_IPS=["127.0.0.1"],
    ROOT_URLCONF=__name__,
    STATIC_URL="/static/",
    INSTALLED_APPS=["django.contrib.staticfiles", "debug_toolbar", "django_datastar_toolbar"],
    MIDDLEWARE=["debug_toolbar.middleware.DebugToolbarMiddleware"],
    TEMPLATES=[
        {"BACKEND": "django.template.backends.django.DjangoTemplates", "APP_DIRS": True}
    ],
    DEBUG_TOOLBAR_PANELS=["django_datastar_toolbar.panels.DatastarStorePanel"],
    DEBUG_TOOLBAR_CONFIG={
        "RENDER_PANELS": os.environ.get("TEST_RENDER_PANELS", "1") == "1",
        "USE_SHADOW_DOM": os.environ.get("TEST_SHADOW_DOM", "1") == "1",
    },
)
django.setup()

from debug_toolbar.toolbar import debug_toolbar_urls


BUNDLE = Path(__file__).parent / "vendor" / "datastar.js"


def index(request):
    return HttpResponse(
        '<!doctype html><html><head><script type="module" src="/test-datastar.js"></script>'
        '</head><body><main data-signals:count="1">'
        '<span id="signal-count" data-text="$count"></span>'
        '<button id="increment" type="button" data-on:click="$count++">Increase count</button>'
        '</main></body></html>'
    )


def datastar_bundle(request):
    return FileResponse(BUNDLE.open("rb"), content_type="text/javascript")


urlpatterns = [
    path("", index),
    path("test-datastar.js", datastar_bundle),
    *debug_toolbar_urls(),
]


if __name__ == "__main__":
    with make_server("127.0.0.1", 0, StaticFilesHandler(get_wsgi_application())) as server:
        print(server.server_port, flush=True)
        server.serve_forever()
