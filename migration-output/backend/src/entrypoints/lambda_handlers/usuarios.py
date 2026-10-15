"""Handlers HTTP de la gestión de usuarios y roles."""

from __future__ import annotations

from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest, api_handler, created


@api_handler(principal_resolver=container.resolve_principal)
def list_roles_handler(request: HttpRequest):
    return container.list_roles().execute(request.require_principal())


@api_handler(principal_resolver=container.resolve_principal)
def save_role_handler(request: HttpRequest):
    return container.save_role().execute(
        request.require_principal(), request.path_param("roleId"), request.json_body()
    )


@api_handler(principal_resolver=container.resolve_principal)
def delete_role_handler(request: HttpRequest):
    return container.delete_role().execute(request.require_principal(), request.path_param("roleId"))


@api_handler(principal_resolver=container.resolve_principal)
def list_usuarios_handler(request: HttpRequest):
    return container.list_usuarios().execute(request.require_principal())


@api_handler(principal_resolver=container.resolve_principal)
def create_usuario_handler(request: HttpRequest):
    return created(container.create_usuario().execute(request.require_principal(), request.json_body()))


@api_handler(principal_resolver=container.resolve_principal)
def update_usuario_handler(request: HttpRequest):
    return container.update_usuario().execute(
        request.require_principal(), request.path_param("usuarioId"), request.json_body()
    )


@api_handler(principal_resolver=container.resolve_principal)
def delete_usuario_handler(request: HttpRequest):
    return container.delete_usuario().execute(request.require_principal(), request.path_param("usuarioId"))
