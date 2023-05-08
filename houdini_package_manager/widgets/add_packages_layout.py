from PySide6.QtCore import QSize, Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QVBoxLayout,
    QWidget,
)

from houdini_package_manager.widgets.custom_widgets import SvgPushButton
from houdini_package_manager.wrangle.config_control import HoudiniManager


class LocalPackageAdderWidget(QWidget):
    """
    The layout that displays the tools for creating new packages from plugin folders/files.

    Arguments:
        parent:
            The parent widget.

        table_data (HoudiniManager):
            The data set to populate the QWidgetTable. Data can consist of multiple sets of packages
            for different installed versions of Houdini.

        versions (list[str]):
            The list of ordered version numbers that will determine which set of package data is shown in the table.
    """

    def __init__(self, parent, table_data: HoudiniManager, versions: list[str]) -> None:
        super().__init__(parent)

        self.table_data = table_data
        self.versions = versions
        self.tool_widgets = PresetWidgets()

        # LABEL - HOUDINI VERSION DROPDOWN

        # BUTTON - ADD PACKAGE
        # button_add_package = SvgPushButton(
        #     self,
        #     120,
        #     36,
        #     "./houdini_package_manager/design/icons/add_packages.svg",
        #     "./houdini_package_manager/design/icons/add_packages_hover.svg",
        # )

        # LIST - HOUDINI VERSIONS
        label_versions = QLabel("Create packages for:")
        button_invert_versions_selection = self.tool_widgets.invert_selection(self)
        button_clear_versions_selection = self.tool_widgets.clear_selection(self)

        list_versions = CheckboxList(self)
        for version in self.versions:
            list_versions.addItem(f"Houdini {version}", checked=True)

        # LIST - PLUGINS TO ADD
        label_plugins = QLabel("Plugins to add:")
        button_clear_plugins_selection = self.tool_widgets.clear_selection(self)
        button_invert_plugins_selection = self.tool_widgets.invert_selection(self)
        button_remove_item = self.tool_widgets.remove_selected_item(self)
        button_remove_all_items = self.tool_widgets.remove_all_items(self)
        # button_remove_all_items.clicked.connect(self.remove_all_items)

        list_plugins = CheckboxList(self)

        # CREATE LAYOUTS
        self.layout_main = QVBoxLayout()
        layout_h_adders = QHBoxLayout()
        layout_v_hou_list = QVBoxLayout()
        layout_h_hou_list_header = QHBoxLayout()
        layout_v_plugin_list = QVBoxLayout()
        layout_h_plugin_list_header = QHBoxLayout()

        # SET LAYOUTS
        # self.layout_main.addWidget(ADD PACKAGES BUTTON)
        self.layout_main.addLayout(layout_h_adders)
        layout_h_adders.addLayout(layout_v_hou_list, 1)
        layout_h_adders.addLayout(layout_v_plugin_list, 3)

        layout_v_hou_list.addLayout(layout_h_hou_list_header)
        layout_h_hou_list_header.addWidget(label_versions)
        layout_h_hou_list_header.addWidget(button_clear_versions_selection)
        layout_h_hou_list_header.addWidget(button_invert_versions_selection)
        layout_h_hou_list_header.setAlignment(label_versions, Qt.AlignBottom)
        layout_v_hou_list.addWidget(list_versions)

        layout_v_plugin_list.addLayout(layout_h_plugin_list_header)
        layout_h_plugin_list_header.addWidget(label_plugins)
        layout_h_plugin_list_header.addWidget(button_clear_plugins_selection)
        layout_h_plugin_list_header.addWidget(button_invert_plugins_selection)
        layout_h_plugin_list_header.addWidget(button_remove_item)
        layout_h_plugin_list_header.addWidget(button_remove_all_items)
        layout_h_plugin_list_header.setAlignment(label_plugins, Qt.AlignBottom)
        layout_v_plugin_list.addWidget(list_plugins)

    # def remove_all_items(self, list_widget: QListWidget) -> None:


class PluginListItem(QWidget):
    """
    Custom widget for the QListWidgetItem that includes a checkbox, label, and a remove-item button
    """

    def __init__(self, parent: QWidget) -> None:
        super().__init__(parent)


class CheckboxListItem(QWidget):
    """
    Custom widget for the QListWidgetItem that includes a checkbox and label.
    """

    def __init__(self, parent, label_text: str, checked=False, removable=False):
        super().__init__(parent)

        self.checkbox = QCheckBox()
        self.checkbox.setChecked(checked)
        self.label = QLabel(label_text)
        self.button_remove = SvgPushButton(
            self,
            16,
            16,
            "./houdini_package_manager/design/icons/remove_item.svg",
            "./houdini_package_manager/design/icons/remove_item_hover.svg",
        )

        layout = QHBoxLayout()
        layout.addWidget(self.checkbox)
        layout.addWidget(self.label)
        if removable:
            layout.addWidget(self.button_remove)
        layout.setContentsMargins(0, 0, 0, 0)
        self.setLayout(layout)

    def isChecked(self):
        """
        Return the current checked state of the checkbox.
        """
        return self.checkbox.isChecked()


class CheckboxList(QListWidget):
    """
    QListWidget subclass that includes custom CheckboxListItem widgets.
    """

    def __init__(self, parent):
        super().__init__(parent)

        self.setSpacing(6)

    def addItem(self, label_text, checked=False, removable=False):
        """
        Add a new CheckboxListItem to the list.
        """
        item = QListWidgetItem(self)
        widget = CheckboxListItem(self, label_text, checked, removable)
        item.setSizeHint(widget.sizeHint())
        self.setItemWidget(item, widget)

    def getCheckedItems(self):
        """
        Get a list of all CheckboxListItems that are currently checked.
        """
        checked_items = []
        for index in range(self.count()):
            item = self.itemWidget(self.item(index))
            if item.isChecked():
                checked_items.append(item)
        return checked_items


class PresetWidgets:
    """
    Tool widgets for the package adder window.
    """

    button_size = QSize(24, 24)

    @classmethod
    def invert_selection(cls, parent) -> SvgPushButton:
        invert_selection = SvgPushButton(
            parent,
            *cls.button_size.toTuple(),
            "./houdini_package_manager/design/icons/invert_selection.svg",
            "./houdini_package_manager/design/icons/invert_selection_hover.svg",
        )
        invert_selection.set_hover_status_message("Invert selection.")
        invert_selection.setToolTip("Invert selection")
        return invert_selection

    @classmethod
    def clear_selection(cls, parent) -> SvgPushButton:
        clear_selection = SvgPushButton(
            parent,
            *cls.button_size.toTuple(),
            "./houdini_package_manager/design/icons/clear_selection.svg",
            "./houdini_package_manager/design/icons/clear_selection_hover.svg",
        )
        clear_selection.set_hover_status_message("Clear selection.")
        clear_selection.setToolTip("Clear selection")
        return clear_selection

    @classmethod
    def remove_selected_item(cls, parent) -> SvgPushButton:
        remove_item = SvgPushButton(
            parent,
            *cls.button_size.toTuple(),
            "./houdini_package_manager/design/icons/remove_item.svg",
            "./houdini_package_manager/design/icons/remove_item_hover.svg",
        )
        remove_item.set_hover_status_message("Remove selected item.")
        remove_item.setToolTip("Remove selected item")
        return remove_item

    @classmethod
    def remove_all_items(cls, parent) -> SvgPushButton:
        remove_all_items = SvgPushButton(
            parent,
            *cls.button_size.toTuple(),
            "./houdini_package_manager/design/icons/remove_all_items.svg",
            "./houdini_package_manager/design/icons/remove_all_items_hover.svg",
        )
        remove_all_items.set_hover_status_message("Remove all items.")
        remove_all_items.setToolTip("Remove all items")
        return remove_all_items
