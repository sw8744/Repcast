import time
import hashlib

def idMaker():
    return hashlib.md5(str(time.time()).encode("utf-8")).hexdigest()