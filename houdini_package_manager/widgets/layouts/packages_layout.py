import logging
import shutil
from pathlib import Path
from typing import Dict, List

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QHBoxLayout,
    QLabel,
    QStackedWidget,
    QTabWidget,
    QVBoxLayout,
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
from houdini_package_manager.widgets.packages_table import PackageTableModel
from houdini_package_manager.wrangle.config_control import HoudiniManager, Package


class PackagesWidget(QWidget):
    """
    The packages layout that displays the main packages table and relevant dropdowns and buttons.

    Arguments:
        parent:
            The parent widget.

        table_data (HoudiniManager):
            The data set to populate the QWidgetTable. Data can consist of multiple sets of packages
            for different installed versions of Houdini.

        versions (List[str]):
            The list of ordered version numbers that will determine which set of package data is shown in the table.

        tabs (QTabWidget):
            The parent QTabWidget. Used for switching tabs based on widget interaction in this QWidget.
    """

    def __init__(self, parent, table_data: HoudiniManager, hou_versions: List[str], tabs: QTabWidget) -> None:
        super().__init__(parent)

        self.parent_tabs = tabs
        self.table_data = table_data
        self.hou_versions = hou_versions

        self.version_labels = ["Houdini " + version for version in self.hou_versions]
        self._current_table_version = self.hou_versions[0]

        # LABEL - HOUDINI VERSION DROPDOWN
        label_version_dropdown = QLabel("HOUDINI VERSIONS")
        label_version_dropdown.setStyleSheet("QLabel { color: #ff6600 }")

        # BUTTON - ADD PACKAGE
        button_add_package = SvgPushButton(self, BtnSize.WIDE_LARGE, BtnIcon.ADD_PKG)
        button_add_package.clicked.connect(self.add_packages)

        # DROPDOWN - HOUDINI VERSION
        self.combo_version = QComboBox()
        self.combo_version.addItems(self.version_labels)
        self.combo_version.activated.connect(self.switch_package_table)
        self.combo_version.setMinimumHeight(29)
        self.combo_version.setMinimumWidth(155)

        self.combo_version.setStyleSheet(
            """
        QComboBox {
            text-align: left;
            background-color: #303030;
            border: none;
            padding: 5px;
        }

        QComboBox:hover { background-color: #404040; }
        QComboBox::drop-down { subcontrol-position: left; }
        """
        )

        # BUTTON - HOUDINI VERSION FOLDER
        self.button_version = SvgPushButton(self, BtnSize.FOLDER, BtnIcon.FOLDER)
        path = self.current_packages_directory()
        self.button_version.set_hover_status_message(f"Open: {path}")
        self.button_version.setToolTip("Open packages folder")
        self.button_version.setProperty("path", path)
        self.button_version.clicked.connect(self.open_path)

        # BUTTONS - PACKAGE OPTIONS
        # copy all the packages in the current table to another houdini version
        self.button_git_sync = SvgPushButton(self, BtnSize.SQUARE_DEFAULT, BtnIcon.GIT_SYNC)
        self.button_git_sync.set_hover_status_message(
            "Sync all package metadata from remote repositories for these plugins."
        )
        self.button_git_sync.setToolTip("Sync these plugins' metadata")
        self.button_git_sync.clicked.connect(self.fetch_all_package_remote_metadata)

        self.button_copy = SvgPushButton(self, BtnSize.SQUARE_DEFAULT, BtnIcon.MIGRATE)
        self.button_copy.set_hover_status_message("Copy all packages to other Houdini versions.")
        self.button_copy.setToolTip("Copy all packages to other Houdini versions")
        self.button_copy.clicked.connect(self.migrate_packages)

        self.button_refresh = SvgPushButton(self, BtnSize.SQUARE_DEFAULT, BtnIcon.REFRESH)
        self.button_refresh.set_hover_status_message(f"Refresh Houdini {self.current_table_version} packages.")
        self.button_refresh.setToolTip("Refresh packages for current table")
        self.button_refresh.clicked.connect(self.refresh_table)

        self.button_refresh_all = SvgPushButton(self, BtnSize.SQUARE_DEFAULT, BtnIcon.REFRESH_ALL)
        self.button_refresh_all.set_hover_status_message("Refresh all packages for all installed versions of Houdini.")
        self.button_refresh_all.setToolTip("Refresh all packages for all installed versions of Houdini")
        self.button_refresh_all.clicked.connect(self.refresh_all_tables)

        # TABLE - PACKAGE DATA
        current_hou_version = self.table_data.hou_installs[self.hou_versions[0]]
        if current_hou_version.packages.pkgs:
            table = PackageTableModel(self, current_hou_version)
            table.setStyleSheet("QTableWidget {border: none;}")
        else:
            table = self._no_packages_found()

        self.stacked_widget = QStackedWidget()
        self.stacked_widget.addWidget(table)
        self.stacked_widget.setStyleSheet("QStackedWidget {border: 1px solid grey;}")

        # keep track of loaded package tables in the order they are added to stacked_widget
        self.loaded_stacked_widgets_in_order_loaded = [self.hou_versions[0]]

        # CREATE LAYOUTS
        self.layout_main = QVBoxLayout()
        layout_secondary_header = QHBoxLayout()
        layout_table_options = QHBoxLayout()
        layout_version_buttons = QHBoxLayout()
        layout_package_buttons = QHBoxLayout()

        # SET LAYOUTS
        self.layout_main.addLayout(layout_secondary_header)
        self.layout_main.addLayout(layout_table_options)
        self.layout_main.addWidget(self.stacked_widget)

        layout_secondary_header.addWidget(label_version_dropdown)
        layout_secondary_header.addWidget(button_add_package)
        layout_secondary_header.setAlignment(label_version_dropdown, Qt.AlignBottom)

        layout_table_options.addLayout(layout_version_buttons)
        layout_version_buttons.addWidget(self.combo_version)
        layout_version_buttons.addWidget(self.button_version)
        layout_table_options.addLayout(layout_package_buttons)
        layout_package_buttons.addWidget(self.button_git_sync)
        layout_package_buttons.addWidget(self.button_copy)
        layout_package_buttons.addWidget(self.button_refresh)
        layout_package_buttons.addWidget(self.button_refresh_all)
        layout_version_buttons.setAlignment(Qt.AlignLeft)
        layout_table_options.setAlignment(layout_package_buttons, Qt.AlignRight)

    @property
    def current_table_version(self) -> str:
        """
        Returns the houdini version number of the current displayed package table.
        """

        self._current_table_version = self.combo_version.currentText().split(" ")[-1]
        return self._current_table_version

    @property
    def current_table(self) -> PackageTableModel:
        """
        Returns the currently displayed PackageTableModel package table.
        """

        table = self.stacked_widget.currentWidget()
        return table

    @property
    def loaded_tables(self) -> List[PackageTableModel]:
        """
        Returns a list of currently loaded PackageTableModel package tables.

        Tables that aren't loaded are ones that the user has not navigated to yet,
        which hasn't triggered their load.
        """

        tables = []
        for i in range(self.stacked_widget.count()):
            tables.append(self.stacked_widget.widget(i))
        return tables

    def add_packages(self) -> None:
        """
        Switch to the tab for creating packages from local plugins.
        Choosing the tab index to switch to is determined by a tab's
        matching "id" property.
        """

        target_id = "local_plugin_adder"
        tab_widget_id = []
        for i in range(self.parent_tabs.count()):
            tab_widget_id.append(self.parent_tabs.widget(i).property("id"))

        target_index = tab_widget_id.index(target_id)

        self.parent_tabs.setCurrentIndex(target_index)

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

    def switch_package_table(self) -> None:
        """
        Load a set of package data into a table, add it to the QStackedWidget, and switch to it.
        If the set of data was already loaded then switch to it instead of loading it again.
        """

        # MANUAL UPDATING OF PACKAGE TABLE INDEPENDENT WIDGETS
        # update refresh button hover status bar message
        self.button_refresh.set_hover_status_message(f"Refresh Houdini {self.current_table_version} packages.")
        # update houdini packages folder button location
        self.button_version.setProperty("path", self.current_packages_directory())
        self.button_version.set_hover_status_message(f"Open: {self.current_packages_directory()}")

        # if the table widget has already been added, switch to it
        if self.current_table_version in self.loaded_stacked_widgets_in_order_loaded:
            index = self.loaded_stacked_widgets_in_order_loaded.index(self.current_table_version)
            self.stacked_widget.setCurrentIndex(index)
            return

        configs = self.table_data.hou_installs[self.current_table_version].packages.pkgs
        if configs:
            widget_contents = PackageTableModel(self, self.table_data.hou_installs[self.current_table_version])
            widget_contents.setStyleSheet("QTableWidget {border: none;}")
        else:
            widget_contents = QLabel("No packages found")
            widget_contents.setAlignment(Qt.AlignCenter)

        self.stacked_widget.addWidget(widget_contents)
        self.stacked_widget.setCurrentWidget(widget_contents)
        self.loaded_stacked_widgets_in_order_loaded.append(self.current_table_version)

    def refresh_table(self, version: str = None, status: bool = True) -> None:
        """
        Refresh all the package data for the desired table.
        If version is specified, the currently displayed table's data will be refreshed.

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

        refresh_version = version if version else self.current_table_version

        # refresh config data for current package set
        self.table_data.get_houdini_data(refresh_version)

        configs = self.table_data.hou_installs[refresh_version].packages.pkgs
        if configs:
            widget_contents = PackageTableModel(self, self.table_data.hou_installs[refresh_version])
            widget_contents.setStyleSheet("QTableWidget {border: none;}")
        else:
            if status:
                StatusBar.message(f"No packages found for Houdini {refresh_version}.")
            widget_contents = self._no_packages_found()

        current_index = self.stacked_widget.currentIndex()

        # refresh QStackWidget widget (if it has been created)
        if refresh_version not in self.loaded_stacked_widgets_in_order_loaded:
            return

        target_index = self.loaded_stacked_widgets_in_order_loaded.index(
            refresh_version
        )  # index position in self.stacked_widget, NOT the QComboBox
        target_widget = self.stacked_widget.widget(target_index)

        self.stacked_widget.insertWidget(target_index, widget_contents)
        self.stacked_widget.removeWidget(target_widget)
        self.stacked_widget.setCurrentIndex(current_index)

        if status:
            StatusBar.message(f"Refreshed packages for Houdini {refresh_version}.")

    def _no_packages_found(self):
        """
        Returns a QLabel that's meant to replace a table when there is no package data to fill it.
        """

        label = QLabel("No packages found")
        label.setAlignment(Qt.AlignCenter)
        return label

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
        not_loaded_versions = list(set(self.hou_versions).difference(set(self.loaded_stacked_widgets_in_order_loaded)))
        for version in not_loaded_versions:
            self.table_data.get_houdini_data(version)

        StatusBar.message("Refreshed all package data and tables.")

    def fetch_all_package_remote_metadata(self) -> None:
        """
        Fetch the remote metadata for every package of this version of Houdini.

        This is done by programmatically "clicking" every git sync button in the
        table across all the rows.

        Exceptions that occur during metadata syncing across multiple rows are
        tracked by a global exception tracker and then handled in this method
        because programmatically triggering buttons' signals prevents
        exceptions from traversing up the call stack to this method where
        they need to be caught. The global exception tracker is the
        workaround for this.
        """

        logging.debug(f"Started full table metadata GitHub sync for Houdini {self.current_table_version}")

        table = self.current_table
        cell_data = table.cell_data
        git_fetch_col_index = table._headers_to_column_index(TableHeaders.SYNC)[0]
        tracker = GlobalExceptionTracker()

        for row in cell_data:
            cell_item = row[git_fetch_col_index]
            if isinstance(cell_item, SvgPushButton):  # checking button exists in cell
                cell_item.clicked.emit()  # trigger signal
                exception = tracker.get_exception()  # recheck if hidden exception occured
                if exception:
                    break

        if not exception:
            logging.debug(
                f"Completed full table metadata GitHub sync for Houdini {self.current_table_version} with no errors."
            )
            StatusBar.message(
                f"Synced all metadata for applicable Houdini {self._current_table_version} packages.", TextColor.SUCCESS
            )
        elif exception:
            logging.error(
                f"Failed to complete full table metadata GitHub sync for Houdini {self.current_table_version}"
            )

            if isinstance(exception, RateLimitError):
                StatusBar.message(
                    "GitHub API rate limiting occured at some point during table metadata sync. Some packages weren't"
                    " synced. Try again later.",
                    TextColor.ERROR,
                )
            elif isinstance(exception, RequestConnectionError):
                StatusBar.message(
                    "A connection error occured trying to reach the GitHub API during table metadata sync. Try again.",
                    TextColor.ERROR,
                )

        # TODO: print total number of pkgs whose tag lists have been updated

    def migrate_packages(self) -> None:
        """
        Make copies of all the packages in the currently displayed table and put them
        in the target packages directory of the target installed versions of Houdini.
        """

        if len(self.hou_versions) <= 1:
            StatusBar.message("No other Houdini versions to copy packages to.", TextColor.ERROR)
            return

        checkbox_version_options = list(self.hou_versions)
        checkbox_version_options.remove(self.current_table_version)
        checkbox_version_options = [f"Houdini {version}" for version in checkbox_version_options]

        # identify any potential file overwrite conflicts for different houdini versions
        current_package_paths = [package.config_path for package in self.current_packages()]
        if not current_package_paths:
            StatusBar.message(f"No packages in Houdini {self.current_table_version} to copy.")
            return

        file_conflicts = self.find_file_conflicts()
        dialog = CheckboxDialog(checkbox_version_options, len(current_package_paths), file_conflicts)
        dialog.setStyleSheet(
            """
            * {
                background-color: #303030;
                color: white;
            }
        """
        )
        result = dialog.exec()
        if result == 0:
            return

        target_versions = dialog.enabled_checkboxes()
        target_versions = [version.split(" ")[-1] for version in target_versions]
        target_packages_dirs = [
            self.table_data.hou_installs[version].packages.packages_directory for version in target_versions
        ]

        # copy files
        for dest in target_packages_dirs:
            for file_path in current_package_paths:
                shutil.copy(file_path, dest)

        StatusBar.message(
            f"Copied {len(current_package_paths)} packages from {self.combo_version.currentText()} to"
            f" {len(target_packages_dirs)} other Houdini installs."
        )

        # refresh packages table for target houdini versions
        for version in target_versions:
            self.refresh_table(version, status=False)

    def find_file_conflicts(self) -> Dict[str, List[Path]]:
        """
        Search for file conflicts in other Houdini packages directories by comparing
        all the Package configs in the current houdini version with all the other houdini version Package configs.
        This is useful for if config files from one houdini version need to be moved to another.

        Returns a dict of all other houdini versions where each value is a list of package Paths.
        """

        # check the package tables that aren't the one that's currently loaded
        other_versions = list(self.hou_versions)
        other_versions.remove(self.current_table_version)

        # identify any potential file overwrite conflicts for different houdini versions
        current_package_paths = [package.config_path for package in self.current_packages()]
        other_package_paths = {}
        for version, pkgs in self.get_packages(other_versions).items():  # sort package paths to each houdini version
            pkg_paths = []
            for pkg in pkgs.values():
                pkg_paths.append(pkg.config_path)
            pkg_paths = [path.name for path in pkg_paths]
            other_package_paths[version] = pkg_paths

        file_conflicts = {}
        for version, paths in other_package_paths.items():
            file_conflicts[version] = []
            for pkg_path in current_package_paths:
                if pkg_path.name in paths:
                    file_conflicts[version].append(pkg_path)

        return file_conflicts

    def current_packages(self) -> List[Package]:
        """
        Return a list of the Package objects assosciated with the currently loaded table.
        """

        current_table = self.current_table
        if not hasattr(current_table, "packages"):
            return []
        packages = list(current_table.packages.values())
        return packages

    def get_packages(self, versions: str | List[str] = None) -> Dict[str, Package]:
        """
        Return a dict of the package data for the all the tables.
        The key is the Houdini version number.
        The value is the Package object.

        Arguments:
            versions (str | List[str]):
                The Houdini versions to get packages from.
                If no version is provided, the packages for all Houdini versions will be returned.
        """

        all_versions = self.table_data.hou_installs
        if not versions:
            return all_versions

        if isinstance(versions, str):
            versions = [versions]

        #  isolate target versions
        target_versions = {}
        for key, value in all_versions.items():
            if key in versions:
                target_versions[key] = value

        # get the package data for each houdini install version
        package_data = {}
        for key, houInstall in target_versions.items():
            package_data[key] = houInstall.packages.pkgs

        return package_data

    def current_packages_directory(self) -> Path:
        """
        Return the packages directory of the currently loaded houdini version.
        """

        current_version = self.current_table_version
        path = self.table_data.hou_installs[current_version].packages.packages_directory
        return path


class CheckboxDialog(QDialog):
    """
    The dialog box for copying packages from one Houdini version to another.
    """

    def __init__(self, checkbox_data, package_count, file_conflicts, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Copy packages")

        self.file_conflicts = file_conflicts  # all possible conflicts
        self.checked_file_conflicts = 0  # accumulated number of conflicts from only checked houdini versions
        self.checkboxes = []

        label_pkg_num = QLabel(f"Copy {package_count} packages to:")
        self.label_file_overwrites = QLabel(f"{self.checked_file_conflicts} files will be overwritten.")

        layout_versions = QVBoxLayout()
        self.checkboxes = []
        for option in checkbox_data:
            checkbox = QCheckBox(option)
            checkbox.clicked.connect(self.update_file_conflicts)
            hbox = QHBoxLayout()
            hbox.addWidget(checkbox)
            hbox.setContentsMargins(0, 0, 0, 0)
            hbox.setAlignment(Qt.AlignLeft)
            layout_versions.addLayout(hbox)
            self.checkboxes.append(checkbox)
        layout_versions.setContentsMargins(0, 10, 0, 10)

        # button box
        button_box = QDialogButtonBox(Qt.Horizontal)
        button_box.setStandardButtons(QDialogButtonBox.Cancel | QDialogButtonBox.Ok)
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)

        layout_main = QVBoxLayout()
        layout_main.addWidget(label_pkg_num)
        layout_main.addLayout(layout_versions)
        layout_main.addWidget(self.label_file_overwrites)
        layout_main.addWidget(button_box)
        layout_main.setAlignment(button_box, Qt.AlignCenter)
        self.setLayout(layout_main)

    def update_file_conflicts(self) -> None:
        """
        Updates the displayed total number of file conflicts in the dialog box's warning.

        This is done by checking for conflicts for each selected version of houdini.
        """

        self.checked_file_conflicts = 0
        data = self.get_checkbox_data()

        i = 0
        for paths in self.file_conflicts.values():
            if data[i]:
                self.checked_file_conflicts += len(paths)
            i += 1

        self.label_file_overwrites.setText(f"{self.checked_file_conflicts} files will be overwritten.")

    def get_checkbox_data(self) -> List[tuple]:
        """
        Returns a list of tuples containing this dialog's checkbox labels and whether they are checked.
        """

        return [checkbox.isChecked() for checkbox in self.checkboxes]

    def enabled_checkboxes(self) -> List[str]:
        """
        Returns a list of strings of the enabled checkbox labels' text.
        """

        selected_checkboxes = []
        for checkbox in self.checkboxes:
            if checkbox.isChecked():
                selected_checkboxes.append(checkbox.text())

        return selected_checkboxes
