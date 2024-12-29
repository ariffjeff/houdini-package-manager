#!/usr/bin/env python3
"""
Convert pyproject.toml to requirements.txt
"""
from pathlib import Path

import toml
import click


class RequirementsConverter:
    """
    @description: a class containing scripts for conversion
    """

    def __init__(self, project_dir: str, with_version: bool = True) -> None:
        self.__project_dir = Path(project_dir).resolve(strict=True)
        self.__source = self.__project_dir / "pyproject.toml"
        self.__target = self.__project_dir / "requirements.txt"

        self.__with_version = with_version
        self.__dependencies = self.__load_dependencies()
        self.__requirements = self.__make_requirements()

    def __load_dependencies(self) -> dict[str, str]:
        """
        @description: get a dict of packages and versions from pyproject.toml
        """
        parsed = {}
        content = toml.load(self.__source)
        dependencies = content["tool"]["poetry"]["dependencies"]
        for package, meta in dependencies.items():
            if package == "python":
                continue
            if isinstance(meta, str) and meta.startswith("{") and meta.endswith("}"):
                meta = toml.loads(meta)
            if "extras" in meta:
                extras = ",".join(meta["extras"])
                parsed[f"{package}[{extras}]"] = meta["version"].strip("^=")
            elif "version" in meta:
                parsed[package] = meta["version"].strip("^=")
            elif "path" in meta:
                parsed[meta["path"]] = ""
            else:
                parsed[package] = meta.strip("^=")
        return parsed

    def __make_requirements(self) -> str:
        """
        @description: convert the dict of dependencies to requirements format
        """
        requirements = [
            f"{package}=={version}" if (version and self.__with_version) else package
            for package, version in self.__dependencies.items()
        ]
        return "\n".join(requirements)

    def get_dependencies(self) -> dict[str, str]:
        """
        @description: getter for dependencies in pyproject.toml
        """
        return self.__dependencies

    def get_requirements(self) -> str:
        """
        @description: getter for requirements (separated by \n)
        """
        return self.__requirements

    def write_requirements(self) -> None:
        """
        @description: write requirements to requirements.txt
        """
        with open(self.__target, "w", encoding="UTF-8") as file:
            file.write(self.__requirements)
        print(f"requirements.txt has been stored in {self.__project_dir}")


@click.command()
@click.argument("project_dir", default=".")
@click.option("--version/--noversion", default=True)
def main(project_dir: str, version: bool) -> None:
    """
    @description: main function to perform the conversion
    """
    converter = RequirementsConverter(project_dir, version)
    converter.write_requirements()


if __name__ == "__main__":
    main()
