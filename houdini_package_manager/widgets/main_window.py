from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QApplication,
    QLabel,
    QMainWindow,
    QStatusBar,
)

from .package_table import PackageTable


class MainWindow(QMainWindow):
    def __init__(self, app: QApplication) -> None:
        super().__init__()
        self.app = app  # declare an app member

        self.setMinimumSize(800, 400)

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

        paklist = PackageTable(self)

        self.setCentralWidget(paklist)

    def quit_app(self):
        self.app.quit()