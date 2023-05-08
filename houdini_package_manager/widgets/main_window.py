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

from houdini_package_manager.widgets.add_packages_layout import LocalPackageAdderWidget
from houdini_package_manager.widgets.packages_layout import PackagesWidget
from houdini_package_manager.wrangle.config_control import HoudiniManager


class MainWindow(QMainWindow):
    """
    The main window containing all of HPM's functionality.
    """

    def __init__(self, app: QApplication) -> None:
        super().__init__()
        self.app = app  # declare an app member

        self.setMinimumSize(1000, 500)

        self.setStyleSheet(
            """
                background-color: #202020;
                color: white;
                font-size: 16px;
                font-family: Lato;
                font-weight: 100;
            """
        )

        # for some reason this makes the above styles start affecting tooltips
        self.app.setStyleSheet(
            """
            QToolTip {
                border: 1px solid #3A3939;
            }
        """
        )

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
        tabs.addTab(tab_add_packages, "Add Local Plugins")

        tabs.setStyleSheet(
            """
            QTabWidget::pane {
                background-color: #303030;
            }

            QTabBar::tab {
                background-color: #303030;
                color: lightgrey;
                font-weight: bold;
                height: 40px;
            }

            QTabBar::tab:hover { background-color: #666666; }
            QTabBar::tab:selected { background-color: #4d4d4d; }
        """
        )

        packages = PackagesWidget(self, self.houdini_data, self.versions)
        add_packages = LocalPackageAdderWidget(self, self.houdini_data, self.versions)

        # CREATE LAYOUTS
        central_widget = QWidget(self)
        self.setCentralWidget(central_widget)

        layout_main_vertical = QVBoxLayout()  # includes the tabs
        central_widget.setLayout(layout_main_vertical)

        # SET LAYOUTS
        layout_main_vertical.addWidget(tabs)

        tab_packages.setLayout(packages.layout_main)
        tab_add_packages.setLayout(add_packages.layout_main)

    def quit_app(self):
        self.app.quit()
