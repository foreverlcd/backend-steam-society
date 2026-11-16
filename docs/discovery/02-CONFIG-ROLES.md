# 02 · Diseño de configuración, roles y matching gobernable

**Objetivo.** Que ningún valor de negocio, texto, lista, país, moneda, zona horaria, idioma, proveedor o peso de matching viva en el código; que todo cambio sea trazable, aprobable, reversible y promovible de staging a producción; y que el matching pueda evaluarse antes de exponerlo.

**Principio rector.** *Estructura en código, valores en datos, secretos fuera de ambos.* El código define qué se puede configurar y con qué límites; la base define el valor vigente; el admin lo edita con salvaguardas. Un ajuste faltante o inválido **impide arrancar** la API.

## 1. Registro de ajustes

### 1.1 Modelo de datos propuesto

```text
market(id, code, country_code, currency, timezone, locale, active)
setting_definition(key, value_type, json_schema, scope_mode, risk_level,
                   effect, safe_min, safe_max, required, owner_role,
                   requires_approval, description, created_at, updated_at)
setting_value(id, definition_key, scope_type, scope_id, value jsonb,
              version, status, valid_from, valid_to,
              created_by, approved_by, approval_count, change_reason)
setting_version(id, setting_value_id, version, value jsonb, diff jsonb,
                change_reason, rollback_of, created_by, created_at)
feature_flag(key, enabled, scope_type, scope_id, rollout_percent,
             allowlist jsonb, starts_at, ends_at, owner_role, kill_switch)
secret_ref(key, provider, status, last_rotated_at, rotation_days, version)
translation(locale, namespace, key, value, version, updated_by)
message_template(key, channel, locale, subject, body, version, updated_by)
matching_profile(id, key, status, active_version_id, created_by)
matching_profile_version(id, profile_id, version, config jsonb, status,
                         evaluation jsonb, approved_by, valid_from, valid_to)
matching_impression(id, profile_version_id, subject_hash, candidate_ids jsonb,
                    scores jsonb, shown_at, outcome, consent_scope)
role_permission(role, action, allowed, constraints jsonb, updated_by)
```

### 1.2 Metadatos obligatorios por ajuste

| Campo | Regla |
|---|---|
| `key` | Estable, namespaced (`booking.request_ttl_hours`); nunca se renombra, se deprecia |
| `value_type` / `json_schema` | Zod/JSON Schema; valida tipo, formato y rango |
| `scope_mode` | `global` o `market`; un valor por mercado puede sobrescribir el global |
| `risk_level` | `low`, `medium`, `high`, `critical` |
| `effect` | `immediate`, `cache_ttl` (con segundos), `restart` |
| `safe_min` / `safe_max` | Rango duro; el editor no permite salir de él |
| `required` | Si es `true`, la app falla al arrancar cuando falta |
| `owner_role` | Rol que puede proponer el cambio |
| `requires_approval` | `true` para `high` y `critical`: dos personas distintas |
| `valid_from` / `valid_to` | Vigencia; permite programar un cambio |
| `version` / `status` | `draft`, `active`, `retired`; una sola versión activa por clave+scope |
| `change_reason` | Obligatorio; mínimo 10 caracteres |
| `approved_by` / `approval_count` | Quién aprobó; nunca el mismo que propuso |

### 1.3 Ejemplo de definición

```json
{
  "key": "booking.request_ttl_hours",
  "value_type": "integer",
  "json_schema": { "minimum": 1, "maximum": 336 },
  "scope_mode": "global",
  "risk_level": "high",
  "effect": "cache_ttl",
  "cache_ttl_seconds": 30,
  "safe_min": 1,
  "safe_max": 336,
  "required": true,
  "owner_role": "admin",
  "requires_approval": true,
  "description": "Horas que tiene una mentora para responder una solicitud."
}
```

### 1.4 Resolución y arranque

1. `SettingsService` carga al iniciar todos los ajustes `required` activos y los valida contra su esquema.
2. Si falta uno o no valida, lanza un error con la clave exacta y el proceso termina. No hay defaults silenciosos en código.
3. Los defaults viven en `prisma/seed-config.ts` y se insertan con `upsert` idempotente. El seed es la única fuente de valores iniciales.
4. Resolución: `market` específico > `global` > error. Si el mercado no está activo, se usa el global.
5. Cache: en memoria con TTL por ajuste y una versión global (`config_version`). Cada escritura incrementa la versión; las instancias recargan al detectar cambio o al vencer el TTL.
6. Efecto `restart`: solo para cambios de seguridad o de conexión; el admin muestra "requiere reinicio" y no lo aplica solo.

### 1.5 Separación estricta

| Categoría | Dónde vive | Quién edita | Ejemplo |
|---|---|---|---|
| Ajuste | `setting_value` | Admin/superadmin según matriz | TTL de reserva, comisión, página |
| Feature flag | `feature_flag` | Superadmin; admin con aprobación | `matching.shadow`, `payments.enabled` |
| Secreto | Gestor de secretos / entorno | Solo operaciones; nunca visible en admin | `SMTP_URL`, `DATABASE_URL` |
| Referencia | `taxonomy_item` + `translation` | Admin de catálogo | Áreas, idiomas, países |
| Plantilla | `message_template` | Admin de contenido | Correo de rechazo |
| Perfil de matching | `matching_profile_version` | Superadmin con evaluación | Pesos y umbrales |

**Regla de oro:** el admin nunca muestra un secreto; solo `secret_ref.status` ("configurado", "rota en 12 días"). El export/import excluye secretos por diseño.

### 1.6 Historial, rollback y promoción

- Toda escritura crea una fila en `setting_version` con `diff`, autor, motivo y aprobadores.
- Rollback = crear una versión nueva que copia el valor de una versión anterior; no se borra historia.
- Export: JSON firmado con `schema_version`, `config_version`, checksum y solo claves no secretas.
- Import: validación completa + `dry-run` que muestra altas, bajas y cambios; requiere aprobación de dos personas y deja auditoría.
- Promoción staging→producción: artefacto exportado en staging, revisado en un PR de configuración o en el admin de producción; nunca copia directa de la base.
- Vigencia: un cambio programado se activa por fecha; si falla la validación al activarse, se mantiene la versión anterior y se alerta.

## 2. Roles y permisos

### 2.1 Roles propuestos

| Rol | Propósito | No puede |
|---|---|---|
| `superadmin` | Gobierno de ajustes críticos, roles, matching, legales, import/export | Editar su propio rol; aprobar su propio cambio; quedarse como único superadmin |
| `admin` | Aprobar mentoras, moderar catálogo, operar el día a día | Tocar secretos, roles, matching o finanzas |
| `finance` | Pagos, comisión, payouts, reembolsos, conciliación | Aprobar sus propios pagos; ver datos personales innecesarios |
| `support` | Atender incidencias, ver reservas y perfiles, reenviar correos | Cambiar roles, precios, comisión o matching |
| `moderator` | Reportes, bloqueos, contenido y conducta | Ver datos financieros; cambiar configuración |

**Nota de coherencia documental:** `docs/07-DECISIONS.md` (ADR-013) hoy dice "un rol por cuenta" y "el admin no se crea por registro"; **no** contiene la regla de cuentas privilegiadas separadas. El encargo la exige. Se propone **ADR-024** (no se editó `07-DECISIONS.md`): las cuentas `superadmin`, `finance`, `support` y `moderator` son cuentas separadas de la cuenta de mentora/mentee, con correo corporativo, 2FA obligatoria y sin registro público. Si el desarrollador prefiere otro número o fusionarlo con ADR-013, se ajusta antes de implementar.

### 2.2 Matriz de permisos (editable con invariantes)

| Acción | superadmin | admin | finance | support | moderator |
|---|---|---|---|---|---|
| Ver panel | ✓ | ✓ | ✓ | ✓ | ✓ |
| Aprobar/rechazar mentoras | ✓ | ✓ | — | — | — |
| Suspender cuentas | ✓ | ✓ | — | — | ✓ |
| Ver reservas | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ver datos personales | ✓ | ✓ | mínimo | mínimo | mínimo |
| Editar ajustes `low/medium` | ✓ | ✓ | — | — | — |
| Editar ajustes `high/critical` | ✓ + 2ª aprobación | propone | — | — | — |
| Editar roles | ✓ | — | — | — | — |
| Ver finanzas | ✓ | — | ✓ | — | — |
| Aprobar payout/refund | ✓ | — | propone + 2ª aprobación | — | — |
| Editar matching | ✓ + evaluación | — | — | — | — |
| Editar legales | ✓ + 2ª aprobación | propone | — | — | — |
| Export/import configuración | ✓ | — | — | — | — |
| Ver auditoría | ✓ | ✓ | ✓ (finanzas) | ✓ (soporte) | ✓ (moderación) |

**Invariantes que la matriz no puede romper:**

1. Debe existir al menos un `superadmin` activo y **mínimo 2** para operar; si queda 1, se bloquean cambios críticos y se alerta.
2. Nadie puede concederse un rol a sí mismo ni aprobar su propio cambio.
3. Un `superadmin` no puede degradar al último `superadmin` ni desactivar su propia 2FA.
4. `finance` no puede aprobar un payout que él mismo creó.
5. Los permisos se evalúan en el backend; el frontend solo oculta acciones.
6. Toda acción crítica escribe `audit_log` con actor, antes/después, motivo, IP y request-id.

### 2.3 Salvaguardas de cuentas privilegiadas

- 2FA obligatoria (TOTP o WebAuthn) para todos los roles privilegiados; sin 2FA no se puede iniciar sesión en el panel.
- Sesión corta: 30 min de inactividad y 8 h absolutas; reautenticación para acciones críticas.
- Cuentas separadas: el correo de una mentora no puede ser superadmin; se usa un alias corporativo.
- Sin autoescalada: el alta de un rol privilegiado la hace otro superadmin y requiere doble aprobación.
- Doble aprobación para ajustes `high/critical`, roles, legales, matching y pagos.
- Auditoría completa e inmutable (append-only); retención mínima 2 años para acciones financieras. [a confirmar con contador/abogado]
- Bloqueo por intentos fallidos y alerta a los superadmins.
- Revisión trimestral de accesos y rotación de secretos.

## 3. Matching gobernable

### 3.1 Perfil versionado

```json
{
  "key": "default",
  "signals": ["areas", "availability", "language", "level_fit", "price_fit", "reliability"],
  "weights": { "areas": 35, "availability": 20, "language": 15, "level_fit": 15, "price_fit": 10, "reliability": 5 },
  "hard_filters": ["approved", "active", "language", "area", "availability", "blocked"],
  "thresholds": { "trigram": 0.2, "min_score": 0 },
  "horizon_days": 14,
  "target_availability_hours": 6,
  "list_size": 3,
  "max_list_size": 10,
  "level_fit_max_years_distance": 7,
  "reason_components": 2
}
```

Cada versión tiene estado `draft → shadow → active → retired`. Solo una `active` por perfil. Cambiar cualquier peso, umbral, filtro duro, horizonte o tamaño de lista crea una versión nueva; nunca se edita la activa.

### 3.2 Puerta de evaluación antes de activar

| Chequeo | Umbral propuesto | Bloquea |
|---|---|---|
| precision@3 | ≥ 0,60 en fixture y ≥ 0,50 en evaluación humana de 10 pares | Sí |
| Cobertura | ≥ 70 % de mentoras elegibles mostradas al menos una vez en 30 días | Sí |
| Diversidad | Ninguna área con >40 % de impresiones si su oferta es <25 % | Sí |
| Equidad | Diferencia de exposición entre grupos comparables ≤10 pp | Sí |
| Regresión | Caída >2 pp frente a la versión activa | Sí |
| Latencia p95 | ≤300 ms para el cálculo de 100 candidatas | Sí |

Los umbrales son ajustes `high`; el desarrollador los aprueba. La evaluación humana sigue pendiente (10 pares reales) y es requisito para activar, no para sombra.

### 3.3 Sombra, A/B, kill switch y rollback

- **Sombra:** la versión nueva calcula y registra, pero la UI muestra la activa. Duración mínima 7 días o 200 impresiones.
- **A/B:** asignación determinista por `hash(user_id + experiment_key) % 100`; no se usa aleatoriedad por request. Máximo 50/50; cada brazo debe tener tamaño mínimo antes de leer resultados.
- **Kill switch:** flag `matching.enabled=false` devuelve catálogo por orden neutro (completitud + disponibilidad) sin usar el motor; se prueba cada trimestre.
- **Rollback:** reactivar la versión anterior en <5 min; no requiere despliegue.
- **Registro:** `matching_impression` guarda versión, candidatas, puntajes, posición y resultado (vista, clic, solicitud, aceptación) con `subject_hash`, no con datos personales directos. Consentimiento explícito para analítica; retención 90 días; borrado por usuaria.
- **Arranque en frío:** una mentora nueva recibe una cuota de exploración (10 % de impresiones) y confiabilidad neutral; su exposición no se compra. Se mide aceptación por cohorte.

### 3.4 Métricas de matching

- Cobertura de mentoras y de áreas.
- Diversidad de idioma, país y área en el top 3.
- Tasa de clic, solicitud y aceptación por posición.
- Tiempo hasta la primera solicitud de una mentora nueva.
- Cancelación y no-show por origen (recomendada vs catálogo).
- Quejas por recomendación percibida como injusta.

## 4. Consumo desde el web

- `GET /v1/config/public`: devuelve solo ajustes públicos (país, moneda, locale, textos de UI, flags públicos, versión). Sin secretos ni datos internos.
- `ETag`/`If-None-Match` y `Cache-Control: public, max-age=60, stale-while-revalidate=300`.
- El web no duplica listas ni enums: consume `GET /v1/taxonomies` y `GET /v1/config/public`.
- Si la API no responde, el web usa el último `config_version` cacheado y muestra un aviso; nunca inventa defaults de negocio.
- Los textos legales se sirven versionados (`/v1/legal/:key?version=`) y el web muestra la versión aceptada por la usuaria.

## 5. Plan de implementación y pruebas

| Fase | Entregable | Pruebas mínimas |
|---|---|---|
| A | Tablas + seeds + `SettingsService` + fail-fast | falta un required → no arranca; tipo inválido → no arranca; precedencia market/global |
| B | Admin de ajustes + auditoría + rollback | cambio low directo; high con 2 aprobaciones; autoaprobación rechazada; rollback crea versión |
| C | Taxonomías + i18n + config pública | lista vacía no rompe; locale desconocido cae a default; ETag |
| D | Matching versionado + sombra + kill switch | misma entrada → mismo orden; A/B determinista; rollback <5 min |
| E | Flags + secret_ref + export/import | flag on/off sin deploy; export sin secretos; import inválido no aplica |

**Riesgo principal:** el admin se convierte en una herramienta de desarrollo. Mitigación: esquemas cerrados, sin fórmulas libres, sin scripts, sin acceso SQL, y revisión de seguridad de cada editor nuevo.
