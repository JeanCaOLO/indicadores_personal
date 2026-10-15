"""Sesión del usuario autenticado (antes OLOAuth.login leía usuario y rol desde el navegador)."""

from __future__ import annotations

from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.use_cases.common import resolve_access


class GetCurrentAccessUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal) -> dict[str, Any]:
        """Misma forma que ``olo_session``: {id, email, nombre, rol: {id, nombre, scope, pais}}."""
        with self._uow_factory(principal) as uow:
            return resolve_access(uow, principal).to_session_dict()
