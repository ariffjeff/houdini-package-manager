import logging
from pathlib import Path
from typing import Any, List

from PySide6.QtCore import QEvent, Qt, QTimer, QUrl
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

from houdini_package_manager.meta.meta_tools import (
    GlobalExceptionTracker,
    RateLimitError,
    RequestConnectionError,
    StatusBar,
    TableHeaders,
    TextColor,
)
from houdini_package_manager.widgets.custom_widgets import BtnIcon, BtnSize, SvgPushButton
from houdini_package_manager.wrangle.config_control import HoudiniInstall, Package
from houdini_package_manager.wrangle.url import Url


class PackageTableModel(QTableWidget):
    """
    The table widget that displays Houdini package configuration data and various
    buttons/options to navigate and manipulate them.

    Every cell of the table by default contains a QWidget container which is used
    to align and scale its inner contents. Contents can consist of text, buttons,
    dropdowns, or other functionality. If a container is not set to have anything
    in it (because nothing applies for that cell), then it will be filled with
    an empty QLabel by default, which displays as a blank cell.

    A default QWidget for every cell helps prevent errors when programmatically
    traversing multiple cells.
    """

    def __init__(self, parent, houdini_install: HoudiniInstall) -> None:
        super().__init__(parent)

        if not houdini_install.packages.pkgs:
            raise ValueError(f"No package data found for Houdini {houdini_install.version.full}")

        self.hou_version = houdini_install.version
        self.packages = houdini_install.packages.pkgs
        self.table_data = houdini_install.pkg_data_as_table_model(named=False)
        self.column_headers = houdini_install.get_labels()
        self.warnings = houdini_install.get_package_warnings()

        self.setup_table_data()
        self.fill_table_contents()

    @property
    def cell_data(self) -> List[List[Any]]:
        """
        Returns a grid of each cell's inner data for this table.

        This refers to the inner most desirable data:
        table -> cell -> QWidget container -> desired data

        This should only be called after the table has been fully setup with data
        (QWidget container and any inner data) in all cells.
        """

        data = []
        for i in range(self.rowCount()):
            data.append([])
            for j in range(self.columnCount()):
                cell = self.cellWidget(i, j).layout().itemAt(0).widget()
                data[i].append(cell)

        return data

    def setup_table_data(self) -> None:
        """
        Prepare the table data before it gets entered into the packages table.
        This method does not determine column order. This is pre-set by the table_model property in the Package class.
        """

        # insert custom index column
        self.column_headers.insert(0, "")
        for i, _row in enumerate(self.table_data):
            self.table_data[i].insert(0, str(i + 1))
        # remove default index column since it contains the corner part that can't be styled
        for i in range(self.rowCount()):
            item = self.item(i, 0)
            item.setTextAlignment(Qt.AlignCenter)
        self.verticalHeader().setVisible(False)

        self.setRowCount(len(self.table_data))
        self.setColumnCount(len(self.column_headers))

        self.setHorizontalHeaderLabels(self.column_headers)
        self.resizeColumnsToContents()  # before manual width adjustments
        self.setColumnWidth(self.column_headers.index(TableHeaders.PACKAGE.value), 180)
        self.setColumnWidth(self.column_headers.index(TableHeaders.PLUGINS.value), 200)

        # resize troublesome columns to their contents after event loop is idle (window shown)
        QTimer.singleShot(0, self.minimize_column_widths)

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

    def minimize_column_widths(self):
        """
        Resizes certain table's column widths to their content width.

        This is to improve quality of life when using the app by working around an annoying
        feature of certain columns horizontally resizing inconsistently.

        This method really only exists to support resizing any troublesome columns that:
            - refuse to allow resizing to their contents until after the app window is shown.
            - size unpredictably/inconsistently across multiple tables, leading to data
            visually jumping around horizontally when you switch between tables.

        Add more columns to this list whenever they start to become troublesome.
        """

        column_indices = [0]  # start with custom index column
        column_indices += self._headers_to_column_index(TableHeaders.SOURCE)

        for i in column_indices:
            self.resizeColumnToContents(i)

    def setCellWidget(self, widget: QWidget) -> None:
        """
        Wrapper for the QTableWidget setCellWidget method to simplify setting cell data.
        """

        return super().setCellWidget(self.t_row, self.t_col, widget)

    def fill_table_contents(self) -> None:
        """
        Enters the packages data into the packages table.

        The QTableWidget's cells each consist of a QWidget container that aligns the
        desired widget (QLabel, QPushButton, etc.) inside it.
        (QTableWidget -> cell -> QWidget -> Any widget type)

        All cell items are center aligned by default.
        """

        columns_to_align_left = self._headers_to_column_index(
            [TableHeaders.PACKAGE, TableHeaders.AUTHOR, TableHeaders.PLUGINS]
        )
        self.t_row = 0
        self.t_col = 0

        # set table data with widgets based on the incoming data's information/data type
        for row, rowData in enumerate(self.table_data):
            self.t_row = row
            for col, value in enumerate(rowData):
                self.t_col = col

                header = self.horizontalHeaderItem(self.t_col).text()  # column title
                if header:
                    header = self._string_to_header_enum(header)  # convert header back to its enum

                # checkbox
                if header in [TableHeaders.ENABLE]:
                    widget = CellWidgets.checkbox_enable(self, value)

                # button - open a path
                elif header in [TableHeaders.SOURCE, TableHeaders.CONFIG] and value:
                    widget = CellWidgets.button_open_path(self, value, header)

                # button - sync a package's repository metadata
                elif header in [TableHeaders.SYNC] and self._current_package().remote_repo_url:
                    widget = CellWidgets.button_git_sync(self)

                # dropdown (warning button as a replacement)
                elif header in [TableHeaders.PLUGINS]:
                    widget = self._create_plugin_dropdown_widget(value)

                # index (str), string, None - strings and any remaining unset values from the table model
                elif isinstance(value, str) or not value:
                    widget = CellWidgets.label_text(value)

                # align widgets in cells
                align = None
                if self.t_col in columns_to_align_left:
                    align = Qt.AlignLeft

                self.setCellWidget(self.align_widget(widget, align))

    def _create_plugin_dropdown_widget(self, value) -> QWidget:
        """
        Creates the plugins dropdown widget.
        """

        warnings = "\n".join(list(self.warnings.values())[self.t_row])
        if warnings:
            widget = CellWidgets.button_warning(self, self.t_row, warnings, self._current_package().config_path)
        elif not value:
            widget = CellWidgets.label_no_plugin_data()
        elif len(value) > 1:
            widget = CellWidgets.combo_plugins(self, value)
        else:
            widget = CellWidgets.button_plugins(self, value[0])
            widget.clicked.connect(self.open_path)
        widget.setMinimumHeight(29)
        return widget

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
        StatusBar.message(f"{message} package: {package.pkg_name}")

    def align_widget(self, widget, align: Qt.AlignmentFlag = None) -> QWidget:
        """
        Creates a QWidget with a QHBoxLayout that positions and scales a desired widget inside.

        These are mainly sub-containers that are intended to be set inside a QTableWidget cell.
        The QWidget prevents the cell from collapsing in on the cell contents, which would hide it.

        Args:
            widget:
                The QWidget container to be placed in a QTableWidget cell.

            align:
                The type of alignment. Centered inside the cell by default.

        Returns:
            A QWidget that can be used as an argument in the self.setCellWidget method.
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

    def _current_package(self) -> Package:
        """
        Return the current Package that's data is being worked upon while the table cells are being set.
        """

        pkg = list(self.packages.values())[self.t_row]
        return pkg

    def _current_cell(self) -> tuple:
        """
        The row and column integers for the current cell that is being created while the given cell is being set.

        Returns a tuple.
        """

        return (self.t_row, self.t_col)

    def _get_cell_contents_from_same_row(self, header: TableHeaders) -> QWidget | None:
        """
        Returns the desired QTableWidget cell's widget contents (if any).

        The desired cell must be targeted:
            - from another cell within the same row.
            - during the calling cell's creation (so that the current row & column indices are correct).
            - with a given column header from TableHeaders.

        Args:
            header (TableHeaders):
                The target cell's column header Enum name.

        Returns:
            A QWidget object (the cell's inner alignment container) if one exists or None if the cell is empty.
        """

        cell_position = self._get_cell_position_from_same_row(header)
        cell_widget = self.cellWidget(*cell_position)

        # in case cell has not been set with anything
        if not cell_widget:
            message = (
                f"Table cell at position {cell_position} is missing a default inner QWidget container (cell has no"
                " data)."
            )
            logging.error(message)
            StatusBar.message(message, TextColor.ERROR)
            return None

        target_widget = cell_widget.layout().itemAt(0).widget()

        return target_widget

    def _get_cell_position_from_same_row(self, header: TableHeaders) -> tuple:
        """
        Returns the index coordinate position of the desired QTableWidget cell.

        The position is determined by iterating through the header row until
        the current header name matches the desired name.

        Args:
            header (TableHeaders):
                The target cell's column header Enum name.

        Returns:
            A tuple of the cell's coordinate position.
        """

        if not isinstance(header, TableHeaders):
            raise TypeError(f"{type(header)} must be of type TableHeaders.")

        header_row = self.horizontalHeader()
        for column in range(header_row.count()):
            if self.horizontalHeaderItem(column).text() == header.value:
                break

        cell_position = (self.t_row, column)

        return cell_position

    def _headers_to_column_index(self, headers: TableHeaders | List[TableHeaders]) -> List[int]:
        """
        Convert the column header(s) to its index.

        Returns a list of int(s).
        """

        if isinstance(headers, TableHeaders):
            headers = [headers]

        indices = []
        for head in headers:
            i = self.column_headers.index(head.value)
            indices.append(i)

        return indices

    def _string_to_header_enum(self, string_value: str) -> TableHeaders:
        """
        Converts a string to its corresponding enum member in the TableHeaders class.

        Args:
            string_value (str): The string to convert to an enum member.

        Returns:
            TableHeaders: The enum member corresponding to the string value.

        Raises:
            ValueError: If the string does not match any of the enum members' values.
        """

        for member in TableHeaders:
            if member.value == string_value:
                return member
        raise ValueError(f"{string_value} is not a valid {TableHeaders.__name__}")


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

        pkg_name = parent._current_package().pkg_name
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
    def button_open_path(parent: PackageTableModel, path: Path | Url, button_type: TableHeaders) -> SvgPushButton:
        """
        A QPushButton that opens its file path or url when clicked.
        """

        # local path or url
        if button_type is TableHeaders.SOURCE:
            button = SvgPushButton(parent, BtnSize.CELL_TALL, BtnIcon.SOURCE_CONTROL)
        elif button_type is TableHeaders.CONFIG:
            button = SvgPushButton(parent, BtnSize.CELL_TALL, BtnIcon.FILE)

        button.setToolTip(str(path))
        button.setProperty("path", path)  # store path on button
        button.clicked.connect(parent.open_path)
        button.set_hover_status_message(f"Open: {str(path)}")
        return button

    @staticmethod
    def button_git_sync(parent: PackageTableModel) -> SvgPushButton:
        """
        A QPushButton that updates the row with the latest tag version.

        One or more requests is sent to the GitHub API to fetch the remote repo's tags.
        """

        # initialize data now during this cell's creation
        pkg = parent._current_package()
        target_cell = parent._get_cell_contents_from_same_row(TableHeaders.LATEST)
        exception_tracker = GlobalExceptionTracker()

        def update_latest_tag() -> None:
            """
            Perform all operations to update the latest tag version.

            The tag is fetched from the remote, set to the relevant cell, and finally cached in the user's json.
            """

            try:
                latest_tag = pkg._git_project.fetch_latest_remote_tag()

                if not latest_tag:
                    StatusBar.message(
                        f"Sync failed. No tag versions found on the remote repository for {pkg.pkg_name}.",
                        TextColor.ERROR,
                    )
                    return

                target_cell.setText(latest_tag)
                StatusBar.message(f"Successfully synced metadata for {pkg.pkg_name}", TextColor.SUCCESS)

            except (RateLimitError, RequestConnectionError) as e:
                exception_tracker.set_exception(e)
                StatusBar.message(str(e), TextColor.ERROR)

        button = SvgPushButton(parent, BtnSize.SQUARE_DEFAULT, BtnIcon.GIT_SYNC)
        button.clicked.connect(update_latest_tag)
        button.setToolTip("Sync metadata")
        button.set_hover_status_message(f"Sync metadata for {pkg.remote_repo_url.stem}")
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
    """
    A dropdown list of items that ignores scroll-wheel scrolling.
    """

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
