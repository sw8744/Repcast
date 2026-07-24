from pydantic import BaseModel

class InsertSession(BaseModel):
    uid: str
    gym: str
    equipment: str

class FinishSession(BaseModel):
    sid: str
    count: int
    set: int