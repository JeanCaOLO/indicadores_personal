"""Composition root: arma casos de uso con sus adapters. Todo perezoso (se crea en el primer uso)."""

from __future__ import annotations

from functools import lru_cache

from application.dto.principal import Principal
from application.use_cases.acceso import GetCurrentAccessUseCase
from application.use_cases.indicadores import ListIndicadoresRegistrosUseCase, SaveIndicadoresRegistrosUseCase
from application.use_cases.resolve_current_user import ResolveCurrentUserUseCase
from application.use_cases.usuarios import (
    CreateUsuarioUseCase,
    DeleteRoleUseCase,
    DeleteUsuarioUseCase,
    ListRolesUseCase,
    ListUsuariosUseCase,
    SaveRoleUseCase,
    UpdateUsuarioUseCase,
)
from entrypoints.lambda_handlers.bootstrap import connection_factory
from infrastructure.aws.cognito_identity_directory import CognitoIdentityDirectory
from infrastructure.database.postgresql.app_unit_of_work import AppPostgresUnitOfWork
from shared.settings import env


def uow_factory(principal: Principal | None = None) -> AppPostgresUnitOfWork:
    return AppPostgresUnitOfWork(connection_factory(), principal, role=None if principal else "service_role")


@lru_cache(maxsize=1)
def _current_user() -> ResolveCurrentUserUseCase:
    return ResolveCurrentUserUseCase(lambda: uow_factory(None))


def resolve_principal(principal: Principal) -> Principal:
    """Vincula el ``sub`` de Cognito con tbl_app_users (espejo de identidades) y fija ``user_id``."""
    return _current_user().execute(principal)


@lru_cache(maxsize=1)
def _identity_directory() -> CognitoIdentityDirectory:
    return CognitoIdentityDirectory(env("COGNITO_USER_POOL_ID", required=True))


def get_current_access() -> GetCurrentAccessUseCase:
    return GetCurrentAccessUseCase(uow_factory)


def list_indicadores_registros() -> ListIndicadoresRegistrosUseCase:
    return ListIndicadoresRegistrosUseCase(uow_factory)


def save_indicadores_registros() -> SaveIndicadoresRegistrosUseCase:
    return SaveIndicadoresRegistrosUseCase(uow_factory)


def list_roles() -> ListRolesUseCase:
    return ListRolesUseCase(uow_factory)


def save_role() -> SaveRoleUseCase:
    return SaveRoleUseCase(uow_factory)


def delete_role() -> DeleteRoleUseCase:
    return DeleteRoleUseCase(uow_factory)


def list_usuarios() -> ListUsuariosUseCase:
    return ListUsuariosUseCase(uow_factory)


def create_usuario() -> CreateUsuarioUseCase:
    return CreateUsuarioUseCase(uow_factory, _identity_directory())


def update_usuario() -> UpdateUsuarioUseCase:
    return UpdateUsuarioUseCase(uow_factory)


def delete_usuario() -> DeleteUsuarioUseCase:
    return DeleteUsuarioUseCase(uow_factory, _identity_directory())
