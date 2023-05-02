from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QApplication,
    QComboBox,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QStackedWidget,
    QStatusBar,
    QVBoxLayout,
    QWidget,
)

from houdini_package_manager.styles.widget_styles import WidgetStyles
from houdini_package_manager.widgets.package_table import PackageTableModel
from houdini_package_manager.wrangle.config_control import HoudiniManager


class MainWindow(QMainWindow):
    def __init__(self, app: QApplication) -> None:
        super().__init__()
        self.app = app  # declare an app member

        self.setMinimumSize(800, 400)

        # MANAGE HOUDINI DATA
        # get packages and their HOUDINI_PATH data for each installed Houdini version
        self.houdini_data = HoudiniManager()
        self.houdini_data.get_houdini_data()
        self.versions = [version.version.front for version in self.houdini_data.hou_installs.values()]
        self.versions.reverse()  # latest houdini version on top
        combo_version_labels = ["Houdini " + version for version in self.versions]

        # CREATE LAYOUTS
        central_widget = QWidget(self)
        self.setCentralWidget(central_widget)

        layout_main_vertical = QVBoxLayout()
        central_widget.setLayout(layout_main_vertical)

        layout_secondary = QHBoxLayout()

        layout_package_options = QHBoxLayout()

        # MENU BAR
        # menu_bar = self.menuBar()
        # file_menu = menu_bar.addMenu("File")
        # quit_action = file_menu.addAction("Quit")
        # quit_action.triggered.connect(self.quit_app)

        # STATUS BAR
        self.status_bar = QStatusBar(self)
        self.setStatusBar(self.status_bar)
        self.statusLabel = QLabel()
        self.status_bar.addWidget(self.statusLabel)
        self.statusLabel.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self.statusLabel = self.status_bar.findChild(QLabel)

        # LABEL - HOUDINI VERSION DROPDOWN
        label_version_dropdown = QLabel("HOUDINI VERSIONS")

        # BUTTON - ADD PACKAGE
        button_add_package = QPushButton()

        WidgetStyles.svg_QPushButton(button_add_package, 120, 36, "./houdini_package_manager/icons/add_packages.svg")

        # DROPDOWN - HOUDINI VERSION
        combo_version = QComboBox()
        combo_version.addItems(combo_version_labels)
        combo_version.activated.connect(self.switch_package_table)

        # BUTTONS - PACKAGE OPTIONS
        button_copy = QPushButton("COPY")  # copy all the packages in the current table to another houdini version

        # TABLE - PACKAGE DATA
        table = PackageTableModel(self, self.houdini_data.hou_installs[self.versions[0]])
        self.stacked_widget = QStackedWidget()
        self.stacked_widget.addWidget(table)
        # keep track of loaded package tables in the order they are added to stacked_widget
        self.loaded_table_widgets = [self.versions[0]]

        # SET LAYOUTS
        layout_secondary.addWidget(label_version_dropdown)
        layout_secondary.addWidget(button_add_package)

        layout_package_options.addWidget(combo_version)
        layout_package_options.addWidget(button_copy)

        layout_main_vertical.addLayout(layout_secondary)
        layout_main_vertical.addLayout(layout_package_options)
        layout_main_vertical.addWidget(self.stacked_widget)

    def quit_app(self):
        self.app.quit()

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

        table = PackageTableModel(self, self.houdini_data.hou_installs[selected_item_text])
        self.stacked_widget.addWidget(table)
        self.stacked_widget.setCurrentWidget(table)
        self.loaded_table_widgets.append(selected_item_text)
