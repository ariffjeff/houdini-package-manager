from pathlib import Path

from PySide6.QtCore import QEvent, Qt, QUrl
from PySide6.QtGui import QDesktopServices, QStandardItem, QStandardItemModel
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QHBoxLayout,
    QLabel,
    QStyledItemDelegate,
    QTableWidget,
    QWidget,
)

from houdini_package_manager.meta.meta_tools import StatusBar
from houdini_package_manager.widgets.custom_widgets import SvgPushButton
from houdini_package_manager.wrangle.config_control import HoudiniInstall, Package


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
        self.verticalHeader().setMinimumWidth(22)  # default index column width
        self.verticalHeader().setDefaultSectionSize(36)  # cell height

        # set table data with widgets
        for row, rowData in enumerate(self.table_data):
            for column, value in enumerate(rowData):
                if self.horizontalHeaderItem(column).text() == "Enable":
                    checkbox_widget = CellWidgets.checkbox_enable(self, value)
                    self.setCellWidget(row, column, self.align_widget(checkbox_widget))

                elif self.horizontalHeaderItem(column).text() == "Config":
                    config_widget = CellWidgets.button_config(self, value)
                    self.setCellWidget(row, column, self.align_widget(config_widget))

                elif self.horizontalHeaderItem(column).text() == "Plugins":
                    warnings = "\n".join(list(self.warnings.values())[row])
                    if warnings:
                        plugin_widget = CellWidgets.button_warning(self, row, warnings)
                    elif not value:
                        plugin_widget = CellWidgets.label_no_plugin_data()
                    else:
                        plugin_widget = CellWidgets.combo_plugins(value)
                    plugin_widget.setMinimumHeight(29)
                    self.setCellWidget(row, column, self.align_widget(plugin_widget, Qt.AlignLeft))

                elif isinstance(value, str):
                    text_widget = CellWidgets.label_text(value)
                    self.setCellWidget(row, column, self.align_widget(text_widget, Qt.AlignLeft))

    def open_path(self) -> None:
        """
        Get the path that is associated with a button and open it.
        """

        button = self.sender()
        path = button.property("path")

        if not isinstance(path, Path):
            path = Path(path)

        if not path.exists():
            StatusBar.message(f"Failed to open: {str(path)}")
            return

        QDesktopServices.openUrl(QUrl.fromLocalFile(path))
        StatusBar.message(f"Opened: {path}")

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
    def button_warning(parent: PackageTableModel, row: int, warnings: str) -> SvgPushButton:
        # Plugins: a drop down of path buttons that can be clicked.
        # A warning SVG replaces the dropdown if the package has errors that the user needs to resolve.
        # A label replaces the dropdown if there is no plugin data.

        # if the package config has problems
        button_warning = SvgPushButton(
            parent,
            32,
            29,
            "./houdini_package_manager/design/icons/warning.svg",
            "./houdini_package_manager/design/icons/warning_hover.svg",
        )

        pkg_name = parent._current_package(row).name
        if pkg_name[-5:] != ".json":
            pkg_name += ".json"
        button_warning.set_hover_status_message(f"Can't process package, error(s) in config: {pkg_name}")
        button_warning.setToolTip(warnings)

        # parent.setCellWidget(row, column, parent.center_widget(button_warning))

        return button_warning

    @staticmethod
    def label_no_plugin_data() -> QLabel:
        # if there's no plugin data
        label = QLabel("No plugin data")
        return label

    @staticmethod
    def combo_plugins(value) -> QComboBox:
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
        return combo

    @staticmethod
    def button_config(parent: PackageTableModel, value) -> SvgPushButton:
        # Config: push button that opens its file path when clicked
        config_button = SvgPushButton(
            parent,
            23,
            29,
            "./houdini_package_manager/design/icons/file.svg",
            "./houdini_package_manager/design/icons/file_hover.svg",
        )
        config_button.setToolTip(str(value))
        config_button.setProperty("path", value)
        config_button.clicked.connect(parent.open_path)
        config_button.set_hover_status_message(f"Open: {value}")
        return config_button

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
