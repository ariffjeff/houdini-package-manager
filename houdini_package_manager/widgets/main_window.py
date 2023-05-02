from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QApplication,
    QComboBox,
    QLabel,
    QMainWindow,
    QStackedWidget,
    QStatusBar,
    QVBoxLayout,
    QWidget,
)

from houdini_package_manager.widgets.package_table import PackageTableModel3
from houdini_package_manager.wrangle.config_control import HoudiniManager


class MainWindow(QMainWindow):
    def __init__(self, app: QApplication) -> None:
        super().__init__()
        self.app = app  # declare an app member

        self.setMinimumSize(800, 400)

        central_widget = QWidget(self)
        self.setCentralWidget(central_widget)

        main_layout = QVBoxLayout()
        central_widget.setLayout(main_layout)

        self.stacked_widget = QStackedWidget()

        # menu_bar = self.menuBar()
        # file_menu = menu_bar.addMenu("File")
        # quit_action = file_menu.addAction("Quit")
        # quit_action.triggered.connect(self.quit_app)

        self.status_bar = QStatusBar(self)
        self.setStatusBar(self.status_bar)
        self.statusLabel = QLabel()
        self.status_bar.addWidget(self.statusLabel)
        self.statusLabel.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self.statusLabel = self.status_bar.findChild(QLabel)

        # get packages and their HOUDINI_PATH data for each installed Houdini version
        self.houdini_data = HoudiniManager()
        self.houdini_data.get_houdini_data()

        self.versions = [version.version.front for version in self.houdini_data.hou_installs.values()]
        self.versions.reverse()  # latest houdini version on top
        combo_version_labels = ["Houdini " + version for version in self.versions]
        combo_version = QComboBox()
        combo_version.addItems(combo_version_labels)
        combo_version.activated.connect(self.switch_package_table)

        table = PackageTableModel3(self, self.houdini_data.hou_installs[self.versions[0]])
        self.stacked_widget.addWidget(table)
        # keep track of loaded package tables in the order they are added to stacked_widget
        self.loaded_table_widgets = [self.versions[0]]

        main_layout.addWidget(combo_version)
        main_layout.addWidget(self.stacked_widget)

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

        table = PackageTableModel3(self, self.houdini_data.hou_installs[selected_item_text])
        self.stacked_widget.addWidget(table)
        self.stacked_widget.setCurrentWidget(table)
        self.loaded_table_widgets.append(selected_item_text)
