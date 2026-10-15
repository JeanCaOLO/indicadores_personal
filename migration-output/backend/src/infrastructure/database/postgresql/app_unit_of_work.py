"""UnitOfWork de la aplicación: arma los repositories sobre la conexión de la transacción."""

from __future__ import annotations

import psycopg

from infrastructure.database.postgresql.acceso_repository import (
    PostgresRolRepository,
    PostgresUsuarioRepository,
)
from infrastructure.database.postgresql.app_user_repository import PostgresAppUserRepository
from infrastructure.database.postgresql.indicadores_repository import PostgresIndicadoresRepository
from infrastructure.database.postgresql.unit_of_work import PostgresUnitOfWork


class AppPostgresUnitOfWork(PostgresUnitOfWork):
    def _build_repositories(self, connection: psycopg.Connection) -> None:
        self.usuarios = PostgresUsuarioRepository(connection)
        self.roles = PostgresRolRepository(connection)
        self.indicadores = PostgresIndicadoresRepository(connection)
        self.app_users = PostgresAppUserRepository(connection)
