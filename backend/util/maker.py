import time
import hashlib
import bcrypt

def idMaker():
    return hashlib.md5(str(time.time()).encode("utf-8")).hexdigest()

def passwordMaker(pwd: str):
    return bcrypt.hashpw(pwd.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')