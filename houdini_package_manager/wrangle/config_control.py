import json
import os
import platform
import re
import subprocess
import winreg
from itertools import takewhile
from pathlib import Path


class HoudiniManager:
    """
    A class for managing data related to multiple installed versions of Houdini.

    Attributes:
        install_directories (Dict[str, Path]):
            The directories containing the install locations of different Houdini versions.
            The keys are the version numbers. The values are the directories.

        hou_installs (Dict[HoudiniInstall]):
            A dictionary of all the installed versions of Houdini and their data.
    """

    def __init__(self, only_hou_installs=True) -> None:
        self.install_directories = self._get_houdini_paths()
        if only_hou_installs:
            self.install_directories = self.only_houdini_locations()

        self.hou_installs = {}

    def get_houdini_data(self):
        for version, path in self.install_directories.items():
            self.hou_installs[version] = HoudiniInstall(path)

    def _get_houdini_paths(self) -> dict:
        """
        Get the locations of Houdini installed software and related software, independent of OS.
        This includes any Houdini version and other components like LicenseServer.
        """

        opsys = platform.system()

        paths = {}
        if opsys == "Windows":
            paths = self._win_registry_values(r"SOFTWARE\Side Effects Software\Houdini")
        elif opsys == "Darwin" or opsys == "Linux":
            pass
        else:
            raise Exception("Could not determine operating system.")

        paths = {key: path for key, path in paths.items() if path.exists()}
        return paths

    def _win_registry_values(self, key_path: str) -> dict:
        """
        Get the values of a Windows registry key.
        Paths are converted to pathlib.Path objects.
        """

        try:
            # Open the registry key
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path)

            # Iterate over all values in the key
            values = {}
            i = 0
            while True:
                # Get the name, data, and type of the next value
                name, data, _ = winreg.EnumValue(key, i)
                name = self._houdini_version_name(name)
                if isinstance(data, str):
                    data = Path(data)
                values[name] = data
                i += 1
        except OSError:
            # no more values left
            pass

        return values

    def _houdini_version_name(self, version: str) -> str:
        """
        Get a combination of the major, minor, and patch version components from the full semantic version number
        of an installed version of Houdini.
        Removes the mystery 3rd middle version component that doesn't seem to matter or show up anywhere else.
        """

        # which components of the version number to use.
        # major, minor, mystery number, patch
        version_components = [True, True, False, False]

        if any(char.isalpha() for char in version):
            return version

        version = version.split(".")
        new_version = [item for item, bool_val in zip(version, version_components) if bool_val]
        new_version = ".".join(new_version)

        return new_version

    def only_houdini_locations(self) -> dict:
        """
        Remove paths that aren't Houdini install locations.
        e.g. This is a Houdini install directory:
            'C:/Program Files/Side Effects Software/Houdini 19.0.917'
        """

        keys_to_remove = []
        for key in self.install_directories:
            key_split = key.split(".")
            try:
                int(key_split[0])
            except Exception:
                keys_to_remove.append(key)

        install_dirs_copy = dict(self.install_directories)
        for key in keys_to_remove:
            del install_dirs_copy[key]

        return install_dirs_copy


class HoudiniInstall:
    """
    A manager of all the relevant data for a single installed version of Houdini.
    """

    def __init__(self, install_dir: Path) -> None:
        if install_dir and not isinstance(install_dir, Path):
            raise TypeError("install_dir must be a pathlib.Path object.")

        self.HFS = install_dir
        self.HB = Path(self.HFS, "bin")
        self.version = HouVersion(str(self.HFS))

        # get metadata from hconfig
        self.env_vars = self.run_hconfig()

        self.packages = PackageCollection(Path(self.env_vars["HOUDINI_USER_PREF_DIR"], "packages"), self.env_vars)

    def run_hconfig(self) -> list:
        """
        Execute Houdini's hconfig to generate the environment variables associated with an installed version of Houdini.

        Returns a list of the environment variables.
        """

        command = "hconfig"
        if platform.system() == "Windows":
            command += ".exe"

        command = Path(self.HB, command)

        result = subprocess.run([command], shell=True, capture_output=True, text=True)
        metadata = result.stdout.split("\n")
        metadata = dict(item.split(" := ") for item in metadata if len(item) > 0)
        # remove first and last quotes
        for key, value in metadata.items():
            if value[0] in ["'", '"'] and value[-1] in ["'", '"']:
                metadata[key] = value[1:-1]

        return metadata


class HouVersion:
    """
    Version components of a Houdini version.
    """

    def __init__(self, install_path: str) -> None:
        if install_path and not isinstance(install_path, str):
            raise TypeError("install_path must be a str.")

        self.full = self._extract_version(install_path)
        parts = self.full.split(".")
        self.major = parts[0]
        self.minor = parts[1]
        self.patch = parts[2]
        self.front = self.major + "." + self.minor

    def _extract_version(self, install_path) -> str:
        """
        Extract the version from the Houdini install path ($HFS).
        """
        ver = os.path.basename(install_path)
        ver = ver.split(" ")[1]
        return ver


class PackageCollection:
    """
    Package JSON configurations and the associated plugin data the configs point to.

    Arguments:
        packages_directory (str):
            The directory containing the JSON packages that Houdini references to find plugins.

        env_vars (dict[str]):
            The environment variables needed to help resolve variables found in package configuration
            files. They are aggregated by hconfig

        get_data (bool):
            Whether or not to automatically get the package data and its respective plugin data upon
            creation of the Packages object.
            Default is True.

    Attributes:
        plugin_paths (list):
            The paths from HOUDINI_PATH which is from hconfig. These are all
            the plugins paths from all the packages that hconfig found for a single installed
            version of Houdini.
    """

    def __init__(self, packages_directory: Path = None, env_vars: dict[str] = None, get_data=True) -> None:
        if packages_directory and not isinstance(packages_directory, Path):
            raise TypeError("directory must be a pathlib.Path object.")

        if not env_vars:
            env_vars = {}
        if not isinstance(env_vars, dict):
            raise TypeError("env_vars must be a dict.")

        if get_data and not isinstance(get_data, bool):
            raise TypeError("get_data must be a bool.")

        self.packages_directory = packages_directory
        self.env_vars = env_vars
        self.plugin_paths = []
        self.configs = []
        self.package_plugin_matches = {}

        if get_data:
            self.get_package_data()

    @property
    def parent_directory(self):
        if not self.packages_directory:
            return None
        return self.packages_directory.parent

    def get_package_data(self) -> None:
        """
        Finds the package configuration files for a version of Houdini and matches them to their respective plugin data.

        Returns:
            None
        """

        if not self.packages_directory:
            raise AttributeError(
                "directory is not set to any path. Make sure env_vars contains data as well if needed."
            )

        # add the package directory as a needed environment variable
        # which isn't automatically added by hconfig for some reason.
        HOUDINI_PACKAGE_PATH = "HOUDINI_PACKAGE_PATH"
        if HOUDINI_PACKAGE_PATH not in self.env_vars:
            self.env_vars.update({HOUDINI_PACKAGE_PATH: str(self.packages_directory) or ""})

        self.plugin_paths = self.extract_plugin_paths_from_HOUDINI_PATH(self.env_vars["HOUDINI_PATH"])

        files = next(os.walk(self.packages_directory))
        self.configs = [name for name in files[2] if ".json" in name]  # only .json files

        # match plugins to packages since both sets of data are obtained separately
        # because that is the easiest method of getting them
        for package_name in self.configs:
            self.package_plugin_matches[package_name] = self.match_plugins_to_package(package_name, self.env_vars)

    def match_plugins_to_package(self, package_name: str, env_vars: dict[str]) -> list[str]:
        """
        Try to find which JSON packages are associated with which plugin paths.
        Since both are obtained separately (a matter of path of least resistance),
        they need to be associated with eachother. This is done by reading the
        package configs, extracting any paths within, and comparing them to the
        existing plugin paths.

        Arguments:
            package_name (str):
                The filename of the JSON package to be analyzed.
            env_vars (dict[str]):
                The environment variables that apply to all the packages for an
                installed Houdini version.
        """

        # search for other os.path uses
        package_name = Path(self.packages_directory, package_name)

        config = self._load(package_name)

        config = self._flatten_package(config)
        # use the global env vars to help resolve any variables in the package config
        env_vars = [list(item) for item in env_vars.items()]
        merged_config = env_vars + config  # prepend environment variables
        merged_config = self._resolve_vars(merged_config)
        # only get the original package config that is now variable-resolved.
        # no need to do anything: the original list is automatically updated since lists are mutable.

        plugin_paths_from_config = self._find_plugin_paths(config)

        # now compare the manually extracted plugin paths to the ones produced by hconfig
        # in order to find which plugin directories match which package files

        matching_plugin_paths = []
        for path in plugin_paths_from_config:
            if path in self.plugin_paths:
                matching_plugin_paths.append(path)

        return matching_plugin_paths

    def extract_plugin_paths_from_HOUDINI_PATH(self, houdini_path: str) -> list[str]:
        """
        Extract all the paths from the value of the HOUDINI_PATH environment variable.
        The paths are the directories that Houdini will search for the plugin data (HDAs/OTLs).
        """

        plugin_paths = houdini_path.split(";")
        plugin_paths = [path for path in plugin_paths if os.path.exists(path)]

        return plugin_paths

    def _load(self, path: Path) -> dict:
        """
        Load json contents.
        Handles invalid json such as directory paths with single \\ character delimiters.
        """

        if not isinstance(path, Path):
            raise TypeError("path must be a pathlib.Path object.")

        # convert invalid json values that are paths with '\' to '\\' to prevent json loading error
        class JSONPathDecoder(json.JSONDecoder):
            def decode(self, s, **kwargs):
                regex_replacements = [
                    (re.compile(r"([^\\])\\([^\\])"), r"\1\\\\\2"),
                    (re.compile(r",(\s*])"), r"\1"),
                ]
                for regex, replacement in regex_replacements:
                    s = regex.sub(replacement, s)
                return super().decode(s, **kwargs)

        with open(path) as f:
            data = json.load(f, cls=JSONPathDecoder)

        return data

    def _flatten_package(self, data, prefix=None) -> list:
        """
        Recursively traverses a JSON-like data structure and returns a list of paths
        to each value. Each path is structured as its own list where each element is
        a key or the final value.

        Essentially produces a rudimentary tree data structure.

        Args:
            data (dict or list or scalar): A JSON-like data structure to traverse.
            prefix (list, optional): A list representing the current path being
                traversed. Defaults to None, in which case the prefix is initialized
                as an empty list.

        Returns:
            list: A list of paths, where each path is a list of keys and/or values
                representing a path to a value in the original data structure.
        """

        if prefix is None:
            prefix = []

        flat = []
        if isinstance(data, dict):
            for key, value in data.items():
                path = [*prefix, key]
                flat.extend(self._flatten_package(value, path))
        elif isinstance(data, list):
            for i, item in enumerate(data):
                path = [*prefix, i]
                flat.extend(self._flatten_package(item, path))
        else:  # str, int, bool
            flat.append([*prefix, data])
        return flat

    def _standard_paths(self, data: list[list]) -> list[list]:
        """
        Replace invalid double backslashes in paths with valid forward slashes.
        This ensures future regex operations do not encounter errors parsing escape characters.
        """

        for i, value in enumerate(data):
            value = value[-1]
            if isinstance(value, str) and ("/" in value or "\\" in value):
                value = value.replace("\\", "/")
                data[i][-1] = value
        return data

    def _split_indexes(self, nums: list[int], split_num: int) -> list[list[int]]:
        index = len(nums)
        for i, num in enumerate(nums):
            if num > split_num:
                index = i
                break

        start = nums[:index]
        end = nums[index:]
        return [start, end]

    def _replace_var_calls(self, data: list[list], var_calls: list, potential_var_names: list) -> list[list]:
        """
        Continuously replace variable calls with their respective values until no variable calls remain.
        Only replaces var calls if the variable exists to replace it with.
        Catches circular referencing variable calls.
        """

        # get all var inits
        # structure: [var name, var value, index of var initialization]
        var_inits = []
        known_vars = []
        [known_vars.append(call[0]) for call in var_calls if call[0] not in known_vars]
        for i, path in enumerate(data):
            if isinstance(path[-2], str) and path[-2].lower() in known_vars:
                var_inits.append([path[-2], path[-1], i])

        # replace var calls with var values
        for call, call_i, processed_vars in var_calls:
            # check for circular references
            if call in processed_vars:
                raise ValueError(f"Circular reference detected for variable '{call}'")
            processed_vars.add(call)

            # determine which var init to try to get value from first
            # get value from var init closest to var call and before the var call, or after
            var_init_indexes = [init[2] for init in var_inits if init[0].lower() == call]
            var_init_priority = self._split_indexes(var_init_indexes, call_i)
            var_index = var_init_priority[0][-1] if len(var_init_priority[0]) != 0 else var_init_priority[1][0]

            var_init_indexes = [init[2] for init in var_inits]
            var = var_inits[var_init_indexes.index(var_index)]

            # case insensitive replace
            compiled = re.compile(re.escape("$" + call), re.IGNORECASE)
            data[call_i][-1] = compiled.sub(var[1], data[call_i][-1])

            # check if the new value contains variable calls
            new_value = data[call_i][-1]
            if "$" in new_value:
                new_var_calls = [
                    [call, call_i, processed_vars.copy()]
                    for call in (
                        "".join(takewhile(str.isidentifier, call.lower())) for call in new_value.split("$")[1:]
                    )
                    if call and call in potential_var_names
                ]
                self._replace_var_calls(data, new_var_calls, potential_var_names)

        return data

    def _resolve_vars(self, config: list[list]) -> None:
        """
        Replace every variable call in a package config with the variable's value.

        Custom package data structure rules:
            The last list element is a value.
            The second last list element is a value's key.
            When variable call found, work backwards from the call to find the most recent
            declaration of variable (var names will always be the second last element).

        Arguments:
            config (list):
                A flattened package config. Each item of each sublist is a component
                of a "path" that points to the last value.
                e.g. ['env', 0, 'HOUDINI_PATH', 'C:/Users/user/Desktop/myplugin']
        """

        def is_variable(char: str) -> bool:
            """
            Check if a string is a valid character in a variable name.
            """

            return char.isalpha() or char.isdigit() or char == "_"

        config = self._standard_paths(config)

        while True:
            # get list of potential variables
            potential_var_names = []
            [
                potential_var_names.append(path[-2].lower())
                for path in config
                if isinstance(path[-2], str) and len(path) >= 2 and path[-2].lower() not in potential_var_names
            ]

            # find and extract variable calls
            var_calls = []
            for i, path in enumerate(config):
                if isinstance(path[-1], str) and "$" in path[-1]:
                    var_calls.extend(
                        [call, i, set()]
                        for call in ("".join(takewhile(is_variable, call.lower())) for call in path[-1].split("$")[1:])
                        if call and call in potential_var_names
                    )

            # break the loop if no more variable calls are found
            if not var_calls:
                break

            config = self._replace_var_calls(config, var_calls, potential_var_names)

        return config

    def _find_plugin_paths(self, data: list[list]) -> list[str]:
        """
        Find all the plugin paths in the package.
        Returns a list of all the valid paths.
        """

        # locate HOUDINI_PATH
        # Need to look for "path" (legacy of HOUDINI_PATH) as well since our manual reading of
        # the package config does not cause any paths in "path" to be automatically merged into HOUDINI_PATH,
        # as apposed to when packages are read by hconfig
        # HOUDINI_PATH or "path" can be anywhere in the chain, not only just [-2]
        data = [path for path in data if "HOUDINI_PATH" in path or "path" in path]
        data = [path for path in data if isinstance(path[-1], str) and os.path.exists(path[-1])]
        data = [path[-1] for path in data]
        return data
