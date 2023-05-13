<p align="center">
  <img width="125" src="https://raw.githubusercontent.com/ariffjeff/houdini-package-manager/main/docs/static/hpm.svg">
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


## Install
1. Download the latest version from https://houpm.com
2. Unzip and store the folder anywhere you want.
3. Create a shortcut of the Houdini_Package_Manager-x.y.z.exe file from the folder.
4. Now you can run HPM from the shortcut, that's all there is to it!

## Building the project yourself
Note: This project was primarily tested with Python 3.9.10.

1. Install the [Poetry dependency manager](https://python-poetry.org/docs/#installation).
1. Clone the HPM project to a directory, open a terminal, and `cd` to it.
1. Do `poetry install`
1. Make your code changes and commit them.
    - If you're adding other files/images/vectors/etc., put them somewhere in `houdini_package_manager/resources/`
1. Optional: Version bump the project
    1. Version bump the project by doing `poetry version minor`. Use `major` or `patch` in place of `minor` if appropriate.
        - Both `pyproject.toml` and `__version__.py` will be updated automatically due to [poetry-bumpversion](https://pypi.org/project/poetry-bumpversion/) being installed in this project.
    1. Commit the version bump. The commit message should be the version number (e.g. `1.3.2`)
1. Do `make build-exe` to build the project. It will appear in `dist/`
    - `resources/` is copied over to the build folder automatically for you so you don't have to worry about it.
    - The build folder and .exe name is determined by the version number set by the result of `poetry version ...` (referenced in the Makefile)
1. Do `make zip` to make a .zip of the build in `dist/`
1. Run the build by going to `dist/`, finding the .exe, and running it there.
    - You can also run it by doing `make run-exe`, but be aware that this doesn't run it directly in the folder its in, which can lead to the issue of relative file paths not being able to find the files they're targetting if the paths have been set improperly... i.e. images failing to load. Make sure you set file paths with `utils.epath()` which automatically handles relative paths correctly for both the dev and build environment.
1. If you get unexpected results (something isn't working right):
    1. Remove `-w` from the `build-exe:` action in the `Makefile`
    1. Do `make build-exe` again.
    1. Run the .exe and you'll notice a terminal pops up along with the app. If any errors occur you'll be able to see them there.
