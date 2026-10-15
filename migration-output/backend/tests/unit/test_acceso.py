import pytest

from application.dto.principal import Principal
from application.use_cases.acceso import GetCurrentAccessUseCase
from domain.exceptions import ForbiddenError, UnauthorizedError
from fakes.fake_app_unit_of_work import FakeAppUnitOfWork


def _principal(email):
    return Principal(subject=f"sub-{email}", email=email)


def test_me_returns_session_with_original_shape():
    uow = FakeAppUnitOfWork()
    usuario = uow.usuarios.add("ana@olo.com", "costa_rica", nombre="Ana")
    session = GetCurrentAccessUseCase(uow.factory).execute(_principal("ANA@olo.com"))
    assert session == {
        "id": usuario.id,
        "email": "ana@olo.com",
        "nombre": "Ana",
        "rol": {"id": "costa_rica", "nombre": "Costa Rica", "scope": "pais", "pais": "Costa Rica"},
    }


def test_me_rejects_unknown_and_inactive_users_with_login_message():
    uow = FakeAppUnitOfWork()
    uow.usuarios.add("baja@olo.com", "global", activo=False)
    me = GetCurrentAccessUseCase(uow.factory)
    for email in ("nadie@olo.com", "baja@olo.com"):
        with pytest.raises(ForbiddenError, match="Usuario o contraseña incorrectos"):
            me.execute(_principal(email))
    with pytest.raises(UnauthorizedError):
        me.execute(Principal(subject="sin-email"))
