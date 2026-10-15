"""Adapters PostgreSQL de usuarios y roles (tbl_olo_indicadores_usuarios, tbl_olo_indicadores_roles)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg
from psycopg import sql

from application.ports.acceso import RolRepository, UsuarioRepository
from domain.entities.acceso import Acceso, Rol, Usuario

_ROLE_COLUMNS = "id, nombre, scope, pais, created_at"
_USER_COLUMNS = "id, email, nombre, rol_id, activo, created_at, updated_at"

_LIST_ROLES_SQL = f"SELECT {_ROLE_COLUMNS} FROM tbl_olo_indicadores_roles ORDER BY nombre"
_GET_ROLE_SQL = f"SELECT {_ROLE_COLUMNS} FROM tbl_olo_indicadores_roles WHERE id = %s"
_UPSERT_ROLE_SQL = f"""
INSERT INTO tbl_olo_indicadores_roles (id, nombre, scope, pais) VALUES (%s, %s, %s, %s)
ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, scope = EXCLUDED.scope, pais = EXCLUDED.pais
RETURNING {_ROLE_COLUMNS}
"""
_DELETE_ROLE_SQL = "DELETE FROM tbl_olo_indicadores_roles WHERE id = %s RETURNING id"

_ACCESS_BY_EMAIL_SQL = """
SELECT u.id, u.email, u.nombre, u.rol_id, u.activo, u.created_at, u.updated_at,
       r.nombre AS rol_nombre, r.scope AS rol_scope, r.pais AS rol_pais, r.created_at AS rol_created_at
FROM tbl_olo_indicadores_usuarios u
JOIN tbl_olo_indicadores_roles r ON r.id = u.rol_id
WHERE lower(u.email) = lower(%s)
ORDER BY u.created_at
LIMIT 1
"""
_LIST_USERS_SQL = f"SELECT {_USER_COLUMNS} FROM tbl_olo_indicadores_usuarios ORDER BY created_at"
_GET_USER_SQL = f"SELECT {_USER_COLUMNS} FROM tbl_olo_indicadores_usuarios WHERE id = %s"
# Usuarios nuevos: la credencial vive en Cognito; los hash heredados de las filas migradas no se tocan.
_CREATE_USER_SQL = f"""
INSERT INTO tbl_olo_indicadores_usuarios (email, nombre, rol_id, pass_hash, pass_salt)
VALUES (%s, %s, %s, '', '')
RETURNING {_USER_COLUMNS}
"""
_DELETE_USER_SQL = f"DELETE FROM tbl_olo_indicadores_usuarios WHERE id = %s RETURNING {_USER_COLUMNS}"
_UPDATABLE_USER_COLUMNS = ("nombre", "rol_id", "activo")


class PostgresRolRepository(RolRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def list_all(self) -> list[Rol]:
        with self._connection.cursor() as cursor:
            cursor.execute(_LIST_ROLES_SQL)
            return [Rol(**row) for row in cursor.fetchall()]

    def get(self, role_id: str) -> Rol | None:
        with self._connection.cursor() as cursor:
            cursor.execute(_GET_ROLE_SQL, (role_id,))
            row = cursor.fetchone()
        return Rol(**row) if row else None

    def upsert(self, rol: Rol) -> Rol:
        with self._connection.cursor() as cursor:
            cursor.execute(_UPSERT_ROLE_SQL, (rol.id, rol.nombre, rol.scope, rol.pais))
            return Rol(**cursor.fetchone())

    def delete(self, role_id: str) -> bool:
        with self._connection.cursor() as cursor:
            cursor.execute(_DELETE_ROLE_SQL, (role_id,))
            return cursor.fetchone() is not None


class PostgresUsuarioRepository(UsuarioRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def find_access_by_email(self, email: str) -> Acceso | None:
        with self._connection.cursor() as cursor:
            cursor.execute(_ACCESS_BY_EMAIL_SQL, (email,))
            row = cursor.fetchone()
        if not row:
            return None
        rol = Rol(id=row["rol_id"], nombre=row.pop("rol_nombre"), scope=row.pop("rol_scope"),
                  pais=row.pop("rol_pais"), created_at=row.pop("rol_created_at"))
        return Acceso(usuario=Usuario(**row), rol=rol)

    def list_all(self) -> list[Usuario]:
        with self._connection.cursor() as cursor:
            cursor.execute(_LIST_USERS_SQL)
            return [Usuario(**row) for row in cursor.fetchall()]

    def get(self, user_id: UUID) -> Usuario | None:
        with self._connection.cursor() as cursor:
            cursor.execute(_GET_USER_SQL, (user_id,))
            row = cursor.fetchone()
        return Usuario(**row) if row else None

    def create(self, email: str, nombre: str, rol_id: str) -> Usuario:
        with self._connection.cursor() as cursor:
            cursor.execute(_CREATE_USER_SQL, (email, nombre, rol_id))
            return Usuario(**cursor.fetchone())

    def update(self, user_id: UUID, values: dict[str, Any]) -> Usuario | None:
        columns = [c for c in _UPDATABLE_USER_COLUMNS if c in values]
        if not columns:
            return self.get(user_id)
        query = sql.SQL("UPDATE tbl_olo_indicadores_usuarios SET {} WHERE id = %s RETURNING {}").format(
            sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(c)) for c in columns),
            sql.SQL(_USER_COLUMNS),
        )
        with self._connection.cursor() as cursor:
            cursor.execute(query, (*[values[c] for c in columns], user_id))
            row = cursor.fetchone()
        return Usuario(**row) if row else None

    def delete(self, user_id: UUID) -> Usuario | None:
        with self._connection.cursor() as cursor:
            cursor.execute(_DELETE_USER_SQL, (user_id,))
            row = cursor.fetchone()
        return Usuario(**row) if row else None
