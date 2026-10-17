# Installed wheel check

Build a source archive and wheel, then install the wheel in a new environment:

```sh
uv build --out-dir /tmp/django-datastar-dist
python tests/release/check_wheel.py /tmp/django-datastar-dist/*.whl
```

Use the minimum dependency versions in a second check:

```sh
python tests/release/check_wheel.py --constraints tests/release/constraints-min.txt /tmp/django-datastar-dist/*.whl
```

CI tests the minimum versions and the latest compatible versions on Python 3.10 and 3.13.
Both checks use a new environment for the installed wheel.

The check verifies the source archive, static files, template, panel script, and stored panel data.
It runs the smoke test outside the checkout.
Use `python -m build` if you do not use `uv build`.
