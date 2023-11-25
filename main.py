import datetime
import logging
import os

from houdini_package_manager.__init__ import __version__
from houdini_package_manager.main import main

if __name__ == "__main__":
    fmt = "%(levelname)s %(asctime)s - %(message)s"

    # crash log file name currently stamped with program start time, not the crash time
    current_time = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    FILENAME = f"Houdini_Package_Manager-{__version__}_crash.{current_time}.log"

    logging.basicConfig(filename=FILENAME, filemode="w", format=fmt, level=logging.DEBUG)

    # duplicate logging to console
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter(fmt))
    logging.getLogger().addHandler(console_handler)

    exception_occurred = False

    try:
        main()
    except Exception as e:
        exception_occurred = True
        logging.exception("An internal error occured: %s", str(e))

    if not exception_occurred:
        logging.shutdown()  # Ensure all loggers are closed
        os.remove(FILENAME)
