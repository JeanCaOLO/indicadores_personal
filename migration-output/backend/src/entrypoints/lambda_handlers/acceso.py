"""Handler GET /me: sesión del usuario (perfil + rol) que antes armaba OLOAuth.login."""

from __future__ import annotations

from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest, api_handler


@api_handler(principal_resolver=container.resolve_principal)
def get_current_access_handler(request: HttpRequest):
    return container.get_current_access().execute(request.require_principal())
