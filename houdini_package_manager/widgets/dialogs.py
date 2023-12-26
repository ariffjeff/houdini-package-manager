import logging

import requests
from packaging import version
from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import QDialog, QHBoxLayout, QLabel, QMessageBox, QPushButton, QVBoxLayout, QWidget

from houdini_package_manager import __version__


class Updater(QWidget):
    def __init__(self, parent=None) -> None:
        super().__init__(parent)

    def check_update(self) -> None:
        """
        Check for the latest version of the installed package on PyPI.
        Prompt upgrade if installed app is out of date.
        """

        self.dist_url = QUrl("https://houpm.com")
        self.TITLE = "houdini-package-manager"

        latest_version = self.get_latest_project_version()

        if not latest_version:
            return

        if version.parse(latest_version) > version.parse(__version__):
            update_dialog = UpdateDialog(self, latest_version, self.dist_url)
            update_dialog.setStyleSheet(
                """
                background-color: #303030;
                color: white;
                font-size: 14px;
            """
            )

            choice = update_dialog.exec()
            if choice == QMessageBox.Yes:
                QDesktopServices.openUrl(self.dist_url)

    def get_latest_project_version(self) -> str:
        """
        Get the latest version of the project from PyPI.
        Returns None if the version number can not be retrieved.
        """

        try:
            logging.debug("Checking for HPM updates...")
            response = requests.get(f"https://pypi.org/pypi/{self.TITLE}/json", timeout=5)
        except (requests.RequestException, ValueError):
            return None

        if response.status_code == 200:
            data = response.json()
            latest_version = data["info"]["version"]
            return latest_version
        return None


class UpdateDialog(QDialog):
    """
    The dialog that displays the new version project version information
    and the choice to update or not.
    """

    def __init__(self, parent, latest_version: str, dist_url: QUrl):
        super().__init__(parent)

        self.latest_version = latest_version
        self.dist_url = dist_url

        self.setWindowTitle("Upgrade Dialog")

        layout = QVBoxLayout(self)

        label = QLabel(f"A new version ({latest_version}) of HPM is available.\n\nDo you want to upgrade?")
        label.setAlignment(Qt.AlignLeft)
        layout.addWidget(label)

        button_layout = QHBoxLayout()
        button_layout.setContentsMargins(0, 20, 0, 0)
        layout.addLayout(button_layout)

        yes_button = QPushButton("Yes")
        yes_button.clicked.connect(self.upgrade)
        button_layout.addWidget(yes_button)

        no_button = QPushButton("No")
        no_button.clicked.connect(self.reject)
        button_layout.addWidget(no_button)

    def upgrade(self) -> None:
        QDesktopServices.openUrl(self.dist_url)
        self.accept()


class ErrorDialog(QDialog):
    """
    A standard error dialog that contains a message and an OK button.
    """

    def __init__(self, error_message):
        super().__init__()
        self.setWindowTitle("Error: Houdini not installed")
        self.setFixedWidth(300)
        self.setFixedHeight(150)
        self.layout_main = QVBoxLayout()
        self.setLayout(self.layout_main)

        label = QLabel(error_message)
        label.setWordWrap(True)
        self.layout_main.addWidget(label)

        ok_button = QPushButton("OK")
        ok_button.setMaximumWidth(85)
        ok_button.clicked.connect(self.accept)
        self.layout_main.addWidget(ok_button)

        self.setStyleSheet(
            """
            background-color: #303030;
            color: white;
            padding: 5px;
        """
        )
