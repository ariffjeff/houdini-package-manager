# for processing cli args
import sys

from PySide6.QtWidgets import QApplication, QWidget


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
    app = QApplication(sys.argv)

    TITLE = "Houdini Package Manager"
    window = QWidget()
    window.setWindowTitle(TITLE)

    if not headless:
        window.show()

    if start:
        app.exec()

    return app


if __name__ == "__main__":
    main()
