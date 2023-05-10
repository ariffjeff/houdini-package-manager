from pathlib import Path

from houdini_package_manager.wrangle.config_control import Package


class TestPackageVariableResolution:
    """
    Test the validity of a package after all possible variable calls have been replaced with their respective values.
    """

    def test_simple_package(self):
        """
        A simple test for variable resolution of a JSON package with a flat hierarchy.
        """

        # the formatting is strange because of Black formatting for the line length rule
        expected_resolved_config = [
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

        package_path = Path(r"tests\test_packages\package_standard_simple.json")
        package_data = Package(package_path)
        assert package_data.config == expected_resolved_config

    def test_standard_package(self):
        """
        A more complicated test for variable resolution of a JSON package with a hierarchy of nested keys and values.
        """

        expected_resolved_config = [
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

        package_path = Path(r"tests\test_packages\package_standard.json")
        package_data = Package(package_path)
        assert package_data.config == expected_resolved_config


def test_flatten_package():
    """
    Tests whether the 'flatten_package' method correctly flattens a given JSON object into a list of paths to each value.
    """

    expected_flattened_config = [
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

    package_path = Path(r"tests\test_packages\package_standard.json")
    package_data = Package(package_path)
    config = package_data._flatten_package(package_data._raw_json)

    assert config == expected_flattened_config


def test_invalid_slashes():
    """
    Test if invalid JSON single backslashes are parsed correctly by the JSONPathDecoder class.
    """

    expected_loaded_config = {
        "env": [{"MOPS": "C:\\Users\\ariff\\Desktop\\dev\\DCCs\\houdini\\plugins\\MOPS-master"}],
        "path": "$MOPS",
    }

    package_path = Path(r"tests\test_packages\package_invalid_slashes.json")
    package_data = Package(package_path)
    assert package_data._raw_json == expected_loaded_config


def test_handle_circular_referencing_vars():
    expected_loaded_config = [
        ["var_one", "$var_one"],
        ["var_two", "$var_two"],
        ["var_three", "something"],
        ["other", "something"],
    ]

    package_path = Path(r"tests\test_packages\package_circular_reference.json")
    package_data = Package(package_path)

    assert package_data.config == expected_loaded_config
    assert len(package_data.warnings) > 0
