import sys
from pathlib import Path


def _base_path() -> Path:
    """
    Return the absolute base Path of the current executing environment.
    This allows resource files to be located when the project is running from either the
    development environment or pyinstaller build environment.
    """

    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        base_path = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
        return base_path

    base_path = Path(__file__).resolve().parent
    return base_path


def epath(path: str, string=False) -> Path:
    """
    Combine the base path and a given relative path to produce a complete environment path.
    Returns a Path by default. Returns a string if string arg is True.
    """

    path = Path(_base_path(), path)

    if string:
        return str(path)

    return path
