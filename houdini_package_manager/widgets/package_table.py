import json
import os
from pathlib import Path

from PySide6.QtCore import QEvent, Qt, QUrl
from PySide6.QtGui import QDesktopServices, QIcon, QStandardItem, QStandardItemModel
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QHBoxLayout,
    QMainWindow,
    QPushButton,
    QStyledItemDelegate,
    QTableWidget,
    QTableWidgetItem,
    QWidget,
)

from houdini_package_manager.wrangle.config_control import HoudiniInstall, HoudiniManager


class PackageTableModel3(QTableWidget):
    def __init__(self, parent: QMainWindow, houdini_install: HoudiniInstall) -> None:
        super().__init__()
        self.parent_window = parent

        self.packages = houdini_install.packages.configs
        self.table_data = houdini_install.get_package_data(named=False)
        self.labels = houdini_install.get_labels()

        self.setRowCount(len(self.table_data))
        self.setColumnCount(len(self.labels))

        self.setHorizontalHeaderLabels(self.labels)
        self.resizeColumnsToContents()
        self.setColumnWidth(self.labels.index("Name"), 150)
        self.setColumnWidth(self.labels.index("Plugins"), 200)

        self.setEditTriggers(QTableWidget.NoEditTriggers)
        self.setSelectionMode(QTableWidget.NoSelection)
        self.setShowGrid(False)

        for row, rowData in enumerate(self.table_data):
            for column, value in enumerate(rowData):
                if self.horizontalHeaderItem(column).text() == "Enable":
                    # Enable: togglable checkbox
                    widget = QWidget()
                    layout = QHBoxLayout(widget)
                    checkbox = QCheckBox()
                    checkbox.clicked.connect(self.enable_package)
                    checkbox.setCheckState(Qt.Checked if self.table_data[row][column] else Qt.Unchecked)

                    layout.addWidget(checkbox)
                    layout.setAlignment(Qt.AlignCenter)
                    layout.setContentsMargins(0, 0, 0, 0)
                    widget.setLayout(layout)
                    self.setCellWidget(row, column, widget)
                elif isinstance(value, str):
                    # Version, Name, Author, Date Installed: text
                    item = QTableWidgetItem(value)
                    self.setItem(row, column, item)
                elif self.horizontalHeaderItem(column).text() == "Config":
                    # Config: push button that opens its file path when clicked
                    button = QPushButton()
                    button.setIcon(QIcon("./houdini_package_manager/icons/file.svg"))
                    button.setToolTip(str(value))
                    button.setProperty("path", value)
                    button.clicked.connect(self.open_path)

                    self.setCellWidget(row, column, button)
                elif self.horizontalHeaderItem(column).text() == "Plugins":
                    # Plugins: a drop down of path buttons that can be clicked.
                    combo = QComboBox()
                    value = [str(path) for path in value]

                    model = QStandardItemModel()
                    combo.setModel(model)

                    for path in value:
                        model.invisibleRootItem().appendRow(QStandardItem(path))

                    # create a delegate that handles the paint and editorEvent events for the items in the combo box.
                    # this allows the dropdown items to open their paths when they are clicked.
                    delegate = QStyledItemDelegate()
                    combo.setItemDelegate(delegate)

                    delegate = self.CustomItemDelegate()
                    combo.setItemDelegate(delegate)

                    self.setCellWidget(row, column, combo)

    def open_path(self) -> None:
        """
        Get the path that is associated with a button and open it.
        """

        button = self.sender()
        path = button.property("path")

        if not isinstance(path, Path):
            path = Path(path)

        if not path.exists():
            self.parent_window.statusBar().showMessage(f"Failed to open: {str(path)}")
            return

        QDesktopServices.openUrl(QUrl.fromLocalFile(path))
        self.parent_window.statusBar().showMessage(f"Opened: {path}")

    def enable_package(self) -> None:
        """
        This method is called when an enable checkbox is clicked.
        This sets the 'enable' variable of the relevant JSON package to the toggle value by
        triggering the packages enable attribute setter method, thus enabling or disabling
        the package.
        """

        checkbox = self.sender()
        toggle = checkbox.isChecked()
        row = self.indexAt(checkbox.parent().pos()).row()

        package = list(self.packages.values())[row]
        package.enable = toggle  # triggers setter method

        message = "Enabled" if toggle else "Disabled"
        self.parent_window.statusBar().showMessage(f"{message} package: {package.name}")

    class CustomItemDelegate(QStyledItemDelegate):
        """
        CustomItemDelegate is a custom QStyledItemDelegate that handles the paint and
        editorEvent events for the items in a QComboBox. It overrides the paint and editorEvent
        methods of the QStyledItemDelegate to customize the appearance and behavior of the items.
        """

        def paint(self, painter, option, index):
            option.text = index.data()
            super().paint(painter, option, index)

        def editorEvent(self, event, model, option, index):
            if event.type() == QEvent.Type.MouseButtonPress and event.button() in [Qt.LeftButton, Qt.RightButton]:
                QDesktopServices.openUrl(QUrl.fromLocalFile(index.data()))
                return True
            return super().editorEvent(event, model, option, index)


# class PackageTableModel(QAbstractTableModel):
#     def __init__(self, houdini_install: HoudiniInstall, parent=None):
#         super().__init__(parent)

#         self.package_data = houdini_install.get_package_data(named=False)
#         self.labels = houdini_install.get_labels()

#         print("")

#     def rowCount(self, parent=QModelIndex()):
#         return len(self.package_data)

#     def columnCount(self, parent=QModelIndex()):
#         return len(self.package_data[0]) if self.package_data else 0

#     def data(self, index, role=Qt.DisplayRole):
#         if not index.isValid():
#             return None

#         row = index.row()
#         column = index.column()

#         if role == Qt.DisplayRole or role == Qt.EditRole:
#             return str(self.package_data[row][column])
#         elif role == Qt.CheckStateRole and self.headerData(column, Qt.Horizontal) == "Enable":
#             return Qt.Checked if self.package_data[row][column] else Qt.Unchecked
#         elif role == Qt.UserRole and column == 3:
#             return row

#     def setData(self, index, value, role=Qt.EditRole):
#         if not index.isValid() or role != Qt.CheckStateRole or index.column() != 0:
#             return False

#         row = index.row()
#         self.package_data[row][0] = True if value == Qt.Checked else False
#         self.dataChanged.emit(index, index)
#         return True

#     def headerData(self, section, orientation, role=Qt.DisplayRole):
#         if orientation == Qt.Horizontal and role == Qt.DisplayRole:
#             return self.labels[section]
#         return None

#     def flags(self, index):
#         if not index.isValid():
#             return Qt.NoItemFlags

#         flags = Qt.ItemIsEnabled | Qt.ItemIsSelectable

#         if self.headerData(index.column(), Qt.Horizontal) == "Enable":
#             flags |= Qt.ItemIsUserCheckable

#         if self.headerData(index.column(), Qt.Horizontal) == "Config Path":
#             flags |= Qt.ItemIsEnabled | Qt.ItemIsSelectable

#         return flags

#     def createIndex(self, row, column, ptr=None):
#         index = super().createIndex(row, column, ptr)
#         index.internalPointer = self.package_data[row]
#         return index

#     def createEditor(self, parent, option, index):
#         if self.headerData(index.column(), Qt.Horizontal) == "Config Path":
#             editor = QPushButton(parent)
#             editor.clicked.connect(self.openFile)
#             return editor
#         return super().createEditor(parent, option, index)

#     def openFile(self):
#         filename, _ = QFileDialog.getOpenFileName(None, "Open Configuration File", "", "Configuration Files (*.conf)")
#         if filename:
#             button = self.sender()
#             index = self.index(button.property("row"), 2)
#             self.package_data[button.property("row")][2] = filename
#             self.dataChanged.emit(index, index)


class PackageTable(QWidget):

    """
    The table widget that displays Houdini package configuration data and various buttons/options to navigate and manipulate them.
    """

    def __init__(self, window: QMainWindow, houdini_data: HoudiniManager):
        super().__init__()
        self.parent_window = window

        self.package_data = self.load("./houdini_package_manager/package_data/package_data.json")

        # CONVERT houdini_data TO REQUIRED JSON FORMAT
        # CREATE DROP DOWN FOR CHOOSING HOUDINI VERSION TO MANAGE FIRST????

        h_layout = QHBoxLayout()

        # loader = QUiLoader()
        # table = loader.load("./qt_designer/package_list.ui", self)

        self.buttons = {}

        labels = ["Version", "Package", "Author", "Date Installed", "Config", "Source", "Options"]
        # labels = ["Enable", "Version", "Package", "Author", "Date Installed", "Config", "Source", "Options"] # FUTURE LAYOUT

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
            package_data = json.load(f)
        # except Exception:
        # print("Fail")
        return package_data

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
