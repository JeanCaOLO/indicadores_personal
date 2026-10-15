"""Gestión de usuarios y roles (vista 👥 Usuarios; solo scope admin o global)."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from application.dto.principal import Principal
from application.ports.acceso import IdentityDirectory
from application.ports.app_unit_of_work import AppUnitOfWork, UnitOfWorkFactory
from application.use_cases.common import parse_uuid, require_user_manager, resolve_access
from domain.entities.acceso import BASE_ROLE_IDS, CambiosUsuario, NuevoUsuario, Rol, Usuario
from domain.exceptions import BusinessRuleViolation, NotFoundError, ValidationError


class _ManagerUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    @contextmanager
    def _open(self, principal: Principal) -> Iterator[AppUnitOfWork]:
        """Transacción del caso de uso, solo para usuarios con scope admin o global."""
        with self._uow_factory(principal) as uow:
            require_user_manager(resolve_access(uow, principal))
            yield uow


class ListRolesUseCase(_ManagerUseCase):
    def execute(self, principal: Principal) -> list[Rol]:
        with self._open(principal) as uow:
            return uow.roles.list_all()


class SaveRoleUseCase(_ManagerUseCase):
    def execute(self, principal: Principal, role_id: str, body: dict[str, Any]) -> Rol:
        rol = Rol.from_input(role_id, body)
        with self._open(principal) as uow:
            saved = uow.roles.upsert(rol)
            uow.commit()
        return saved


class DeleteRoleUseCase(_ManagerUseCase):
    def execute(self, principal: Principal, role_id: str) -> None:
        if role_id in BASE_ROLE_IDS:
            raise BusinessRuleViolation("Los roles base no se pueden eliminar.")
        with self._open(principal) as uow:
            if not uow.roles.delete(role_id):
                raise NotFoundError("El rol no existe.")
            uow.commit()


class ListUsuariosUseCase(_ManagerUseCase):
    def execute(self, principal: Principal) -> list[Usuario]:
        with self._open(principal) as uow:
            return uow.usuarios.list_all()


class CreateUsuarioUseCase(_ManagerUseCase):
    def __init__(self, uow_factory: UnitOfWorkFactory, directory: IdentityDirectory) -> None:
        super().__init__(uow_factory)
        self._directory = directory

    def execute(self, principal: Principal, body: dict[str, Any]) -> Usuario:
        nuevo = NuevoUsuario.from_input(body)
        with self._open(principal) as uow:
            if uow.roles.get(nuevo.rol_id) is None:
                raise ValidationError("El rol no existe.", details={"field": "rol_id"})
            usuario = uow.usuarios.create(nuevo.email, nuevo.nombre, nuevo.rol_id)
            self._directory.create_user(nuevo.email, nuevo.password, nuevo.nombre)
            uow.commit()
        return usuario


class UpdateUsuarioUseCase(_ManagerUseCase):
    def execute(self, principal: Principal, raw_user_id: str, body: dict[str, Any]) -> Usuario:
        user_id = parse_uuid(raw_user_id, "usuarioId")
        cambios = CambiosUsuario.from_input(body)
        with self._open(principal) as uow:
            rol_id = cambios.values.get("rol_id")
            if rol_id is not None and uow.roles.get(rol_id) is None:
                raise ValidationError("El rol no existe.", details={"field": "rol_id"})
            usuario = uow.usuarios.update(user_id, cambios.values)
            if usuario is None:
                raise NotFoundError("El usuario no existe.")
            uow.commit()
        return usuario


class DeleteUsuarioUseCase(_ManagerUseCase):
    def __init__(self, uow_factory: UnitOfWorkFactory, directory: IdentityDirectory) -> None:
        super().__init__(uow_factory)
        self._directory = directory

    def execute(self, principal: Principal, raw_user_id: str) -> None:
        user_id = parse_uuid(raw_user_id, "usuarioId")
        with self._open(principal) as uow:
            usuario = uow.usuarios.delete(user_id)
            if usuario is None:
                raise NotFoundError("El usuario no existe.")
            self._directory.disable_user(usuario.email)
            uow.commit()
