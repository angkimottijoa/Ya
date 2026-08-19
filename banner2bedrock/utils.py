import os
import sys


def print_with_flush(data):
    print(data)
    sys.stdout.flush()


def get_assets_folder():
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
