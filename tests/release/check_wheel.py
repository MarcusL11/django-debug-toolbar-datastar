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
    wheels = [Path(path).resolve() for path in sys.argv[1:]]
    assert len(wheels) == 1 and wheels[0].is_file(), wheels
    check_source_archive(wheels[0].parent)

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        environment = root / "venv"
        subprocess.run([sys.executable, "-m", "venv", str(environment)], check=True)
        python = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        env = os.environ.copy()
        env.pop("PYTHONPATH", None)
        subprocess.run(
            [str(python), "-m", "pip", "install", str(wheels[0])],
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
