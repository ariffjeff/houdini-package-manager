from pathlib import Path


class PackageTemplates:
    """
    Various package template formats.
    """

    @staticmethod
    def standard(data_path: Path) -> dict:
        """
        A standard package config JSON template that allows Houdini to find and load data from
        standard named folders:
        data_path/
            /otls/
            /scripts/
            /toolbar/
            /vex/

        Arguments:
            data_path (pathlib.Path):
                The path to the directory that contains additional user/company Houdini data folders such as /otls, /scripts, /vex, /toolbars, etc.
                This is literally just the path that goes into the $HOUDINI_PATH (hpath) env var.

        Package keywords Houdini will recognize:
            HOUDINI_PATH
            hpath (Shortcut to set HOUDINI_PATH. "path" has been deprecated in favor of hpath.)
            HOUDINI_TOOLBAR_PATH
            HOUDINI_OTLSCAN_PATH
            PYTHONPATH
            enable
            recommends

        Note: Do not include empty values for some keys, like recommends,
        because it causes older versions of Houdini to crash on startup.
        """

        if not data_path.exists():
            raise FileNotFoundError(f"Does not exist: {data_path}")

        """
        Note: HOUDINI_PATH and hpath are sometimes used interchangeably in this
        documentation since hpath is an alias of HOUDINI_PATH. Use whichever
        makes the most sense at any given moment.

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

        HOUDINI_VEX_PATH is included explicitly since a /vex folder
        is apparently not recognized by HOUDINI_PATH by default.

        hpath is included explicitly to accommodate the needed inclusion
        of HOUDINI_VEX_PATH. Putting HOUDINI_PATH in HOUDINI_VEX_PATH
        like the following causes Houdini not to recognize the vex folder
        for some reason.
        "HOUDINI_VEX_PATH": "$HOUDINI_PATH/vex"
        Therefore HOUDINI_PATH was changed to hpath with the whole config
        restructured as a workaround.

        An additional benefit of including the data path as a value
        of USER_DATA is that USER_DATA can be used as a variable
        ("$USER_DATA") in other parts of the JSON config. hconfig
        will recognize this when parsing the config.
        """

        package_config = {
            "env": [{"USER_DATA": str(data_path)}, {"HOUDINI_VEX_PATH": "$USER_DATA/vex"}],
            "hpath": "$USER_DATA;",
        }

        return package_config
