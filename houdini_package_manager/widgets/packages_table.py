from pathlib import Path
from typing import Union

from PySide6.QtCore import QEvent, Qt, QUrl
from PySide6.QtGui import QDesktopServices, QStandardItem, QStandardItemModel
from PySide6.QtWidgets import (
    QAbstractItemView,
    QCheckBox,
    QComboBox,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSizePolicy,
    QStyledItemDelegate,
    QTableWidget,
    QWidget,
)

from houdini_package_manager.meta.meta_tools import StatusBar
from houdini_package_manager.widgets.custom_widgets import BtnIcon, BtnSize, SvgPushButton
from houdini_package_manager.wrangle.config_control import HoudiniInstall, Package
from houdini_package_manager.wrangle.url import Url


class PackageTableModel(QTableWidget):
    """
    The table widget that displays Houdini package configuration data and various buttons/options to navigate and manipulate them.
    """

    def __init__(self, parent, houdini_install: HoudiniInstall) -> None:
        super().__init__(parent)

        if not houdini_install.packages.configs:
            raise ValueError(f"No package data found for Houdini {houdini_install.version.full}")

        self.version = houdini_install.version
        self.packages = houdini_install.packages.configs
        self.table_data = houdini_install.get_package_data(named=False)
        self.labels = houdini_install.get_labels()
        self.warnings = houdini_install.get_package_warnings()

        self.setup_table_data()
        self.fill_table_contents()

    def setup_table_data(self) -> None:
        """
        Prepare the table data before it gets entered into the packages table.
        This method does not determine column order. This is pre-set by the table_model property in the Package class.
        """

        # insert custom index column
        self.labels.insert(0, "")
        for i, _row in enumerate(self.table_data):
            self.table_data[i].insert(0, str(i + 1))
        # remove default index column since it contains the corner part that can't be styled
        for i in range(self.rowCount()):
            item = self.item(i, 0)
            item.setTextAlignment(Qt.AlignCenter)
        self.verticalHeader().setVisible(False)

        self.setRowCount(len(self.table_data))
        self.setColumnCount(len(self.labels))

        self.setHorizontalHeaderLabels(self.labels)
        self.resizeColumnsToContents()  # before manual width adjustments
        self.setColumnWidth(self.labels.index("Package"), 180)
        self.setColumnWidth(self.labels.index("Plugins"), 200)
        # self.setColumnWidth(0, 26)  # doesnt seem to work with small numbers

        style = """
            ::section {
                background-color: #3d3d3d;
                border: none;
                border-left: 1px solid #202020;
                border-right: 1px solid #202020;
            }
        """
        self.horizontalHeader().setStyleSheet(style)
        self.verticalHeader().setStyleSheet(style)

        self.setVerticalScrollMode(QAbstractItemView.ScrollPerPixel)
        self.setEditTriggers(QTableWidget.NoEditTriggers)
        self.setSelectionMode(QTableWidget.NoSelection)
        self.setShowGrid(False)

        header = self.horizontalHeader()
        header.setStretchLastSection(True)

        # expand vertical cell size
        # self.verticalHeader().setMinimumWidth(26) # default index column width
        self.verticalHeader().setDefaultSectionSize(36)  # cell height

    def fill_table_contents(self) -> None:
        """
        Enter the packages data into the packages table.
        """

        # set table data with widgets based on the incoming data's information/data type
        for row, rowData in enumerate(self.table_data):
            for column, value in enumerate(rowData):
                # checkbox
                if self.horizontalHeaderItem(column).text() == "Enable":
                    checkbox_widget = CellWidgets.checkbox_enable(self, value)
                    self.setCellWidget(row, column, self.align_widget(checkbox_widget))

                # button
                elif self.horizontalHeaderItem(column).text() in ["Source", "Config"] and value:
                    button_widget = CellWidgets.button_path(self, value)
                    self.setCellWidget(row, column, self.align_widget(button_widget))

                # dropdown (warning button as a replacement)
                elif self.horizontalHeaderItem(column).text() == "Plugins":
                    warnings = "\n".join(list(self.warnings.values())[row])
                    if warnings:
                        plugin_widget = CellWidgets.button_warning(
                            self, row, warnings, self._current_package(row).config_path
                        )
                    elif not value:
                        plugin_widget = CellWidgets.label_no_plugin_data()
                    elif len(value) > 1:
                        plugin_widget = CellWidgets.combo_plugins(self, value)
                    else:
                        plugin_widget = CellWidgets.button_plugins(self, value[0])
                        plugin_widget.clicked.connect(self.open_path)

                    plugin_widget.setMinimumHeight(29)
                    self.setCellWidget(row, column, self.align_widget(plugin_widget, Qt.AlignLeft))

                # string
                elif isinstance(value, str):
                    text_widget = CellWidgets.label_text(value)
                    self.setCellWidget(
                        row, column, self.align_widget(text_widget, Qt.AlignCenter if column == 0 else Qt.AlignLeft)
                    )

    def open_path(self) -> None:
        """
        Get the path that is associated with a button and open it.
        This method can handle both path Url and Path objects.
        """

        button = self.sender()
        path = button.property("path")  # Url or Path
        path_str = str(path)

        if isinstance(path, Path):
            if not path.exists():
                StatusBar.message(f"Failed to open: {path_str}")
                return
            QDesktopServices.openUrl(QUrl.fromLocalFile(path))
        elif isinstance(path, Url):
            QDesktopServices.openUrl(QUrl.fromUserInput(path_str))

        StatusBar.message(f"Opened: {path_str}")

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
        StatusBar.message(f"{message} package: {package.name}")

    def align_widget(self, widget, align: Qt.AlignmentFlag = None) -> QWidget:
        """
        Create a QWidget that lays out a desired widget in a QTableWidget cell.
        Mainly prevents the table cell from collapsing in on the cell contents.
        Returns a QWidget that should be used as the third arg of: self.setCellWidget(row, column, widget)
        """

        if not align:
            align = Qt.AlignCenter

        layout_widget = QWidget()
        layout = QHBoxLayout(layout_widget)
        layout.addWidget(widget)
        layout.setAlignment(align)
        layout.setContentsMargins(0, 0, 0, 0)
        layout_widget.setLayout(layout)
        return layout_widget

    def _current_package(self, row: int) -> Package:
        """
        Return the current Package that's data is being worked upon while the table cells are being set.

        Arguments:
            row (int):
                The index of the row that the table cell-setting for loop is currently on.
        """
        return list(self.packages.values())[row]


class CellWidgets:
    """
    Various widget presets such as buttons, dropdowns, and labels for a packages table.
    """

    @staticmethod
    def button_warning(parent: PackageTableModel, row: int, warnings: str, config_path: Path) -> SvgPushButton:
        # Plugins: a drop down of path buttons that can be clicked.
        # A warning SVG replaces the dropdown if the package has errors that the user needs to resolve.
        # A label replaces the dropdown if there is no plugin data.

        # if the package config has problems
        button_warning = SvgPushButton(parent, BtnSize.WARNING, BtnIcon.WARNING)

        pkg_name = parent._current_package(row).name
        if pkg_name[-5:] != ".json":
            pkg_name += ".json"
        button_warning.set_hover_status_message(f"Can't process package, error(s) in config: {pkg_name}")
        button_warning.setToolTip(warnings)
        button_warning.setProperty("path", config_path)
        button_warning.clicked.connect(parent.open_path)

        return button_warning

    @staticmethod
    def label_no_plugin_data() -> QLabel:
        # if there's no plugin data
        label = QLabel("No plugin folder found.")
        return label

    @staticmethod
    def combo_plugins(parent, value) -> QComboBox:
        combo = DropDown(parent)
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
        combo.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)

        combo.setStyleSheet(
            """
        QComboBox {
            text-align: left;
            background-color: #303030;
            border: none;
            padding: 5px;
        }

        QComboBox::drop-down { subcontrol-position: left; }
        QComboBox:hover { background-color: #404040; }
        """
        )

        return combo

    @staticmethod
    def button_plugins(parent, value) -> QPushButton:
        button = QPushButton(text=str(value), parent=parent)
        button.setProperty("path", value)
        button.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)

        button.setStyleSheet(
            """
        QPushButton {
            text-align: left;
            background-color: #303030;
            border: none;
            padding: 5px;
        }

        QPushButton:hover {
            background-color: #404040;
        }

        QPushButton:pressed { background-color: #303030; }
        """
        )

        return button

    @staticmethod
    def button_path(parent: PackageTableModel, path: Union[Path, Url]) -> SvgPushButton:
        # Config: push button that opens its file path or url when clicked

        # local path or url
        if isinstance(path, Url):
            button = SvgPushButton(parent, BtnSize.CELL_TALL, BtnIcon.SOURCE_CONTROL)
        elif isinstance(path, Path):
            button = SvgPushButton(parent, BtnSize.CELL_TALL, BtnIcon.FILE)

        button.setToolTip(str(path))
        button.setProperty("path", path)  # store path on button
        button.clicked.connect(parent.open_path)
        button.set_hover_status_message(f"Open: {str(path)}")
        return button

    @staticmethod
    def label_text(value) -> QLabel:
        # Version, Name, Author, Date Installed: text
        item = QLabel(value)
        return item

    @staticmethod
    def checkbox_enable(parent: PackageTableModel, value) -> QCheckBox:
        # Enable: togglable checkbox
        checkbox = QCheckBox()
        checkbox.clicked.connect(parent.enable_package)
        checkbox.setCheckState(Qt.Checked if value else Qt.Unchecked)
        return checkbox


class DropDown(QComboBox):
    def __init__(self, parent=None):
        super().__init__(parent)

        self.setStyleSheet("QComboBox:focus { border: 2px solid #100000; }")

    def wheelEvent(self, event):
        event.ignore()


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
