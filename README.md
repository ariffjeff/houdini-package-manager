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


## Building the project yourself
1. Make your code changes.
2. Version bump the project with `poetry version minor`. Use `major` or `patch` in place of `minor` if appropriate.
    - Both `pyproject.toml` and `__version__.py` will be updated automatically due to [poetry-bumpversion](https://pypi.org/project/poetry-bumpversion/) being installed in this project.
3. Do `make build-exe` to build the project. It will appear in `dist/`
    - `/resources` is copied over to the build folder automatically for you so you don't have to worry about it.
4. Do `make zip` to make a .zip of the build in `dist/`
5. Run the build by going to `dist/`, finding the .exe, and running it there.
6. If you get unexpected results (something isn't working right):
    1. Remove `-w` from the `build-exe:` action in the `Makefile`
    2. Do `make build-exe` again.
    3. Run the .exe and you'll notice a terminal pops up along with the app. If any errors occur you'll be able to see them there.
