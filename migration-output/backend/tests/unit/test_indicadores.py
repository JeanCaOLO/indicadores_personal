import pytest

from application.dto.principal import Principal
from application.use_cases.indicadores import ListIndicadoresRegistrosUseCase, SaveIndicadoresRegistrosUseCase
from domain.entities.indicadores import merge_for_country
from domain.exceptions import ForbiddenError, ValidationError
from fakes.fake_app_unit_of_work import FakeAppUnitOfWork

CR, VE = "Costa Rica", "Venezuela"


def _month(*rows, params=None):
    return {"activos": list(rows), "egresos": [], "params": params or {"prom_colab": 10}}


def _setup():
    uow = FakeAppUnitOfWork()
    uow.usuarios.add("global@olo.com", "global")
    uow.usuarios.add("cr@olo.com", "costa_rica")
    uow.usuarios.add("admin@olo.com", "admin")
    uow.indicadores.rows = {
        "__cfg": {"metas": {}, "leaders": []},
        "2026-07": _month({"nombre": "Ana", "pais": CR}, {"nombre": "Luis", "pais": VE}),
    }
    return uow


def _p(email):
    return Principal(subject=email, email=email)


def test_global_reads_everything_with_key_value_shape():
    uow = _setup()
    rows = ListIndicadoresRegistrosUseCase(uow.factory).execute(_p("global@olo.com"))
    assert [r["key"] for r in rows] == ["2026-07", "__cfg"]
    assert set(rows[0]) == {"key", "value"}
    assert len(rows[0]["value"]["activos"]) == 2


def test_country_user_only_reads_people_of_its_country():
    uow = _setup()
    rows = ListIndicadoresRegistrosUseCase(uow.factory).execute(_p("cr@olo.com"))
    month = next(r for r in rows if r["key"] == "2026-07")
    assert month["value"]["activos"] == [{"nombre": "Ana", "pais": CR}]
    assert month["value"]["params"] == {"prom_colab": 10}


def test_admin_scope_has_no_data_access():
    uow = _setup()
    with pytest.raises(ForbiddenError):
        ListIndicadoresRegistrosUseCase(uow.factory).execute(_p("admin@olo.com"))
    with pytest.raises(ForbiddenError):
        SaveIndicadoresRegistrosUseCase(uow.factory).execute(_p("admin@olo.com"), [])


def test_global_push_replaces_documents_as_sent():
    uow = _setup()
    body = [{"key": "2026-07", "value": _month({"nombre": "Eva", "pais": VE})}, {"key": "otro", "value": 1}]
    assert SaveIndicadoresRegistrosUseCase(uow.factory).execute(_p("global@olo.com"), body) == {"count": 2}
    assert uow.indicadores.rows["2026-07"]["activos"] == [{"nombre": "Eva", "pais": VE}]
    assert uow.indicadores.rows["otro"] == 1
    assert uow.commits == 1


def test_country_push_keeps_other_countries_and_drops_non_month_keys():
    uow = _setup()
    body = {
        "rows": [
            {"key": "2026-07", "value": _month({"nombre": "Ana R.", "pais": CR}, params={"prom_colab": 12})},
            {"key": "2026-08", "value": _month({"nombre": "Nuevo", "pais": CR})},
            {"key": "__cfg", "value": {"metas": {"rot_total": [0.02, 0.05]}}},
            {"key": "basura", "value": {"x": 1}},
        ]
    }
    result = SaveIndicadoresRegistrosUseCase(uow.factory).execute(_p("cr@olo.com"), body)
    assert result == {"count": 3}
    july = uow.indicadores.rows["2026-07"]
    assert july["activos"] == [{"nombre": "Luis", "pais": VE}, {"nombre": "Ana R.", "pais": CR}]
    assert july["params"] == {"prom_colab": 12}
    assert uow.indicadores.rows["2026-08"]["activos"] == [{"nombre": "Nuevo", "pais": CR}]
    assert uow.indicadores.rows["__cfg"] == {"metas": {"rot_total": [0.02, 0.05]}}
    assert "basura" not in uow.indicadores.rows
    assert uow.indicadores.locked == [["2026-07", "2026-08"]]


def test_merge_matches_original_merge_month():
    cloud = {"activos": [{"pais": VE}, {"pais": CR, "n": 1}], "egresos": [{"pais": VE}], "params": {"a": 1}}
    local = {"activos": [{"pais": CR, "n": 2}, {"pais": VE, "n": 9}], "params": {}}
    merged = merge_for_country(cloud, local, CR)
    assert merged["activos"] == [{"pais": VE}, {"pais": CR, "n": 2}]
    assert merged["egresos"] == [{"pais": VE}]
    assert merged["params"] == {"a": 1}
    assert merge_for_country(None, local, CR) is local


def test_push_validation():
    uow = _setup()
    save = SaveIndicadoresRegistrosUseCase(uow.factory)
    with pytest.raises(ValidationError):
        save.execute(_p("global@olo.com"), {"rows": "x"})
    with pytest.raises(ValidationError):
        save.execute(_p("global@olo.com"), [{"key": "a", "value": 1}, {"key": "a", "value": 2}])
    with pytest.raises(ValidationError):
        save.execute(_p("cr@olo.com"), [{"key": "2026-07", "value": None}])
    assert save.execute(_p("global@olo.com"), []) == {"count": 0}
