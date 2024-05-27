import logging

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QDesktopServices, QIcon
from PySide6.QtWidgets import (
    QApplication,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QStatusBar,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from houdini_package_manager import __version__
from houdini_package_manager.meta.meta_tools import StatusBar
from houdini_package_manager.utils import epath
from houdini_package_manager.widgets.add_packages_layout import LocalPackageAdderWidget
from houdini_package_manager.widgets.custom_widgets import BtnIcon, BtnSize, SvgPushButton
from houdini_package_manager.widgets.packages_layout import PackagesWidget
from houdini_package_manager.wrangle.config_control import HoudiniManager


class MainWindow(QMainWindow):
    """
    The main window containing all of HPM's functionality.
    """

    def __init__(self, app: QApplication, houdini_data: HoudiniManager) -> None:
        super().__init__()

        self.app = app  # declare an app member
        self.houdini_data = houdini_data

        TITLE = f"Houdini Package Manager {__version__}"
        self.setWindowTitle(TITLE)

        self.setWindowIcon(QIcon(epath("resources/icons/hpm_icon.svg", True)))

        self.resize(1250, 600)

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

        # if no package data (PackageCollection object) for a houdini install, then there's no way to know where
        # the Houdini /packages directory is, so remove the whole houdini install from the data
        valid_installs = {}
        for version, hou_install in self.houdini_data.hou_installs.items():
            if hou_install.packages:
                valid_installs[version] = hou_install
            else:
                logging.warning(f"Skipping Houdini {version} since no packages were found for it.")
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

        logo = SvgPushButton(self, BtnSize.HPM_LOGO, BtnIcon.HPM_LOGO, clickable=False)

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
        self.DOWNLOAD_URL = "https://houpm.com"
        self.REPOSITORY_URL = "https://github.com/ariffjeff/houdini-package-manager"
        self.REPOSITORY_ISSUES_URL = "https://github.com/ariffjeff/houdini-package-manager/issues"
        self.PACKAGES_DOCS_URL = "https://www.sidefx.com/docs/houdini/ref/plugins.html"

        button_houpm = SvgPushButton(self, BtnSize.HPM_LOGO, BtnIcon.HPM_LOGO_GREY)
        button_houpm.clicked.connect(lambda: self.open_url(self.DOWNLOAD_URL))
        button_houpm.set_hover_status_message(f"Open project download site: {self.DOWNLOAD_URL}")
        button_houpm.setToolTip("Project download site")

        button_repo = SvgPushButton(self, BtnSize.SQUARE_DEFAULT, BtnIcon.REPO)
        button_repo.clicked.connect(lambda: self.open_url(self.REPOSITORY_URL))
        button_repo.set_hover_status_message(f"Open project repository: {self.REPOSITORY_URL}")
        button_repo.setToolTip("Project repository")

        button_bug_report = SvgPushButton(self, BtnSize.SQUARE_DEFAULT, BtnIcon.BUG)
        button_bug_report.clicked.connect(lambda: self.open_url(self.REPOSITORY_ISSUES_URL))
        button_bug_report.set_hover_status_message(f"Open feature request/bug report: {self.REPOSITORY_ISSUES_URL}")
        button_bug_report.setToolTip("Feature request/bug report")

        button_pkg_docs = SvgPushButton(self, BtnSize.DOCS, BtnIcon.DOCS)
        button_pkg_docs.clicked.connect(lambda: self.open_url(self.PACKAGES_DOCS_URL))
        button_pkg_docs.set_hover_status_message(f"Open Houdini packages docs: {self.PACKAGES_DOCS_URL}")
        button_pkg_docs.setToolTip("Houdini packages docs")

        # TAB DATA
        packages = PackagesWidget(self, self.houdini_data, self.versions, self.tabs)
        add_packages = LocalPackageAdderWidget(self, self.houdini_data, self.versions)

        # CREATE LAYOUTS
        central_widget = QWidget(self)
        self.setCentralWidget(central_widget)

        layout_main_vertical = QVBoxLayout()  # includes the tabs
        layout_main_header = QHBoxLayout()
        layout_urls = QHBoxLayout()

        # SET LAYOUTS
        central_widget.setLayout(layout_main_vertical)

        layout_main_vertical.addLayout(layout_main_header)
        layout_main_header.addWidget(logo)
        layout_main_header.addLayout(layout_urls)
        layout_urls.addWidget(button_houpm)
        layout_urls.addWidget(button_repo)
        layout_urls.addWidget(button_bug_report)
        layout_urls.addWidget(button_pkg_docs)
        layout_urls.setAlignment(Qt.AlignRight)
        layout_main_vertical.addWidget(self.tabs)

        tab_packages.setLayout(packages.layout_main)
        tab_add_packages.setLayout(add_packages.layout_main)

    def open_url(self, url: str):
        """
        Open the repository for this project.
        """

        url = QUrl(url)
        QDesktopServices.openUrl(url)
        StatusBar.message(f"Opened: {url}")

    def quit_app(self):
        self.app.quit()
