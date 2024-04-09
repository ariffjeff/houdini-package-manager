from pathlib import Path


class PackageTemplates:
    """
    Various package template formats.
    """

    @staticmethod
    def standard(houdini_path: Path):
        """
        A standard package template.

        Houdini will recognize:
            HOUDINI_PATH
            hpath (Shortcut to set HOUDINI_PATH. "path" has been deprecated in favor of hpath.)
            HOUDINI_TOOLBAR_PATH
            HOUDINI_OTLSCAN_PATH
            PYTHONPATH
            enable
            recommends

        Note: Do not include empty values for some keys, like recommends,
        because it was cause Houdini to crash on startup.
        """

        if not houdini_path.exists():
            raise FileNotFoundError(f"Does not exist: {houdini_path}")

        houdini_path = str(houdini_path)

        package = {
            "env": [
                {"HOUDINI_PATH": houdini_path},
                {"HOUDINI_OTLSCAN_PATH": "$HOUDINI_PATH/otls"},
                {"HOUDINI_TOOLBAR_PATH": "$HOUDINI_PATH/toolbar"},
                {"PYTHONPATH": "$HOUDINI_PATH/scripts/python"},
            ]
        }

        return package
