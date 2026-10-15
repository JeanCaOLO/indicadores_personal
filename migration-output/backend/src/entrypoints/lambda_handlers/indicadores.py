"""Handlers HTTP de la sincronización del tablero (pull / push)."""

from __future__ import annotations

from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest, api_handler


@api_handler(principal_resolver=container.resolve_principal)
def list_indicadores_registros_handler(request: HttpRequest):
    return container.list_indicadores_registros().execute(request.require_principal())


@api_handler(principal_resolver=container.resolve_principal)
def save_indicadores_registros_handler(request: HttpRequest):
    return container.save_indicadores_registros().execute(request.require_principal(), request.json())
