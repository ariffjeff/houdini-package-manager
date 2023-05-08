from pathlib import Path

from PySide6.QtCore import QUrl
from PySide6.QtGui import QDesktopServices

from houdini_package_manager.meta.meta_tools import StatusBar


class Actions:
    """
    Various actions that can be performed by widgets.
    """

    def open_path(path):
        """
        Get the path that is associated with a button and open it.
        """

        if not isinstance(path, Path):
            path = Path(path)

        if not path.exists():
            StatusBar.message(f"Failed to open: {str(path)}")
            return

        QDesktopServices.openUrl(QUrl.fromLocalFile(path))
        StatusBar.message(f"Opened: {path}")
