# for processing cli args
import logging
import sys

from PySide6.QtCore import QTimer
from PySide6.QtWidgets import QApplication

from houdini_package_manager.widgets.dialogs import ErrorDialog, Updater
from houdini_package_manager.widgets.main_window import MainWindow
from houdini_package_manager.wrangle.config_control import HoudiniManager


def main(start: bool = True, headless: bool = False) -> QApplication:
    """Start the Houdini package manager app

    Create and open the Houdini package manager window

    Args:
        start (bool): Start the app. Default is True.
            If False, the app won't start but the QApplication object will still be created.
        headless (bool): The app window will not show when the app starts if True. Default is False.

    Returns:
        QApplication: PySide6.QtWidgets object
    """

    logging.debug("Houdini Package Manager - Python version:")
    logging.debug(sys.version)
    logging.debug(f"{sys.version_info}\n")

    app = QApplication(sys.argv)

    # get all the relevant houdini meta and package data for all installed versions of Houdini
    houdini_data = HoudiniManager()
    houdini_data.get_houdini_data()

    # check for no houdini install
    if not houdini_data.install_directories:
        dialog_missing_houdini = ErrorDialog(
            "No Houdini install found.\nPlease install Houdini first.\n\nHPM's functionality relies on a version of"
            " Houdini being installed to work."
        )
        dialog_missing_houdini.exec()
        return

    window = MainWindow(app, houdini_data)

    # delay updater dialog until main window shows
    QTimer.singleShot(0, show_updater)

    if not headless:
        window.show()

    if start:
        app.exec()

    return app


def show_updater():
    """
    Show the version update dialog.
    """

    updater = Updater()
    updater.check_update()


if __name__ == "__main__":
    main()
