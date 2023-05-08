from PySide6.QtWidgets import QApplication, QMainWindow, QStatusBar


class StatusBar:
    """
    The status bar of the application.
    This is a wrapper around QStatusBar.
    """

    @classmethod
    def message(cls, message: str) -> None:
        """
        Print a message to the main window's status bar.

        Arguments (str):
            The string to print to the status bar.
        """

        status_bar = cls.status_bar()
        status_bar.setStyleSheet(
            """
            font-family: Lato;
            font-weight: 100;
            font-size: 12px;
            """
        )
        status_bar.showMessage(message)

    @staticmethod
    def status_bar(raise_on_error=True) -> QStatusBar:
        """
        Return the status bar object.
        Raises an error or returns False if the status bar cannot be found depending on what
        the error argument specifies.

        Arguments:
            raise_on_error (bool):
                Whether or not you want to raise an error if the status bar cannot be found.
                This can be useful if you just want to know if the statusbar can be accessed.
                Default is True.
                If False, False will be returned instead.
        """

        top_level_widgets = QApplication.topLevelWidgets()
        for widget in top_level_widgets:
            if isinstance(widget, QMainWindow):
                return widget.statusBar()

        if not raise_on_error:
            return False

        raise RuntimeError("Unable to find status bar in top level widget.")
