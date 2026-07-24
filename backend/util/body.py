from pydantic import BaseModel

class UserRegister(BaseModel):
    name: str
    tel: str
    email: str
    expire: int

class InsertSession(BaseModel):
    uid: str
    gym: str
    equipment: str

class FinishSession(BaseModel):
    sid: str
    count: int
    set: int
    weight: int = 0
