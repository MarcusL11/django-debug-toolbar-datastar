from django.urls import include, path
from installed_views import bundle, demo

urlpatterns = [
    path("demo/", demo),
    path("__datastar_full.js", bundle),
    path("__debug__/", include("debug_toolbar.urls")),
]
