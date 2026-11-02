# 07 · Especificación del ADMIN v2

**Fecha:** 2026-11-01. **Alcance:** diseño del panel de administración; no se implementa en esta etapa. **Punto de partida:** el admin actual solo tiene bandeja y detalle de mentoras con aprobar/rechazar/suspender/reactivar. No hay métricas, ajustes, taxonomías, auditoría visible, roles privilegiados ni 2FA. `[leído en el código: frontend/src/app/(app)/admin, backend/src/modules/profiles/profiles.controller.ts]`

## 1. Principios

1. **El admin es un plano de control, no un IDE.** Edita valores con esquema, no fórmulas, scripts ni SQL.
2. **Mínimo privilegio.** Cada rol ve solo lo que necesita; el backend es la autoridad, el frontend solo oculta.
3. **Todo cambio es trazable.** Actor, antes/después, motivo, aprobadores, IP y `request-id`.
4. **Nada crítico se autoaprueba.** Dos personas para ajustes `high/critical`, roles, legales, matching y pagos.
5. **Los secretos no se muestran.** Solo estado ("configurado", "rota en 12 días").
6. **Los datos personales se minimizan.** Enmascarar correo/teléfono cuando no sean necesarios; no exportar PII sin motivo y permiso.
7. **Accesible por defecto.** WCAG 2.2 AA, teclado, lector de pantalla y lenguaje claro.

## 2. Arquitectura de información

```text
Inicio
├─ Resumen (métricas y alertas)
├─ Personas
│  ├─ Mentoras (bandeja, detalle, aprobación)
│  ├─ Mentoradas (búsqueda, detalle, soporte)
│  └─ Cuentas privilegiadas (solo superadmin)
├─ Catálogo
│  ├─ Áreas y taxonomías
│  ├─ Idiomas y países
│  └─ Ofertas y moderación
├─ Reservas y sesiones
│  ├─ Reservas
│  ├─ Sesiones y no-show
│  └─ Reclamos
├─ Matching
│  ├─ Perfiles y versiones
│  ├─ Evaluación y sombra
│  └─ Impresiones y equidad
├─ Configuración
│  ├─ Ajustes por categoría y riesgo
│  ├─ Feature flags
│  ├─ Proveedores (sin secretos)
│  └─ Import/export y promoción
├─ Contenido
│  ├─ Plantillas de correo
│  ├─ Traducciones
│  └─ Documentos legales
├─ Finanzas (Hito 2)
│  ├─ Pagos
│  ├─ Payouts
│  ├─ Reembolsos y disputas
│  └─ Conciliación
├─ Auditoría
└─ Sistema (salud, jobs, versión de config)
```

**Regla de navegación:** una sola barra lateral, máximo 2 niveles, breadcrumb, búsqueda global (usuaria, reserva, ajuste, documento) y atajos de teclado. En móvil, menú colapsable; las tablas pasan a tarjetas.

## 3. Pantallas y funciones

### 3.1 Resumen

| Elemento | Contenido | Permiso |
|---|---|---|
| Tarjetas | Mentorías completadas/semana, activación de mentoradas, activación de mentoras, tiempo de respuesta p50/p90 | Todos |
| Embudo | Registro → onboarding → catálogo → solicitud → aceptación → completada | Todos |
| Alertas | Mentoras pendientes >48 h, reservas por vencer, correos fallidos, health, config sin aprobar | Todos |
| Filtros | Rango de fechas, país, área, cohorte | Todos |
| Estados | Cargando (skeleton), vacío ("aún no hay datos del piloto"), error con reintento, dato viejo con `as_of` | — |

### 3.2 Mentoras

| Elemento | Contenido | Acciones | Permiso |
|---|---|---|---|
| Bandeja | Estado, nombre, áreas, idiomas, país, antigüedad, SLA | Filtrar, buscar, ordenar, paginar | admin/superadmin |
| Detalle | Perfil, onboarding completo, ofertas, disponibilidad, historial de estados, auditoría | Aprobar, rechazar (motivo), suspender, reactivar | admin/superadmin |
| Comparación | Cambios desde la última revisión | Ver diff | admin/superadmin |
| Riesgo | Correo no verificado, perfil incompleto, denuncias | Bloquear aprobación | admin/superadmin |

**Invariante:** una mentora no aparece en catálogo si no está `approved` y su cuenta `active`. La UI no puede saltarse la máquina de estados; el backend la valida.

### 3.3 Personas y cuentas privilegiadas

- Búsqueda por correo (enmascarado), nombre, rol, estado, país y fecha de registro.
- Detalle: perfil, sesiones activas (dispositivo/IP aproximada/última actividad), consentimientos, estado de borrado, auditoría.
- Acciones: suspender/reactivar, revocar sesiones, forzar reset de contraseña, iniciar exportación/borrado (con confirmación).
- **Nunca** mostrar contraseña, hash, token ni secreto.
- Cuentas privilegiadas: alta solo por superadmin, doble aprobación, 2FA obligatoria, correo corporativo, sin registro público.

### 3.4 Reservas y sesiones

- Lista con estado, mentora, mentorada, fecha/hora, zona, oferta, precio, origen (catálogo/recomendación), antigüedad.
- Detalle con línea de tiempo: solicitada → aceptada/rechazada → confirmada → completada/cancelada/no-show, con actor y motivo.
- Acciones: cancelar con motivo (solo admin/support), corregir no-show con evidencia, reenviar notificación, abrir reclamo.
- Filtros: estado, fecha, área, país, `payment_required`, con/sin `meetingUrl`.
- **No** editar precios ni estados financieros desde aquí; eso vive en Finanzas.

### 3.5 Ajustes

- Lista por categoría (`auth`, `booking`, `scheduling`, `catalog`, `matching`, `notifications`, `security`, `finance`), con riesgo, valor actual, vigencia, autor y estado.
- Editor schema-driven: tipo, mínimo/máximo, unidad, descripción, ejemplo, valor por mercado, programación, motivo obligatorio.
- Vista diff antes/después; simulador cuando aplique (ej. TTL); validación en cliente y servidor.
- `low/medium`: edición directa con auditoría. `high/critical`: propuesta + segunda aprobación + vigencia.
- Rollback: crea versión nueva con el valor anterior; nunca borra historia.
- Import/export: JSON firmado, `dry-run`, sin secretos, con checksum y `schema_version`.
- Banner de entorno: "STAGING" o "PRODUCCIÓN" siempre visible; producción con color distinto y confirmación escrita.

### 3.6 Matching

| Elemento | Contenido | Acciones |
|---|---|---|
| Perfiles | `default`, versiones, estado (`draft/shadow/active/retired`), autor, fechas | Crear versión, clonar, retirar |
| Señales | Activas/inactivas, pesos (suma 100), filtros duros, horizonte, tamaño de lista, umbrales | Editar con sliders + numérico |
| Evaluación | precision@3, cobertura, diversidad, equidad, latencia | Ejecutar fixture, ver informe |
| Sombra | Días/impresiones, diferencias vs activa | Promover, pausar, volver |
| A/B | Tráfico por brazo, métricas, significancia | Iniciar, detener, elegir ganador |
| Impresiones | Candidatas, puntajes, posición, resultado, versión | Filtrar, exportar agregado |
| Kill switch | `matching.enabled=false` | Activar con confirmación y motivo |

**Invariantes:** una sola versión `active`; no se edita la activa; activar exige evaluación aprobada y sombra mínima; rollback <5 min; los cambios quedan en auditoría. El editor no permite fórmulas libres ni pesos que no sumen 100.

### 3.7 Taxonomías y traducciones

- Árbol de áreas con padre/hijo, orden, activo, uso (mentoras/ofertas), traducciones por locale y % de completitud.
- Idiomas, países, etapas, objetivos, tipos de apoyo, industrias, rangos de experiencia.
- Acciones: crear, editar, reordenar, traducir, activar/desactivar, fusionar, archivar.
- **Guardas:** no borrar si está referenciada; archivar en su lugar; aviso de impacto ("37 mentoras usan esta área"); cambio de slug con redirect 301.
- Traducciones: editor por locale, estado (`missing/draft/reviewed/published`), revisor, fecha; no publicar traducciones automáticas sin revisión.

### 3.8 Contenido y legales

- Plantillas de correo por evento (`reset`, `booking_accepted`, `declined`, `cancelled`, `expired`), locale, asunto, cuerpo, variables permitidas, preview y prueba de envío.
- Documentos legales: términos, privacidad, cookies, código de conducta, libro de reclamaciones; versionados, con vigencia, locale y aceptación por usuaria.
- Flujo: borrador → revisión legal → publicado; cambio de versión exige reaceptación si es material.
- Reporte de aceptación: versión, fecha, usuaria (seudónimo), canal.

### 3.9 Auditoría

- Filtros por actor, acción, entidad, fecha, riesgo, `request-id`.
- Detalle con antes/después, motivo, aprobadores, IP y user-agent.
- Export CSV/JSON con permisos y marca de agua; retención 2 años para finanzas, 12 meses para el resto.
- Append-only: la UI no permite editar ni borrar; el trigger de base lo impide. `[leído en el código: prisma/migrations, audit_log_append_only]`

### 3.10 Finanzas (Hito 2)

| Pantalla | Contenido | Acciones | Permiso |
|---|---|---|---|
| Resumen | GMV, ingresos, take rate, reembolsos, chargebacks, payout pendiente | Filtrar, exportar | finance/superadmin |
| Pagos | Intento, estado, proveedor, monto, moneda, reserva, eventos | Ver, reintentar, reembolsar | finance |
| Payouts | Saldo, retención, método, estado, lote | Aprobar (2ª persona), rechazar, marcar pagado | finance + superadmin |
| Reembolsos | Motivo, monto, evidencia, estado | Aprobar, rechazar | finance + superadmin |
| Disputas | Evidencia, plazo, resultado | Responder, escalar | finance |
| Conciliación | Extracto vs ledger, diferencias | Marcar, ajustar con asiento | finance |

**Invariantes:** nadie aprueba su propio payout/reembolso; el saldo sale de un ledger de doble entrada, no de sumar reservas; toda corrección genera asiento; moneda y tipo de cambio quedan registrados.

### 3.11 Reclamos y moderación (Hito 3)

- Bandeja de reportes con severidad, categoría, partes, evidencia y SLA.
- Acciones: asignar, pedir información, advertir, suspender, escalar a superadmin, cerrar con resolución.
- Separación entre quien reporta y quien modera; conflicto de interés declarado.
- Categorías: acoso, discriminación, fraude, no-show, contenido, seguridad, menores. Menores → escalado inmediato y no exposición pública.

### 3.12 Sistema

- Salud de API/DB/web, versión desplegada (`REVISION`), migraciones aplicadas, jobs (vencimiento, backups, correos), flags, proveedores (SMTP, pagos, storage) sin secretos, versión de configuración y última promoción.
- Acciones: reintentar job, pausar flag, ver logs correlacionados (sin PII), abrir runbook.

## 4. Métricas: definiciones exactas

**Convenciones:** ventana por defecto 28 días; semanas ISO; almacenamiento UTC y visualización `America/Lima`; excluir cuentas `@steam.test`, demos y `APP_ENV != production`; denominadores <10 se muestran como "n<10" sin porcentaje; cada tarjeta muestra `as_of` y definición emergente.

| Métrica | Definición | Numerador / denominador | Fuente |
|---|---|---|---|
| **North star: mentorías completadas/semana** | Reservas `completed` con `completedAt` en la semana ISO | Conteo / 1 semana | `booking` |
| Activación de mentorada | Registradas en la cohorte que completan onboarding y solicitan su primera reserva en 7 días | Cumplen / registradas | `user`, `onboarding_response`, `booking` |
| Activación de mentora | Aprobadas en la cohorte con ≥1 oferta activa, ≥1 regla de disponibilidad y ≥1 reserva aceptada en 14 días | Cumplen / aprobadas | `mentor_profile`, `offering`, `availability_rule`, `booking` |
| Tiempo de respuesta de mentora | Horas entre `requestedAt` y `respondedAt` de aceptadas/rechazadas; excluye vencidas y canceladas por la mentorada antes de responder | p50 y p90 | `booking` |
| Embudo | Usuarias únicas que llegan a cada paso en 7 días: registro → onboarding completo → vista de catálogo → detalle → solicitud → aceptación → completada | Conteo por paso y conversión paso a paso | `user`, eventos, `booking` |
| Tasa de aceptación | Aceptadas / (aceptadas + rechazadas + vencidas) en la ventana | Cociente | `booking` |
| Tasa de cancelación | Canceladas / confirmadas; separar por actor y por <24 h / ≥24 h | Cociente | `booking` |
| Tasa de no-show | No-show / (completadas + no-show); separar por parte | Cociente | `booking` |
| Oferta/demanda por área | Mentoras activas con oferta en el área / mentoradas activas interesadas | Ratio y brecha | `mentor_area`, `mentee_interest`, `offering` |
| Demanda insatisfecha | Búsquedas con 0 resultados + solicitudes rechazadas/vencidas por área | Conteo y % | eventos, `booking` |
| Geografía | Usuarias por país/ciudad; reservas entre zonas horarias | Conteo y % | `user`, `mentor_profile` |
| Retención | % de la cohorte con una reserva en 30/60/90 días | Cohorte | `booking` |
| GMV (H2) | Suma de pagos capturados en la ventana | Suma | `payment` |
| Ingreso neto (H2) | GMV × comisión − reembolsos − chargebacks − costo de pasarela | Suma | `payment`, `ledger` |
| Take rate (H2) | Ingreso neto / GMV | Cociente | `ledger` |
| Payout pendiente (H2) | Saldo aprobado no pagado, por antigüedad | Suma y aging | `ledger`, `payout` |
| Conciliación (H2) | Diferencia entre extracto del proveedor y ledger | Suma absoluta / GMV | `reconciliation` |

**Definiciones que se editan desde admin:** ventana por defecto, metas por métrica, umbrales de alerta, zonas horarias de reporte y cohortes. **No** se editan las fórmulas ni las fuentes: eso es estructura y requiere código.

## 5. Editor de ajustes: salvaguardas de UI

1. **Esquema cerrado:** cada ajuste tiene tipo, rango y validación; no hay campos JSON libres.
2. **Vista previa:** diff, valor anterior, valor nuevo, impacto estimado y unidades.
3. **Motivo obligatorio:** ≥10 caracteres; se guarda con el cambio.
4. **Aprobación:** `low/medium` directa; `high/critical` propone y otra persona aprueba; nunca el mismo.
5. **Vigencia:** inmediata o programada; zona horaria visible; si falla al activar, se mantiene la anterior y se alerta.
6. **Rollback:** un clic crea versión nueva; confirmación y motivo.
7. **Entorno:** banner persistente; producción exige escribir el nombre del ajuste para confirmar.
8. **Import/export:** `dry-run` obligatorio; muestra altas/bajas/cambios; bloquea secretos; checksum.
9. **Auditoría:** enlace al registro desde cada cambio.
10. **Sin secretos:** el editor nunca lee ni escribe valores secretos; solo `secret_ref.status`.

## 6. Permisos

| Acción | superadmin | admin | finance | support | moderator |
|---|---|---|---|---|---|
| Ver resumen | ✓ | ✓ | ✓ | ✓ | ✓ |
| Aprobar/rechazar mentoras | ✓ | ✓ | — | — | — |
| Suspender cuentas | ✓ | ✓ | — | — | ✓ |
| Ver reservas | ✓ | ✓ | ✓ | ✓ | ✓ |
| Cancelar reserva | ✓ | ✓ | — | ✓ | — |
| Editar ajustes `low/medium` | ✓ | ✓ | — | — | — |
| Editar ajustes `high/critical` | ✓ + 2ª | propone | — | — | — |
| Editar matching | ✓ + evaluación | — | — | — | — |
| Ver finanzas | ✓ | — | ✓ | — | — |
| Aprobar payout/refund | ✓ + 2ª | — | propone + 2ª | — | — |
| Editar roles | ✓ | — | — | — | — |
| Ver auditoría | ✓ | ✓ | ✓ (finanzas) | ✓ (soporte) | ✓ (moderación) |
| Exportar datos | ✓ | — | ✓ (finanzas) | — | — |

**Invariantes:** mínimo 2 superadmins activos; nadie se autoasigna rol; el último superadmin no puede degradarse; 2FA obligatoria; sesión de 30 min de inactividad y 8 h absolutas; reautenticación para acciones críticas; toda acción crítica en `audit_log`.

## 7. Estados vacíos, errores y accesibilidad

### 7.1 Estados

| Estado | Comportamiento |
|---|---|
| Cargando | Skeleton con la forma del contenido; no spinner de página completa |
| Vacío | Explicación + CTA; distinguir "no hay datos" de "no hay resultados para el filtro" |
| Error | Código, mensaje claro, `request-id` copiable, reintento y enlace a soporte |
| Sin permiso | Explicar el rol requerido; no ocultar la navegación sin explicación |
| Dato viejo | Banner "actualizado hace X" + botón refrescar |
| Parcial | Mostrar lo disponible y marcar la sección fallida; no romper toda la pantalla |
| Conflicto | "Otra persona cambió este registro"; mostrar diff y recargar |

### 7.2 Accesibilidad

- WCAG 2.2 AA; foco visible; navegación completa por teclado; `skip link`; landmarks; títulos jerárquicos.
- Tablas con `<caption>`, encabezados, orden accesible y paginación anunciada.
- Formularios con label, ayuda, error asociado y resumen de errores.
- Contraste ≥4,5:1; no usar color como único indicador; objetivo táctil ≥24 px.
- `prefers-reduced-motion`; zoom 200 %; texto ampliable.
- Lenguaje claro en español; evitar jerga interna.
- Pruebas: axe en CI + revisión manual con teclado y lector de pantalla en las 10 pantallas principales.

## 8. Priorización en 3 niveles

### Nivel 0 · Imprescindible para el piloto

| # | Entregable | Por qué |
|---|---|---|
| 0.1 | Login + 2FA + sesión corta | Sin esto no se abre a personas reales |
| 0.2 | Resumen con north star, activación, respuesta y embudo | Operar sin métricas es volar a ciegas |
| 0.3 | Bandeja/detalle de mentoras con SLA y auditoría | Ya existe; completar historial y alertas |
| 0.4 | Búsqueda de personas y revocación de sesiones | Soporte y seguridad básicos |
| 0.5 | Reservas: lista, detalle, cancelar, no-show | Operación diaria |
| 0.6 | Ajustes `low/medium` con diff, motivo y rollback | Dejar de desplegar por un número |
| 0.7 | Taxonomías y traducciones (lectura + edición básica) | El web no duplica listas |
| 0.8 | Plantillas de correo y legales versionados | Reset y reservas dependen del correo |
| 0.9 | Visor de auditoría | Trazabilidad mínima |
| 0.10 | Salud, jobs, flags y versión de config | Diagnóstico y kill switch |
| 0.11 | Bandeja de reclamos básica | No hay piloto sin canal de conducta |
| 0.12 | Accesibilidad AA en las pantallas 0.x | Exclusión y riesgo legal |

### Nivel 1 · Necesario para dinero real (Hito 2)

| # | Entregable | Por qué |
|---|---|---|
| 1.1 | Resumen financiero: GMV, ingreso neto, take rate, refunds, chargebacks | Sin números no se cobra |
| 1.2 | Pagos y eventos del proveedor | Conciliar y depurar |
| 1.3 | Payouts con doble aprobación y aging | Pagar a mentoras sin fraude |
| 1.4 | Reembolsos y disputas con evidencia | Riesgo legal y de consumidor |
| 1.5 | Conciliación extracto vs ledger | Detectar descuadres |
| 1.6 | Ajustes `high/critical` de comisión y moneda | Gobierno financiero |
| 1.7 | Rol `finance` y reportes exportables | Separación de funciones |
| 1.8 | Matching lab: versiones, evaluación, sombra, A/B, kill switch | Cambiar matching sin código |
| 1.9 | Analítica de cohortes y retención | Decidir con datos |
| 1.10 | Reporte de aceptación de legales | Cumplimiento |

### Nivel 2 · Después

| # | Entregable | Por qué |
|---|---|---|
| 2.1 | Moderación con SLA y apelaciones | Escala de comunidad |
| 2.2 | Operaciones masivas (aprobar, etiquetar, exportar) | Eficiencia |
| 2.3 | Gestión de API keys y webhooks | Integraciones |
| 2.4 | Editor de traducciones con memoria y revisión | Coste de localización |
| 2.5 | Experimentos de producto (no solo matching) | Optimización |
| 2.6 | Status page y comunicación de incidentes | Confianza |
| 2.7 | Declaración de accesibilidad y auditoría externa | Cumplimiento |
| 2.8 | Exportación/borrado masivo y DSAR self-service | Privacidad a escala |
| 2.9 | Panel de proveedores y rotación de secretos | Operación madura |
| 2.10 | Analítica de ingresos por cohorte y LTV | Sostenibilidad |

## 9. Instrumentación y datos

- **Eventos de producto** (servidor, seudónimos): `signup`, `email_verified`, `onboarding_step`, `onboarding_complete`, `catalog_view`, `mentor_view`, `booking_request`, `booking_accept`, `booking_decline`, `booking_cancel`, `booking_complete`, `no_show`, `review_submit` (H3), `report_submit` (H3).
- **Propiedades permitidas:** `user_hash`, rol, locale, país, área, idioma, `mentor_hash`, `booking_hash`, origen, posición, duración, estado. **Prohibidas:** nombre, correo, teléfono, mensaje libre, IP completa, token, `meetingUrl`.
- **Fuente de verdad:** base propia; el admin lee de réplicas/materialized views, no de un tercero.
- **Calidad:** test de que cada evento tiene `user_hash` y timestamp; test de que no hay PII en propiedades; reconciliación diaria de conteos contra `booking`.
- **Retención:** 90 días crudos, 2 años agregados; borrado por usuaria.

## 10. Evidencia de cierre

- Admin actual: solo bandeja/detalle de mentoras; sin métricas, ajustes, taxonomías, auditoría visible, finanzas ni roles. `[leído en el código]`
- `audit_log` append-only existe en migración. `[leído en el código]`
- Roles actuales: `mentee|mentor|admin`; no hay superadmin/finance/support/moderator. `[leído en el código: prisma/schema.prisma:25-30]`
- 12 pantallas/entregables P0, 10 P1 y 10 P2; métricas con fórmula y fuente; accesibilidad y estados definidos.
- Este documento no implementa nada: queda pendiente de aprobación y de las decisiones de 08.
