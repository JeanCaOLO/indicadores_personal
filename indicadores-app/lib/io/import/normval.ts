// lib/io/import/normval.ts
//
// Normalización de valores del importador. Portado LÍNEA POR LÍNEA desde
// out/index.html (fuente de verdad). La PARIDAD EXACTA de estas regex y ramas
// es crítica para que el import mapee igual que el sistema actual: se copian
// sin cambios de lógica.
//
// Exporta:
//   - NA(s)              → normaliza un encabezado a snake_case sin acentos
//   - toISODate(v)       → fecha (Date / serial Excel / string) a ISO YYYY-MM-DD
//   - eduCarrera(s)      → extrae/canoniza la carrera de un texto de educación
//   - normVal(field,v,kind) → normaliza el valor de un campo según su tipo
//   - DEPTCODE, PAISES   → constantes usadas por normVal
//
// `titleCase` NO se duplica: se reutiliza el ya portado en core/format.ts.
//
// Módulo puro (sin DOM).

import { titleCase } from "../../../core/format";

// ---------------------------------------------------------------------------
// Constantes
// Portadas de out/index.html:
//   const DEPTCODE={dlog:"Logística",dcoex:"Comercio Exterior",dper:"Personal",dsist:"Sistemas",dope:"Operaciones",dcon:"Control",dvent:"Ventas",dimc:"IMC"};
//   const PAISES=["Venezuela","Costa Rica","El Salvador","Guatemala","Colombia"];
// ---------------------------------------------------------------------------
export const DEPTCODE: Record<string, string> = {
  dlog: "Logística",
  dcoex: "Comercio Exterior",
  dper: "Personal",
  dsist: "Sistemas",
  dope: "Operaciones",
  dcon: "Control",
  dvent: "Ventas",
  dimc: "IMC",
};

export const PAISES: string[] = ["Venezuela", "Costa Rica", "El Salvador", "Guatemala", "Colombia"];

// ---------------------------------------------------------------------------
// NA — normaliza un encabezado a snake_case sin acentos.
// Portado de:
//   const NA=s=>String(s==null?"":s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
// ---------------------------------------------------------------------------
export function NA(s: unknown): string {
  return String(s == null ? "" : s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// ---------------------------------------------------------------------------
// toISODate — fecha a ISO (YYYY-MM-DD).
// Portado de out/index.html:
//   function toISODate(v){
//     if(v==null||v==="")return "";
//     if(v instanceof Date&&!isNaN(v)){return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,"0")}-${String(v.getDate()).padStart(2,"0")}`;}
//     if(typeof v==="number"&&isFinite(v)){const dt=new Date(Math.round((v-25569)*86400000));if(!isNaN(dt))return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")}`;}
//     const s=String(v).trim();
//     let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
//     m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);if(m){let y=m[3];if(y.length===2)y="20"+y;return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;}
//     const dt=new Date(s);if(!isNaN(dt))return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
//     return s.slice(0,10);
//   }
// ---------------------------------------------------------------------------
export function toISODate(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number" && isFinite(v)) {
    const dt = new Date(Math.round((v - 25569) * 86400000));
    if (!isNaN(dt.getTime())) return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = "20" + y;
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return s.slice(0, 10);
}

// ---------------------------------------------------------------------------
// eduCarrera — extrae/canoniza la carrera a partir de un texto de educación.
// Portado de out/index.html:
//   function eduCarrera(s){s=String(s==null?"":s).trim();if(!s)return "";
//     const bare=s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
//     if(/ningun|sin estudio|no aplica|no indica|desconoc|^n\/?a$|^-+$|analfab|sin escolar/.test(bare))return "";
//     let base="";const m=s.match(/\ben\s+(.+)/i);
//     if(m)base=m[1];
//     else if(/^(ingenier|administra|...|criminolog)/.test(bare))base=s;
//     else return "";
//     base=base.replace(/\s+de\s+.*/i,"").replace(/\s+y\s+.*/i,"").trim();
//     const bb=base.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
//     if(!bb||/educacion media|...|bachillerato general/.test(bb))return "";
//     return titleCase(base);}
// ---------------------------------------------------------------------------
export function eduCarrera(s: unknown): string {
  const str = String(s == null ? "" : s).trim();
  if (!str) return "";
  const bare = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/ningun|sin estudio|no aplica|no indica|desconoc|^n\/?a$|^-+$|analfab|sin escolar/.test(bare)) return "";
  let base = "";
  const m = str.match(/\ben\s+(.+)/i);
  if (m) base = m[1];
  else if (/^(ingenier|administra|contadur|contabil|derecho|juridic|psicolog|pedagog|docenc|medic|enfermer|farmac|veterinar|nutric|arquitect|econom|finanz|mercad|informatic|computac|sistemas|software|electron|electric|mecatron|mecanic|industrial|civil|telecom|comunicac|periodism|publicid|dise|biolog|quimic|fisic|matematic|sociolog|antropolog|filosof|historia|linguist|idioma|traduc|teolog|turism|hoteler|gastronom|agronom|logistic|aduan|criminolog)/.test(bare)) base = str;
  else return "";
  base = base.replace(/\s+de\s+.*/i, "").replace(/\s+y\s+.*/i, "").trim();
  const bb = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!bb || /educacion media|educacion basica|educacion diversificada|ensenanza media|educacion general|primari|secundari|^media$|colegio|escolar|bachillerato general/.test(bb)) return "";
  return titleCase(base);
}

// ---------------------------------------------------------------------------
// normVal — normaliza el valor de un campo según su tipo (y `kind` opcional,
// p.ej. "ausencias" para el campo "tipo").
// Portado LÍNEA POR LÍNEA de out/index.html (ver comentarios por rama).
// ---------------------------------------------------------------------------
export function normVal(field: string, v: unknown, kind?: string): string {
  let val: string;
  if (v instanceof Date) {
    val = isNaN(v.getTime()) ? "" : new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  } else {
    val = v as string;
  }
  val = String(val == null ? "" : val).trim();
  if (!val) return "";
  if (/^#\s*(n\/?a|ref|value|div\/?0|name|num|null|error|¡)/i.test(val)) return "";

  if (field === "id") {
    let x = val.replace(/\s+/g, "").replace(/[.\u00A0]/g, "").trim();
    if (/^\d+([.,]\d+)?[eE][+\-]?\d+$/.test(val.replace(/\s/g, ""))) {
      const n = Number(val.replace(/\s/g, "").replace(",", "."));
      if (!isNaN(n)) x = n.toLocaleString("fullwide", { useGrouping: false });
    }
    return x;
  }
  if (field === "sexo") {
    const x = val.toLowerCase();
    if (x === "m" || x.startsWith("masc") || x.startsWith("hom")) return "Masculino";
    if (x === "f" || x.startsWith("fem") || x.startsWith("muj")) return "Femenino";
    return val;
  }
  if (field === "carrera") return eduCarrera(val);
  if (field === "movimiento") {
    const x = val.toLowerCase();
    if (/promoc/.test(x)) return "Promoción";
    if (/ascens/.test(x)) return "Ascenso";
    if (/sin ?cambio|ninguno|estable|n\/?a/.test(x)) return "Sin cambio";
    return titleCase(val);
  }
  if (field === "motivo") {
    const x = val.toLowerCase();
    if (x.includes("renuncia")) return "Renuncia";
    if (x.includes("despido")) return "Despido";
    if (x.includes("final") || x.includes("vencim") || x.includes("determinado")) return "Finalización";
    if (x.includes("jubila") || x.includes("pension")) return "Jubilación";
    if (x.includes("mutuo") || x.includes("acuerdo")) return "Mutuo acuerdo";
    return val.charAt(0).toUpperCase() + val.slice(1);
  }
  if (field === "pais") {
    const c = NA(val);
    const hit = PAISES.find((p) => NA(p) === c);
    return hit || titleCase(val);
  }
  if (field === "nombre" || field === "area") return titleCase(val);
  if (field === "departamento") {
    const c = NA(val);
    if (DEPTCODE[c]) return DEPTCODE[c];
    return titleCase(val);
  }
  if (field === "movilidad") {
    const u = val.toUpperCase().replace(/[-·_.]/g, " ").replace(/\s+/g, " ").trim();
    if (u === "NN" || u === "M7 NN" || u === "M7NN") return "M7 NN";
    const m = u.replace(/\s/g, "").match(/M?([1-7])/);
    return m ? "M" + m[1] : val;
  }
  if (field === "nivel_educativo") {
    const x = String(val).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (!x || /ningun|sin estudio|no aplica|no indica|desconoc|^n\/?a$|^-+$|analfab|sin escolar/.test(x)) return "";
    const CAR = /odontolog|medic|enfermer|farmac|veterinar|nutric|fisioterap|\bterapia\b|obstetr|radiolog|biolog|microbiolog|bioquim|quimic|\bfisica\b|matematic|actuar|estadistic|comunicac|periodism|publicid|mercadot|mercadeo|disen|arquitect|urbanism|abogac|derecho|juridic|notari|contadur|contabil|auditor|administrac|gerenci|\beconom|finanz|\bbanca\b|negoci|comerci|turism|hoteler|gastronom|culinari|agronom|agricol|zootec|forestal|ambient|geolog|geograf|sociolog|trabajo social|antropolog|filosof|historia|\bletras\b|linguist|idioma|traduc|teolog|psicolog|pedagog|docenc|informatic|computac|\bsistemas\b|software|telematic|electron|electric|mecatron|mecanic|industrial|\bcivil\b|telecom|politic|internacional|relacion|logistic|aduan|criminolog|salud ocupacional|recursos humanos|ingenier/;
    if (/postgrado|posgrado|maestria|master|\bmba\b|doctorad|\bphd\b|especializac|especialidad|posdoc/.test(x)) return "Posgrado";
    if (/licenciatura|licenciad|bachiller universitari|\bprofesional\b/.test(x)) return "Universitario";
    if (/bachiller|bachillerato/.test(x)) {
      if (/educacion media|ensenanza media|\bmedia\b|\bcolegio\b|secundari|escolar/.test(x)) return "Secundaria";
      if (/universitari/.test(x) || CAR.test(x)) return "Universitario";
      return "Secundaria";
    }
    if (/tecnic|diplomad|parauniversit|tecnolog(?!ia de la informacion)/.test(x)) return "Técnico";
    if (/universi/.test(x)) return "Universitario";
    if (/secundari|\bcolegio\b|ensenanza media|educacion media/.test(x)) return "Secundaria";
    if (/primaria|\bescuela\b|educacion basica|basica/.test(x)) return "Primaria";
    if (CAR.test(x)) return "Universitario";
    return "Universitario";
  }
  if (field === "recomienda") {
    const x = val.toLowerCase();
    if (/^s|^si|^sí|^y|recom/.test(x) && !/no recom|^n/.test(x)) return "Sí";
    if (/^n/.test(x)) return "No";
    return "";
  }
  if (field === "tipo") {
    const x = val.toLowerCase();
    if (kind === "ausencias") {
      if (/ccss|caja/.test(x)) return "CCSS";
      if (/\bins\b|seguros/.test(x)) return "INS";
      if (/matern/.test(x)) return "Maternidad";
      if (/patern/.test(x)) return "Paternidad";
      return val;
    }
    if (x.indexOf("indetermin") >= 0 || x.indexOf("permanen") >= 0 || x.indexOf("fijo") >= 0) return "Indeterminado";
    if (x.indexOf("determin") >= 0 || x.indexOf("temporal") >= 0 || x.indexOf("plazo") >= 0) return "Determinado";
    return "Indeterminado";
  }
  if (field === "paso") {
    const m = val.match(/(\d+)/);
    return m ? m[1] : val;
  }
  if (field.indexOf("fecha") === 0) {
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
    const s = val.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (s) {
      const yy = s[3].length === 2 ? "20" + s[3] : s[3];
      return `${yy}-${String(s[2]).padStart(2, "0")}-${String(s[1]).padStart(2, "0")}`;
    }
    const n = +val;
    if (!isNaN(n) && n > 20000 && n < 80000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + n * 864e5);
      return dt.toISOString().slice(0, 10);
    }
    const dd = new Date(val);
    if (!isNaN(dd.getTime())) return dd.toISOString().slice(0, 10);
    return val;
  }
  return val;
}
