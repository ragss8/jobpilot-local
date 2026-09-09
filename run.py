"""Cross-platform launcher. No third-party packages required for the core app."""
import os
import sys
from pathlib import Path

if sys.version_info<(3,11):
    raise SystemExit('JobPilot requires Python 3.11 or newer. Install Python, then try again.')
os.chdir(Path(__file__).resolve().parent)
venv_python=Path('.venv')/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
if sys.prefix==sys.base_prefix and venv_python.is_file():
    interpreter=str(Path.cwd()/venv_python)
    os.execv(interpreter,[interpreter,__file__,*sys.argv[1:]])
from jobpilot.server import main
main()
