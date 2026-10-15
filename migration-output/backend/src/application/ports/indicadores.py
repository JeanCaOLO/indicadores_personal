"""Port de persistencia de los registros clave/valor del tablero."""

from __future__ import annotations

from abc import ABC, abstractmethod

from domain.entities.indicadores import RegistroIndicador


class IndicadoresRepository(ABC):
    @abstractmethod
    def list_all(self) -> list[RegistroIndicador]:
        """Todos los registros (key, value) ordenados por clave."""

    @abstractmethod
    def lock_many(self, keys: list[str]) -> dict[str, RegistroIndicador]:
        """Registros existentes de esas claves, bloqueados hasta el fin de la transacción."""

    @abstractmethod
    def upsert_many(self, registros: list[RegistroIndicador]) -> int:
        """Inserta o reemplaza el valor por clave. Devuelve cuántos registros escribió."""
