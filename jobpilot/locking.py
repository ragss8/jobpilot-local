"""Prevent two app processes from using the same private data directory."""
import os
from pathlib import Path
from contextlib import contextmanager


@contextmanager
def data_lock(directory):
    root=Path(directory).resolve();root.mkdir(parents=True,exist_ok=True,mode=0o700)
    handle=(root/'.jobpilot.lock').open('a+b')
    handle.seek(0,2)
    if handle.tell()==0:handle.write(b'0');handle.flush()
    handle.seek(0)
    locked=False
    try:
        try:
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
            locked=True
        except OSError:
            raise ValueError('JobPilot is already using this data directory. Close the other instance first.')
        yield
    finally:
        if locked:
            handle.seek(0)
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(),fcntl.LOCK_UN)
        handle.close()
