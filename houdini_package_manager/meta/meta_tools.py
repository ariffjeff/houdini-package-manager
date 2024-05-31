import json
from enum import Enum
from pathlib import Path

from PySide6.QtWidgets import QApplication, QMainWindow, QStatusBar


class TextColor(Enum):
    """
    Text colors determined by CSS style text color.
    """

    DEFAULT = "color: white;"
    ERROR = "color: red;"
    SUCCESS = "color: green;"
    WARNING = "color: yellow;"


class StatusBar:
    """
    The status bar of the application.
    This is a wrapper around QStatusBar.
    """

    @classmethod
    def message(cls, message: str, text_color: TextColor = None) -> None:
        """
        Print a message to the main window's status bar.

        Arguments:
            message (str):
                The string to print to the status bar.

            text_color (TextColor):
                The text color enum that sets the color the status bar message text.
                Default is white.
        """

        if not text_color:
            text_color = TextColor.DEFAULT

        status_bar = cls.status_bar()
        status_bar.setStyleSheet(text_color.value)
        status_bar.showMessage(message)

    @staticmethod
    def status_bar(raise_on_error=True) -> QStatusBar:
        """
        Return the status bar object.
        Raises an error or returns False if the status bar cannot be found depending on what
        the error argument specifies.

        Arguments:
            raise_on_error (bool):
                Whether or not you want to raise an error if the status bar cannot be found.
                This can be useful if you just want to know if the statusbar can be accessed.
                Default is True.
                If False, False will be returned instead.
        """

        top_level_widgets = QApplication.topLevelWidgets()
        for widget in top_level_widgets:
            if isinstance(widget, QMainWindow):
                return widget.statusBar()

        if not raise_on_error:
            return False

        raise RuntimeError("Unable to find status bar in top level widget.")


class TableHeaders(Enum):
    """
    Enums for the table column header names.
    """

    ENABLE = "Enable"
    PACKAGE = "Package"
    AUTHOR = "Author"
    LATEST = "Latest"
    INSTALLED = "Installed"
    SOURCE = "Src"
    CONFIG = "Config"
    PLUGINS = "Plugins"
    SYNC = "Sync"
    UPDATE = "Update"


class RateLimitError(Exception):
    """
    An exception that should be raised when an API's rate limit has been exceeded (status code: 403).
    """

    def __init__(self, message="API rate limit exceeded. Status code: 403") -> None:
        self.message = message
        super().__init__(self.message)


class RequestConnectionError(Exception):
    """
    An exception when a request connection fails.
    """

    def __init__(self, message="Failed to establish connection.") -> None:
        self.message = message
        super().__init__(self.message)


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
        """Reads data from the JSON file."""
        if self.file_path.exists():
            with open(self.file_path) as file:
                return json.load(file)
        else:
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
            raise KeyError(f"Entry for tool '{tool_name}' does not exist.")

    def set_file_path(self, file_path):
        """Sets or changes the file path for the JSON data file."""
        self.file_path = file_path
