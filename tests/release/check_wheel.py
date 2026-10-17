import argparse
import os
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path


def check_source_archive(directory):
    archives = list(directory.glob("*.tar.gz"))
    assert len(archives) == 1, archives
    with tarfile.open(archives[0]) as archive:
        paths = archive.getnames()
    for asset in (
        "src/django_datastar_toolbar/panels.py",
        "src/django_datastar_toolbar/templates/django_datastar_toolbar/panels/datastar_store.html",
        "src/django_datastar_toolbar/static/django_datastar_toolbar/js/datastar_store.js",
    ):
        assert any(path.endswith(asset) for path in paths), asset


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("wheel", type=Path)
    parser.add_argument("--constraints", type=Path)
    args = parser.parse_args()
    wheel = args.wheel.resolve()
    assert wheel.is_file(), wheel
    check_source_archive(wheel.parent)
    constraints = args.constraints.resolve() if args.constraints else None
    if constraints is not None:
        assert constraints.is_file(), constraints

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        environment = root / "venv"
        subprocess.run([sys.executable, "-m", "venv", str(environment)], check=True)
        python = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        env = os.environ.copy()
        env.pop("PYTHONPATH", None)
        pip_args = [str(python), "-m", "pip", "install"]
        if constraints is not None:
            pip_args.extend(["-c", str(constraints)])
        subprocess.run(
            [*pip_args, str(wheel)],
            cwd=root,
            env=env,
            check=True,
        )
        smoke = Path(__file__).with_name("installed_smoke.py").resolve()
        subprocess.run(
            [str(python), "-I", str(smoke), str(environment)],
            cwd=root,
            env=env,
            check=True,
        )


if __name__ == "__main__":
    main()
