from enum import Enum

from PySide6.QtWidgets import QApplication, QMainWindow, QStatusBar


class TextColor(Enum):
    """
    Text colors determined by CSS style text color.
    """

    DEFAULT = "color: white;"
    ERROR = "color: red;"
    SUCCESS = "color: green;"
    WARNING = "color: yellow;"


class StatusBar:
    """
    The status bar of the application.
    This is a wrapper around QStatusBar.
    """

    @classmethod
    def message(cls, message: str, text_color: TextColor = None) -> None:
        """
        Print a message to the main window's status bar.

        Arguments:
            message (str):
                The string to print to the status bar.

            text_color (TextColor):
                The text color enum that sets the color the status bar message text.
                Default is white.
        """

        if not text_color:
            text_color = TextColor.DEFAULT

        status_bar = cls.status_bar()
        status_bar.setStyleSheet(text_color.value)
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


class TableHeaders(Enum):
    """
    Enums for the table column header names.
    """

    ENABLE = "Enable"
    PACKAGE = "Package"
    AUTHOR = "Author"
    LATEST = "Latest"
    INSTALLED = "Installed"
    SOURCE = "Src"
    CONFIG = "Config"
    PLUGINS = "Plugins"
    SYNC = "Sync"
    UPDATE = "Update"


class RateLimitError(Exception):
    """
    An exception that should be raised when an API's rate limit has been exceeded (status code: 403).
    """

    def __init__(self, message="API rate limit exceeded. Status code: 403") -> None:
        self.message = message
        super().__init__(self.message)


class RequestConnectionError(Exception):
    """
    An exception when a request connection fails.
    """

    def __init__(self, message="Failed to establish connection.") -> None:
        self.message = message
        super().__init__(self.message)


class SingletonMeta(type):
    """
    A metaclass to support other classes to make them singletons.
    """

    _instances = {}

    def __call__(cls, *args, **kwargs):
        if cls not in cls._instances:
            instance = super().__call__(*args, **kwargs)
            cls._instances[cls] = instance
        return cls._instances[cls]


class GlobalExceptionTracker(metaclass=SingletonMeta):
    """
    Singleton global class for tracking the latest raised exception.

    This was written to work around the issue of exceptions that get raised by
    a Qt button's emitted signal (set via a slot) but fail to get passed to the
    caller when the button's signals were called programmatically with something like
    `some_qpushbutton.clicked.emit()` instead of being clicked in the UI. This meant
    that exceptions would get printed to the terminal/debugger but not trigger the
    exception part of a try-catch block.

    This class allows for keeping track of an exception if one is created and
    then later checking for its existence where try-catch block would usually be.
    It can effectively be used to mimic a try-catch.

    A single exception must be written, read, and cleared on this object manually
    with the relevant methods.
    """

    def __init__(self):
        self._exception = None

    def set_exception(self, exception) -> None:
        """
        Sets the given exception as the most recent exception.
        """

        if not issubclass(type(exception), Exception):
            raise TypeError(f"Argument {exception} must be a subclass of Exception.")

        self.clear_exception()
        self._exception = exception

    def get_exception(self) -> Exception:
        """
        Returns the exception that was last set.

        The exception can be of any type with a base class of Exception.
        """

        exception = self._exception
        self.clear_exception()
        return exception

    def clear_exception(self) -> None:
        """
        Clears the last set exception by setting the attribute to None.
        """

        self._exception = None
