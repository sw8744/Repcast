from pydantic import BaseModel

class UserRegister(BaseModel):
    name: str
    tel: int
    email: str

class InsertSession(BaseModel):
    uid: str
    gym: str
    equipment: str

class FinishSession(BaseModel):
    sid: str
    count: int
    set: int