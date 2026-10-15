import pytest

from application.dto.principal import Principal
from application.use_cases.usuarios import (
    CreateUsuarioUseCase,
    DeleteRoleUseCase,
    DeleteUsuarioUseCase,
    ListRolesUseCase,
    ListUsuariosUseCase,
    SaveRoleUseCase,
    UpdateUsuarioUseCase,
)
from domain.entities.acceso import Rol
from domain.exceptions import (
    BusinessRuleViolation,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from fakes.fake_app_unit_of_work import FakeAppUnitOfWork, FakeIdentityDirectory

PASSWORD = "Segura#2026ok"
EVA = {"email": "eva@olo.com", "rol_id": "global", "password": PASSWORD}


def _p(email):
    return Principal(subject=email, email=email)


def _setup():
    uow = FakeAppUnitOfWork()
    uow.usuarios.add("admin@olo.com", "admin")
    uow.usuarios.add("global@olo.com", "global")
    uow.usuarios.add("cr@olo.com", "costa_rica")
    return uow, FakeIdentityDirectory()


def test_only_admin_or_global_manage_users_and_roles():
    uow, _ = _setup()
    assert [r.nombre for r in ListRolesUseCase(uow.factory).execute(_p("admin@olo.com"))] == [
        "Administrador", "Costa Rica", "Global", "Venezuela"]
    assert len(ListUsuariosUseCase(uow.factory).execute(_p("global@olo.com"))) == 3
    with pytest.raises(ForbiddenError):
        ListUsuariosUseCase(uow.factory).execute(_p("cr@olo.com"))
    with pytest.raises(ForbiddenError):
        ListRolesUseCase(uow.factory).execute(_p("desconocido@olo.com"))


def test_list_users_keeps_original_columns():
    uow, _ = _setup()
    user = ListUsuariosUseCase(uow.factory).execute(_p("admin@olo.com"))[0]
    assert set(user.to_dict()) == {"id", "email", "nombre", "rol_id", "activo", "created_at"}


def test_create_user_registers_profile_and_cognito_identity():
    uow, directory = _setup()
    create = CreateUsuarioUseCase(uow.factory, directory)
    usuario = create.execute(_p("admin@olo.com"), {"email": " Eva@OLO.com ", "nombre": "Eva",
                                                    "rol_id": "venezuela", "password": PASSWORD})
    assert usuario.email == "eva@olo.com" and usuario.activo
    assert directory.users["eva@olo.com"] == {"password": PASSWORD, "nombre": "Eva", "enabled": True}
    with pytest.raises(ConflictError):
        create.execute(_p("admin@olo.com"), EVA)


def test_create_user_validations():
    uow, directory = _setup()
    create = CreateUsuarioUseCase(uow.factory, directory)
    for body in (
        {"email": "x@olo.com", "rol_id": "global", "password": "corta"},
        {"email": "no-es-correo", "rol_id": "global", "password": PASSWORD},
        {"email": "x@olo.com", "rol_id": "inexistente", "password": PASSWORD},
    ):
        with pytest.raises(ValidationError):
            create.execute(_p("admin@olo.com"), body)
    assert directory.users == {}


def test_update_user_whitelist_and_not_found():
    uow, _ = _setup()
    target = uow.usuarios.add("eva@olo.com", "global")
    update = UpdateUsuarioUseCase(uow.factory)
    updated = update.execute(_p("global@olo.com"), str(target.id), {"rol_id": "venezuela", "activo": False})
    assert (updated.rol_id, updated.activo) == ("venezuela", False)
    with pytest.raises(ValidationError):
        update.execute(_p("global@olo.com"), str(target.id), {"pass_hash": "x"})
    with pytest.raises(ValidationError):
        update.execute(_p("global@olo.com"), str(target.id), {"activo": "si"})
    with pytest.raises(ValidationError):
        update.execute(_p("global@olo.com"), "no-uuid", {"activo": True})
    with pytest.raises(NotFoundError):
        update.execute(_p("global@olo.com"), "00000000-0000-0000-0000-000000000000", {"activo": True})


def test_delete_user_disables_cognito_identity():
    uow, directory = _setup()
    create = CreateUsuarioUseCase(uow.factory, directory)
    eva = create.execute(_p("admin@olo.com"), EVA)
    DeleteUsuarioUseCase(uow.factory, directory).execute(_p("admin@olo.com"), str(eva.id))
    assert uow.usuarios.get(eva.id) is None
    assert directory.users["eva@olo.com"]["enabled"] is False
    with pytest.raises(NotFoundError):
        DeleteUsuarioUseCase(uow.factory, directory).execute(_p("admin@olo.com"), str(eva.id))


def test_roles_crud_rules():
    uow, _ = _setup()
    save = SaveRoleUseCase(uow.factory)
    rol = save.execute(_p("admin@olo.com"), "el_salvador", {"nombre": "El Salvador", "scope": "pais",
                                                             "pais": "El Salvador"})
    assert rol == Rol("el_salvador", "El Salvador", "pais", "El Salvador")
    assert save.execute(_p("admin@olo.com"), "auditoria", {"nombre": "Auditoría", "scope": "global",
                                                           "pais": "x"}).pais is None
    with pytest.raises(ValidationError, match="Indicá el país"):
        save.execute(_p("admin@olo.com"), "colombia", {"nombre": "Colombia", "scope": "pais"})
    with pytest.raises(ValidationError):
        save.execute(_p("admin@olo.com"), "Mal Id", {"nombre": "X", "scope": "global"})
    delete = DeleteRoleUseCase(uow.factory)
    delete.execute(_p("admin@olo.com"), "el_salvador")
    with pytest.raises(NotFoundError):
        delete.execute(_p("admin@olo.com"), "el_salvador")
    with pytest.raises(BusinessRuleViolation):
        delete.execute(_p("admin@olo.com"), "costa_rica")
    uow.roles.upsert(Rol("colombia", "Colombia", "pais", "Colombia"))
    uow.usuarios.add("co@olo.com", "colombia")
    with pytest.raises(ConflictError):
        delete.execute(_p("admin@olo.com"), "colombia")


def test_role_slug_matches_front():
    assert Rol.slug("El Salvador") == "el_salvador"
    assert Rol.slug(" Perú / Norte ") == "peru_norte"
