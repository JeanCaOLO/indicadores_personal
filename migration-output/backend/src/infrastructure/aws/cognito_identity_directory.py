"""Adapter de IdentityDirectory sobre el User Pool de Cognito (APIs Admin*)."""

from __future__ import annotations

from typing import Any

from application.ports.acceso import IdentityDirectory
from domain.exceptions import ConflictError, ValidationError


def _error_code(error: Exception) -> str:
    response = getattr(error, "response", None) or {}
    return str((response.get("Error") or {}).get("Code") or "")


class CognitoIdentityDirectory(IdentityDirectory):
    def __init__(self, user_pool_id: str, client: Any | None = None) -> None:
        self._user_pool_id = user_pool_id
        self._client = client

    def _cognito(self) -> Any:
        if self._client is None:
            import boto3

            self._client = boto3.client("cognito-idp")
        return self._client

    def create_user(self, email: str, temporary_password: str, nombre: str) -> None:
        attributes = [{"Name": "email", "Value": email}, {"Name": "email_verified", "Value": "true"}]
        if nombre:
            attributes.append({"Name": "name", "Value": nombre})
        try:
            self._cognito().admin_create_user(
                UserPoolId=self._user_pool_id,
                Username=email,
                TemporaryPassword=temporary_password,
                MessageAction="SUPPRESS",
                UserAttributes=attributes,
            )
        except Exception as error:
            code = _error_code(error)
            if code == "UsernameExistsException":
                raise ConflictError("Ese correo ya existe (duplicate).", code="duplicate_email") from error
            if code in ("InvalidPasswordException", "InvalidParameterException"):
                raise ValidationError(
                    "La contraseña no cumple la política del directorio.", details={"field": "password"}
                ) from error
            raise

    def disable_user(self, email: str) -> None:
        try:
            self._cognito().admin_disable_user(UserPoolId=self._user_pool_id, Username=email)
        except Exception as error:
            if _error_code(error) != "UserNotFoundException":
                raise
