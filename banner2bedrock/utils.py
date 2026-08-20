import os
import sys


def print_with_flush(data):
    # In a --windowed (no console) PyInstaller build on Windows, sys.stdout
    # is None rather than a stream, so print()/flush() would crash. Silently
    # drop progress output in that case instead of using it.
    if sys.stdout is None:
        return
    print(data)
    sys.stdout.flush()


def get_assets_folder():
    # PyInstaller's documented way to find bundled data at runtime: onefile
    # builds extract everything (including assets/, via --add-data) under a
    # temp dir it points to as sys._MEIPASS.
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, "assets")
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
