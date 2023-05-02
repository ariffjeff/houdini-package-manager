from PySide6.QtCore import QFile, QSize, Qt
from PySide6.QtGui import QIcon, QPainter, QPixmap
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWidgets import (
    QPushButton,
)


class WidgetStyles:

    """
    A collection of styles for QWidget objects like QPushButtons and QCheckBoxes.
    """

    def svg_QPushButton(button_widget: QPushButton, width: int, height: int, svg_path: str) -> None:
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
