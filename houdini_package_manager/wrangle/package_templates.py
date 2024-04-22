from pathlib import Path


class PackageTemplates:
    """
    Various package template formats.
    """

    @staticmethod
    def standard(path_to_plugin: Path):
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

        if not path_to_plugin.exists():
            raise FileNotFoundError(f"Does not exist: {path_to_plugin}")

        path_to_plugin = str(path_to_plugin)

        package = {
            "env": [
                {"HOUDINI_PATH": path_to_plugin},
                {"HOUDINI_OTLSCAN_PATH": "$HOUDINI_PATH/otls"},
                {"HOUDINI_TOOLBAR_PATH": "$HOUDINI_PATH/toolbar"},
                {"PYTHONPATH": "$HOUDINI_PATH/scripts/python"},
            ]
        }

        return package
