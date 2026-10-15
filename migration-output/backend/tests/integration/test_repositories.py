"""Repositories contra el esquema Aurora generado (tablas tbl_*, search_path del usuario app)."""

import os
from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration

DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
if not DATABASE_URL:
    pytest.skip("TEST_DATABASE_URL no definida", allow_module_level=True)

import psycopg  # noqa: E402

from application.dto.principal import Principal  # noqa: E402
from domain.entities.acceso import Rol  # noqa: E402
from domain.entities.indicadores import RegistroIndicador  # noqa: E402
from domain.exceptions import ConflictError  # noqa: E402
from infrastructure.database.postgresql.app_unit_of_work import AppPostgresUnitOfWork  # noqa: E402
from infrastructure.database.postgresql.connection import (  # noqa: E402
    PostgresConnectionFactory,
    StaticCredentials,
)
from shared.settings import DatabaseSettings  # noqa: E402


@pytest.fixture(scope="module")
def factory():
    info = psycopg.conninfo.conninfo_to_dict(DATABASE_URL)
    settings = DatabaseSettings(
        secret_name="unused",
        name=info["dbname"],
        host=info.get("host", "localhost"),
        port=int(info.get("port", 5432)),
        sslmode="disable",
        connect_timeout=5,
        schemas=(),
    )
    return PostgresConnectionFactory(settings, StaticCredentials(info["user"], info.get("password", "")))


def _principal(email):
    return Principal(subject=f"sub-{email}", email=email)


def test_roles_and_users_against_generated_schema(factory):
    suffix = uuid4().hex[:8]
    role_id, email = f"pais_{suffix}", f"Eva.{suffix}@OLO.com"
    with AppPostgresUnitOfWork(factory, _principal(email)) as uow:
        assert {"global", "admin"} <= {r.id for r in uow.roles.list_all()}
        uow.roles.upsert(Rol(role_id, f"País {suffix}", "pais", "Colombia"))
        usuario = uow.usuarios.create(email.lower(), "Eva", role_id)
        uow.commit()
    with pytest.raises(ConflictError), AppPostgresUnitOfWork(factory, None) as uow:
        uow.usuarios.create(email.lower(), "Otra", role_id)
    with AppPostgresUnitOfWork(factory, _principal(email)) as uow:
        acceso = uow.usuarios.find_access_by_email(email)
        assert acceso.usuario.id == usuario.id and acceso.pais == "Colombia"
        updated = uow.usuarios.update(usuario.id, {"activo": False, "rol_id": "global"})
        assert (updated.activo, updated.rol_id) == (False, "global")
        assert updated.updated_at >= usuario.updated_at
        uow.commit()
    with AppPostgresUnitOfWork(factory, None) as uow:
        assert uow.roles.delete(role_id) is True
        assert uow.usuarios.delete(usuario.id).email == email.lower()
        assert uow.usuarios.get(usuario.id) is None
        uow.commit()


def test_role_in_use_cannot_be_deleted(factory):
    suffix = uuid4().hex[:8]
    with AppPostgresUnitOfWork(factory, None) as uow:
        uow.roles.upsert(Rol(f"r_{suffix}", "R", "global", None))
        uow.usuarios.create(f"u{suffix}@olo.com", "", f"r_{suffix}")
        uow.commit()
    with pytest.raises(ConflictError), AppPostgresUnitOfWork(factory, None) as uow:
        uow.roles.delete(f"r_{suffix}")


def test_kv_upsert_lock_and_jsonb_roundtrip(factory):
    key = f"2099-{uuid4().hex[:2]}"
    month = {"activos": [{"nombre": "Ana", "pais": "Costa Rica"}], "params": {"prom_colab": 3.5}}
    with AppPostgresUnitOfWork(factory, None) as uow:
        assert uow.indicadores.upsert_many([RegistroIndicador(key, month)]) == 1
        uow.commit()
    with AppPostgresUnitOfWork(factory, None) as uow:
        locked = uow.indicadores.lock_many([key, "no-existe"])
        assert list(locked) == [key] and locked[key].value == month
        uow.indicadores.upsert_many([RegistroIndicador(key, {"activos": []})])
        uow.commit()
    with AppPostgresUnitOfWork(factory, None) as uow:
        stored = {r.key: r for r in uow.indicadores.list_all()}
        assert stored[key].value == {"activos": []}
        assert stored[key].to_dict() == {"key": key, "value": {"activos": []}}
        with uow.connection.cursor() as cursor:
            cursor.execute("DELETE FROM tbl_olo_indicadores_kv WHERE key = %s", (key,))
        uow.commit()
