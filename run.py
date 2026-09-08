"""Cross-platform launcher. No third-party packages required for the core app."""
import os
import sys
from pathlib import Path

if sys.version_info<(3,11):
    raise SystemExit('JobPilot requires Python 3.11 or newer. Install Python, then try again.')
os.chdir(Path(__file__).resolve().parent)
from jobpilot.server import main
main()
