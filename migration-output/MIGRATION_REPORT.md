# MIGRATION REPORT — Indicadores de Personal OLO

**Estado: MIGRATION COMPLETE**  
Generado: 2026-10-14T13:38:24+00:00 · Validación: 2026-10-14T13:38:20+00:00

## 1. Resumen

| Aspecto | Origen | Destino |
|---|---|---|
| Frontend | static-html (js), router none, monolito | mismo framework y router · hosting amplify-static |
| API | Supabase (PostgREST, RPC, Edge Functions) | API Gateway REST REGIONAL + 10 endpoints Lambda python3.13 (hexagonal) |
| Base de datos | PostgreSQL Supabase (esquema: live_db) | Aurora PostgreSQL `olo_dev_indicadores_personal_db` · 3 tablas, 0 vistas, 2 funciones |
| Autorización | RLS + auth.uid() | reglas en use cases (rls_mode: backend) |
| Auth | Supabase Auth | Amazon Cognito (grupos: ninguno) |
| Exposición | — | internal |

## 2. Criterios de finalización (16)

| # | Criterio | Estado |
|---|---|---|
| 1 | Discovery completo: preflight, proyecto, uso de Supabase y esquema real | OK |
| 2 | Manifest revisado (sin borrador, endpoints válidos, reglas de autorización asignadas) | OK |
| 3 | Scripts Aurora completos por ambiente (provisioning, schema, validation, rollback, migration, datos) | OK |
| 4 | SQL Aurora validado en PostgreSQL efímero (idempotente, TOTAL_FALTA=0, rollback limpio) | OK |
| 5 | Backend hexagonal: handlers y use cases existen; dependencias entre capas y SQL en su lugar | OK |
| 6 | Tests del backend en verde (unitarios con fakes e integración contra el esquema generado) | OK |
| 7 | Lint del backend limpio (ruff) | OK |
| 8 | Template SAM único y samconfig dev/qa/prod con tags y rutas por ambiente | OK |
| 9 | Template válido (cfn-lint y transformación SAM) | OK |
| 10 | IAM mínimo y resiliencia (sin wildcards salvo ENI; SQS con DLQ, reintentos, visibility e idempotencia) | OK |
| 11 | Frontend con arquitectura estándar (Page → Controller → Api → axiosApiGateway, naming y tamaños) | OK |
| 12 | Frontend compila, cumple Prettier y sus tests pasan | OK |
| 13 | Cero residuos de Supabase (código, dependencias, variables) | OK |
| 14 | Sin secretos ni identificadores de ambiente hardcodeados | OK |
| 15 | Sin TODO/FIXME/pseudocódigo en el código generado | OK |
| 16 | Reporte final con matriz ORIGEN → DESTINO y solo pendientes de configuración | OK |

## 3. Matriz ORIGEN → DESTINO

### 3.1 Operaciones del frontend y Edge Functions

| Origen (archivo:línea) | Operación Supabase | Destino | Use case |
|---|---|---|---|
| out/index.html:2213 | table select olo_indicadores_roles | GET /roles → `ListRoles` | `ListRolesUseCase` |
| out/index.html:2214 | table upsert olo_indicadores_roles | PUT /roles/{roleId} → `SaveRole` | `SaveRoleUseCase` |
| out/index.html:2215 | table delete olo_indicadores_roles | DELETE /roles/{roleId} → `DeleteRole` | `DeleteRoleUseCase` |
| out/index.html:2218 | table select olo_indicadores_usuarios | GET /usuarios → `ListUsuarios` | `ListUsuariosUseCase` |
| out/index.html:2222 | table insert olo_indicadores_usuarios | POST /usuarios → `CreateUsuario` | `CreateUsuarioUseCase` |
| out/index.html:2227 | table update olo_indicadores_usuarios | PATCH /usuarios/{usuarioId} → `UpdateUsuario` | `UpdateUsuarioUseCase` |
| out/index.html:2228 | table delete olo_indicadores_usuarios | DELETE /usuarios/{usuarioId} → `DeleteUsuario` | `DeleteUsuarioUseCase` |
| out/index.html:2233 | table select olo_indicadores_usuarios | GET /me → `GetCurrentAccess` | `GetCurrentAccessUseCase` |
| out/index.html:2239 | table select olo_indicadores_roles | GET /me → `GetCurrentAccess` | `GetCurrentAccessUseCase` |
| out/index.html:2429 | table select olo_indicadores_kv | GET /indicadores/registros → `ListIndicadoresRegistros` | `ListIndicadoresRegistrosUseCase` |
| out/index.html:2453 | table select olo_indicadores_kv | PUT /indicadores/registros → `SaveIndicadoresRegistros` | `SaveIndicadoresRegistrosUseCase` |
| out/index.html:2463 | table upsert olo_indicadores_kv | PUT /indicadores/registros → `SaveIndicadoresRegistros` | `SaveIndicadoresRegistrosUseCase` |
| supabase/supabase-sync.js:40 | table upsert olo_indicadores_kv | PUT /indicadores/registros → `SaveIndicadoresRegistros` | `SaveIndicadoresRegistrosUseCase` |
| supabase/supabase-sync.js:48 | table select olo_indicadores_kv | GET /indicadores/registros → `ListIndicadoresRegistros` | `ListIndicadoresRegistrosUseCase` |

### 3.2 Endpoints

| Método | Ruta | Función Lambda | Handler | Auth |
|---|---|---|---|---|
| GET | /me | GetCurrentAccess | entrypoints.lambda_handlers.acceso.get_current_access_handler | cognito |
| GET | /indicadores/registros | ListIndicadoresRegistros | entrypoints.lambda_handlers.indicadores.list_indicadores_registros_handler | cognito |
| PUT | /indicadores/registros | SaveIndicadoresRegistros | entrypoints.lambda_handlers.indicadores.save_indicadores_registros_handler | cognito |
| GET | /roles | ListRoles | entrypoints.lambda_handlers.usuarios.list_roles_handler | cognito |
| PUT | /roles/{roleId} | SaveRole | entrypoints.lambda_handlers.usuarios.save_role_handler | cognito |
| DELETE | /roles/{roleId} | DeleteRole | entrypoints.lambda_handlers.usuarios.delete_role_handler | cognito |
| GET | /usuarios | ListUsuarios | entrypoints.lambda_handlers.usuarios.list_usuarios_handler | cognito |
| POST | /usuarios | CreateUsuario | entrypoints.lambda_handlers.usuarios.create_usuario_handler | cognito |
| PATCH | /usuarios/{usuarioId} | UpdateUsuario | entrypoints.lambda_handlers.usuarios.update_usuario_handler | cognito |
| DELETE | /usuarios/{usuarioId} | DeleteUsuario | entrypoints.lambda_handlers.usuarios.delete_usuario_handler | cognito |

### 3.3 Objetos de base de datos

| Origen | Aurora | Tipo |
|---|---|---|
| public.olo_indicadores_kv | olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_kv | table |
| public.olo_indicadores_roles | olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_roles | table |
| public.olo_indicadores_usuarios | olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_usuarios | table |
| auth.users | olo_dev_indicadores_personal_sch_core.tbl_app_users | table |
| public.olo_indicadores_set_updated_at | olo_dev_indicadores_personal_sch_core.fn_olo_indicadores_set_updated_at | function |
| public.olo_indicadores_usuarios_touch | olo_dev_indicadores_personal_sch_core.fn_olo_indicadores_usuarios_touch | function |
| auth.uid() | fn_auth_uid() | auth helper |
| auth.role() | fn_auth_role() | auth helper |
| auth.email() | fn_auth_email() | auth helper |
| auth.jwt() | fn_auth_jwt() | auth helper |

Roles: `ro_indicadores_personal`, `rw_indicadores_personal`, `ddl_indicadores_personal`, `admin_indicadores_personal` · Usuarios: `usr_indicadores_personal_report`, `usr_indicadores_personal_app`, `usr_indicadores_personal_deploy`, `usr_indicadores_personal_dba` · search_path: `olo_dev_indicadores_personal_sch_core`

### 3.4 Políticas RLS → reglas de autorización

| Tabla | Regla | Comando | Condición | Se aplica en |
|---|---|---|---|---|
| public.olo_indicadores_kv | olo_indicadores_kv_all | ALL | true | Cognito authorizer + AccessResolver (usuario activo en tbl_olo_indicadores_usuarios). La política abierta (anon) se reemplaza por el modelo de alcance que la UI aplicaba: ListIndicadoresRegistrosUseCase rechaza scope admin (403) y para scope pais filtra los registros de personas a su país (IndicadoresKv.visible_for); SaveIndicadoresRegistrosUseCase rechaza admin y para pais fusiona en el servidor conservando los registros de otros países (IndicadoresKv.merge_for_country, antes mergeMonth en el navegador) dentro de una transacción con SELECT ... FOR UPDATE. |
| public.olo_indicadores_roles | olo_ind_roles_all | ALL | true | GetCurrentAccessUseCase lee solo el rol propio. ListRolesUseCase / SaveRoleUseCase / DeleteRoleUseCase exigen require_user_manager (scope admin o global, igual que el botón Usuarios del original); los roles base (global, admin, costa_rica, venezuela) no se eliminan (antes solo lo impedía la UI). |
| public.olo_indicadores_usuarios | olo_ind_usuarios_all | ALL | true | GetCurrentAccessUseCase resuelve solo la fila propia por el email del token. ListUsuarios / CreateUsuario / UpdateUsuario / DeleteUsuario exigen require_user_manager (scope admin o global); UpdateUsuario aplica lista blanca (nombre, rol_id, activo); pass_hash/pass_salt nunca se exponen ni se leen desde el API. |

### 3.5 Servicios

| Origen | Destino |
|---|---|
| Supabase Auth | Amazon Cognito User Pool + authorizer de API Gateway |

## 4. Cambios estructurales, incompatibilidades y riesgos

**Cambios estructurales:** 
- Login propio (PBKDF2 calculado en el navegador contra olo_indicadores_usuarios leída con la anon key) → Amazon Cognito (SRP). La fila de olo_indicadores_usuarios sigue siendo el perfil con rol y estado; GET /me la resuelve por el email verificado del token y devuelve la sesión con la misma forma que guardaba OLOAuth (id, email, nombre, rol{id,nombre,scope,pais}). activo=false bloquea todo el API y el login muestra el mismo mensaje "Usuario o contraseña incorrectos".
- Alta de usuarios: CreateUsuario crea la identidad en Cognito (AdminCreateUser con la contraseña indicada como temporal, sin correo) y la fila del perfil en una sola operación. En el primer ingreso Cognito pide definir una contraseña nueva (paso agregado en la misma tarjeta de login). pass_hash/pass_salt quedan vacíos para los usuarios nuevos: las credenciales viven solo en Cognito.
- Baja de usuarios: DeleteUsuario elimina el perfil y deshabilita la identidad de Cognito (AdminDisableUser).
- Sincronización KV: la fusión por país que hacía el navegador (OLOSync.mergeMonth con SELECT ... IN y upsert) pasa al backend (SaveIndicadoresRegistrosUseCase), atómica y basada en el país del rol del servidor, no en el valor ROLE de localStorage. El navegador sigue enviando el documento completo con el mismo rebote de 1,2 s y el botón Sincronizar hace el mismo pull.
- Lectura KV por país: para usuarios scope pais el API devuelve solo los registros de personas de su país (antes la anon key permitía leer todo y el filtro era visual).
- Sitio HTML estático → React 19 + Vite + TypeScript. La interfaz (marcado, clases, CSS, textos) se conserva: el shell (cabecera, filtros, vistas, login) es JSX y el motor de render original (cálculo de indicadores, vistas Operativa/Corporativa/Administrar, exportes Excel/PDF) se movió tal cual a src/views/indicadores/engine con sus dependencias inyectadas (sincronización, sesión, usuarios) desde los controllers. xlsx, jspdf, jspdf-autotable y las fuentes Inter/Space Grotesk pasan de CDN a dependencias npm empaquetadas (la CSP de Amplify no permite scripts ni fuentes de terceros). El logo base64 pasa a src/assets/olo-logo.jpg.
- Validación de contraseña en el alta de usuarios: de "mínimo 6 caracteres" a la política estándar del User Pool (12+ caracteres con mayúscula, minúscula, número y símbolo); se mantiene el mismo aviso (toast).

**Incompatibilidades:** 
- Las contraseñas existentes (hash PBKDF2-SHA256 propio) no se pueden importar a Cognito: los usuarios migrados se crean en el User Pool (importación CSV o alta desde la vista Usuarios) y definen contraseña nueva en el primer ingreso. Las filas y sus hashes se migran tal cual a Aurora como histórico.
- Reactivar en Cognito un correo dado de baja requiere habilitar la identidad en la consola (el perfil IAM estándar cognito_admin no incluye AdminEnableUser/AdminDeleteUser); mientras tanto el alta de ese correo responde "Ese correo ya existe".
- El rol de scope admin no ve indicadores: el backend responde 403 en /indicadores/*; la UI ya no los pedía.

**Riesgos:** 
- Base Supabase compartida: solo se exportan las tablas olo_indicadores_*; auth.users (5 usuarios de otros proyectos) y las tablas olo_kv, olo_movilidad_*, olo_organigramas_kv, olo_salida_kv, olo_usuarios quedan fuera a propósito (export_data_sql.py --exclude auth.users, esquema filtrado en .discovery/supabase-schema.json; el completo está en supabase-schema-full.json).
- El documento KV de cada mes puede crecer (listas de colaboradores por país); PUT /indicadores/registros usa 1024 MB y el límite de 10 MB de payload de API Gateway. Si se supera, el front deberá enviar solo los meses modificados.
- localStorage sigue siendo la copia de trabajo (olo_master_db) como en el original; un navegador con datos locales viejos que no pudo sincronizar los subirá en el siguiente guardado (mismo comportamiento).

## 5. Pendientes (solo configuración de ambiente)

- **dev** — crear parámetros SSM: `/dev/indicadores-personal/network/subnets` (VpcSubnetIds), `/dev/indicadores-personal/network/lambda-sg` (LambdaSecurityGroupId), `/dev/indicadores-personal/db/proxy-endpoint` (DbProxyEndpoint), `/dev/indicadores-personal/frontend/origin` (AllowedOrigins)
- **dev** — crear el secreto de Secrets Manager `/dev/indicadores-personal/db/app` con `username`/`password` del usuario `usr_<app>_app`
- **qa** — crear parámetros SSM: `/qa/indicadores-personal/network/subnets` (VpcSubnetIds), `/qa/indicadores-personal/network/lambda-sg` (LambdaSecurityGroupId), `/qa/indicadores-personal/db/proxy-endpoint` (DbProxyEndpoint), `/qa/indicadores-personal/frontend/origin` (AllowedOrigins)
- **qa** — crear el secreto de Secrets Manager `/qa/indicadores-personal/db/app` con `username`/`password` del usuario `usr_<app>_app`
- **prod** — crear parámetros SSM: `/prod/indicadores-personal/network/subnets` (VpcSubnetIds), `/prod/indicadores-personal/network/lambda-sg` (LambdaSecurityGroupId), `/prod/indicadores-personal/db/proxy-endpoint` (DbProxyEndpoint), `/prod/indicadores-personal/frontend/origin` (AllowedOrigins)
- **prod** — crear el secreto de Secrets Manager `/prod/indicadores-personal/db/app` con `username`/`password` del usuario `usr_<app>_app`
- Frontend — variables por ambiente en Amplify/pipeline: `VITE_API_BASE_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID` (salidas del stack SAM)
- Base de datos — ejecutar provisioning con las 4 contraseñas por variable de psql (`-v pass_ro=... -v pass_rw=... -v pass_ddl=... -v pass_admin=...`), nunca en archivos
- Usuarios — importar usuarios a Cognito (CSV de importación o Lambda de migración) y comunicar el restablecimiento de contraseña
- Opcional — `AlarmTopicArn` (SNS) en parameter_overrides para recibir las alarmas
- Seguridad — al terminar, borrar `.env.supabase` y rotar en Supabase la secret key, la password de la base y el access token usados en la migración

## 6. Validaciones ejecutadas

| Criterio | Verificación | Estado | Detalle |
|---|---|---|---|
| C1 | Artefactos de discovery | OK |  |
| C1 | Origen del esquema | OK | fuente: live_database |
| C2 | Manifest completo | OK |  |
| C2 | Cada regla de autorización tiene dónde se aplica (enforced_in) | OK |  |
| C2 | Sin errores pendientes declarados en el manifest | OK |  |
| C3 | Scripts Aurora por ambiente (dev, qa, prd) | OK |  |
| C3 | Objetos sin equivalente en Aurora documentados | OK |  |
| C4 | SQL en PostgreSQL efímero (idempotencia, validación, rollback) | OK | dev: PASSED; qa: PASSED; prd: PASSED |
| C8 | Un único template SAM parametrizado | OK |  |
| C8 | Template conforme al estándar (parámetros, runtime, logs) | OK |  |
| C5 | Estructura hexagonal del backend | OK |  |
| C5 | Handlers del manifest y del template implementados | OK | 10 handlers |
| C5 | Use cases del manifest implementados | OK | 10 use cases |
| C5 | Dependencias entre capas y handlers delgados | OK |  |
| C5 | SQL solo en adapters y con nombres de Aurora | OK |  |
| C6 | pytest (unitarios con fakes) | OK | 47 passed, 2 skipped in 0.07s |
| C6 | Cada módulo del manifest tiene tests unitarios | OK |  |
| C6 | pytest de integración contra el esquema generado (PG efímero) | OK | 4 passed in 0.31s |
| C7 | ruff check | OK |  |
| C8 | samconfig.toml dev/qa/prod con tags y rutas por ambiente | OK |  |
| C9 | cfn-lint | OK |  |
| C9 | Transformación SAM | OK | 48 recursos CloudFormation |
| C10 | IAM sin comodines (salvo ENI documentado) | OK |  |
| C10 | Colas SQS con los 4 controles del estándar | OK | sin colas (no aplica) |
| C11 | Capa compartida (gateway HTTP, auth, env) | OK |  |
| C11 | HTTP solo vía axiosApiGateway | OK |  |
| C11 | Módulos src/views con Page → Controller → Api | OK |  |
| C11 | Naming kebab-case (-page, use-*-controller, -api) | OK |  |
| C11 | Límites de tamaño de pages y secciones | OK |  |
| C11 | Componentes fuera de views/ ≤ 250 líneas | OK |  |
| C11 | Variables por ambiente y hosting | OK |  |
| C12 | Instalación y build del frontend | OK | install + build |
| C12 | Prettier | OK |  |
| C12 | Tests del frontend | OK | el proyecto no tiene tests (no aplica) |
| C13 | Cero referencias a Supabase en frontend y backend | OK |  |
| C14 | Sin secretos en código ni configuración | OK |  |
| C14 | Sin IDs/ARNs/endpoints de AWS hardcodeados | OK |  |
| C15 | Sin TODO/FIXME/pseudocódigo | OK |  |

## 7. Despliegue

```bash
# 1. Base de datos (por ambiente; desde database/ o database/environments/<amb>/)
psql "$ADMIN_URL/postgres" -v pass_ro=*** -v pass_rw=*** -v pass_ddl=*** -v pass_admin=*** \
     -f aurora_postgresql_provisioning.sql
psql "$ADMIN_URL/olo_dev_indicadores_personal_db" -f aurora_postgresql_schema.sql
psql "$ADMIN_URL/olo_dev_indicadores_personal_db" -f aurora_postgresql_data.sql             # datos del origen (re-ejecutable)
psql "$ADMIN_URL/olo_dev_indicadores_personal_db" -At -f aurora_postgresql_validation.sql   # TOTAL_FALTA debe ser 0
# datos: origen Supabase en solo lectura, credenciales desde .env.supabase (nunca en la línea de comandos)
TARGET_DATABASE_URL=... python "$SKILL/scripts/supabase_connect.py" exec -- ./data_migration.sh
python "$SKILL/scripts/supabase_connect.py" storage-export --out ./storage-export   # Storage
aws s3 sync ./storage-export/<bucket> s3://<bucket-del-stack>/
# 2. Backend
cd backend && sam build && sam deploy --config-env dev   # qa / prod
# 3. Frontend: configurar variables por rama en Amplify (o build del Dockerfile) y desplegar
```

