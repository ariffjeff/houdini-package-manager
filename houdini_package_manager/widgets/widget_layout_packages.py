from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from houdini_package_manager.widgets.widget_table_packages import PackageTableModel
from houdini_package_manager.widgets.widgets_custom import SvgPushButton
from houdini_package_manager.wrangle.config_control import HoudiniManager


class PackagesWidget(QWidget):
    """
    The packages layout that displays the main packages table and relevant dropdowns and buttons.

    Arguments:
        main_window (QMainWindow):
            The main window.

        table_data (HoudiniManager):
            The data set to populate the QWidgetTable. Data can consist of multiple sets of packages
            for different installed versions of Houdini.

        versions (list[str]):
            The list of ordered version numbers that will determine which set of package data is shown in the table.
    """

    def __init__(self, main_window: QMainWindow, table_data: HoudiniManager, versions: list[str]) -> None:
        super().__init__()

        self.main_window = main_window
        self.table_data = table_data
        self.versions = versions
        self.version_labels = ["Houdini " + version for version in self.versions]
        self._table_version = self.versions[0]

        # LABEL - HOUDINI VERSION DROPDOWN
        label_version_dropdown = QLabel("HOUDINI VERSIONS")

        # BUTTON - ADD PACKAGE
        button_add_package = SvgPushButton(
            120,
            36,
            "./houdini_package_manager/design/icons/add_packages.svg",
            "./houdini_package_manager/design/icons/add_packages_hover.svg",
        )

        # DROPDOWN - HOUDINI VERSION
        self.combo_version = QComboBox()
        self.combo_version.addItems(self.version_labels)
        self.combo_version.activated.connect(self.switch_package_table)

        # BUTTONS - PACKAGE OPTIONS
        button_copy = QPushButton("COPY")  # copy all the packages in the current table to another houdini version
        self.button_refresh = SvgPushButton(
            28,
            28,
            "./houdini_package_manager/design/icons/refresh.svg",
            "./houdini_package_manager/design/icons/refresh_hover.svg",
            self.main_window,
        )
        self.button_refresh.set_hover_status_message(f"Refresh the Houdini {self.table_version} table.")
        self.button_refresh.setToolTip("Refresh table")
        self.button_refresh.clicked.connect(self.refresh_table)

        # TABLE - PACKAGE DATA
        table = PackageTableModel(self, self.main_window, self.table_data.hou_installs[self.versions[0]])
        self.stacked_widget = QStackedWidget()
        self.stacked_widget.addWidget(table)
        # keep track of loaded package tables in the order they are added to stacked_widget
        self.loaded_table_widgets = [self.versions[0]]

        # CREATE LAYOUTS
        self.layout_main = QVBoxLayout()
        layout_secondary_header = QHBoxLayout()
        layout_package_options = QHBoxLayout()

        # SET LAYOUTS
        self.layout_main.addLayout(layout_secondary_header)
        self.layout_main.addLayout(layout_package_options)
        self.layout_main.addWidget(self.stacked_widget)

        layout_secondary_header.addWidget(label_version_dropdown)
        layout_secondary_header.addWidget(button_add_package)
        layout_secondary_header.setAlignment(label_version_dropdown, Qt.AlignBottom)

        layout_package_options.addWidget(self.combo_version)
        layout_package_options.addWidget(button_copy)
        layout_package_options.addWidget(self.button_refresh)

    @property
    def table_version(self):
        self._table_version = self.combo_version.currentText().split(" ")[-1]
        return self._table_version

    def switch_package_table(self) -> None:
        """
        Load a set of package data into a table, add it to the QStackedWidget, and switch to it.
        If the set of data was already loaded then switch to it instead of loading it again.
        """

        self.button_refresh.set_hover_status_message(f"Refresh the Houdini {self.table_version} table.")

        # if the table widget has already been added, switch to it
        if self.table_version in self.loaded_table_widgets:
            index = self.loaded_table_widgets.index(self.table_version)
            self.stacked_widget.setCurrentIndex(index)
            return

        table = PackageTableModel(self, self.main_window, self.table_data.hou_installs[self.table_version])
        self.stacked_widget.addWidget(table)
        self.stacked_widget.setCurrentWidget(table)
        self.loaded_table_widgets.append(self.table_version)

    def refresh_table(self) -> None:
        """
        Refresh all the package data for the currently displayed table.
        """

        hou_version = self.table_version

        # refresh config data for current package set
        self.table_data.get_houdini_data(hou_version)

        table = PackageTableModel(self, self.main_window, self.table_data.hou_installs[hou_version])

        current_index = self.stacked_widget.currentIndex()
        current_widget = self.stacked_widget.currentWidget()

        self.stacked_widget.insertWidget(current_index, table)
        self.stacked_widget.removeWidget(current_widget)
        self.stacked_widget.setCurrentIndex(current_index)

        self.main_window.statusBar().showMessage(f"Refreshed table: Houdini {hou_version}")
