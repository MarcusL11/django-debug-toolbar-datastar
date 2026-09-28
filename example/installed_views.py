"""Loopback-only demo for the installed-distribution browser smoke."""

import os
from hashlib import sha256
from pathlib import Path

from django.http import Http404, HttpResponse

BUNDLE_HASH = "727844adfc825ee651fb93c544a2a739986f9a21820a94524b35f0cac470cf91"


def demo(request):
    datastar_script = (
        "" if request.GET.get("datastar") == "late" else '<script type="module" src="/__datastar_full.js"></script>'
    )
    return HttpResponse(
        """<!doctype html>
<html lang="en" data-signals='{"message":"Hello from installed wheel","count":1,"_private":"sample"}'>
<head><meta charset="utf-8"><title>Installed Datastar panel demo</title>
"""
        + datastar_script
        + """</head>
<body><h1>Installed Datastar panel demo</h1>
<button type="button" data-on:click="$count++">Increment</button></body></html>"""
    )


def bundle(request):
    path = os.environ.get("DATASTAR_FULL_BUNDLE")
    if not path:
        raise Http404
    try:
        source = Path(path).read_bytes()
    except OSError as error:
        raise Http404 from error
    if sha256(source).hexdigest() != BUNDLE_HASH:
        raise Http404
    return HttpResponse(source, content_type="text/javascript")
