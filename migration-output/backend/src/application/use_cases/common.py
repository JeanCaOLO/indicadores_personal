"""Reglas de acceso compartidas (reemplazan las políticas RLS abiertas a anon/authenticated)."""

from __future__ import annotations

from uuid import UUID

from application.dto.principal import Principal
from application.ports.app_unit_of_work import AppUnitOfWork
from domain.entities.acceso import Acceso
from domain.exceptions import ForbiddenError, UnauthorizedError, ValidationError

LOGIN_ERROR = "Usuario o contraseña incorrectos"


def resolve_access(uow: AppUnitOfWork, principal: Principal) -> Acceso:
    """Perfil activo del usuario autenticado (por el email del token de Cognito) con su rol.

    Sin perfil o inactivo → 403 con el mismo mensaje que mostraba el login original.
    """
    if not principal.email:
        raise UnauthorizedError("Se requiere autenticación.")
    acceso = uow.usuarios.find_access_by_email(principal.email)
    if acceso is None or not acceso.usuario.activo:
        raise ForbiddenError(LOGIN_ERROR, code="access_denied")
    return acceso


def require_user_manager(acceso: Acceso) -> None:
    if not acceso.can_manage_users():
        raise ForbiddenError("No tenés permisos para gestionar usuarios.")


def require_data_access(acceso: Acceso) -> None:
    if not acceso.can_see_data():
        raise ForbiddenError("Tu rol no tiene acceso a los indicadores.")


def parse_uuid(raw: str, field: str) -> UUID:
    try:
        return UUID(str(raw))
    except ValueError as error:
        raise ValidationError(
            f"'{field}' no es un identificador válido.", details={"field": field}
        ) from error
