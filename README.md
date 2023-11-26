<p align="center">
  <img width="125" src="https://raw.githubusercontent.com/ariffjeff/houdini-package-manager/main/docs/static/hpm.svg">
</p style = "margin-bottom: 2rem;">

<p align="center">
  <img width="700" src="https://raw.githubusercontent.com/ariffjeff/houdini-package-manager/main/docs/static/hpm_screenshot.png">
</p style = "margin-bottom: 2rem;">

# Houdini Package Manager

[![Release](https://img.shields.io/github/v/release/ariffjeff/houdini-package-manager)](https://img.shields.io/github/v/release/ariffjeff/houdini-package-manager)
[![Build status](https://img.shields.io/github/actions/workflow/status/ariffjeff/houdini-package-manager/main.yml?branch=main)](https://github.com/ariffjeff/houdini-package-manager/actions/workflows/main.yml?query=branch%3Amain)
[![codecov](https://codecov.io/gh/ariffjeff/houdini-package-manager/branch/main/graph/badge.svg)](https://codecov.io/gh/ariffjeff/houdini-package-manager)
[![Commit activity](https://img.shields.io/github/commit-activity/m/ariffjeff/houdini-package-manager)](https://img.shields.io/github/commit-activity/m/ariffjeff/houdini-package-manager)
[![License](https://img.shields.io/github/license/ariffjeff/houdini-package-manager)](https://img.shields.io/github/license/ariffjeff/houdini-package-manager)

A comprehensive GUI package manager for Houdini. Manage all your plugins and create new packages with ease.

- **Download the application**: <https://houpm.com>
- **Github repository**: <https://github.com/ariffjeff/houdini-package-manager>
- **PyPI repository**: <https://pypi.org/project/houdini-package-manager>

## How it Works
HPM is a Python application that basically grabs your plugins' package config files and converts them into a nice UI with a bunch of useful functionality.

#### 1. On a high level, HPM does this for all installed versions of Houdini it finds upon startup:
1. Gets Houdini's environment variable key value pairs.
1. Gets the raw json package config data (some values might contain variables), typically found in `/packages`.
1. Uses the Houdini environment variables to resolve the package config variables. The data as a whole is also simplified.
1. Creates arbitrary objects from this resolved package config/plugin data.
1. Converts this package/plugin data into a Pyside6 UI with accompanying functionality.
1. This is all then built into an executable with `Pyinstaller`.

#### 2. Creating package configs for new plugins:
- You can create new package configs for plugins you have downloaded to quickly get them into Houdini hassle free.
- HPM takes the plugin folder path, HDA, or script you provide it and simply creates a new package config from a template, and puts it in `/packages`.

## Install
1. Download the latest version from https://houpm.com
2. Unzip and store the folder anywhere you want.
3. Create a shortcut of the Houdini_Package_Manager-x.y.z.exe file from the folder.
4. Now you can run HPM from the shortcut, that's all there is to it!

## Building the project yourself
Note: This project was primarily tested with Python 3.9.10.

1. Install the [Poetry dependency manager](https://python-poetry.org/docs/#installation).
1. Clone [HPM](https://github.com/ariffjeff/houdini-package-manager)
    1. Open a terminal, and `cd` to it.
1. Do `poetry install`
1. Make your code changes and commit them
    - If you're adding other files/images/vectors/etc., put them somewhere appropriate in `houdini_package_manager/resources/`
1. Version bump (optional)
    - Automatic version bump: 
        1. Do `poetry version minor`. Use `major` or `patch` in place of `minor` if appropriate. These will automatically be updated:
            1. `pyproject.toml`
            2. `__version__` in `__init__.py` (due to [poetry-bumpversion](https://pypi.org/project/poetry-bumpversion/) being installed in this project)
            3. The relevant HTML in `houpm.com`
            4. The final executable and .zip file/folder names
    - Manual version bump:
        1. Do `poetry version 1.2.3`
    - Commit the version bump later along with a new build (keep reading next steps).
1. Do `make prepare`
    -  This does all the final build management automatically by running a bunch of other commands.
    - Review these make commands only if you need to use them individually...
    1. `make test` runs the project pytests. Skip them with `make prepare TEST=0`
    1. `make build-exe` builds the project. It will appear in `dist/`
        - `resources/` is copied to the build folder automatically so you don't have to worry about it.
        - The build folder and .exe name is determined by the version number set by the result of `poetry version ...` (referenced in the Makefile)
    1. `make zip` zips the build in `dist/`
    1. `make dist-move` creates a copy of the dist build in the HouPM website dist_hpm folder.
    1. `make update-houpm` updates HPM version html in houpm website.
1. Run/test the build (sanity check)
    1. Run the build
        - Different methods:
            1. Go to `dist/`, find the .exe and run it.
            2. Or do `make run-exe`.
                - Be aware this doesn't run it directly in the folder its in, which can lead to the issue of relative file paths not being able to find the files they're targetting if the paths have been set improperly... i.e. images failing to load. Make sure you set file paths with `utils.epath()` which automatically handles relative paths correctly for both the dev and build environment.
    1. If you get unexpected behavior or a crash:
        1. Check the app folder for a .log crash file.
            - Crash log files currently are timestamped/created immediately upon exe run. If HPM is closed (not from a crash and not via the debug console) then the log file will be deleted.
        1. Do `make build-exe-log` to make an exe that displays a debug console on run which you can inspect. If any errors occur you'll be able to see them there.
1. Commit 
    - Commit both the version bump (mentioned before) and the new build .zip together.
    - The commit message should just be the version number (e.g. `1.3.2`) for convention.
    - Try not to commit anything else with these for simplicity.
