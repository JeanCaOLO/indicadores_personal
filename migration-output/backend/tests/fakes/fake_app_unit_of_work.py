"""Fakes en memoria de la aplicación para tests unitarios de casos de uso."""

from __future__ import annotations

import copy
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from application.ports.acceso import IdentityDirectory, RolRepository, UsuarioRepository
from application.ports.indicadores import IndicadoresRepository
from domain.entities.acceso import Acceso, Rol, Usuario
from domain.entities.indicadores import RegistroIndicador
from domain.exceptions import ConflictError
from fakes.fake_app_user_repository import FakeAppUserRepository
from fakes.fake_unit_of_work import FakeUnitOfWork

BASE_ROLES = (
    Rol("global", "Global", "global", None),
    Rol("admin", "Administrador", "admin", None),
    Rol("costa_rica", "Costa Rica", "pais", "Costa Rica"),
    Rol("venezuela", "Venezuela", "pais", "Venezuela"),
)


class FakeRolRepository(RolRepository):
    def __init__(self, users: FakeUsuarioRepository) -> None:
        self.rows: dict[str, Rol] = {r.id: r for r in BASE_ROLES}
        self._users = users

    def list_all(self) -> list[Rol]:
        return sorted(self.rows.values(), key=lambda r: r.nombre)

    def get(self, role_id: str) -> Rol | None:
        return self.rows.get(role_id)

    def upsert(self, rol: Rol) -> Rol:
        self.rows[rol.id] = rol
        return rol

    def delete(self, role_id: str) -> bool:
        if any(u.rol_id == role_id for u in self._users.rows.values()):
            raise ConflictError("La operación viola una referencia entre registros.")
        return self.rows.pop(role_id, None) is not None


class FakeUsuarioRepository(UsuarioRepository):
    def __init__(self) -> None:
        self.rows: dict[UUID, Usuario] = {}
        self.roles: FakeRolRepository | None = None
        self._clock = datetime(2026, 1, 1, tzinfo=UTC)

    def add(self, email: str, rol_id: str, *, activo: bool = True, nombre: str = "") -> Usuario:
        self._clock += timedelta(minutes=1)
        usuario = Usuario(uuid4(), email, nombre, rol_id, activo, self._clock, self._clock)
        self.rows[usuario.id] = usuario
        return usuario

    def find_access_by_email(self, email: str) -> Acceso | None:
        usuario = next((u for u in self.rows.values() if u.email.lower() == email.lower()), None)
        if usuario is None or self.roles is None:
            return None
        return Acceso(usuario, self.roles.rows[usuario.rol_id])

    def list_all(self) -> list[Usuario]:
        return sorted(self.rows.values(), key=lambda u: u.created_at)

    def get(self, user_id: UUID) -> Usuario | None:
        return self.rows.get(user_id)

    def create(self, email: str, nombre: str, rol_id: str) -> Usuario:
        if any(u.email == email for u in self.rows.values()):
            raise ConflictError("El registro ya existe.")
        return self.add(email, rol_id, nombre=nombre)

    def update(self, user_id: UUID, values: dict[str, Any]) -> Usuario | None:
        current = self.rows.get(user_id)
        if current is None:
            return None
        self.rows[user_id] = Usuario(**{**current.__dict__, **values})
        return self.rows[user_id]

    def delete(self, user_id: UUID) -> Usuario | None:
        return self.rows.pop(user_id, None)


class FakeIndicadoresRepository(IndicadoresRepository):
    def __init__(self) -> None:
        self.rows: dict[str, Any] = {}
        self.locked: list[list[str]] = []

    def list_all(self) -> list[RegistroIndicador]:
        return [RegistroIndicador(k, copy.deepcopy(v)) for k, v in sorted(self.rows.items())]

    def lock_many(self, keys: list[str]) -> dict[str, RegistroIndicador]:
        self.locked.append(list(keys))
        return {k: RegistroIndicador(k, copy.deepcopy(self.rows[k])) for k in keys if k in self.rows}

    def upsert_many(self, registros: list[RegistroIndicador]) -> int:
        for registro in registros:
            self.rows[registro.key] = copy.deepcopy(registro.value)
        return len(registros)


class FakeIdentityDirectory(IdentityDirectory):
    def __init__(self) -> None:
        self.users: dict[str, dict[str, Any]] = {}

    def create_user(self, email: str, temporary_password: str, nombre: str) -> None:
        if email in self.users:
            raise ConflictError("Ese correo ya existe (duplicate).", code="duplicate_email")
        self.users[email] = {"password": temporary_password, "nombre": nombre, "enabled": True}

    def disable_user(self, email: str) -> None:
        if email in self.users:
            self.users[email]["enabled"] = False


class FakeAppUnitOfWork(FakeUnitOfWork):
    """Comparte el estado entre transacciones, como una base real."""

    def __init__(self) -> None:
        super().__init__()
        self.usuarios = FakeUsuarioRepository()
        self.roles = FakeRolRepository(self.usuarios)
        self.usuarios.roles = self.roles
        self.indicadores = FakeIndicadoresRepository()
        self.app_users = FakeAppUserRepository()

    def factory(self, principal=None) -> FakeAppUnitOfWork:
        return self
