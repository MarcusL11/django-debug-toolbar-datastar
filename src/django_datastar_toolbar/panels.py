from django.templatetags.static import static
from django.utils.translation import gettext_lazy as _

from debug_toolbar.panels import Panel


class DatastarStorePanel(Panel):
    """Render a browser-owned view of the current Datastar JSON projection."""

    is_async = True
    title = _("Current Signal Store (JSON projection)")
    nav_title = _("Datastar Signals")
    template = "django_datastar_toolbar/panels/datastar_store.html"

    @property
    def is_historical(self):
        return False

    @property
    def scripts(self):
        return [*super().scripts, static("django_datastar_toolbar/js/datastar_store.js")]

    def generate_stats(self, request, response):
        # Only shell availability is stored; browser values never cross to Django.
        self.record_stats({"available": True})
