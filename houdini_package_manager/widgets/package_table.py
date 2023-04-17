import json
import os

from PySide6.QtCore import QUrl
from PySide6.QtGui import QDesktopServices, QIcon
from PySide6.QtWidgets import QHBoxLayout, QMainWindow, QPushButton, QTableWidget, QTableWidgetItem, QWidget

from houdini_package_manager.wrangle.config_control import HouMeta


class PackageTable(QWidget):

    """
    The table widget that displays Houdini package configuration data and various buttons/options to navigate and manipulate them.
    """

    def __init__(self, window: QMainWindow, package_data: HouMeta):
        super().__init__()
        self.parent_window = window

        self.load("./houdini_package_manager/package_data/package_data.json")

        h_layout = QHBoxLayout()

        # loader = QUiLoader()
        # table = loader.load("./qt_designer/package_list.ui", self)

        self.buttons = {}

        labels = ["Version", "Package", "Author", "Date Installed", "Config", "Source", "Options"]

        table = QTableWidget(len(self.package_data["packages"]), len(labels), self)
        table.setHorizontalHeaderLabels(labels)
        self.set_table(table)

        h_layout.addWidget(table)
        self.setLayout(h_layout)

    def load(self, path) -> None:
        """
        Load json contents.
        """

        # try:
        with open(path) as f:
            self.package_data = json.load(f)
        # except Exception:
        # print("Fail")

    def save(self) -> None:
        with open("data.json", "w") as f:
            json.dump(self.package_data, f)

    def set_table(self, table: QTableWidget) -> None:
        for i, row in enumerate(self.package_data["packages"]):
            for j, col in enumerate(row):
                value = row[col]
                item = QTableWidgetItem(value)
                if col == "Config" or col == "Source":
                    if col == "Config":
                        icon = "./houdini_package_manager/icons/file.svg"
                    elif col == "Source":
                        icon = "./houdini_package_manager/icons/folder.svg"
                    btn = QPushButton(QIcon(icon), None)
                    btn.setToolTip(value)
                    btn.clicked.connect(self.open_path)
                    # btn.enterEvent = self.value_to_status
                    table.setCellWidget(i, j, btn)
                    self.buttons[f"{str(i)}-{str(j)}"] = {"button": btn, "path": value}
                else:
                    table.setItem(i, j, item)

        table.setEditTriggers(QTableWidget.NoEditTriggers)
        table.setSelectionMode(QTableWidget.NoSelection)
        table.setShowGrid(False)

    def open_path(self) -> None:
        """
        Get the path that is associated with a button and open it
        """
        button = self.sender()
        for _pos, data in self.buttons.items():
            if data["button"] == button:
                path = data["path"]
                break

        if not os.path.exists(path):
            self.parent_window.statusBar().showMessage(f"Failed to open: {path}")
            return

        QDesktopServices.openUrl(QUrl.fromLocalFile(path))
        # self.parent_window.statusBar().showMessage(f"Opened {dir}")
        self.parent_window.statusLabel.setText(f"Opened: {path}")

    # def value_to_status(self, event) -> None:
    #     sender = self.sender()
    #     print(f'{sender.text()} entered')
