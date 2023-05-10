from pathlib import Path


class PackageTemplates:
    """
    Various package template formats.
    """

    @staticmethod
    def standard(plugin_path: Path):
        """
        A standard package template.

        PLUGIN_PATH is a an arbitrary variable.

        Houdini will recognize:
            recommends
            path
            HOUDINI_TOOLBAR_PATH
            HOUDINI_OTLSCAN_PATH
            PYTHONPATH

        Note: Do not include empty values for some keys, like recommends,
        because it was cause Houdini to crash on startup.
        """

        if not plugin_path.exists():
            raise FileNotFoundError(f"Does not exist: {plugin_path}")

        plugin_path = str(plugin_path)

        package = {
            "env": [
                {"PLUGIN_PATH": plugin_path},
                {"HOUDINI_OTLSCAN_PATH": "$PLUGIN_PATH/otls"},
                {"HOUDINI_TOOLBAR_PATH": "$PLUGIN_PATH/toolbar"},
                {"PYTHONPATH": "$PLUGIN_PATH/scripts/python"},
            ],
            "path": "$PLUGIN_PATH",
        }

        return package
