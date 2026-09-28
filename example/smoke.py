"""Run with DJANGO_SETTINGS_MODULE=installed_settings from an isolated cwd."""

import django
from django.contrib.staticfiles import finders
from django.test import Client, override_settings
from django.urls import reverse


def main():
    django.setup()
    from django_datastar_toolbar.panels import DatastarStorePanel

    from debug_toolbar.toolbar import DebugToolbar

    for asset in (
        "django_datastar_toolbar/js/datastar_store.js",
        "django_datastar_toolbar/css/datastar_store.css",
    ):
        assert finders.find(asset), asset
    client = Client()
    for eager in (False, True):
        created = []

        def on_toolbar_created(sender, toolbar, *, _created=created, **kwargs):
            _created.append(toolbar)

        DebugToolbar._created.connect(on_toolbar_created)
        try:
            with override_settings(DEBUG_TOOLBAR_CONFIG={"RENDER_PANELS": eager}):
                response = client.get("/demo/", REMOTE_ADDR="127.0.0.1")
        finally:
            DebugToolbar._created.disconnect(on_toolbar_created)
        assert response.status_code == 200
        assert len(created) == 1
        toolbar = created[0]
        panel = toolbar.get_panel_by_id(DatastarStorePanel.panel_id)
        assert panel.get_stats() == {"available": True}
        assert DebugToolbar.fetch(toolbar.request_id).get_panel_by_id(
            DatastarStorePanel.panel_id
        ).get_stats() == {"available": True}
        if eager:
            assert b"django_datastar_toolbar/css/datastar_store.css" in response.content
            assert b"django_datastar_toolbar/js/datastar_store.js" in response.content
            assert b"data-datastar-store-search" in response.content
        else:
            assert b"data-datastar-store-search" not in response.content
            deferred = client.get(
                reverse("djdt:render_panel"),
                {"request_id": toolbar.request_id, "panel_id": panel.panel_id},
                REMOTE_ADDR="127.0.0.1",
            ).json()
            assert "django_datastar_toolbar/css/datastar_store.css" in deferred["content"]
            assert deferred["scripts"] == [
                "/static/django_datastar_toolbar/js/datastar_store.js"
            ]
    print("Installed wheel: eager/deferred shell, assets, server-only stats OK")


if __name__ == "__main__":
    main()
