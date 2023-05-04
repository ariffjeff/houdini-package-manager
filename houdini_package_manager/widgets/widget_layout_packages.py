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
        table_data (HoudiniManager):
            The data set to populate the QWidgetTable. Data can consist of multiple sets of packages
            for different installed versions of Houdini.

        versions (list[str]):
            The list of ordered version numbers that will determine which set of package data is shown in the table.

        header_labels (list[str]):
            A list of ordered names for the column headers of the table. Determines how the columns are ordered.
    """

    def __init__(
        self, main_window: QMainWindow, table_data: HoudiniManager, versions: list[str], header_labels: list[str]
    ) -> None:
        super().__init__()

        self.main_window = main_window
        self.table_data = table_data
        self.versions = versions
        self.header_labels = header_labels

        # LABEL - HOUDINI VERSION DROPDOWN
        label_version_dropdown = QLabel("HOUDINI VERSIONS")

        # BUTTON - ADD PACKAGE
        button_add_package = SvgPushButton(
            120,
            36,
            "./houdini_package_manager/icons/add_packages.svg",
            "./houdini_package_manager/icons/add_packages_hover.svg",
        )

        # DROPDOWN - HOUDINI VERSION
        combo_version = QComboBox()
        combo_version.addItems(self.header_labels)
        combo_version.activated.connect(self.switch_package_table)

        # BUTTONS - PACKAGE OPTIONS
        button_copy = QPushButton("COPY")  # copy all the packages in the current table to another houdini version

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

        layout_package_options.addWidget(combo_version)
        layout_package_options.addWidget(button_copy)

    def switch_package_table(self):
        """
        Load a set of package data into a table, add it to the QStackedWidget, and switch to it.
        If the set of data was already loaded then switch to it instead of loading it again.
        """

        combo_box = self.sender()
        selected_item_text = combo_box.currentText().split(" ")[-1]

        # if the table widget has already been added, switch to it
        if selected_item_text in self.loaded_table_widgets:
            index = self.loaded_table_widgets.index(selected_item_text)
            self.stacked_widget.setCurrentIndex(index)
            return

        table = PackageTableModel(self, self.main_window, self.table_data.hou_installs[selected_item_text])
        self.stacked_widget.addWidget(table)
        self.stacked_widget.setCurrentWidget(table)
        self.loaded_table_widgets.append(selected_item_text)
