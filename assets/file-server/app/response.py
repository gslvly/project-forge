"""统一响应结构。

所有接口返回 {code, message, data}，调用方据此拆包：
code == 0 视为成功，直接取 data；否则按 message 报错。
"""

from pydantic import BaseModel

SUCCESS_CODE = 0


class ApiResponse[T](BaseModel):
    code: int = SUCCESS_CODE
    message: str = "ok"
    data: T | None = None

    @classmethod
    def ok(cls, data: T | None = None, message: str = "ok") -> "ApiResponse[T]":
        return cls(code=SUCCESS_CODE, message=message, data=data)

    @classmethod
    def fail(cls, message: str, code: int = -1, data: T | None = None) -> "ApiResponse[T]":
        return cls(code=code, message=message, data=data)
