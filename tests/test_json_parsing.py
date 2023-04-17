from houdini_package_manager.wrangle.config_control import PackageConfig


class TestPackageVariableResolution:
    """
    Test the validity of a package after all possible variable calls have been replaced with their respective values.
    """

    def test_simple_package(self):
        """
        A simple test for variable resolution of a JSON package with a flat hierarchy.
        """

        expected_key_vals = [
            ["MAIN_VAR", "something - text - the end"],
            [
                "HELLO",
                (
                    "VARIABLE_VALUE, something - text - the end, iojh, C:/Users/User/Documents/Megascans"
                    " Library/support/plugins/houdini/4.6/MSLiveLink - 987y6"
                ),
            ],
            ["path", "C:/Users/User/Documents/Megascans Library/support/plugins/houdini/4.6/MSLiveLink"],
            ["res", 3],
            ["bool", False],
            [
                "fud",
                (
                    "D:/VARIABLE_VALUE, something - text - the end, iojh, C:/Users/User/Documents/Megascans"
                    " Library/support/plugins/houdini/4.6/MSLiveLink - 987y6/oc.pm3"
                ),
            ],
            [
                "fuhd",
                (
                    "D://$NOVAR/cdd//VARIABLE_VALUE, something - text - the end, iojh,"
                    " C:/Users/User/Documents/Megascans Library/support/plugins/houdini/4.6/MSLiveLink - 987y6.mp4"
                ),
            ],
            ["abg", "text - the end"],
            ["final", "the end"],
        ]

        package_path = r"tests\test_packages\package_standard_simple.json"
        config = PackageConfig(package_path)
        config.resolve_vars()
        assert config.config == expected_key_vals

    def test_standard_package(self):
        """
        A more complicated test for variable resolution of a JSON package with a hierarchy of nested keys and values.
        """

        expected_key_vals = [
            ["path", "$HOUDINI_PACKAGE_PATH/../SideFXLabs/351-embedded/SideFXLabs18.5"],
            ["load_package_once", True],
            ["int", 0],
            ["enable", "houdini_version >= '18.5' and houdini_version < '18.6'"],
            ["version", "18.5.351"],
            ["C", "WRONG-VALUE!!!"],
            ["env", 0, "sidefxlabs_current_version", "351-embedded"],
            ["env", 0, "C", "last"],
            ["env", 1, "SIDEFXLABS", "$HOUDINI_PACKAGE_PATH/../SideFXLabs/351-embedded/SideFXLabs18.5"],
            ["env", 2, "PATH", "method", "prepend"],
            ["env", 2, "PATH", "value", 0, "$HOUDINI_PACKAGE_PATH/../SideFXLabs/351-embedded/SideFXLabs18.5/bin"],
            ["env", 2, "PATH", "value", 1, "test"],
            ["a", "first"],
            ["other", "first and middle, ($NOVAR) & last"],
            ["B", "middle"],
        ]

        package_path = r"tests\test_packages\package_standard.json"
        config = PackageConfig(package_path)
        config.resolve_vars()
        assert config.config == expected_key_vals


def test_flatten_package():
    """
    Tests whether the 'flatten_package' method correctly flattens a given JSON object into a list of paths to each value.
    """

    expected_paths = [
        ["path", "$SIDEFXLABS"],
        ["load_package_once", True],
        ["int", 0],
        ["enable", "houdini_version >= '18.5' and houdini_version < '18.6'"],
        ["version", "18.5.351"],
        ["C", "WRONG-VALUE!!!"],
        ["env", 0, "sidefxlabs_current_version", "351-embedded"],
        ["env", 0, "C", "last"],
        ["env", 1, "SIDEFXLABS", "$HOUDINI_PACKAGE_PATH/../SideFXLabs/351-embedded\\SideFXLabs18.5"],
        ["env", 2, "PATH", "method", "prepend"],
        ["env", 2, "PATH", "value", 0, "$SIDEFXLABS/bin"],
        ["env", 2, "PATH", "value", 1, "test"],
        ["a", "first"],
        ["other", "$A and $B, ($NOVAR) & $C"],
        ["B", "middle"],
    ]

    package_path = r"tests\test_packages\package_standard.json"
    config = PackageConfig(package_path)
    assert config.config == expected_paths
