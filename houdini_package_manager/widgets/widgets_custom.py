from PySide6.QtCore import QFile, QSize, Qt
from PySide6.QtGui import QCursor, QIcon, QPainter, QPixmap
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWidgets import QPushButton


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

    def __init__(self, width: int, height: int, svg_path: str, svg_path_hover: str = None) -> None:
        super().__init__()

        self.btn_width = width
        self.btn_height = height
        self.svg_path = svg_path
        self.svg_path_hover = svg_path_hover

        self.render(self.svg_path)

        self.enterEvent = lambda event: self.hover_enter(event, self.svg_path_hover)
        self.leaveEvent = lambda event: self.hover_leave(event, self.svg_path)
        self.mousePressEvent = lambda event: self.mouse_press(event, self.svg_path)
        self.mouseReleaseEvent = lambda event: self.mouse_release(event, self.svg_path_hover)

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
        self.setCursor(QCursor(Qt.PointingHandCursor))
        if svg_path:
            self.render(svg_path)

    def hover_leave(self, event, svg_path: str) -> None:
        """
        The effects of leaving hover for the button.
        """

        super().leaveEvent(event)
        if svg_path:
            self.render(svg_path)

    def render(self, svg_path: str) -> None:
        """
        Render the SVG icon for the button.
        """

        svg_file = QFile(svg_path)
        svg_file.open(QFile.ReadOnly | QFile.Text)
        svg_renderer = QSvgRenderer(svg_file.readAll())
        svg_size = QSize(self.btn_width, self.btn_height)
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
