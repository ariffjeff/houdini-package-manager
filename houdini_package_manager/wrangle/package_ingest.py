import contextlib
import os
import re
import subprocess
from pathlib import Path

import win32api


class BashNotFoundError(Exception):
    def __init__(self):
        super().__init__("Bash was not found on the system. Currently set to look in Git Bash directories.")


def is_git_bash_in_path_env():
    """
    Check if the Git Bash install directory is in the PATH environment variable.

    This function looks for the typical Git Bash install directories on a Windows
    system in the PATH environment variable. It returns True if any of the
    predefined Git Bash paths are found in the PATH, and False otherwise.

    Returns:
        bool: True if Git Bash install directory is found in PATH, False otherwise.
    """

    # typical Git Bash install directories for Windows
    git_bash_paths = [
        "C:\\Program Files\\Git\\bin",
        "C:\\Program Files (x86)\\Git\\bin",
    ]

    path = os.environ["PATH"].split(os.pathsep)

    return any(git_bash_path in path for git_bash_path in git_bash_paths)


def fix_path(path: list[str]):
    """
    Modify the given path to ensure that the drive letter prefix is in the valid X:/ format.
    """

    start = path[:3]  # start of potential path
    pattern = re.compile(r"/[a-zA-Z]/")  # looking for drive prefix in this format: /c/
    match = pattern.match(start)
    if match:
        path = path[1] + ":/" + path[3:]
    return path


def setup_houdini_environment(houdini_install_dir: Path) -> None:
    """
    Sets up the environment for Houdini by running the "houdini_setup" bash script found in the given Houdini install directory.
    houdini_setup runs the OS relevant bash or csh script that does all the setup.
    This is the necessary precursor setup for running enableHouModule()
        https://www.sidefx.com/docs/houdini/hom/commandline.html

    This function sets environment variables and modifies the search path by
    inserting the Houdini bin directory at the beginning.

    Args:
        houdini_setup_path (str):
            The Houdini install directory. AKA $HFS.

    Environment Variables Set:
        HFS: The Houdini installation directory.
        HB: The Houdini bin directory.
        H: Shortcut for the Houdini installation directory.
        HH: The Houdini "houdini" directory.
        HHC: The Houdini config directory.
        HHP: The Houdini Python X.Y library directory.
        HT: The Houdini toolkit directory.
        PATH: Modified to include the Houdini bin directory.
        HOUDINI_MAJOR_RELEASE: The major release version of Houdini.
        HOUDINI_MINOR_RELEASE: The minor release version of Houdini.
        HOUDINI_BUILD_VERSION: The build version of Houdini.
        HOUDINI_VERSION: The complete Houdini version string.
        HOUDINI_BUILD_KERNEL: The build kernel version of Houdini.
        HOUDINI_BUILD_PLATFORM: The build platform of Houdini.
        HOUDINI_BUILD_COMPILER: The build compiler version of Houdini.
        HIH: The Houdini user directory.
        HIS: The Houdini "houdini" directory (deprecated).
    """

    if not isinstance(houdini_install_dir, Path):
        raise TypeError("houdini_install_dir must be a pathlib.Path object.")

    if not houdini_install_dir.exists():
        raise ValueError(f"{houdini_install_dir} does not exist.")

    if not is_git_bash_in_path_env():
        raise BashNotFoundError()

    BASH_FILE_NAME = "houdini_setup"
    houdini_setup = os.path.join(houdini_install_dir, BASH_FILE_NAME)
    # can't grab child bash shell env var values that have been set,
    # so parse the debugged call of the script instead
    try:
        env_vars = subprocess.run(
            ["bash", "-x", houdini_setup], cwd=houdini_install_dir, capture_output=True, text=True, env=os.environ
        )
        # env_vars = subprocess.run(["bash", "source", houdini_setup], cwd=houdini_install_dir, capture_output=True, text=True, env=os.environ)
        env_vars = env_vars.stderr.split("\n")
        env_vars = [line for line in env_vars if "=" in line and "export" in line]
        env_vars = [part.replace("++ export ", "") for part in env_vars]

        # format PATH export line to be like others
        for i, part in enumerate(env_vars):
            if part[0] == "'":
                env_vars[i] = part[1:-1]
        env_vars = [part.split("=", 1) for part in env_vars]

        # expand "8.3 name" windows paths to long form
        env_vars = [[part[0], fix_path(part[1])] for part in env_vars]  # to prevent win32api.GetLongPathName errors
        for i, part in enumerate(env_vars):
            try:
                env_vars[i][1] = win32api.GetLongPathName(part[1])
            except win32api.error:
                contextlib.suppress(win32api.error)

        # manually recreate PATH to mimic houdini_setup_bash
        env_vars = {item[0]: item[1] for item in env_vars}
        env_vars["PATH"] = env_vars["HB"] + ";" + os.environ["PATH"]

        os.environ.update(env_vars)

    except FileNotFoundError as e:
        raise BashNotFoundError() from e


def enableHouModule():
    """Set up the environment so that "import hou" works."""
    import os
    import sys

    # Importing hou will load Houdini's libraries and initialize Houdini.
    # This will cause Houdini to load any HDK extensions written in C++.
    # These extensions need to link against Houdini's libraries,
    # so the symbols from Houdini's libraries must be visible to other
    # libraries that Houdini loads.  To make the symbols visible, we add the
    # RTLD_GLOBAL dlopen flag.
    if hasattr(sys, "setdlopenflags"):
        old_dlopen_flags = sys.getdlopenflags()
        sys.setdlopenflags(old_dlopen_flags | os.RTLD_GLOBAL)

    # For Windows only.
    # Add %HFS%/bin to the DLL search path so that Python can locate
    # the hou module's Houdini library dependencies.  Note that
    # os.add_dll_directory() does not exist in older Python versions.
    # Python 3.7 users are expected to add %HFS%/bin to the PATH environment
    # variable instead prior to launching Python.
    if sys.platform == "win32" and hasattr(os, "add_dll_directory"):
        os.add_dll_directory("{}/bin".format(os.environ["HFS"]))

    try:
        pass
    except ImportError:
        # If the hou module could not be imported, then add
        # $HFS/houdini/pythonX.Ylibs to sys.path so Python can locate the
        # hou module.
        sys.path.append(os.environ["HHP"])
    finally:
        # Reset dlopen flags back to their original value.
        if hasattr(sys, "setdlopenflags"):
            sys.setdlopenflags(old_dlopen_flags)


def main():
    houdini_version = "19.5.569"
    houdini_install_dir = Path(f"C:/Program Files/Side Effects Software/Houdini {houdini_version}")

    try:
        pass
    except ImportError:
        setup_houdini_environment(houdini_install_dir)
        enableHouModule()

    print("hou imported.")


if __name__ == "__main__":
    main()
