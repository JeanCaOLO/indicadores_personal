"""Registros clave/valor del tablero (antes olo_indicadores_kv).

Claves que usa la app: ``__cfg`` (configuración: metas, líderes, sysUrl, kpiOff, satisfacción) y
``YYYY-MM`` (datos del mes: activos, egresos, ausencias, áreas, capacitación, extras, vacaciones, merma,
terceros y params). Las listas de personas llevan el campo ``pais``.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from domain.exceptions import ValidationError

CONFIG_KEY = "__cfg"
PERSON_FIELDS = (
    "activos", "egresos", "ausencias", "capacitacion", "extras", "vacaciones", "merma", "terceros"
)
MAX_KEY_LENGTH = 100
_MONTH_KEY_RE = re.compile(r"^\d{4}-\d{2}$")


def is_month_key(key: str) -> bool:
    return bool(_MONTH_KEY_RE.match(key))


def _pais_of(row: Any) -> str:
    return str((row.get("pais") if isinstance(row, dict) else None) or "")


@dataclass(frozen=True)
class RegistroIndicador:
    key: str
    value: Any
    updated_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        """Misma forma que ``select("key,value")``."""
        return {"key": self.key, "value": self.value}

    def visible_for(self, pais: str | None) -> RegistroIndicador:
        """Usuario de un país: solo ve los registros de personas de su país (``pais=None`` → todo)."""
        if pais is None or not is_month_key(self.key) or not isinstance(self.value, dict):
            return self
        value = dict(self.value)
        for field in PERSON_FIELDS:
            rows = value.get(field)
            if isinstance(rows, list):
                value[field] = [row for row in rows if _pais_of(row) == pais]
        return RegistroIndicador(self.key, value, self.updated_at)


def parse_registros(body: Any) -> list[RegistroIndicador]:
    """Valida el cuerpo de PUT /indicadores/registros: ``[{key, value}, ...]`` con claves únicas."""
    items = body.get("rows") if isinstance(body, dict) else body
    if not isinstance(items, list):
        raise ValidationError("Se esperaba una lista de registros {key, value}.")
    seen: set[str] = set()
    out: list[RegistroIndicador] = []
    for index, item in enumerate(items):
        if not isinstance(item, dict) or "value" not in item:
            raise ValidationError("Cada registro debe tener key y value.", details={"index": index})
        key = str(item.get("key") or "").strip()
        if not key or len(key) > MAX_KEY_LENGTH:
            raise ValidationError("Clave de registro inválida.", details={"index": index})
        if key in seen:
            raise ValidationError("Clave de registro repetida.", details={"key": key})
        seen.add(key)
        out.append(RegistroIndicador(key, item["value"]))
    return out


def merge_for_country(cloud: Any, local: Any, pais: str) -> Any:
    """Fusiona un mes local con el guardado conservando los registros de OTROS países.

    Port exacto de ``OLOSync.mergeMonth``: base = versión guardada; en cada lista de personas quedan
    los registros ajenos guardados + los propios enviados; ``params`` del mes se toma del envío.
    """
    if not isinstance(local, dict):
        raise ValidationError("El mes debe ser un objeto.", details={"field": "value"})
    if not isinstance(cloud, dict):
        return local
    out = copy.deepcopy(cloud)
    for field in PERSON_FIELDS:
        loc = local.get(field) if isinstance(local.get(field), list) else []
        stored = cloud.get(field) if isinstance(cloud.get(field), list) else []
        out[field] = [r for r in stored if _pais_of(r) != pais] + [r for r in loc if _pais_of(r) == pais]
    if local.get("params"):
        out["params"] = local["params"]
    return out


def rows_for_country(enviados: list[RegistroIndicador]) -> list[RegistroIndicador]:
    """Un usuario de país solo sube ``__cfg`` y meses (igual que el original)."""
    return [r for r in enviados if r.key == CONFIG_KEY or is_month_key(r.key)]
