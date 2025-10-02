import json
from pathlib import Path
from typing import List

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QAbstractItemView,
    QCheckBox,
    QDialog,
    QFileDialog,
    QFileSystemModel,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QListView,
    QPushButton,
    QSizePolicy,
    QStackedWidget,
    QTreeView,
    QVBoxLayout,
    QWidget,
)

from houdini_package_manager.meta.meta_tools import StatusBar, TextColor
from houdini_package_manager.widgets.custom_widgets import BtnIcon, BtnSize, SvgPushButton
from houdini_package_manager.wrangle.config_control import HoudiniManager
from houdini_package_manager.wrangle.package_templates import PackageTemplates


class LocalPackageAdderWidget(QWidget):
    """
    The layout that displays the tools for creating new packages from plugin folders/files.

    Arguments:
        parent:
            The parent widget.

        table_data (HoudiniManager):
            The data set to populate the QWidgetTable. Data can consist of multiple sets of packages
            for different installed versions of Houdini.

        versions (List[str]):
            The list of ordered version numbers that will determine which set of package data is shown in the table.
    """

    def __init__(self, parent, table_data: HoudiniManager, versions: List[str]) -> None:
        super().__init__(parent)

        self.table_data = table_data
        self.versions = versions
        self.tool_widgets = PresetWidgets()

        # LIST - HOUDINI VERSIONS
        label_versions = QLabel("Create packages for:")
        button_invert_versions_selection = self.tool_widgets.invert_selection(self)
        button_clear_versions_selection = self.tool_widgets.clear_selection(self)

        self.layout_v_hou_versions = QVBoxLayout()
        self.layout_v_hou_versions.setAlignment(Qt.AlignTop)
        for version in self.versions:
            checkbox = QCheckBox(f"Houdini {version}")
            checkbox.setProperty("version", version)
            checkbox.clicked.connect(self.update_file_overwrite_warning)
            self.layout_v_hou_versions.addWidget(checkbox)
        button_invert_versions_selection.clicked.connect(lambda: self.invert_selection(self.layout_v_hou_versions))
        button_clear_versions_selection.clicked.connect(lambda: self.clear_selection(self.layout_v_hou_versions))

        group_versions = QGroupBox()
        group_versions.setStyleSheet(
            """
            QGroupBox {
                border: 1px solid gray;
                padding: 5px;
            }
        """
        )
        group_versions.setLayout(self.layout_v_hou_versions)

        # LIST - PLUGINS TO ADD
        label_plugins = QLabel("Plugins to add:")
        button_add_items = self.tool_widgets.add_items(self)
        button_invert_plugins_selection = self.tool_widgets.invert_selection(self)
        button_clear_plugins_selection = self.tool_widgets.clear_selection(self)
        remove_selected_items = self.tool_widgets.remove_selected_items(self)
        button_remove_all_items = self.tool_widgets.remove_all_items(self)

        self.label_file_overwrite = QLabel("")
        self.label_file_overwrite.setProperty("update", self.update_file_overwrite_warning)

        self.plugin_list_box = PluginListBox(self, self.label_file_overwrite)
        self.plugin_list_box.setStyleSheet(
            """
            PluginListBox {
                border: 1px solid gray;
                padding: 15px;
            }
        """
        )
        button_add_items.clicked.connect(self.plugin_list_box.add_plugins_to_list)
        button_invert_plugins_selection.clicked.connect(self.plugin_list_box.invert_selection)
        button_clear_plugins_selection.clicked.connect(self.plugin_list_box.clear_selection)
        remove_selected_items.clicked.connect(self.plugin_list_box.remove_selected_items)
        button_remove_all_items.clicked.connect(self.plugin_list_box.remove_all_items)

        # BUTTON - CREATE PACKAGES
        button_add_package = SvgPushButton(self, BtnSize.WIDE_LARGE, BtnIcon.ADD_PKG_CONFIRM)
        button_add_package.set_hover_status_message(
            "Create packages for the selected plugins for the selected Houdini versions."
        )
        button_add_package.setToolTip("Create packages")
        button_add_package.clicked.connect(self.create_packages)

        # CREATE LAYOUTS
        self.layout_main = QVBoxLayout()
        layout_h_versions_and_plugins = QHBoxLayout()

        layout_v_versions = QVBoxLayout()
        layout_h_versions_header = QHBoxLayout()

        layout_v_plugins = QVBoxLayout()
        layout_h_plugins_header = QHBoxLayout()

        # SET LAYOUTS
        self.layout_main.addLayout(layout_h_versions_and_plugins)
        layout_h_versions_and_plugins.addLayout(layout_v_versions, 1)
        layout_h_versions_and_plugins.addLayout(layout_v_plugins, 4)
        self.layout_main.addWidget(button_add_package)

        layout_v_versions.addLayout(layout_h_versions_header)
        layout_h_versions_header.addWidget(label_versions)
        layout_h_versions_header.addWidget(button_invert_versions_selection)
        layout_h_versions_header.addWidget(button_clear_versions_selection)
        layout_h_versions_header.setAlignment(label_versions, Qt.AlignBottom)
        layout_v_versions.addWidget(group_versions)

        layout_v_plugins.addLayout(layout_h_plugins_header)
        layout_h_plugins_header.addWidget(label_plugins)
        layout_h_plugins_header.addWidget(button_add_items)
        layout_h_plugins_header.addWidget(button_invert_plugins_selection)
        layout_h_plugins_header.addWidget(button_clear_plugins_selection)
        layout_h_plugins_header.addWidget(remove_selected_items)
        layout_h_plugins_header.addWidget(button_remove_all_items)
        layout_h_plugins_header.setAlignment(label_plugins, Qt.AlignBottom)
        layout_v_plugins.addWidget(self.plugin_list_box)
        layout_v_plugins.addWidget(self.label_file_overwrite)

    def update_file_overwrite_warning(self) -> None:
        """
        The warning label will update to show the number of potential package config
        overwrites, if any of the plugins' new config files may overwrite existing
        config files in the selected Houdini versions' package directories.
        """

        versions_selected = self._selected_versions()
        plugins_selected = self.plugin_list_box._selected_plugin_items()
        if not versions_selected or not plugins_selected:
            self.label_file_overwrite.setText("")
            return

        plugin_paths = [plugin.path for plugin in plugins_selected]
        packages_directories = [
            self.table_data.hou_installs[version].packages.packages_directory for version in versions_selected
        ]

        # assemble the paths of the new config files
        expected_new_package_paths = []
        for directory in packages_directories:
            for path in plugin_paths:
                expected_new_package_paths.append(Path(directory, path.name).with_suffix(".json"))

        existing_paths = 0
        for path in expected_new_package_paths:
            if path.exists():
                existing_paths += 1

        if existing_paths == 0:
            self.label_file_overwrite.setText("")
            return

        self.label_file_overwrite.setText(f"{existing_paths} existing config files will be overwritten.")

    def _selected_versions(self) -> List[str]:
        """
        Return a list of the selected houdini version numbers from the version list.
        """

        widgets = []
        for i in range(self.layout_v_hou_versions.count()):
            widgets.append(self.layout_v_hou_versions.itemAt(i).widget())

        widgets = [widget.property("version") for widget in widgets if widget.isChecked()]

        return widgets

    def _create_config_data(self, plugin_paths: List[Path]) -> dict:
        """
        Create the structured config data from a package template for each plugin path.
        """

        new_packages = {}
        for path in plugin_paths:
            new_packages[path.name] = PackageTemplates.standard(path)

        return new_packages

    def create_packages(self) -> None:
        """
        Create the package configs in the relevant Houdini packages
        directories based on the selected Houdini versions and the selected
        plugin items.
        """

        loaded = self.plugin_list_box._loaded_items()
        if not loaded:
            StatusBar.message("No plugins in list.", TextColor.ERROR)
            return

        plugins = self.plugin_list_box._selected_plugin_items()
        if not plugins:
            StatusBar.message("No plugins selected.", TextColor.ERROR)
            return

        versions = self._selected_versions()
        if not versions:
            StatusBar.message("No Houdini versions selected.", TextColor.ERROR)
            return

        plugin_paths = [plugin.path for plugin in plugins]
        packages_directories = [
            self.table_data.hou_installs[version].packages.packages_directory for version in versions
        ]

        new_packages = self._create_config_data(plugin_paths)

        for directory in packages_directories:
            for name, package in new_packages.items():
                outpath = Path(directory, name).with_suffix(".json")
                with open(outpath, "w") as outfile:
                    json.dump(package, outfile, indent=4)

        StatusBar.message(
            f"Created {len(new_packages) * len(packages_directories)} total package configs for"
            f" {len(packages_directories)} Houdini versions.",
            TextColor.SUCCESS,
        )

        self.label_file_overwrite.property("update")()

    def clear_selection(self, layout) -> None:
        """
        Deselects all houdini version list items.
        """

        for i in range(layout.count()):
            box = layout.itemAt(i).widget()
            if isinstance(box, QCheckBox):
                box.setChecked(False)

        self.label_file_overwrite.property("update")()

    def invert_selection(self, layout) -> None:
        """
        Invert the selection of houdini version list items.
        """

        for i in range(layout.count()):
            box = layout.itemAt(i).widget()
            if isinstance(box, QCheckBox):
                box.setChecked(not box.isChecked())

        self.label_file_overwrite.property("update")()


class PluginListBox(QStackedWidget):
    def __init__(self, parent, label_file_overwrite: QLabel):
        super().__init__(parent)

        self.label_file_overwrite = label_file_overwrite
        # the system paths selected by the user from the dialog box
        self.selected_paths = []

        # the default "add plugin folders" button widget
        button_open = SelectPluginsButton(self, "Select plugin folders...")
        button_open.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        button_open.clicked.connect(self.add_plugins_to_list)

        widget_add_plugins = QWidget()
        layout_add_plugins = QVBoxLayout(widget_add_plugins)
        layout_add_plugins.setContentsMargins(0, 0, 0, 0)
        layout_add_plugins.addWidget(button_open)

        # the widget layout of plugin path items
        widget_plugin_list = QWidget()
        self.layout_plugin_list = QVBoxLayout(widget_plugin_list)
        self.layout_plugin_list.setContentsMargins(0, 0, 0, 0)
        self.layout_plugin_list.setAlignment(Qt.AlignTop)
        # plugin item widgets get added later by user via dialog choice

        # stack layout
        self.addWidget(widget_add_plugins)
        self.addWidget(widget_plugin_list)
        self.setCurrentIndex(0)

        self.setStyleSheet("QStackedWidget { border: 1px solid grey; }")

    def remove_all_items(self) -> None:
        """
        Remove all items from the plugin list layout.
        """

        while self.layout_plugin_list.count():
            item = self.layout_plugin_list.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.setParent(None)
            else:
                self.layout_plugin_list.removeItem(item)

        self.setCurrentIndex(0)
        self.label_file_overwrite.property("update")()

    def remove_selected_items(self) -> None:
        """
        Remove only the selected items from the plugin list layout.
        """

        checked_boxes = self._selected_plugin_items()
        for widget in checked_boxes:
            self.layout_plugin_list.removeWidget(widget)
            widget.deleteLater()

        # if no items left, change stack back to default
        if self.layout_plugin_list.count() == 0:
            self.setCurrentIndex(0)
        self.label_file_overwrite.property("update")()

    def invert_selection(self) -> None:
        """
        Invert the selection of plugin list items.
        """

        items = self._loaded_items()
        for item in items:
            item.checkbox.toggle()
        self.label_file_overwrite.property("update")()

    def clear_selection(self) -> None:
        """
        Deselects all plugin list items.
        """

        items = self._loaded_items()
        for item in items:
            item.checkbox.setChecked(False)
        self.label_file_overwrite.property("update")()

    def _selected_plugin_items(self) -> list:
        """
        Return list of plugin item widgets that are selected (checked checkboxes).
        """

        loaded_widgets = self._loaded_items()
        checked_boxes = []
        for widget in loaded_widgets:
            if widget.checkbox.isChecked():
                checked_boxes.append(widget)

        return checked_boxes

    def _loaded_items(self) -> list:
        """
        Return a list of all the currently loaded widgets in the plugin list layout.
        """

        widget_list = []
        for i in range(self.layout_plugin_list.count()):
            widget = self.layout_plugin_list.itemAt(i).widget()
            if widget is not None:
                widget_list.append(widget)

        return widget_list

    def add_plugins_to_list(self) -> None:
        """
        Get the user selected system paths, convert them into custom
        list items for the plugins box layout, and switch to the plugin
        list layout in the stacked widget.

        If there are existing plugin items in the list layout,
        they will be appended onto.

        Paths already in the plugin list layout are not duplicated if
        the user chooses the same path again from the dialog box.
        """

        self._open_files_and_folders()

        if not self.selected_paths:
            return

        # ignore duplicate paths
        loaded_paths = [widget.path for widget in self._loaded_items()]
        paths_to_add = [Path(path) for path in self.selected_paths if Path(path) not in loaded_paths]
        for path in paths_to_add:
            self.layout_plugin_list.addWidget(PluginListItem(self, path, self.label_file_overwrite))

        self.setCurrentIndex(1)
        self.selected_paths = []

        self.label_file_overwrite.property("update")()

    def _open_files_and_folders(self) -> None:
        """
        This is the absolute best attempt to get multiple file & folder selection working
        in one dialog box. It won't work using a native system dialog box, it only seems
        to work using QFileDialog.Option.DontUseNativeDialog.

        The downside is that the user can't paste in a directory path to jump anywhere in the
        dialog and has to manually navigate the top dropdown bar.

        The other downside is that to select any file, a folder must also be selected, and the
        folder must be the first item selected in order for the dialog box to be accepted.

        Selected paths are converted to pathlib Paths.
        """

        dialog = QFileDialog(self)
        dialog.setStyleSheet(
            """
            QHeaderView::section
            {
                background-color: #333;
                color: white;
            }

            QPushButton:disabled {
                color: #444;
            }

            * { font-size: 14px; }
        """
        )
        dialog.setWindowTitle("Select plugins folders/files:")
        dialog.setOption(QFileDialog.Option.DontUseNativeDialog, True)
        dialog.setFileMode(QFileDialog.FileMode.Directory)

        for view in dialog.findChildren(QListView) + dialog.findChildren(QTreeView):
            if isinstance(view.model(), QFileSystemModel):
                view.setSelectionMode(QAbstractItemView.ExtendedSelection)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            self.selected_paths = dialog.selectedFiles()
        dialog.deleteLater()

    def _open_folder(self) -> None:
        # single folder selection
        folderpath = QFileDialog.getExistingDirectory(
            self,
            "Select plugin folder:",
            "",
            # "HDAs/OTLs (*.hda *.hdalc *.hdanc *.hda*);;All Files (*)",
        )
        self.selected_paths = folderpath


class PluginListItem(QWidget):
    """
    A plugin row for the plugins list.
    Includes a checkbox (with the path name), the path, and a remove-item button.
    """

    def __init__(self, listbox: PluginListBox, path: Path, label_file_overwrite: QLabel) -> None:
        super().__init__(listbox)

        if not isinstance(path, Path):
            raise TypeError("path must be a pathlib Path.")

        self.listbox = listbox
        self.label_file_overwrite = label_file_overwrite

        self.button_remove = SvgPushButton(self, BtnSize.SQUARE_SMALL, BtnIcon.REMOVE)
        self.button_remove.set_hover_status_message("Remove item.")
        self.button_remove.setToolTip("Remove item")
        self.button_remove.clicked.connect(self.remove_self)

        self.path = path
        self.name = path.name
        self.checkbox = QCheckBox(path.name)
        self.checkbox.setChecked(True)
        self.checkbox.clicked.connect(self.toggled)
        self.label = QLabel(str(path))
        self.label.setStyleSheet("color: grey;")

        layout_main = QHBoxLayout()
        layout_main.addWidget(self.button_remove)
        layout_main.addWidget(self.checkbox)
        layout_main.addWidget(self.label)
        self.setLayout(layout_main)
        layout_main.setContentsMargins(0, 0, 0, 0)

    def toggled(self):
        """
        Events that occur when the QCheckBox is clicked.
        """

        self.label_file_overwrite.property("update")()

    def remove_self(self):
        """
        Deletes this widget.
        """

        self.deleteLater()

        # since the delete happens later and we need to update the file overwrite conflict check now,
        # manually disable the toggle instead, which has the same effect in this case.
        self.checkbox.setChecked(False)
        self.label_file_overwrite.property("update")()

        # if there's only one item left, then it must be this one (self) that's getting deleted,
        # so change stack back to default
        if self.listbox.layout_plugin_list.count() == 1:
            self.listbox.setCurrentIndex(0)


class SelectPluginsButton(QPushButton):
    """
    The default button that prompts the user to open a file/folder dialog and select files/folders.
    This is meant to be displayed when the plugins list box has no items yet.
    """

    def __init__(self, parent, text):
        super().__init__(parent=parent, text=text)

        self.setStyleSheet("border: none;")

    def enterEvent(self, event):
        self.setCursor(Qt.PointingHandCursor)

    def leaveEvent(self, event):
        self.setCursor(Qt.ArrowCursor)


class PresetWidgets:
    """
    Tool widgets for the package adder window.
    """

    @classmethod
    def add_items(cls, parent) -> SvgPushButton:
        add_items = SvgPushButton(parent, BtnSize.WIDE_DEFAULT, BtnIcon.ADD)
        add_items.set_hover_status_message("Select plugins.")
        add_items.setToolTip("Select plugins")
        return add_items

    @classmethod
    def invert_selection(cls, parent) -> SvgPushButton:
        invert_selection = SvgPushButton(parent, BtnSize.SQUARE_MEDIUM, BtnIcon.INVERT_SELECTION)
        invert_selection.set_hover_status_message("Invert selection.")
        invert_selection.setToolTip("Invert selection")
        return invert_selection

    @classmethod
    def clear_selection(cls, parent) -> SvgPushButton:
        clear_selection = SvgPushButton(parent, BtnSize.SQUARE_MEDIUM, BtnIcon.CLEAR_SELECTION)
        clear_selection.set_hover_status_message("Clear selection.")
        clear_selection.setToolTip("Clear selection")
        return clear_selection

    @classmethod
    def remove_selected_items(cls, parent) -> SvgPushButton:
        remove_item = SvgPushButton(parent, BtnSize.SQUARE_MEDIUM, BtnIcon.REMOVE)
        remove_item.set_hover_status_message("Remove selected items.")
        remove_item.setToolTip("Remove selected items")
        return remove_item

    @classmethod
    def remove_all_items(cls, parent) -> SvgPushButton:
        remove_all_items = SvgPushButton(parent, BtnSize.SQUARE_MEDIUM, BtnIcon.REMOVE_ALL_ITEMS)
        remove_all_items.set_hover_status_message("Remove all items.")
        remove_all_items.setToolTip("Remove all items")
        return remove_all_items
