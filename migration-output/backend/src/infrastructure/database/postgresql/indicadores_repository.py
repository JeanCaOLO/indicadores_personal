"""Adapter PostgreSQL de IndicadoresRepository (tbl_olo_indicadores_kv)."""

from __future__ import annotations

import psycopg
from psycopg.types.json import Jsonb

from application.ports.indicadores import IndicadoresRepository
from domain.entities.indicadores import RegistroIndicador

_LIST_SQL = "SELECT key, value, updated_at FROM tbl_olo_indicadores_kv ORDER BY key"
_LOCK_SQL = """
SELECT key, value, updated_at FROM tbl_olo_indicadores_kv
WHERE key = ANY(%s)
ORDER BY key
FOR UPDATE
"""
# Igual que upsert(rows, {onConflict: "key"}); updated_at lo actualiza trg_olo_indicadores_kv_updated.
_UPSERT_SQL = """
INSERT INTO tbl_olo_indicadores_kv (key, value) VALUES (%s, %s)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
"""


class PostgresIndicadoresRepository(IndicadoresRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def list_all(self) -> list[RegistroIndicador]:
        with self._connection.cursor() as cursor:
            cursor.execute(_LIST_SQL)
            return [RegistroIndicador(**row) for row in cursor.fetchall()]

    def lock_many(self, keys: list[str]) -> dict[str, RegistroIndicador]:
        if not keys:
            return {}
        with self._connection.cursor() as cursor:
            cursor.execute(_LOCK_SQL, (keys,))
            return {row["key"]: RegistroIndicador(**row) for row in cursor.fetchall()}

    def upsert_many(self, registros: list[RegistroIndicador]) -> int:
        if not registros:
            return 0
        with self._connection.cursor() as cursor:
            cursor.executemany(_UPSERT_SQL, [(r.key, Jsonb(r.value)) for r in registros])
        return len(registros)
