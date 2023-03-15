import os
import pathlib
import platform
import subprocess
import winreg


class HouMeta:

    """
    A controller to keep track of Houdini install and package config locations.

    Arguments:
        only_hou_installs : bool
            Set to False to get paths to both Houdini application directories and related components like LicenseServer.
            The default is True which only gets paths to Houdini application directories.
    """

    def __init__(self, only_hou_installs=True) -> None:
        self.dirs_apps = self.get_houdini_paths()

        if only_hou_installs:
            self.only_houdini_locations()

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
        Get package configs from each package config location
        """

        packages = {}
        for version, path in self.dirs_packages.items():
            files = next(os.walk(path))
            files = [name for name in files[2] if ".json" in name]  # only .json files
            packages[version] = PackageCollection(path, files)
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

        ENV_VAR = "HOUDINI_USER_PREF_DIR"
        output = subprocess.getstatusoutput([hconfig_path, "-p"])[1]
        output = output.split("\n")

        for line in output:
            if ENV_VAR in line:
                return line.split("=")[1].strip()

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
    A group of package configs and their collective path for a specific version of Houdini
    """

    def __init__(self, path: str, configs: dict) -> None:
        self.path = path
        self.configs = configs
