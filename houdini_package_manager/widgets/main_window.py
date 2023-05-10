from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QApplication,
    QLabel,
    QMainWindow,
    QStatusBar,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from houdini_package_manager.meta.meta_tools import StatusBar
from houdini_package_manager.widgets.add_packages_layout import LocalPackageAdderWidget
from houdini_package_manager.widgets.custom_widgets import SvgPushButton
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

        # if no package data (PackageCollection object) for a houdini install, then there's no way to know where
        # the Houdini /packages directory is, so remove the whole houdini install from the data
        valid_installs = {}
        for version, hou_install in self.houdini_data.hou_installs.items():
            if hou_install.packages:
                valid_installs[version] = hou_install
        self.houdini_data.hou_installs = valid_installs

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
        self.tabs = QTabWidget()
        tab_packages = QWidget()
        tab_packages.setProperty("id", "package_table")
        tab_add_packages = QWidget()
        tab_add_packages.setProperty("id", "local_plugin_adder")
        self.tabs.addTab(tab_packages, "Packages")
        self.tabs.addTab(tab_add_packages, "Add Local Plugins")

        self.tabs.setStyleSheet(
            """
            QTabWidget::pane {
                background-color: #303030;
            }

            QTabBar::tab {
                background-color: #303030;
                color: lightgrey;
                font-weight: bold;
                padding: 15px 20px;
            }

            QTabBar::tab:hover { background-color: #666666; }
            QTabBar::tab:selected { background-color: #4d4d4d; }
        """
        )

        # SETTINGS BUTTONS
        button_repo = SvgPushButton(
            self,
            28,
            28,
            "./houdini_package_manager/design/icons/repo.svg",
            "./houdini_package_manager/design/icons/repo_hover.svg",
        )
        self.REPOSITORY_URL = "https://github.com/ariffjeff/houdini-package-manager"
        button_repo.clicked.connect(self.open_repo)
        button_repo.set_hover_status_message(f"Open project repository: {self.REPOSITORY_URL}")
        button_repo.setToolTip("Open project repository")

        # TAB DATA
        packages = PackagesWidget(self, self.houdini_data, self.versions, self.tabs)
        add_packages = LocalPackageAdderWidget(self, self.houdini_data, self.versions)

        # CREATE LAYOUTS
        central_widget = QWidget(self)
        self.setCentralWidget(central_widget)

        layout_main_vertical = QVBoxLayout()  # includes the tabs
        central_widget.setLayout(layout_main_vertical)

        # SET LAYOUTS
        layout_main_vertical.addWidget(button_repo, Qt.AlignRight)
        layout_main_vertical.addWidget(self.tabs)

        tab_packages.setLayout(packages.layout_main)
        tab_add_packages.setLayout(add_packages.layout_main)

    def open_repo(self):
        """
        Open the repository for this project.
        """

        url = QUrl(self.REPOSITORY_URL)
        QDesktopServices.openUrl(url)
        StatusBar.message(f"Opened: {self.REPOSITORY_URL}")

    def quit_app(self):
        self.app.quit()
