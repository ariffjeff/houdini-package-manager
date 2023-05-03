from PySide6.QtCore import QFile, QSize, Qt
from PySide6.QtGui import QCursor, QIcon, QPainter, QPixmap
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWidgets import QPushButton


class WidgetStyles:

    """
    A collection of styles for QWidget objects like QPushButtons and QCheckBoxes.
    """

    def svg_QPushButton(
        button_widget: QPushButton, width: int, height: int, svg_path: str, svg_path_hover: str = None
    ) -> None:
        """
        Setup a SVG button with optional hover color change.

        Arguments:
            button_widget (QPushButton):
                The QPushButton widget to be transformed into a SVG button.

            width (int):
                Button width.

            height (int):
                Button height.

            svg_path (str):
                Path to the SVG file to be the default display state of the button.

            svg_path_hover (str):
                Path to the SVG file to be the hover display state of the button.
        """

        svg_file = QFile(svg_path)
        svg_file.open(QFile.ReadOnly | QFile.Text)
        svg_renderer = QSvgRenderer(svg_file.readAll())
        svg_size = QSize(width, height)
        svg_pixmap = QPixmap(svg_size)
        svg_pixmap.fill(Qt.transparent)

        painter = QPainter(svg_pixmap)
        svg_renderer.render(painter)
        painter.end()

        button_widget.setFixedSize(svg_size)
        button_widget.setStyleSheet(
            """
            QPushButton {
                border: none;
                padding: 0px;
            }
        """
        )
        button_widget.setIcon(QIcon(svg_pixmap))
        button_widget.setIconSize(svg_size)

        #  overly confusing recursion to get hover color change to work "properly"
        button_widget.enterEvent = lambda event: hover_effects(svg_path, svg_path_hover)
        button_widget.leaveEvent = lambda event: hover_effects(svg_path, svg_path_hover)

        def hover_effects(svg_path: str, svg_path_hover: str):
            """
            Recurvsive call on button to replace itself with another instance but with the new file.
            Also other hover effects.
            """

            # seems to dissapear on leaveEvent as desired despite this
            # function being called for both enterEvent and leaveEvent.
            button_widget.setCursor(QCursor(Qt.PointingHandCursor))

            if svg_path_hover:
                WidgetStyles.svg_QPushButton(button_widget, width, height, svg_path_hover, svg_path)
