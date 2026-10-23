// supabase/types.ts
//
// Tipos del esquema normalizado de Supabase para tipar la capa de datos.
//
// ⚠️ ESCRITOS A MANO — NO generados con `supabase gen types typescript`.
// El generador de la CLI requiere una conexión a la base con el esquema YA
// aplicado. Las migraciones 010/011/012 están escritas pero todavía no se han
// ejecutado contra una base, por lo que `gen types` no es posible aún.
//
// Estos tipos se derivaron EXACTAMENTE del DDL de:
//   - supabase/migrations/010_schema.sql   (catálogos, datos, parámetros, config)
//   - supabase/migrations/012_profiles_auth.sql (roles, perfiles, ind_user_scope)
//
// Son equivalentes a lo que produciría `supabase gen types typescript`:
// un tipo `Database` con `public.Tables.<tabla>.{ Row, Insert, Update }` y
// `public.Functions`. Cuando el esquema se aplique a la base, este archivo
// puede regenerarse con la CLI; MIENTRAS TANTO, DEBE MANTENERSE SINCRONIZADO
// A MANO con las migraciones anteriores.
//
// Mapeo SQL → TS usado (siguiendo la convención de supabase-js):
//   text                      → string        (| null si la columna es nullable)
//   numeric                   → number        (| null si es nullable)
//   date                      → string        (ISO 'YYYY-MM-DD'; | null si nullable)
//   timestamptz               → string        (ISO; | null si nullable)
//   boolean                   → boolean
//   int / int4                → number
//   bigint (int8) identity    → number        (ids pequeños; supabase-js los trae como number)
//   uuid                      → string
//   jsonb (ind_parametros_mes.params) → ParametrosMes  (tipo del dominio del motor)
//
// Nullabilidad: una columna es `| null` SOLO si el DDL NO la marca `not null`
// y NO es PK. Las columnas con `default` siguen siendo del tipo base en `Row`
// (la base siempre devuelve un valor), pero son OPCIONALES en `Insert`.
//
// Insert: se omiten/hacen opcionales las columnas con `default` (incluidas las
// `bigint generated always as identity`, que NO se insertan) y `created_at`.

import type { ParametrosMes } from "../core/types";

/** Tipo JSON genérico (compatible con la forma que emite `supabase gen types`). */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      // ===================== Catálogos (010) =====================
      ind_paises: {
        Row: {
          nombre: string; // text primary key
        };
        Insert: {
          nombre: string;
        };
        Update: {
          nombre?: string;
        };
      };
      ind_meses: {
        Row: {
          mes: string; // text primary key, check 'YYYY-MM'
        };
        Insert: {
          mes: string;
        };
        Update: {
          mes?: string;
        };
      };

      // ============ Snapshot mensual de colaboradores (010) ============
      ind_colaboradores: {
        Row: {
          cedula: string; // not null (PK)
          mes: string; // not null (PK, FK)
          pais: string; // not null (PK, FK)
          nombre: string | null;
          departamento: string | null;
          area: string | null;
          sexo: string | null;
          fecha_nacimiento: string | null; // date
          fecha_ingreso: string | null; // date
          nivel: string | null;
          nivel_educativo: string | null;
          carrera: string | null;
          movilidad: string | null;
          movimiento: string | null;
          tipo: string | null;
          paso: string | null;
          vac_disfrutadas: number; // numeric default 0
          vac_pendientes: number; // numeric default 0
        };
        Insert: {
          cedula: string;
          mes: string;
          pais: string;
          nombre?: string | null;
          departamento?: string | null;
          area?: string | null;
          sexo?: string | null;
          fecha_nacimiento?: string | null;
          fecha_ingreso?: string | null;
          nivel?: string | null;
          nivel_educativo?: string | null;
          carrera?: string | null;
          movilidad?: string | null;
          movimiento?: string | null;
          tipo?: string | null;
          paso?: string | null;
          vac_disfrutadas?: number; // default 0
          vac_pendientes?: number; // default 0
        };
        Update: {
          cedula?: string;
          mes?: string;
          pais?: string;
          nombre?: string | null;
          departamento?: string | null;
          area?: string | null;
          sexo?: string | null;
          fecha_nacimiento?: string | null;
          fecha_ingreso?: string | null;
          nivel?: string | null;
          nivel_educativo?: string | null;
          carrera?: string | null;
          movilidad?: string | null;
          movimiento?: string | null;
          tipo?: string | null;
          paso?: string | null;
          vac_disfrutadas?: number;
          vac_pendientes?: number;
        };
      };

      // ===================== Egresos (010) =====================
      ind_egresos: {
        Row: {
          id: number; // bigint identity (PK)
          cedula: string | null;
          mes: string; // not null (FK)
          pais: string; // not null (FK)
          nombre: string | null;
          departamento: string | null;
          motivo: string | null;
          fecha_ingreso: string | null; // date
          fecha_salida: string | null; // date
          movilidad: string | null;
          recomienda: string | null;
        };
        Insert: {
          id?: number; // identity: no se inserta
          cedula?: string | null;
          mes: string;
          pais: string;
          nombre?: string | null;
          departamento?: string | null;
          motivo?: string | null;
          fecha_ingreso?: string | null;
          fecha_salida?: string | null;
          movilidad?: string | null;
          recomienda?: string | null;
        };
        Update: {
          id?: number;
          cedula?: string | null;
          mes?: string;
          pais?: string;
          nombre?: string | null;
          departamento?: string | null;
          motivo?: string | null;
          fecha_ingreso?: string | null;
          fecha_salida?: string | null;
          movilidad?: string | null;
          recomienda?: string | null;
        };
      };

      // ===================== Ausencias (010) =====================
      ind_ausencias: {
        Row: {
          id: number; // bigint identity (PK)
          cedula: string | null;
          mes: string; // not null (FK)
          pais: string; // not null (FK)
          nombre: string | null;
          departamento: string | null;
          tipo: string | null;
          dias: number; // numeric default 0
        };
        Insert: {
          id?: number;
          cedula?: string | null;
          mes: string;
          pais: string;
          nombre?: string | null;
          departamento?: string | null;
          tipo?: string | null;
          dias?: number; // default 0
        };
        Update: {
          id?: number;
          cedula?: string | null;
          mes?: string;
          pais?: string;
          nombre?: string | null;
          departamento?: string | null;
          tipo?: string | null;
          dias?: number;
        };
      };

      // ===================== Vacaciones (010) =====================
      ind_vacaciones: {
        Row: {
          id: number; // bigint identity (PK)
          cedula: string | null;
          mes: string; // not null (FK)
          pais: string; // not null (FK)
          nombre: string | null;
          departamento: string | null;
          area: string | null;
          dias: number; // numeric default 0
        };
        Insert: {
          id?: number;
          cedula?: string | null;
          mes: string;
          pais: string;
          nombre?: string | null;
          departamento?: string | null;
          area?: string | null;
          dias?: number; // default 0
        };
        Update: {
          id?: number;
          cedula?: string | null;
          mes?: string;
          pais?: string;
          nombre?: string | null;
          departamento?: string | null;
          area?: string | null;
          dias?: number;
        };
      };

      // ===================== Extras (010) =====================
      ind_extras: {
        Row: {
          id: number; // bigint identity (PK)
          cedula: string | null;
          mes: string; // not null (FK)
          pais: string; // not null (FK)
          nombre: string | null;
          departamento: string | null;
          area: string | null;
          horas: number; // numeric default 0
        };
        Insert: {
          id?: number;
          cedula?: string | null;
          mes: string;
          pais: string;
          nombre?: string | null;
          departamento?: string | null;
          area?: string | null;
          horas?: number; // default 0
        };
        Update: {
          id?: number;
          cedula?: string | null;
          mes?: string;
          pais?: string;
          nombre?: string | null;
          departamento?: string | null;
          area?: string | null;
          horas?: number;
        };
      };

      // ===================== Capacitación (010) =====================
      ind_capacitacion: {
        Row: {
          id: number; // bigint identity (PK)
          mes: string; // not null (FK)
          pais: string; // not null (FK)
          area_conocimiento: string | null;
          curso: string | null;
          horas: number; // numeric default 0
          participantes: number; // numeric default 0
        };
        Insert: {
          id?: number;
          mes: string;
          pais: string;
          area_conocimiento?: string | null;
          curso?: string | null;
          horas?: number; // default 0
          participantes?: number; // default 0
        };
        Update: {
          id?: number;
          mes?: string;
          pais?: string;
          area_conocimiento?: string | null;
          curso?: string | null;
          horas?: number;
          participantes?: number;
        };
      };

      // ===================== Merma (010) =====================
      ind_merma: {
        Row: {
          id: number; // bigint identity (PK)
          mes: string; // not null (FK)
          pais: string; // not null (FK)
          area: string | null;
          cantidad: number; // numeric default 0
        };
        Insert: {
          id?: number;
          mes: string;
          pais: string;
          area?: string | null;
          cantidad?: number; // default 0
        };
        Update: {
          id?: number;
          mes?: string;
          pais?: string;
          area?: string | null;
          cantidad?: number;
        };
      };

      // ===================== Terceros (010) =====================
      ind_terceros: {
        Row: {
          id: number; // bigint identity (PK)
          mes: string; // not null (FK)
          pais: string; // not null (FK)
          cantidad: number; // numeric default 0
        };
        Insert: {
          id?: number;
          mes: string;
          pais: string;
          cantidad?: number; // default 0
        };
        Update: {
          id?: number;
          mes?: string;
          pais?: string;
          cantidad?: number;
        };
      };

      // ===================== Áreas (010) — sin país =====================
      ind_areas: {
        Row: {
          id: number; // bigint identity (PK)
          mes: string; // not null (FK)
          grupo: string | null;
          area: string | null;
          colaboradores: number; // numeric default 0
        };
        Insert: {
          id?: number;
          mes: string;
          grupo?: string | null;
          area?: string | null;
          colaboradores?: number; // default 0
        };
        Update: {
          id?: number;
          mes?: string;
          grupo?: string | null;
          area?: string | null;
          colaboradores?: number;
        };
      };

      // ============ Parámetros por mes/país (010) ============
      ind_parametros_mes: {
        Row: {
          mes: string; // not null (PK, FK)
          pais: string; // not null (PK, FK)
          // jsonb not null default '{}'. Se tipa con el tipo del dominio que
          // compute() espera (ParametrosMes de ../core/types). Un '{}' vacío
          // es asignable porque todos los campos obligatorios de ParametrosMes
          // se garantizan en la capa de ensamblaje (normalizeParams).
          params: ParametrosMes;
        };
        Insert: {
          mes: string;
          pais: string;
          params?: ParametrosMes; // default '{}'::jsonb
        };
        Update: {
          mes?: string;
          pais?: string;
          params?: ParametrosMes;
        };
      };

      // ===================== Config global (010) =====================
      ind_config_metas: {
        Row: {
          kpi: string; // text primary key
          a: number | null; // numeric
          b: number | null; // numeric
        };
        Insert: {
          kpi: string;
          a?: number | null;
          b?: number | null;
        };
        Update: {
          kpi?: string;
          a?: number | null;
          b?: number | null;
        };
      };
      ind_config_leaders: {
        Row: {
          area: string; // text primary key
          lider: string | null;
          correo: string | null;
        };
        Insert: {
          area: string;
          lider?: string | null;
          correo?: string | null;
        };
        Update: {
          area?: string;
          lider?: string | null;
          correo?: string | null;
        };
      };
      ind_config_kpi_off: {
        Row: {
          kpi: string; // text primary key
        };
        Insert: {
          kpi: string;
        };
        Update: {
          kpi?: string;
        };
      };
      ind_config_satisfaccion: {
        Row: {
          anio: number; // int primary key
          valor: number | null; // numeric
        };
        Insert: {
          anio: number;
          valor?: number | null;
        };
        Update: {
          anio?: number;
          valor?: number | null;
        };
      };
      ind_config_kv: {
        Row: {
          key: string; // text primary key
          value: string | null;
        };
        Insert: {
          key: string;
          value?: string | null;
        };
        Update: {
          key?: string;
          value?: string | null;
        };
      };

      // ===================== Roles (012) =====================
      ind_roles: {
        Row: {
          id: string; // text primary key
          nombre: string; // not null
          scope: string; // not null default 'pais' (check global|pais|admin)
          pais: string | null; // FK ind_paises, nullable
          created_at: string; // timestamptz not null default now()
        };
        Insert: {
          id: string;
          nombre: string;
          scope?: string; // default 'pais'
          pais?: string | null;
          created_at?: string; // default now()
        };
        Update: {
          id?: string;
          nombre?: string;
          scope?: string;
          pais?: string | null;
          created_at?: string;
        };
      };

      // ===================== Perfiles (012) =====================
      ind_perfiles: {
        Row: {
          user_id: string; // uuid primary key (FK auth.users)
          email: string | null;
          nombre: string | null;
          rol_id: string; // not null (FK ind_roles)
          activo: boolean; // not null default true
          created_at: string; // timestamptz not null default now()
        };
        Insert: {
          user_id: string;
          email?: string | null;
          nombre?: string | null;
          rol_id: string;
          activo?: boolean; // default true
          created_at?: string; // default now()
        };
        Update: {
          user_id?: string;
          email?: string | null;
          nombre?: string | null;
          rol_id?: string;
          activo?: boolean;
          created_at?: string;
        };
      };
    };

    Views: {
      [key: string]: never;
    };

    Functions: {
      // public.ind_user_scope() returns table(scope text, pais text)
      ind_user_scope: {
        Args: Record<string, never>;
        Returns: {
          scope: string;
          pais: string | null;
        }[];
      };
    };

    Enums: {
      [key: string]: never;
    };

    CompositeTypes: {
      [key: string]: never;
    };
  };
}

// ===========================================================================
// Alias convenientes por fila (Row) e inserción (Insert).
// Permiten `IndColaboradorRow` en vez de la ruta larga indexada en Database.
// ===========================================================================
type PublicTables = Database["public"]["Tables"];

// Catálogos
export type IndPaisRow = PublicTables["ind_paises"]["Row"];
export type IndPaisInsert = PublicTables["ind_paises"]["Insert"];
export type IndMesRow = PublicTables["ind_meses"]["Row"];
export type IndMesInsert = PublicTables["ind_meses"]["Insert"];

// Datos
export type IndColaboradorRow = PublicTables["ind_colaboradores"]["Row"];
export type IndColaboradorInsert = PublicTables["ind_colaboradores"]["Insert"];
export type IndEgresoRow = PublicTables["ind_egresos"]["Row"];
export type IndEgresoInsert = PublicTables["ind_egresos"]["Insert"];
export type IndAusenciaRow = PublicTables["ind_ausencias"]["Row"];
export type IndAusenciaInsert = PublicTables["ind_ausencias"]["Insert"];
export type IndVacacionRow = PublicTables["ind_vacaciones"]["Row"];
export type IndVacacionInsert = PublicTables["ind_vacaciones"]["Insert"];
export type IndExtraRow = PublicTables["ind_extras"]["Row"];
export type IndExtraInsert = PublicTables["ind_extras"]["Insert"];
export type IndCapacitacionRow = PublicTables["ind_capacitacion"]["Row"];
export type IndCapacitacionInsert = PublicTables["ind_capacitacion"]["Insert"];
export type IndMermaRow = PublicTables["ind_merma"]["Row"];
export type IndMermaInsert = PublicTables["ind_merma"]["Insert"];
export type IndTerceroRow = PublicTables["ind_terceros"]["Row"];
export type IndTerceroInsert = PublicTables["ind_terceros"]["Insert"];
export type IndAreaRow = PublicTables["ind_areas"]["Row"];
export type IndAreaInsert = PublicTables["ind_areas"]["Insert"];

// Parámetros
export type IndParametrosMesRow = PublicTables["ind_parametros_mes"]["Row"];
export type IndParametrosMesInsert = PublicTables["ind_parametros_mes"]["Insert"];

// Config global
export type IndConfigMetasRow = PublicTables["ind_config_metas"]["Row"];
export type IndConfigMetasInsert = PublicTables["ind_config_metas"]["Insert"];
export type IndConfigLeadersRow = PublicTables["ind_config_leaders"]["Row"];
export type IndConfigLeadersInsert = PublicTables["ind_config_leaders"]["Insert"];
export type IndConfigKpiOffRow = PublicTables["ind_config_kpi_off"]["Row"];
export type IndConfigKpiOffInsert = PublicTables["ind_config_kpi_off"]["Insert"];
export type IndConfigSatisfaccionRow = PublicTables["ind_config_satisfaccion"]["Row"];
export type IndConfigSatisfaccionInsert = PublicTables["ind_config_satisfaccion"]["Insert"];
export type IndConfigKvRow = PublicTables["ind_config_kv"]["Row"];
export type IndConfigKvInsert = PublicTables["ind_config_kv"]["Insert"];

// Roles y perfiles
export type IndRolRow = PublicTables["ind_roles"]["Row"];
export type IndRolInsert = PublicTables["ind_roles"]["Insert"];
export type IndPerfilRow = PublicTables["ind_perfiles"]["Row"];
export type IndPerfilInsert = PublicTables["ind_perfiles"]["Insert"];

/** Resultado de la función SQL `public.ind_user_scope()`. */
export type IndUserScope = Database["public"]["Functions"]["ind_user_scope"]["Returns"][number];
