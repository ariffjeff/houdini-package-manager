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
        because it was cause older versions of Houdini to crash on startup.
        """

        if not path_to_plugin.exists():
            raise FileNotFoundError(f"Does not exist: {path_to_plugin}")

        """
        The following package template is designed to be as simple and
        functional as possible. It leverages the behavior of hconfig.exe,
        which does not overwrite the HOUDINI_PATH environment variable
        whenever a new instance of HOUDINI_PATH is found in another JSON
        config. Instead, it prepends its value to previously set HOUDINI_PATH
        variables in other package JSON config files by default. Other
        environment variable key names will have their values overwritten
        if they are found in multiple package JSON config files.

        Extra paths that point to a plugin's additional folders, such as
        toolbars, OTLs, and scripts, are not required in the following
        template since Houdini automatically searches for them. As
        long as the path to the main plugin directory is included in
        the config and the plugin directory follows the standard package
        structure, the HOUDINI_PATH environment variable is sufficient
        to ensure that a typical plugin and all its components are
        loaded correctly by Houdini.

        An additional benefit of including the plugin path as a value
        of HOUDINI_PATH is that HOUDINI_PATH can be used as a variable
        ("$HOUDINI_PATH") in other parts of the JSON config. hconfig
        will recognize this when parsing the config.
        """
        package_config = {"env": [{"HOUDINI_PATH": str(path_to_plugin)}]}

        return package_config
