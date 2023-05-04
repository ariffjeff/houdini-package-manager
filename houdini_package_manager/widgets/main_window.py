from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QApplication,
    QLabel,
    QMainWindow,
    QStatusBar,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from houdini_package_manager.widgets.widget_layout_packages import PackagesWidget
from houdini_package_manager.wrangle.config_control import HoudiniManager


class MainWindow(QMainWindow):
    """
    The main window containing all of HPM's functionality.
    """

    def __init__(self, app: QApplication) -> None:
        super().__init__()
        self.app = app  # declare an app member

        self.setMinimumSize(800, 400)

        # MANAGE HOUDINI DATA
        # get packages and their HOUDINI_PATH data for each installed Houdini version
        self.houdini_data = HoudiniManager()
        self.houdini_data.get_houdini_data()
        self.versions = [version.version.front for version in self.houdini_data.hou_installs.values()]

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

        # TABS
        tabs = QTabWidget()
        tab_packages = QWidget()
        tab_add_packages = QWidget()
        tabs.addTab(tab_packages, "Packages")
        tabs.addTab(tab_add_packages, "Add Local Packages")

        packages = PackagesWidget(self, self.houdini_data, self.versions)

        # CREATE LAYOUTS
        central_widget = QWidget(self)
        self.setCentralWidget(central_widget)

        layout_main_vertical = QVBoxLayout()  # includes the tabs
        central_widget.setLayout(layout_main_vertical)

        # SET LAYOUTS
        layout_main_vertical.addWidget(tabs)

        tab_packages.setLayout(packages.layout_main)

    def quit_app(self):
        self.app.quit()
