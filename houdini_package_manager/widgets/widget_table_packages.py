from pathlib import Path

from PySide6.QtCore import QEvent, Qt, QUrl
from PySide6.QtGui import QDesktopServices, QStandardItem, QStandardItemModel
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QStyledItemDelegate,
    QTableWidget,
    QTableWidgetItem,
    QWidget,
)

from houdini_package_manager.widgets.widgets_custom import SvgPushButton
from houdini_package_manager.wrangle.config_control import HoudiniInstall


class PackageTableModel(QTableWidget):
    """
    The table widget that displays Houdini package configuration data and various buttons/options to navigate and manipulate them.
    """

    def __init__(self, parent, main_window: QMainWindow, houdini_install: HoudiniInstall) -> None:
        super().__init__()

        if not houdini_install.packages.configs:
            raise ValueError(f"No package data found for Houdini {houdini_install.version.full}")

        self.parent_window = parent  # required (for some reason) to allow switching between tables via combobox to work
        self.main_window = main_window

        self.packages = houdini_install.packages.configs
        self.table_data = houdini_install.get_package_data(named=False)
        self.labels = houdini_install.get_labels()
        self.warnings = houdini_install.get_package_warnings()

        self.setRowCount(len(self.table_data))
        self.setColumnCount(len(self.labels))

        self.setHorizontalHeaderLabels(self.labels)
        self.resizeColumnsToContents()
        self.setColumnWidth(self.labels.index("Name"), 150)
        self.setColumnWidth(self.labels.index("Plugins"), 200)

        self.setEditTriggers(QTableWidget.NoEditTriggers)
        self.setSelectionMode(QTableWidget.NoSelection)
        self.setShowGrid(False)

        header = self.horizontalHeader()
        header.setStretchLastSection(True)

        # expand vertical cell size
        self.verticalHeader().setDefaultSectionSize(40)  # cell height
        self.verticalHeader().setMinimumWidth(22)  # default index column width

        # shrink cell contents back down to add appearance of vertical spacing
        self.setStyleSheet(
            """
            QTableView::item {
                padding-right: 10px;
                padding: 3.5px 0;
            }
            """
        )

        # set table data with widgets
        for row, rowData in enumerate(self.table_data):
            for column, value in enumerate(rowData):
                if self.horizontalHeaderItem(column).text() == "Enable":
                    _CellWidget.checkbox(self, row, column, value)
                elif self.horizontalHeaderItem(column).text() == "Config":
                    _CellWidget.config(self, row, column, value)
                elif self.horizontalHeaderItem(column).text() == "Plugins":
                    _CellWidget.plugins(self, row, column, value)
                elif isinstance(value, str):
                    _CellWidget.text(self, row, column, value)

    def open_path(self) -> None:
        """
        Get the path that is associated with a button and open it.
        """

        button = self.sender()
        path = button.property("path")

        if not isinstance(path, Path):
            path = Path(path)

        if not path.exists():
            self.main_window.statusBar().showMessage(f"Failed to open: {str(path)}")
            return

        QDesktopServices.openUrl(QUrl.fromLocalFile(path))
        self.main_window.statusBar().showMessage(f"Opened: {path}")

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
        self.main_window.statusBar().showMessage(f"{message} package: {package.name}")

    def center_widget(self, widget) -> QWidget:
        """
        Create the layout that centers a desired widget in a QTableWidget cell.
        Returns a QWidget that should be used as the third arg of: self.setCellWidget(row, column, widget)
        """

        layout_widget = QWidget()
        layout = QHBoxLayout(layout_widget)
        layout.addWidget(widget)
        layout.setAlignment(Qt.AlignCenter)
        layout.setContentsMargins(0, 0, 0, 0)
        layout_widget.setLayout(layout)
        return layout_widget


class _CellWidget:
    """
    Dynamic widgets whose data changes depending on certain requirements.
    This class is only really meant to be used with PackageTableModel.
    """

    def plugins(self: PackageTableModel, row: int, column: int, value) -> None:
        # Plugins: a drop down of path buttons that can be clicked.
        # A warning SVG replaces the dropdown if the package has errors that the user needs to resolve.
        # A label replaces the dropdown if there is no plugin data.

        # if the package config has problems
        warnings = list(self.warnings.values())[row]
        warnings = "\n".join(warnings)
        if warnings:
            button_warning = SvgPushButton(
                32,
                29,
                "./houdini_package_manager/design/icons/warning.svg",
                "./houdini_package_manager/design/icons/warning_hover.svg",
            )
            button_warning.setToolTip(warnings)
            self.setCellWidget(row, column, button_warning)
            return

        # if there's no plugin data
        if not value:
            widget = QLabel("No plugin data")
            self.setCellWidget(row, column, widget)
            return

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

        delegate = CustomItemDelegate()
        combo.setItemDelegate(delegate)

        self.setCellWidget(row, column, combo)

    def config(self: PackageTableModel, row: int, column: int, value) -> None:
        # Config: push button that opens its file path when clicked
        button = SvgPushButton(
            23,
            29,
            "./houdini_package_manager/design/icons/file.svg",
            "./houdini_package_manager/design/icons/file_hover.svg",
            self.main_window,
        )
        button.setToolTip(str(value))
        button.setProperty("path", value)
        button.clicked.connect(self.open_path)
        button.set_hover_status_message(f"Open: {value}")

        self.setCellWidget(row, column, self.center_widget(button))

    def text(self: PackageTableModel, row: int, column: int, value) -> None:
        # Version, Name, Author, Date Installed: text
        item = QTableWidgetItem(value)
        self.setItem(row, column, item)

    def checkbox(self: PackageTableModel, row: int, column: int, value) -> None:
        # Enable: togglable checkbox
        checkbox = QCheckBox()
        checkbox.clicked.connect(self.enable_package)
        checkbox.setCheckState(Qt.Checked if value else Qt.Unchecked)

        self.setCellWidget(row, column, self.center_widget(checkbox))


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
        if event.type() == QEvent.Type.MouseButtonPress and event.button() in [
            Qt.LeftButton,
            Qt.RightButton,
            Qt.MiddleButton,
        ]:
            QDesktopServices.openUrl(QUrl.fromLocalFile(index.data()))
            return True
        return super().editorEvent(event, model, option, index)
