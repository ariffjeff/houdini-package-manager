from PySide6.QtWidgets import QApplication

from houdini_package_manager import main


def test_app_starts_successfully_and_object_returned():
    app = main.main(start=False, headless=True)
    assert type(app) == QApplication
