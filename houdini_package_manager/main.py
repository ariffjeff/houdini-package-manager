# for processing cli args
import sys

from PySide6.QtWidgets import QApplication, QWidget


def main() -> None:
    app = QApplication(sys.argv)

    window = QWidget()
    window.setWindowTitle("Houdini Package Manager")
    window.show()

    app.exec()


if __name__ == "__main__":
    main()
