"""Usuarios y roles del sistema de indicadores (antes olo_indicadores_usuarios / olo_indicadores_roles).

Modelo de acceso del original (columna ``scope`` del rol):
- ``global``: ve toda la data de todos los países.
- ``pais``: ve solo la data de su país (``rol.pais``).
- ``admin``: no ve data; solo gestiona usuarios y roles.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from domain.exceptions import ValidationError

SCOPES = ("global", "pais", "admin")
BASE_ROLE_IDS = frozenset({"global", "admin", "costa_rica", "venezuela"})
USER_MANAGER_SCOPES = frozenset({"admin", "global"})
DATA_SCOPES = frozenset({"global", "pais"})
MAX_TEXT = 200
PASSWORD_MIN_LENGTH = 12
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass(frozen=True)
class Rol:
    id: str
    nombre: str
    scope: str
    pais: str | None
    created_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        """Misma forma que ``select("*")`` sobre olo_indicadores_roles."""
        return {"id": self.id, "nombre": self.nombre, "scope": self.scope, "pais": self.pais,
                "created_at": self.created_at}

    def to_session_dict(self) -> dict[str, Any]:
        """Forma de ``session.rol`` que guardaba OLOAuth."""
        return {"id": self.id, "nombre": self.nombre, "scope": self.scope, "pais": self.pais}

    @staticmethod
    def slug(nombre: str) -> str:
        """Mismo slug que generaba la vista de roles: minúsculas, sin acentos, '_' como separador."""
        plain = unicodedata.normalize("NFD", nombre.lower())
        plain = "".join(ch for ch in plain if unicodedata.category(ch) != "Mn")
        return re.sub(r"^_|_$", "", re.sub(r"[^a-z0-9]+", "_", plain))

    @classmethod
    def from_input(cls, role_id: str, body: dict[str, Any]) -> Rol:
        nombre = _text(body.get("nombre"), "nombre", required=True)
        scope = str(body.get("scope") or "pais").strip()
        if scope not in SCOPES:
            raise ValidationError("El alcance del rol no es válido.", details={"field": "scope"})
        pais = _text(body.get("pais"), "pais") if scope == "pais" else None
        if scope == "pais" and not pais:
            raise ValidationError("Indicá el país", details={"field": "pais"})
        clean_id = str(role_id or "").strip()
        if not clean_id or clean_id != cls.slug(clean_id):
            raise ValidationError("El identificador del rol no es válido.", details={"field": "roleId"})
        return cls(id=clean_id, nombre=nombre, scope=scope, pais=pais)


@dataclass(frozen=True)
class Usuario:
    id: UUID
    email: str
    nombre: str | None
    rol_id: str
    activo: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        """Columnas que listaba la vista de usuarios: id, email, nombre, rol_id, activo, created_at."""
        return {"id": self.id, "email": self.email, "nombre": self.nombre, "rol_id": self.rol_id,
                "activo": self.activo, "created_at": self.created_at}


@dataclass(frozen=True)
class NuevoUsuario:
    email: str
    nombre: str
    rol_id: str
    password: str

    @classmethod
    def from_input(cls, body: dict[str, Any]) -> NuevoUsuario:
        email = normalize_email(body.get("email"))
        password = str(body.get("password") or "")
        validate_password(password)
        rol_id = _text(body.get("rol_id"), "rol_id", required=True)
        return cls(email=email, nombre=_text(body.get("nombre"), "nombre") or "", rol_id=rol_id,
                   password=password)


@dataclass(frozen=True)
class CambiosUsuario:
    """Lista blanca de lo que la vista de usuarios puede modificar (antes ``update(patch)`` libre)."""

    values: dict[str, Any]

    @classmethod
    def from_input(cls, body: dict[str, Any]) -> CambiosUsuario:
        values: dict[str, Any] = {}
        if "nombre" in body:
            values["nombre"] = _text(body.get("nombre"), "nombre") or ""
        if "rol_id" in body:
            values["rol_id"] = _text(body.get("rol_id"), "rol_id", required=True)
        if "activo" in body:
            if not isinstance(body["activo"], bool):
                raise ValidationError("'activo' debe ser verdadero o falso.", details={"field": "activo"})
            values["activo"] = body["activo"]
        unknown = sorted(set(body) - {"nombre", "rol_id", "activo"})
        if unknown:
            raise ValidationError("Campos no permitidos.", details={"fields": unknown})
        if not values:
            raise ValidationError("No hay cambios para guardar.")
        return cls(values)


@dataclass(frozen=True)
class Acceso:
    """Usuario autenticado + su rol: lo que el original guardaba como ``olo_session``."""

    usuario: Usuario
    rol: Rol

    @property
    def scope(self) -> str:
        return self.rol.scope

    @property
    def pais(self) -> str | None:
        return self.rol.pais if self.rol.scope == "pais" else None

    def can_manage_users(self) -> bool:
        return self.rol.scope in USER_MANAGER_SCOPES

    def can_see_data(self) -> bool:
        return self.rol.scope in DATA_SCOPES

    def to_session_dict(self) -> dict[str, Any]:
        return {"id": self.usuario.id, "email": self.usuario.email, "nombre": self.usuario.nombre,
                "rol": self.rol.to_session_dict()}


def normalize_email(raw: object) -> str:
    email = str(raw or "").strip().lower()
    if not email or not _EMAIL_RE.match(email) or len(email) > MAX_TEXT:
        raise ValidationError("Correo y contraseña requeridos", details={"field": "email"})
    return email


def validate_password(password: str) -> None:
    """Política del User Pool: 12+ caracteres con mayúscula, minúscula, número y símbolo."""
    checks = (
        len(password) >= PASSWORD_MIN_LENGTH,
        any(c.islower() for c in password),
        any(c.isupper() for c in password),
        any(c.isdigit() for c in password),
        any(not c.isalnum() for c in password),
    )
    if not all(checks):
        raise ValidationError(
            "La contraseña debe tener 12+ caracteres con mayúscula, minúscula, número y símbolo.",
            details={"field": "password"},
        )


def _text(raw: object, field: str, *, required: bool = False) -> str | None:
    value = str(raw).strip() if raw is not None else ""
    if required and not value:
        raise ValidationError(f"'{field}' es obligatorio.", details={"field": field})
    if len(value) > MAX_TEXT:
        raise ValidationError(f"'{field}' supera {MAX_TEXT} caracteres.", details={"field": field})
    return value or None
