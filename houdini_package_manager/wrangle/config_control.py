import json
import os
import pathlib
import platform
import re
import subprocess
import winreg


class HouMeta:

    """
    A controller to keep track of metadata and package data for different Houdini versions on the current machine.

    Arguments:
        only_hou_installs : bool
            Set to False to get paths to both Houdini application directories and related components like LicenseServer.
            The default is True which only gets paths to Houdini application directories.
    """

    def __init__(self, only_hou_installs=True) -> None:
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
                path = self._houdini_pref_dir(os.path.join(directory, "bin\\hconfig.exe"))
                houdini_dirs[version] = path

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
                configs[i] = PackageConfig(config)

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

    def _houdini_pref_dir(self, hconfig_path: str) -> str:
        """
        Execute hconfig for a certain version of Houdini and return the value of $HOUDINI_USER_PREF_DIR from it
        """

        env_var = "HOUDINI_USER_PREF_DIR"
        env_vars = self.get_env_vars(hconfig_path, env_var)
        return env_vars[env_var]

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

    def __init__(self, config: str) -> None:
        package_data = self.load(config)
        package_data = self.flatten_dict(package_data)

        package_data = self.resolve_variables(package_data)
        self.config = package_data

        paths = self.find_paths(package_data)

        # remove paths that can't be resolved
        # if the path can't be resolved then it probably points to something that isn't a plugin anyway
        keys_to_delete = []
        for key, value in paths.items():
            if not os.path.exists(value):
                keys_to_delete.append(key)
        for key in keys_to_delete:
            del paths[key]
        del keys_to_delete

        # search paths for plugin HDAs (\otls)

        self.plugin_paths = paths

    def flatten_dict(self, d: dict, parent_key="", sep=".") -> dict:
        """
        Flatten a dictionary such that none of the key-value pairs are nested.
        De-nested keys have their name converted into the hierarchy they were de-nested from to prevent key name collisions.
        """

        items = []
        for key, value in d.items():
            new_key = f"{parent_key}{sep}{key}" if parent_key else key
            if isinstance(value, dict):
                items.extend(self.flatten_dict(value, new_key, sep=sep).items())
            elif isinstance(value, list):
                for i, val in enumerate(value):
                    list_key = f"{new_key}{sep}{i}"
                    if isinstance(val, dict):
                        items.extend(self.flatten_dict(val, list_key, sep=sep).items())
                    else:
                        items.append((list_key, val))
            else:
                items.append((new_key, value))
        return dict(items)

    def resolve_variables(self, data: dict) -> dict:
        """
        Search a dict for the use of variables (denoted with '$...') and replace them with the variable's value.
        Does not search in nested lists for dict key values.
        """

        # Iterate through all keys in the dictionary
        for key in data:
            # Check if the value is a string
            if isinstance(data[key], str):
                # Look for $ character in the string
                index = data[key].find("$")

                # If $ character is found, replace with variable value
                while index != -1:
                    start_index = index + 1
                    end_index = start_index

                    # Find the end index of the variable name
                    while end_index < len(data[key]) and data[key][end_index].isalnum():
                        end_index += 1

                    # Get the variable name
                    var_name = data[key][start_index:end_index]

                    # Replace the variable with its value
                    data[key] = data[key][:index] + data.get(var_name, "") + data[key][end_index:]

                    # Look for $ character again
                    index = data[key].find("$")

        return data

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

    def find_paths(self, data: dict) -> dict:
        """
        Find all the paths in a dict.

        Paths are found with regex.
        The regex pattern matches Windows-style and Unix-style file paths.
        Supported delimiter matching:
            Single backslashes
            Double backslashes
            Single forward slashes
            Double forward slashes
        """

        paths = {}
        for key, value in data.items():
            if type(value) is str:
                # pattern that matches file paths
                pattern = r"([a-zA-Z]:|[\\/])(?:[\\/][^\\/:\*\?\"<>\|\r\n]+)*[\\/][^\\/:\*\?\"<>\|\r\n]*"
                match = re.search(pattern, value)

                if match:
                    paths[key] = value

        return paths
