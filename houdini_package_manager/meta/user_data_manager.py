import json
import logging
import os
from pathlib import Path


class UserDataManager:
    """
    TODO
    - create new pkg name dict in json if it doesnt exist (or just pre init them all at once?)
    - read values on HPM load
    - if a non existent json entry for a tool is created, init its local_config_path (forgot to do that currently)
    - account for json file not existing
    - read data back in on HPM start
    - namespace each tool in json user data to be owner.tool to prevent entry collisions
    - ensure that both owner name and tool name variables used to write/read json are identical across config_control and anywhere else.
    - use 'from dataclasses import dataclass, field' to maintain structured data when reading/writing json
    """

    def __init__(self):
        self.file_path = Path("houdini_package_manager/user/package_repo_data.json")

    def _read_data(self) -> dict:
        """
        Reads data from the JSON file.

        If the file doesn't exist, it will be created with no data.
        """

        if self.file_path.exists():
            with open(self.file_path) as file:
                return json.load(file)
        else:
            self.new_empty_file()
            return {}

    def _write_data(self, data) -> None:
        """Writes the given data to the JSON file."""
        with open(self.file_path, "w") as file:
            json.dump(data, file, indent=4)

    # def add_entry(self, tool_name, local_config_path):
    #     """Adds a new entry to the data."""
    #     data = self._read_data()
    #     data[tool_name] = {"local_config_path": local_config_path, "tags": []}
    #     self._write_data(data)

    def update_tags(self, tool_name, tags) -> None:
        """Updates the tags for a specific tool."""
        data = self._read_data()
        if tool_name not in data:
            # If the tool does not exist, initialize its entry with empty tags
            data[tool_name] = {"local_config_path": "", "tags": []}
        data[tool_name]["tags"] = tags
        self._write_data(data)

    def get_entry(self, tool_name) -> dict | None:
        """Retrieves the entry for a specific tool."""
        if not tool_name:
            return

        data = self._read_data()
        if tool_name in data:
            return data[tool_name]
        else:
            logging.debug(f"User data cache for plugin '{tool_name}' does not exist.")
            return None

    def set_file_path(self, file_path):
        """Sets or changes the file path for the JSON data file."""
        self.file_path = file_path

    def new_empty_file(self) -> None:
        """
        Creates the missing file with no data.

        If the user folder does not exist, it will also be created first.
        """

        folder_path = os.path.dirname(self.file_path)
        os.makedirs(folder_path, exist_ok=True)  # ensure the directory exists

        with open(self.file_path, "w") as file:
            json.dump({}, file)
