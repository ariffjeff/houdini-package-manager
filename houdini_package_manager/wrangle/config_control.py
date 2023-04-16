import json
import os
import pathlib
import platform
import re
import subprocess
import winreg
from itertools import takewhile


class HouMeta:

    """
    A controller to keep track of metadata and package data for different Houdini versions on the current machine.

    Arguments:
        only_hou_installs : bool
            Set to False to get paths to both Houdini application directories and related components like LicenseServer.
            The default is True which only gets paths to Houdini application directories.
    """

    def __init__(self, only_hou_installs=True) -> None:
        # get paths of installed versions of Houdini
        self.dirs_apps = self.get_houdini_paths()
        if only_hou_installs:
            self.only_houdini_locations()

        # get all environment variables for every installed version of Houdini
        self.env_vars = {}
        for version, directory in self.dirs_apps.items():
            self.env_vars[version] = self.get_env_vars(os.path.join(directory, "bin\\hconfig.exe"))

        self.get_package_dirs()
        self.get_packages()

    def get_houdini_paths(self) -> dict:
        """
        Get the locations of Houdini installed software and related software, independent of OS.
        This includes any Houdini version and other components like LicenseServer.
        """

        opsys = platform.system()

        if opsys == "Windows":
            return self._win_registry_values(r"SOFTWARE\Side Effects Software\Houdini")
        elif opsys == "Darwin" or opsys == "Linux":
            pass
        else:
            raise Exception("Could not determine operating system.")

    def _win_registry_values(self, key_path: str) -> dict:
        """
        Get the values of a Windows registry key.
        """

        try:
            # Open the registry key
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path)

            # Iterate over all values in the key
            values = {}
            i = 0
            while True:
                # Get the name, data, and type of the next value
                name, data, data_type = winreg.EnumValue(key, i)
                name = self._major_minor_version(name)
                values[name] = data
                i += 1
        except OSError:
            # no more values left
            pass

        return values

    def only_houdini_locations(self) -> None:
        """
        Remove paths that aren't houdini install location related
        """

        keys_to_remove = []
        for key in self.dirs_apps:
            key_split = key.split(".")
            try:
                int(key_split[0])
            except Exception:
                keys_to_remove.append(key)

        for key in keys_to_remove:
            del self.dirs_apps[key]
        del keys_to_remove, key_split

    def get_package_dirs(self, expand_search=True) -> None:
        """
        Get $HOUDINI_USER_PREF_DIR to determine packages dir location.

        Arguments:
            expand_search : bool
                If True, search the parent directories of the Houdini package directories to
                find other config directories for versions of Houdini that are not installed.
        """

        houdini_dirs = {}
        for version, directory in self.dirs_apps.items():
            if os.path.exists(directory):
                version = self._major_minor_version(version)
                houdini_dirs[version] = self.env_vars[version]["HOUDINI_USER_PREF_DIR"]

        self.dirs_packages_parents = self.get_package_parent_dirs(houdini_dirs)

        for version, directory in houdini_dirs.items():
            directory = os.path.join(directory, "packages")
            directory = str(pathlib.Path(directory))
            houdini_dirs[version] = directory
        self.dirs_packages = houdini_dirs

        # expand search to find package directories for versions of Houdini that are not installed
        if expand_search:
            all_houdini_dirs = {}
            for path in self.dirs_packages_parents:
                # search_path = pathlib.Path(path).parent
                folders = next(os.walk(path))[1]
                for folder in folders:
                    if "houdini" in folder:
                        version = folder.split("houdini")[1]
                        folder = os.path.join(path, folder, "packages")
                        if folder not in all_houdini_dirs:
                            all_houdini_dirs[version] = folder
            self.dirs_packages = all_houdini_dirs

    def get_packages(self) -> None:
        """
        Get all the json package configs from each packages directory.
        """

        packages = {}
        for version, path in self.dirs_packages.items():
            configs = next(os.walk(path))
            configs = [name for name in configs[2] if ".json" in name]  # only .json files

            # create package config object
            for i, file in enumerate(configs):
                config = str(pathlib.Path(path, file))
                if version in self.env_vars:  # installed houdini versions only
                    env_vars = self.env_vars[version]
                else:
                    env_vars = {}
                configs[i] = PackageConfig(config, env_vars)
                configs[i].setup()

            packages[version] = PackageCollection(path, configs)
        self.packages = packages

    def get_package_parent_dirs(self, paths: dict[str]) -> list:
        """
        Get the list of directories that contain all the different versions of Houdini's preferences.
        These can be useful for when searching for preferences/packages for versions of Houdini that are no longer installed.
        """

        config_dirs = []
        for _, path in paths.items():
            if path:
                path = str(pathlib.Path(path).parent)
                if path not in config_dirs:
                    config_dirs.append(path)
        return config_dirs

    def get_env_vars(self, hconfig_path: str, target_vars: str | list[str] = None) -> dict[str]:
        """
        Get the environment variables for a specific version of Houdini by executing hconfig.exe.

        Arguments:
            hconfig_path : str
                The path to hconfig.exe of a specific version of Houdini.
            vars : str | list[str]
                Desired env vars to only return out of all the env vars.

        Returns Houdini's common and user-set environment variables in a dict.
        """

        def is_special_env_vars(string: str) -> str:
            """
            Check if the line of the hconfig output is an env var that sets its value with ':='.
            """

            string = string.split(" ")
            if string[1] == ":=":
                return True
            return False

        output = subprocess.getstatusoutput([hconfig_path, "-p"])[1]
        output = output.split("\n")

        # extract env vars from output
        env_vars = {}
        for el in output:
            if len(el) > 0 and el[0] == "$":
                env_var = el.split(" = ", 1)
                env_var[0] = env_var[0].replace("$", "")
                env_vars[env_var[0]] = env_var[1].strip()
            elif len(el) > 0 and is_special_env_vars(el):
                env_var = el.split(" := ", 1)
                env_vars[env_var[0]] = env_var[1].strip()

        # only get desired env vars
        if target_vars:
            if isinstance(target_vars, str):
                target_vars = [target_vars]
            env_vars = self.isolate_vars(env_vars, target_vars)

        return env_vars

    def isolate_vars(self, given: list[str], target: list[str]) -> list[str]:
        """
        Get only the desired env vars from the given list of env vars.
        """

        isolated_vars = {}
        for key in target:
            try:
                isolated_vars[key] = given[key]
            except KeyError:
                print(f'"{key}" not found in Houdini environment variables.')
        return isolated_vars

    def _major_minor_version(self, version: str) -> str:
        """
        Get only the major and minor version from the full semantic version.
        """

        if any(char.isalpha() for char in version):
            return version

        version = version.split(".")[0:2]
        version = ".".join(version)
        return version


class PackageCollection:

    """
    A group of package configs and their collective path for a specific version of Houdini.
    """

    def __init__(self, path: str, configs: dict) -> None:
        self.path = path
        self.configs = configs


class PackageConfig:

    """
    A config json package file and its related path(s) to its installed plugin(s).

    Depending on the package file, there may be multiple paths that point to locations that aren't directly
    related to telling Houdini where the actual plugin directory is (which contains the HDAs in the /otls folder).
    This class grabs all the valid paths that its able to find (as well as those it can resolve from $VARIABLES).
    """

    def __init__(self, config_path: str, env_vars=None) -> None:
        if env_vars is None:
            env_vars = {}
        self.config_raw = self.load(config_path)
        self.config = self.flatten_package(self.config_raw)
        self._env_vars = env_vars
        self.warnings = None

        # # search paths for plugin HDAs (\otls)
        # # search paths for plugin HDAs (\otls)
        # # search paths for plugin HDAs (\otls)
        # # search paths for plugin HDAs (\otls)

    def setup(self) -> None:
        """
        Convert the package configuration and extracts any resolved paths from its values.
        """

        package_data = [list(item) for item in self._env_vars.items()] + self.config  # prepend environment variables
        package_data = self.resolve_vars(package_data)
        self.config = package_data
        self.plugin_paths = self.find_paths(package_data)

    def clean_paths(self, data: list[list]) -> list[list]:
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

    def resolve_vars(self, data: list[list]) -> list[list]:
        """
        Replace every variable call in a package config with the variable's value.

        Custom package data structure rules:
            The last list element is a value.
            The second last list element is a value's key.
            When variable call found, work backwards from the call to find the most recent
            declaration of variable (var names will always be the second last element).
        """

        data = self.clean_paths(data)

        while True:
            # get list of potential variables
            # cannot be a dict in order to avoid var name collisions
            # structure: [var name, var value]
            potential_var_names = []
            potential_var_names = [
                path[-2].lower()
                for path in data
                if isinstance(path[-2], str) and len(path) >= 2 and path[-2].lower() not in potential_var_names
            ]

            # find and extract variable calls
            var_calls = []
            for i, path in enumerate(data):
                if isinstance(path[-1], str) and "$" in path[-1]:
                    var_calls.extend(
                        [call, i, set()]
                        for call in (
                            "".join(takewhile(str.isidentifier, call.lower())) for call in path[-1].split("$")[1:]
                        )
                        if call and call in potential_var_names
                    )

            # break the loop if no more variable calls are found
            if not var_calls:
                break

            # get all var inits
            # structure: [var name, var value, index of var initialization]
            var_inits = []
            known_vars = [call[0] for call in var_calls]
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

    def flatten_package(self, data, prefix=None) -> list:
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
                flat.extend(self.flatten_package(value, path))
        elif isinstance(data, list):
            for i, item in enumerate(data):
                path = [*prefix, i]
                flat.extend(self.flatten_package(item, path))
        else:  # str, int, bool
            flat.append([*prefix, data])
        return flat

    def find_paths(self, data: list[list]) -> list[str]:
        """
        Find all the valid paths in the package.
        Returns a list of all the valid paths.
        """

        paths = [path[-1] for path in data if isinstance(path[-1], str) and os.path.exists(path[-1])]
        return paths

    def load(self, path: str) -> dict:
        """
        Load json contents.
        Handles invalid json such as directory paths with single \\ character delimiters.
        """

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
