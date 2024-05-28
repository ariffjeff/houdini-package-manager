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


class RepoMetadataController:
    """
    Read, write, and manage a package's repo metadata.
    """

    def __init__(self) -> None:
        self.PACKAGES_GIT_DATA_PATH = Path("houdini_package_manager/user/package_repo_data.json")
        # self.package = package

    def load_local_metadata(self) -> dict:
        if not self.PACKAGES_GIT_DATA_PATH.exists():
            return {}

        with open(self.PACKAGES_GIT_DATA_PATH) as file:
            data = json.load(file)
        return data

    def fetch_remote_metadata(self) -> dict:
        """
        Access the GitHub API to fetch remote repo data for all packages.
        Accounts for API rate limiting if there are too many packages to request data for.
        Returns a json-like dict of the desired repo data.
        """

        # request remote repo data
        for name, _pkg in self.configs.items():
            self.configs[name]._repo.get_remote_data()
            # repo = pkg._repo
            # repo.get_remote_data()

        # create json structure
        data = {self.houdini_version: {}}
        for name, pkg in self.configs.items():
            data[self.houdini_version][name] = {
                "local_config_path": str(pkg.config_path),
                "latest_version": self.configs[name]._repo.remote.tag_latest,
            }

        return data
