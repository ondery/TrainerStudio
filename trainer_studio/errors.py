"""Errors the API turns into JSON. The message is English; the UI translates ``code``."""

from trainer_studio.messages import text


class StudioError(Exception):
    def __init__(self, message: str = "", code: str = "error", status: int = 400, params: dict | None = None):
        self.code = code
        self.status = status
        self.params = {key: value for key, value in (params or {}).items()}
        english = text(code, **self.params)
        self.message = english or message or text("error")
        super().__init__(self.message)


class LockError(StudioError):
    def __init__(self, message: str = ""):
        super().__init__(message, code="catalog.lock", status=400)
