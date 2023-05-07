import json
import os
import platform
import re
import subprocess
import winreg
from itertools import takewhile
from pathlib import Path
from typing import Union


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

    def get_houdini_data(self, versions: Union[str, list[str]] = None) -> None:
        """
        Get the package data and relevant meta data for each installed version of Houdini.
        If an install has no package data then the config will simply be empty.

        Arguments:
            version (Union[str, list[str]]):
                Get all data for only the given Houdini version(s). If the data already exists
                for a version then it is replaced by a new set of data.
        """

        if isinstance(versions, str):
            versions = [versions]

        # replace only the data for the given versions
        if versions:
            for ver in versions:
                try:
                    self.hou_installs[ver] = HoudiniInstall(self.install_directories[ver])
                except KeyError as e:
                    raise KeyError(
                        f"Houdini version {e} is not in the dict of known Houdini install directories."
                    ) from e
            return

        for ver, path in self.install_directories.items():
            self.hou_installs[ver] = HoudiniInstall(path)

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

        # only get houdini version paths
        pattern = re.compile(r"^\d+\.\d+")  # match version numbers (19.0 & 19.5.123)
        paths = {k: v for k, v in paths.items() if pattern.match(k)}

        # sort dict items by key version number in descending order (largest version number first)
        paths = dict(sorted(paths.items(), key=lambda x: tuple(map(int, x[0].split("."))), reverse=True))
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

    def get_package_data(self, named=True) -> dict:
        """
        Get the ordered list of data for all the packages for a single version of Houdini.

        Arguments:
            named (bool):
                Whether or not the returned data should be a dict with the data names as keys or a list of just the values.
                Default is True.
        """
        if named:
            data = {}
            for name, pkg in self.packages.configs.items():
                data[name] = pkg.table_model
        else:
            data = []
            for _name, pkg in self.packages.configs.items():
                data.append(list(pkg.table_model.values()))
        return data

    def get_package_warnings(self) -> list[str]:
        """
        Get the warnings for each package.
        """

        data = {}
        for name, pkg in self.packages.configs.items():
            data[name] = pkg.warnings
        return data

    def get_labels(self) -> list[str]:
        for _, pkg in self.packages.configs.items():
            return list(pkg.table_model.keys())


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
        hconfig_plugin_paths (list):
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
        self.hconfig_plugin_paths = []
        self.configs = {}
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

        self.hconfig_plugin_paths = self.extract_plugin_paths_from_HOUDINI_PATH(self.env_vars["HOUDINI_PATH"])

        files = next(os.walk(self.packages_directory))
        files = [name for name in files[2] if ".json" in name]  # only .json files
        for file in files:
            self.configs[Path(file).stem] = Package(
                Path(self.packages_directory, file), self.hconfig_plugin_paths, self.env_vars
            )

    def extract_plugin_paths_from_HOUDINI_PATH(self, houdini_path: str) -> list[Path]:
        """
        Extract all the paths from the value of the HOUDINI_PATH environment variable.
        The paths are the directories that Houdini will search for the plugin data (HDAs/OTLs).

        Returns a list of pathlib.Path paths that exist.
        """

        plugin_paths = houdini_path.split(";")
        plugin_paths = [Path(path) for path in plugin_paths]
        plugin_paths = [path for path in plugin_paths if path.exists()]

        return plugin_paths


class Package:
    def __init__(self, config_path: Path, hconfig_plugin_paths: list[Path] = None, env_vars: dict[str] = None) -> None:
        """
        A single JSON package file and its configuration and related data.

        If hconfig_plugin_paths is not given, manually determine which plugins the package are pointing to since
        we cannot use all_plugin_paths as a helping guide which was extracted from hconfig.

        Arguments:
            config_path (pathlib.Path):
                The file path of the package .json file.

            hconfig_plugin_paths (list[str]):
                The list of paths extracted from the HOUDINI_PATH environment variable produced by hconfig.
                These paths are associated with all packages for an installed version of Houdini.

            env_vars (dict[str]):
                The environment variables that apply to all the packages for an
                installed Houdini version.
        """

        if not isinstance(config_path, Path):
            raise TypeError("package_path must be a pathlib.Path object.")

        if not hconfig_plugin_paths:
            hconfig_plugin_paths = []
        if not isinstance(hconfig_plugin_paths, list) or not all(
            isinstance(path, Path) for path in hconfig_plugin_paths
        ):
            raise TypeError("all_plugin_paths must be a list of pathlib.Path objects.")

        if env_vars and not isinstance(env_vars, dict):
            raise TypeError("env_vars must be a dict.")

        self.config_path = config_path

        self._hconfig_plugin_paths = hconfig_plugin_paths
        self._env_vars = env_vars or {}
        self._plugin_paths = []
        self.date_installed = None
        self.warnings = []

        self._load()
        self.config = self._flatten_package(self.config)

        self.resolve()
        self.extract_data()

        ###############################
        # set data determined by config
        ###############################

        # enable
        self._enable = self.is_enabled()
        self.version = None
        self.author = None

    @property
    def env_vars(self):
        return self._env_vars

    @property
    def plugin_paths(self):
        return self._plugin_paths

    @property
    def name(self):
        return self.config_path.stem

    @property
    def enable(self):
        return self._enable

    @enable.setter
    def enable(self, toggle: bool):
        if not isinstance(toggle, bool):
            raise TypeError("enable must be a bool.")

        self._enable = toggle

        # set in self.config
        if "enable" in self.config_keys:  # set existing key's value
            i = self.config_keys.index("enable")
            self.config[i][-1] = toggle
        else:  # create new key
            self.config.insert(0, ["enable", toggle])

        # set in .json config
        self._raw_json["enable"] = toggle  # enable is a top-level key, so this just works
        with open(self.config_path, "w") as outfile:
            json.dump(self._raw_json, outfile, indent=4)

    # convenient way to access all the config key-value assignments
    @property
    def config_keys(self):
        return [path[-2] for path in self.config]

    @property
    def config_values(self):
        return [path[-1] for path in self.config]

    @property
    def table_model(self):
        # the order here is how the columns are ordered in the GUI
        return {
            "Enable": self.enable,
            "Name": self.name,
            "Version": self.version,
            "Author": self.author,
            "Date Installed": self.date_installed,
            "Config": self.config_path,
            "Plugins": self.plugin_paths,
        }

    def is_enabled(self) -> bool:
        """
        Returns True or False based on whether or not the package is
        enabled according to its top-level "enable" variable.
        """

        if "enable" in self.config_keys:
            enabled = self.config_values[self.config_keys.index("enable")]
            # account for user using wrong type
            if isinstance(enabled, str) and enabled.lower() == "false":
                return False
            elif isinstance(enabled, str) and enabled.lower() == "true":
                return True
            return enabled
        return True

    def resolve(self) -> None:
        """
        Call all the methods necessary to convert the loaded package data into an easily
        readable format by flattening it and resolving all possible variables.

        Also tries to find which JSON packages are associated with which plugin paths.
        Since both are obtained separately (a matter of path of least resistance),
        they need to be associated with eachother. This is done by reading the
        package configs, extracting any paths within, and comparing them to the
        existing plugin paths.
        """

        config = self.config
        # use the global env vars to help resolve any variables in the package config
        env_vars = [list(item) for item in self._env_vars.items()]
        merged_config = env_vars + config  # prepend environment variables
        merged_config = self._resolve_vars(merged_config)
        # only get the original package config that is now variable-resolved.
        # no need to do anything: the original list is automatically updated since lists are mutable.
        self.config = config

    def extract_data(self) -> None:
        """
        Extract the relevant config data needed to populate the package manager Qt table.

        This operation can fail to get the data if the package has problems that the user needs to fix,
        such as circular variable references that can't be resolved. If a path contains a circular
        reference then this method will ignore it since it won't be a valid path.
        """

        plugin_paths_from_config = self._find_plugin_paths(self.config)

        # now compare the manually extracted plugin paths to the ones produced by hconfig
        # in order to find which plugin directories match which package files.
        # plugin paths and packages are obtained separately because that
        # is the easiest method of getting them.
        for path in plugin_paths_from_config:
            if path in self._hconfig_plugin_paths:
                self._plugin_paths.append(path)

    def _load(self) -> None:
        """
        Load json contents.
        Handles invalid json such as directory paths with single \\ character delimiters.
        """

        if not isinstance(self.config_path, Path):
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

        with open(self.config_path) as f:
            data = json.load(f, cls=JSONPathDecoder)

        self._raw_json = data
        self.config = data

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
                self.warnings.append(f"Can't process package! Circular reference detected for variable: '{call}'")
                return
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
            Check if a string is a valid character that would make up a standard variable name.
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

            # break the loop if no more variable calls are found or there are errors with the package that can't be parsed
            if not var_calls or self.warnings:
                break

            config = self._replace_var_calls(config, var_calls, potential_var_names)

        return config

    def _find_plugin_paths(self, paths: list[list]) -> list[str]:
        """
        Find all the plugin paths in the package.
        Returns a list of all the valid paths.
        """

        def split_paths(string: str) -> list:
            """
            Split a combined string of multiple paths into individual paths.
            Removes trailing separators.
            """
            if string[-2:] == ";&":
                string = string[:-2]
            elif string[-1] == ";":
                string = string[:-1]
            string = string.split(";")
            return string

        # locate HOUDINI_PATH
        # Need to look for "path" (legacy of HOUDINI_PATH) as well since our manual reading of
        # the package config does not cause any paths in "path" to be automatically merged into HOUDINI_PATH,
        # as apposed to when packages are read by hconfig
        # HOUDINI_PATH or "path" can be anywhere in the chain, not only just [-2]
        paths = [path for path in paths if "HOUDINI_PATH" in path or "path" in path or "hpath" in path]
        paths = [path for path in paths if isinstance(path[-1], str)]
        new_paths = []
        [new_paths.extend(split_paths(path[-1])) for path in paths]
        paths = new_paths
        paths = [Path(path) for path in paths]
        paths = [path for path in paths if path.exists()]
        return paths
