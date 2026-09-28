"""业务异常与全局异常处理。

业务代码只需 `raise AppError("xxx")`，由这里统一转成 ApiResponse 结构，
保证调用方拿到的错误格式和成功格式一致。
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.response import ApiResponse


class AppError(Exception):
    """业务异常。status_code 走 HTTP 状态，code 走业务错误码。"""

    def __init__(self, message: str, code: int = -1, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


def _json(status_code: int, payload: ApiResponse) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=payload.model_dump())


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        return _json(exc.status_code, ApiResponse.fail(exc.message, exc.code))

    @app.exception_handler(RequestValidationError)
    async def _handle_validation_error(
        _request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        first = exc.errors()[0]
        field = ".".join(str(x) for x in first["loc"][1:]) or "请求参数"
        return _json(422, ApiResponse.fail(f"{field}: {first['msg']}", code=422))

    @app.exception_handler(StarletteHTTPException)
    async def _handle_http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _json(exc.status_code, ApiResponse.fail(str(exc.detail), code=exc.status_code))

    # Starlette 返回响应后会继续抛出原异常，堆栈由 uvicorn 打印，这里不重复记日志
    @app.exception_handler(Exception)
    async def _handle_unexpected(_request: Request, _exc: Exception) -> JSONResponse:
        return _json(500, ApiResponse.fail("服务器内部错误", code=500))
