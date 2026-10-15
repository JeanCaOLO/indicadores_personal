"""Sincronización del tablero (antes OLOSync.pull / OLOSync.push sobre olo_indicadores_kv)."""

from __future__ import annotations

from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.use_cases.common import require_data_access, resolve_access
from domain.entities.indicadores import (
    RegistroIndicador,
    is_month_key,
    merge_for_country,
    parse_registros,
    rows_for_country,
)


class ListIndicadoresRegistrosUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal) -> list[dict[str, Any]]:
        with self._uow_factory(principal) as uow:
            acceso = resolve_access(uow, principal)
            require_data_access(acceso)
            registros = uow.indicadores.list_all()
        return [registro.visible_for(acceso.pais).to_dict() for registro in registros]


class SaveIndicadoresRegistrosUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: Any) -> dict[str, int]:
        enviados = parse_registros(body)
        with self._uow_factory(principal) as uow:
            acceso = resolve_access(uow, principal)
            require_data_access(acceso)
            pais = acceso.pais
            if pais is not None:
                enviados = self._merge_country(uow, rows_for_country(enviados), pais)
            if not enviados:
                return {"count": 0}
            count = uow.indicadores.upsert_many(enviados)
            uow.commit()
        return {"count": count}

    @staticmethod
    def _merge_country(uow, enviados: list[RegistroIndicador], pais: str) -> list[RegistroIndicador]:
        """Conserva los registros de otros países de cada mes (bloqueo de fila mientras se fusiona)."""
        guardados = uow.indicadores.lock_many([r.key for r in enviados if is_month_key(r.key)])
        merged = []
        for registro in enviados:
            if is_month_key(registro.key):
                previo = guardados.get(registro.key)
                value = merge_for_country(previo.value if previo else None, registro.value, pais)
                registro = RegistroIndicador(registro.key, value)
            merged.append(registro)
        return merged
