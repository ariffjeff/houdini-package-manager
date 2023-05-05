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

from houdini_package_manager.widgets.custom_widgets import SvgPushButton
from houdini_package_manager.widgets.packages_table import PackageTableModel
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
        self.button_refresh.set_hover_status_message(f"Refresh Houdini {self.table_version} packages.")
        self.button_refresh.setToolTip("Refresh packages for current table")
        self.button_refresh.clicked.connect(self.refresh_table)

        self.button_refresh_all = SvgPushButton(
            28,
            28,
            "./houdini_package_manager/design/icons/refresh_all.svg",
            "./houdini_package_manager/design/icons/refresh_all_hover.svg",
            self.main_window,
        )
        self.button_refresh_all.set_hover_status_message("Refresh all packages for all installed versions of Houdini.")
        self.button_refresh_all.setToolTip("Refresh all packages for all installed versions of Houdini.")
        self.button_refresh_all.clicked.connect(self.refresh_all_tables)

        # TABLE - PACKAGE DATA
        table = PackageTableModel(self, self.main_window, self.table_data.hou_installs[self.versions[0]])
        table.setStyleSheet("QTableWidget {border: none;}")

        self.stacked_widget = QStackedWidget()
        self.stacked_widget.addWidget(table)
        self.stacked_widget.setStyleSheet("QStackedWidget {border: 1px solid grey;}")

        # keep track of loaded package tables in the order they are added to stacked_widget
        self.loaded_stacked_widgets_in_order_loaded = [self.versions[0]]

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
        layout_package_options.addWidget(self.button_refresh_all)

    @property
    def table_version(self):
        self._table_version = self.combo_version.currentText().split(" ")[-1]
        return self._table_version

    def switch_package_table(self) -> None:
        """
        Load a set of package data into a table, add it to the QStackedWidget, and switch to it.
        If the set of data was already loaded then switch to it instead of loading it again.
        """

        # update refresh button hover status bar message
        self.button_refresh.set_hover_status_message(f"Refresh Houdini {self.table_version} packages.")

        configs = self.table_data.hou_installs[self.table_version].packages.configs

        # if the table widget has already been added, switch to it
        if self.table_version in self.loaded_stacked_widgets_in_order_loaded:
            index = self.loaded_stacked_widgets_in_order_loaded.index(self.table_version)
            self.stacked_widget.setCurrentIndex(index)
            return

        if configs:
            widget_contents = PackageTableModel(
                self, self.main_window, self.table_data.hou_installs[self.table_version]
            )
            widget_contents.setStyleSheet("QTableWidget {border: none;}")
        else:
            widget_contents = QLabel("No packages found")
            widget_contents.setAlignment(Qt.AlignCenter)

        self.stacked_widget.addWidget(widget_contents)
        self.stacked_widget.setCurrentWidget(widget_contents)
        self.loaded_stacked_widgets_in_order_loaded.append(self.table_version)

    def refresh_table(self, version: str = None, status: bool = True) -> None:
        """
        Refresh all the package data for the currently displayed table.

        Arguments:
            version (str):
                The version number from the QComboBox list of the package table to refresh.
                If version is None, the currently displayed package data and table in the QStackedWidget will be refreshed.
                If version is a valid version, that loaded package data and table will be refreshed.

            status (bool):
                Whether the status bar should print a successful package refresh message.
                Suppressing this is useful when multiple package tables need to be refreshed all at once.
                Default is True.
        """

        refresh_version = version if version else self.table_version

        # refresh config data for current package set
        self.table_data.get_houdini_data(refresh_version)

        configs = self.table_data.hou_installs[refresh_version].packages.configs
        if configs:
            widget_contents = PackageTableModel(self, self.main_window, self.table_data.hou_installs[refresh_version])
            widget_contents.setStyleSheet("QTableWidget {border: none;}")
        else:
            if status:
                self.main_window.statusBar().showMessage(f"No packages found for Houdini {refresh_version}.")
            widget_contents = QLabel("No packages found")
            widget_contents.setAlignment(Qt.AlignCenter)

        current_index = self.stacked_widget.currentIndex()

        target_index = self.loaded_stacked_widgets_in_order_loaded.index(
            refresh_version
        )  # index position in self.stacked_widget, NOT the QComboBox
        target_widget = self.stacked_widget.widget(target_index)

        self.stacked_widget.insertWidget(target_index, widget_contents)
        self.stacked_widget.removeWidget(target_widget)
        self.stacked_widget.setCurrentIndex(current_index)

        if status:
            self.main_window.statusBar().showMessage(f"Refreshed packages for Houdini {refresh_version}.")

    def refresh_all_tables(self) -> None:
        """
        Refresh the package data for all versions of Houdini.
        First refresh the data for every loaded table, then reload the rest
        of package config data that hasn't yet been converted to a table. This
        is to prevent having to load tables for the entire list of Houdini installs.
        """

        # # lazy method - refresh everything (less efficient)
        # # refresh all config data
        # self.table_data.get_houdini_data()
        # # refresh all loaded widgets in QStackedWidget
        # # DOESNT WORK CURRENTLY ANYWAYS SINCE CAN'T REFRESH A NON-LOADED WIDGET
        # for version in self.versions:
        #     self.refresh_table(version)

        # refresh loaded tables
        for version in self.loaded_stacked_widgets_in_order_loaded:
            self.refresh_table(version)

        # reload package config data for packages not loaded into tables.
        not_loaded_versions = list(set(self.versions).difference(set(self.loaded_stacked_widgets_in_order_loaded)))
        for version in not_loaded_versions:
            self.table_data.get_houdini_data(version)

        self.main_window.statusBar().showMessage("Refreshed all package data and tables.")
