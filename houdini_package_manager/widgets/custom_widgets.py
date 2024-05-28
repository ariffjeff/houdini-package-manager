from enum import Enum

from PySide6.QtCore import QFile, QSize, Qt
from PySide6.QtGui import QCursor, QIcon, QPainter, QPixmap
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWidgets import QPushButton

from houdini_package_manager.meta.meta_tools import StatusBar
from houdini_package_manager.utils import epath


class BtnIcon(Enum):
    """
    Enum class for different types of SVG QPushButton icons.
    Each string is the filename of the respective SVG file.
    """

    SOURCE_CONTROL = "source_control"
    FILE = "file"
    UPDATE = "update"
    HPM_LOGO = "hpm"
    HPM_LOGO_GREY = "hpm_grey"
    ADD_PKG = "add_packages"
    ADD_PKG_CONFIRM = "add_packages_confirm"
    REPO = "repo"
    BUG = "bug"
    DOCS = "docs"
    FOLDER = "folder"
    GIT_SYNC = "git_sync"
    MIGRATE = "migrate"
    REFRESH = "refresh"
    REFRESH_ALL = "refresh_all"
    WARNING = "warning"

    ADD = "add"
    REMOVE = "remove"
    REMOVE_ALL_ITEMS = "remove_all_items"
    INVERT_SELECTION = "invert_selection"
    CLEAR_SELECTION = "clear_selection"


class BtnSize(Enum):
    """
    Enum class for different types of SVG QPushButton pixel sizes.
    """

    SQUARE_DEFAULT = (28, 28)
    SQUARE_MEDIUM = (24, 24)
    SQUARE_SMALL = (16, 16)
    WIDE_DEFAULT = (48, 24)
    WIDE_LARGE = (120, 36)

    CELL_TALL = (23, 29)

    """SPECIALS"""
    HPM_LOGO = (56, 28)
    FOLDER = (38, 24)
    WARNING = (32, 29)
    DOCS = (24, 28)


class SvgPushButton(QPushButton):
    """
    A standard SVG QPushButton.

    Arguments:
        width (int):
            Button width.

        height (int):
            Button height.

        svg_path (str):
            Path to the SVG file to be the default display state of the button.

        svg_path_hover (str):
            Path to the SVG file to be the hover display state of the button.
    """

    def __init__(self, parent, dimensions: BtnSize, icon: BtnIcon, clickable=True) -> None:
        super().__init__(parent)

        if not isinstance(dimensions, BtnSize):
            raise TypeError(f"Argument 'dimensions' must be of type BtnSize, not {type(dimensions)}")

        if not isinstance(icon, BtnIcon):
            raise TypeError(f"Argument 'icon' must be of type BtnIcon, not {type(icon)}")

        if not isinstance(clickable, bool):
            raise TypeError(f"Argument 'clickable' must be of type bool, not {type(clickable)}")

        self.dims = dimensions.value

        """Standard icon filename structure"""
        icon_dir = "resources/icons/"
        self.svg_path = epath(icon_dir + icon.value + ".svg")
        if clickable:
            self.svg_path_hover = epath(icon_dir + icon.value + "_hover.svg")
        else:
            self.svg_path_hover = None

        self._hover_message = None

        self.render(self.svg_path)

        self.enterEvent = lambda event: self.hover_enter(event, self.svg_path_hover)
        self.leaveEvent = lambda event: self.hover_leave(event, self.svg_path)
        if self.svg_path_hover:
            self.mousePressEvent = lambda event: self.mouse_press(event, self.svg_path)
            self.mouseReleaseEvent = lambda event: self.mouse_release(event, self.svg_path_hover)

    @property
    def hover_message(self):
        return self._hover_message

    def mouse_release(self, event, svg_path: str):
        """
        The effects of click mouse release on the button.
        """

        super().mouseReleaseEvent(event)
        self.render(svg_path)

    def mouse_press(self, event, svg_path: str):
        """
        The effects of click mouse down on the button.
        """

        super().mousePressEvent(event)
        self.render(svg_path)

    def hover_enter(self, event, svg_path: str):
        """
        The effects of entering hover for the button.
        """

        super().enterEvent(event)
        if self.svg_path_hover:
            self.setCursor(QCursor(Qt.PointingHandCursor))
        if svg_path:
            self.render(svg_path)

        if self.hover_message:
            StatusBar.message(self.hover_message)

    def hover_leave(self, event, svg_path: str) -> None:
        """
        The effects of leaving hover for the button.
        """

        super().leaveEvent(event)
        if svg_path:
            self.render(svg_path)

        # if StatusBar.status_bar(raise_on_error=False):
        #     StatusBar.message('')

    def set_hover_status_message(self, message: str):
        """
        Set the message to be displayed in the status bar when this button is hovered over.
        """

        self._hover_message = message

    def render(self, svg_path: str) -> None:
        """
        Render the SVG icon for the button.
        """

        svg_file = QFile(svg_path)
        svg_file.open(QFile.ReadOnly | QFile.Text)
        svg_renderer = QSvgRenderer(svg_file.readAll())
        svg_size = QSize(*self.dims)
        svg_pixmap = QPixmap(svg_size)
        svg_pixmap.fill(Qt.transparent)

        painter = QPainter(svg_pixmap)
        svg_renderer.render(painter)
        painter.end()

        self.setFixedSize(svg_size)
        self.setStyleSheet(
            """
            QPushButton {
                border: none;
                padding: 0px;
            }
        """
        )
        self.setIcon(QIcon(svg_pixmap))
        self.setIconSize(svg_size)
