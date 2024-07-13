from __future__ import annotations

import json
import logging
import os
import platform
import re
import subprocess
from itertools import takewhile
from pathlib import Path

from houdini_package_manager.meta.meta_tools import TableHeaders
from houdini_package_manager.wrangle.repository import GitProject
from houdini_package_manager.wrangle.url import Url


class HoudiniManager:
    """
    A class for managing data related to multiple installed versions of Houdini.

    Arguments:
        only_hou_installs (bool):
            Remove any paths that aren't Houdini install paths.
            This will remove the LicenceServer path for example.

    Attributes:
        install_directories (Dict[str, Path]):
            The directories containing the install locations of different Houdini versions.
            The keys are the version numbers. The values are the directories.

        hou_installs (Dict[str, HoudiniInstall]):
            A dictionary of all the installed versions of Houdini and their data.
    """

    def __init__(self, only_hou_installs=True) -> None:
        self.install_directories = self._get_houdini_paths()
        if only_hou_installs:
            self.install_directories = self.only_houdini_locations()

        logging.debug(f"Using these installs:\n{self.install_directories}\n")
        self.hou_installs = {}

    def get_houdini_data(self, versions: str | list[str] = None) -> None:
        """
        Get the package data and relevant meta data for each installed version of Houdini.
        If an install has no package data then the config will simply be empty.

        Arguments:
            version (str | List[str]):
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
        logging.debug(f"Houdini install paths:\n{paths}\n")
        return paths

    def _win_registry_values(self, key_path: str) -> dict:
        """
        Get the values of a Windows registry key.
        Paths are converted to pathlib.Path objects.
        """

        import winreg

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

        logging.debug(f"Houdini relevant registry keys detected:\n{values}\n")
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
        self.env_vars = self._get_env_vars()
        self.packages = self._get_pkgs()
        self._final_debug_logs()

    def _final_debug_logs(self) -> None:
        """
        Various debug logs to explain the results of this Houdini version's extracted package/plugin data.
        """

        if not self.packages:
            return

        logging.debug(f"Houdini {self.version.full} PACKAGE CONFIGS:")
        for pkg in self.packages.pkgs.values():
            logging.debug(pkg.config_path)
        logging.debug("\n")

        logging.debug(f"Houdini {self.version.full} PLUGINS:")
        for plugin in self.packages.hconfig_plugin_paths:
            logging.debug(plugin)
        logging.debug("\n")

    def _get_pkgs(self) -> PackageCollection | None:
        """
        Returns the PackageCollection object for this Houdini version.
        Returns None if the Houdini user preferences directory does not exist as an environment variable.
        """

        HOU_PKG_DIR_KEY = "HOUDINI_USER_PREF_DIR"
        # if hconfig.exe failed to produce the "HOUDINI_USER_PREF_DIR" env var or any env var data
        # because maybe the houdini install is corrupted somehow, then no package data can be retrieved.
        logging.debug(f"Houdini {self.version.full} ENV VARS:")
        for key, value in self.env_vars.items():
            logging.debug(f"{key} = {value}")
        logging.debug("\n")

        if HOU_PKG_DIR_KEY in self.env_vars:
            return PackageCollection(Path(self.env_vars[HOU_PKG_DIR_KEY], "packages"), self.env_vars)

        logging.warning(
            f"'{HOU_PKG_DIR_KEY}' was missing from Houdini {self.version.front}'s environment variables.\nThis means"
            " that hconfig.exe probably failed to return it, thus any of this Houdini version's installed packages are"
            " not able to be found."
        )
        return None

    def _get_env_vars(self) -> list:
        """
        Executes Houdini's hconfig.exe via a Python subprocess in order to get the generated Houdini environment variables (keys and values) that
        hconfig processes from the json package config files.

        hconfig.exe can only be run by a compatible Python version that Houdini shipped with (Windows only: https://www.sidefx.com/docs/houdini/hom/index.html#which-python).
        So here we can either:
            1. Find and run a compatible Python by proxy in order to have it run hconfig.exe. This allows us to avoid needing to ship this project with multiple matching Python versions.
            or...
            2. Naively run any Houdini hconfig.exe's with whataver version of Python HPM is built with. For example, a Python3.9 subprocess calling an hconfig.exe that was build for
            Python3.10 will result in an error message being returned, and thus no env vars. No env vars means we can't process any package config data - the given Houdini version
            would have to be ignored entirely! If HPM is running hconfig naively, HPM's Python will need to be updated to match the latest Houdini's Python version on every major release.

        ### WARNING
        Due to the difficulty of getting Houdini environment variables (keys AND values) quickly and without errors, here are the
        different ways to go about it (hconfig and other methods).

        1. open houdini directly > Python Shell > hou.ui.packageInfo()
        - Returns plugin paths (some env var values and no keys), and other crap, can probably be extracted with regex
        - Only works directly in Houdini's python shell

        2. hython > hou.getenv("HOUDINI_PATH")
        - Returns plugin paths (not env vars!)

        3. python > subprocess call hython > import os; os.environ
        - Returns env var keys + values, including global Windows env vars.
        - Slow performance overhead to load hython

        4. python > subprocess > hconfig
        - Returns env var keys + values
        - fast performance
        - errors on incompatible python versions calling hconfig.exe (if this can be fixed then this is the ideal solution)

        5. Somehow find env vars a different way?
        ###

        Returns a list of the Houdini environment variables.
        """

        def _run_with_this_apps_python_naively(hconfig_path: Path) -> list[str]:
            # naively run given hconfig with this project's python version, which might be incompatible (would return useless data)

            subproc_return = subprocess.run(
                [hconfig_path], cwd=hconfig_path.parent, shell=True, capture_output=True, text=True
            )
            subproc_stdout = subproc_return.stdout

            if subproc_stdout:
                logging.debug(f"HCONFIG RETURNED:\n{subproc_stdout}\n")
            else:
                logging.error("HCONFIG FAILED TO RETURN ANY DATA!...")
                logging.error("Subprocess to hconfig returned:")
                logging.error(f"args: {subproc_return.args}")
                logging.error(f"returncode: {subproc_return.returncode}")
                logging.error(f"stderr: {subproc_return.stderr}\n")

            metadata = subproc_stdout.split("\n")
            return metadata

        def _run_with_compatible_python(hconfig_path: Path, python_exe_path: Path) -> list[str]:
            # run hconfig based on the python version it was built for through two-layered subprocess calls.

            # THIS CURRENTLY DOES NOT WORK AS HCONFIG WILL STILL RETURN AN ERROR THINKING IT'S BEING CALLED BY THE
            # WRONG PYTHON VERSION, WHICH MAKES NO SENSE.

            command_main = [
                python_exe_path,
                "-c",
                (
                    f"import subprocess; result = subprocess.run(['{hconfig_path.as_posix()}'], capture_output=True,"
                    " text=True); print(result)"
                ),
            ]
            result = subprocess.run(
                command_main, cwd=hconfig_path.parent, shell=False, capture_output=True, text=True
            ).stdout

            if result:
                logging.debug(f"HCONFIG RETURNED:\n{result}\n")
            else:
                logging.error("HCONFIG FAILED TO RETURN ANY DATA!\n")

            result = re.findall(r'stdout="(.*?)"\s*,\s*stderr=', result)[0]  # extract inner subprocess return value
            metadata = result.split("\\n")
            return metadata

        logging.debug(
            f"Getting Houdini {self.version.full} install data (env vars from hconfig, package data from json)...\n"
        )

        # target the correct hconfig.exe
        hconfig = "hconfig"
        if platform.system() == "Windows":
            hconfig += ".exe"
        hconfig = Path(self.HB, hconfig)

        # run hconfig - choose the best method!
        metadata = _run_with_this_apps_python_naively(hconfig)
        # metadata = _run_with_compatible_python(hconfig, self.this_houdini_python_version())

        metadata = dict(item.split(" := ") for item in metadata if len(item) > 0)
        for key, value in metadata.items():  # remove first and last quotes
            if value[0] in ["'", '"'] and value[-1] in ["'", '"']:
                metadata[key] = value[1:-1]

        return metadata

    def this_houdini_python_version(self) -> Path | None:
        """
        Finds the latest installed version of Python that shipped with this Houdini (Windows only).
        Returns a Path object of the python directory.
        """

        hou_folders = os.listdir(self.HFS)
        python_folders = [folder for folder in hou_folders if re.match(r"python\d+", folder)]

        if not python_folders:
            return None

        installed_pythons = [
            Path(self.HFS, folder, "python.exe")
            for folder in python_folders
            if Path(self.HFS, folder, "python.exe").exists()
        ]
        return installed_pythons[0]

    def pkg_data_as_table_model(self, named=True) -> dict | list:
        """
        Get a list or dict of data for all the packages for a single version of Houdini, ordered as defined by the table model.

        Arguments:
            named (bool):
                Whether or not the returned data should be a dict with the data names as keys or a list of just the values.
                Default is True.
        """
        if named:
            data = {}
            for name, pkg in self.packages.pkgs.items():
                data[name] = pkg.table_model
        else:
            data = []
            for _name, pkg in self.packages.pkgs.items():
                data.append(list(pkg.table_model.values()))
        return data

    def get_package_warnings(self) -> list[str]:
        """
        Get the warnings for each package.
        """

        data = {}
        for name, pkg in self.packages.pkgs.items():
            data[name] = pkg.warnings
        return data

    def get_labels(self) -> list[str]:
        for _, pkg in self.packages.pkgs.items():
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
    Package JSON configurations and the associated plugin data the configs point to for a given Houdini version.

    Arguments:
        packages_directory (str):
            The directory containing the JSON packages that Houdini references to find plugins.

        env_vars (Dict[str, str]):
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

    def __init__(self, packages_directory: Path = None, env_vars: dict[str, str] = None, get_data=True) -> None:
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
        self.pkgs = {}  # Package objects
        self.package_plugin_matches = {}

        self.PACKAGES_GIT_DATA_PATH = Path("houdini_package_manager/user_data/package_repo_data.json")

        if get_data:
            self.create_pkgs()

    @property
    def parent_directory(self) -> Path | None:
        if not self.packages_directory:
            return None
        return self.packages_directory.parent

    @property
    def houdini_version(self) -> str:
        """
        The version of Houdini in major.minor format.

        This verion number is extracted directly from the Houdini install directory path.

        Returns a string.
        """

        if not self.packages_directory:
            return None
        return self.packages_directory.parent.name

    def create_pkgs(self) -> None:
        """
        Finds all the package configuration files for a version of Houdini and matches them to their respective plugin data.

        Returns:
            None
        """

        if not self.packages_directory:
            raise AttributeError(
                "directory is not set to any path. Make sure env_vars contains data as well if needed."
            )

        if not self.packages_directory.exists():
            self.packages_directory.mkdir(parents=True)
            logging.debug(f"Created missing packages folder: {self.packages_directory}")

        # add the package directory as a needed environment variable
        # which isn't automatically added by hconfig for some reason.
        HOUDINI_PACKAGE_PATH = "HOUDINI_PACKAGE_PATH"
        if HOUDINI_PACKAGE_PATH not in self.env_vars:
            self.env_vars.update({HOUDINI_PACKAGE_PATH: str(self.packages_directory) or ""})

        self.hconfig_plugin_paths = self.extract_plugin_paths_from_HOUDINI_PATH(self.env_vars["HOUDINI_PATH"])

        files = next(os.walk(self.packages_directory))
        files = [name for name in files[2] if ".json" in name]  # only .json files

        # create each Package object
        for file in files:
            filename = Path(file).stem
            self.pkgs[filename] = Package(Path(self.packages_directory, file), self.hconfig_plugin_paths, self.env_vars)

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
    def __init__(
        self, config_path: Path, hconfig_plugin_paths: list[Path] = None, env_vars: dict[str, str] = None
    ) -> None:
        """
        A single JSON package file and its configuration and related data.

        If hconfig_plugin_paths is not given, manually determine which plugins the package are pointing to since
        we cannot use all_plugin_paths as a helping guide which was extracted from hconfig.

        Arguments:
            config_path (pathlib.Path):
                The file path of the package .json file.

            hconfig_plugin_paths (List[str]):
                The list of paths extracted from the HOUDINI_PATH environment variable produced by hconfig.
                These paths are associated with all packages for an installed version of Houdini.

            env_vars (Dict[str, str]):
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
        self.warnings = []

        self._load()
        self.config = self._flatten_package(self.config)

        self.resolve()
        self.extract_data()

        # initialize git repo data structure
        path = self.plugin_paths[0] if len(self.plugin_paths) != 0 else None
        self._git_project = GitProject(path)

    @property
    def env_vars(self) -> dict:
        """
        The environment variables that apply to all the packages for an installed Houdini version.
        """
        return self._env_vars

    ##############################################
    # set data determined by package's config file
    ##############################################

    @property
    def enable(self) -> bool:
        """
        Whether the package is enabled to be loaded by houdini.
        Can be found in package config.
        """
        enabled = self.is_enabled()
        return enabled

    @enable.setter
    def enable(self, toggle: bool) -> None:
        """
        Set the 'enable' variable's state of a plugin's config file to True or False.
        This determines if houdini loads the plugin.
        """

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

    @property
    def pkg_name(self) -> str:
        """
        Name of the plugin's package (taken from the config's filename).
        """
        return self.config_path.stem

    @property
    def pkg_author(self) -> str:
        """
        The author of the package.
        """
        return self._git_project.owner

    @property
    def version_latest(self) -> str:
        """
        Latest version of the plugin (git tag version string).
        This is fetched from the remote repo via the GitHub API or a local json file if it already exists.
        """
        return self._git_project.remote.tag_latest

    @property
    def version_installed(self) -> str:
        """
        Installed version of the plugin (git tag version string).
        This is taken from local repo (if a repo exists).
        """
        return self._git_project.local.tag_latest

    @property
    def remote_repo_url(self) -> Url:
        """
        The URL of the plugin's remote repository, if it exists.
        """
        return self._git_project.remote_url

    @property
    def plugin_paths(self) -> list[Path]:
        """
        List of Path(s) to the local plugin data.
        Extracted from the package config file.
        """
        return self._plugin_paths

    @property
    def config_keys(self) -> list[str]:
        """
        A list of the keys of key-value pairs from a package's json config file.
        Convenient for checking the current saved state of a package configuration as recognized by houdini.
        """
        keys = [path[-2] for path in self.config]
        return keys

    @property
    def config_values(self) -> list[str | bool]:
        """
        A list of the values of key-value pairs from a package's json config file.
        Convenient for checking the current saved state of a package configuration as recognized by houdini.
        """
        values = [path[-1] for path in self.config]
        return values

    @property
    def last_metadata_sync_from_remote(self) -> str:
        """
        The date when this package's remote metadata was last synced from the remote repo.
        """
        pass

    @property
    def table_model(self) -> dict:
        """
        The model of package data that is later interpreted and loaded into the table GUI.
        The order of key-value pairs here determines how the columns are ordered in the GUI.
        The dict keys determine the names of the columns and which cells get which data.
        The dict values determine the contents of the row cells (that can be interpreted later by the table loader).
        """
        return {
            # first column in table is the index, this is created in the table view
            TableHeaders.ENABLE.value: self.enable,
            TableHeaders.PACKAGE.value: self.pkg_name,
            TableHeaders.AUTHOR.value: self.pkg_author,
            TableHeaders.INSTALLED.value: self.version_installed,
            TableHeaders.LATEST.value: self.version_latest,
            TableHeaders.SOURCE.value: self.remote_repo_url,
            TableHeaders.SYNC.value: None,  # functionality handled by table view
            TableHeaders.CONFIG.value: self.config_path,
            TableHeaders.PLUGINS.value: self.plugin_paths,
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
        Handles invalid json. If the json cannot be recovered, an empty dict will be set.
        """

        if not isinstance(self.config_path, Path):
            raise TypeError("path must be a pathlib.Path object.")

        class JSONPathDecoder(json.JSONDecoder):
            """
            Tries to parse invalid json into valid json by accounting for some possible errors.
            """

            def decode(self, s, **kwargs):
                regex_replacements = [
                    (re.compile(r"([^\\])\\([^\\])"), r"\1\\\\\2"),  # Fix single backslashes in paths
                    (re.compile(r",(\s*[\]}])"), r"\1"),  # Remove extraneous commas at the end of objects and arrays
                    (re.compile(r"}\s*{"), r"}, {"),  # Fix missing commas between objects
                ]
                for regex, replacement in regex_replacements:
                    s = regex.sub(replacement, s)
                return super().decode(s, **kwargs)

        try:
            with open(self.config_path) as f:
                data = json.load(f)
        except json.decoder.JSONDecodeError:
            logging.warning(f"Invalid json (might fail to resolve/parse): {self.config_path}")
            self.warnings.append("Invalid JSON! Fix errors and refresh this table.")
            try:
                with open(self.config_path) as f:
                    data = json.load(f, cls=JSONPathDecoder)
            except Exception:  # final catch all for all other broken json errors
                data = {}

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

        # remove duplicate paths
        new_paths = []
        [new_paths.extend([path]) for path in paths if path not in new_paths]
        paths = new_paths

        paths = [Path(path) for path in paths]
        paths = [path for path in paths if path.exists()]
        return paths
