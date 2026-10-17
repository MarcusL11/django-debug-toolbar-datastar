# Installed wheel check

Build a source archive and wheel, then install the wheel in a new environment:

```sh
uv build --out-dir /tmp/django-datastar-dist
python tests/release/check_wheel.py /tmp/django-datastar-dist/*.whl
```

The check verifies the source archive, static files, template, panel script, and stored panel data.
It runs the smoke test outside the checkout.
Use `python -m build` if you do not use `uv build`.
