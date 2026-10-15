"""Ports de persistencia de usuarios y roles, y del directorio de identidades (Cognito)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID

from domain.entities.acceso import Acceso, Rol, Usuario


class RolRepository(ABC):
    @abstractmethod
    def list_all(self) -> list[Rol]:
        """Todos los roles ordenados por nombre."""

    @abstractmethod
    def get(self, role_id: str) -> Rol | None:
        """Rol por id, o None."""

    @abstractmethod
    def upsert(self, rol: Rol) -> Rol:
        """Crea o actualiza (por id) nombre, scope y pais."""

    @abstractmethod
    def delete(self, role_id: str) -> bool:
        """Elimina el rol. Con usuarios asignados → ConflictError (FK). False si no existía."""


class UsuarioRepository(ABC):
    @abstractmethod
    def find_access_by_email(self, email: str) -> Acceso | None:
        """Usuario + rol por email (sin distinguir mayúsculas), o None."""

    @abstractmethod
    def list_all(self) -> list[Usuario]:
        """Todos los usuarios ordenados por fecha de alta."""

    @abstractmethod
    def get(self, user_id: UUID) -> Usuario | None:
        """Usuario por id, o None."""

    @abstractmethod
    def create(self, email: str, nombre: str, rol_id: str) -> Usuario:
        """Inserta el perfil (credenciales en Cognito). Email repetido → ConflictError."""

    @abstractmethod
    def update(self, user_id: UUID, values: dict[str, Any]) -> Usuario | None:
        """Aplica columnas ya validadas (nombre, rol_id, activo). None si no existe."""

    @abstractmethod
    def delete(self, user_id: UUID) -> Usuario | None:
        """Elimina y devuelve el usuario borrado, o None."""


class IdentityDirectory(ABC):
    """Directorio de identidades (User Pool de Cognito)."""

    @abstractmethod
    def create_user(self, email: str, temporary_password: str, nombre: str) -> None:
        """Crea la identidad con contraseña temporal y email verificado, sin enviar correo.
        Si ya existe → ConflictError."""

    @abstractmethod
    def disable_user(self, email: str) -> None:
        """Impide que la identidad vuelva a iniciar sesión. Si no existe, no hace nada."""
