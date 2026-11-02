# 08 · Roadmap v3, riesgos no cubiertos y preguntas abiertas

**Fecha:** 2026-11-01. **Relación con docs/05:** este documento **no reemplaza** la hoja de ruta vigente; la extiende con lo que falta para producción real y con el orden de cierre. Las etapas 1.1–1.6 ya están hechas; el Hito 1 termina con el piloto cerrado (F6).

**Lo que este documento NO repite:** inventario de hardcodes y frontera estructura/valores (01), registro de ajustes, roles y matching gobernable (02), auditoría de producción y bloqueantes (03), CI/CD, migraciones y secretos (04), proveedores gratuitos y arquitecturas (05), SLO, capacidad y k6 (06), especificación del admin (07). Aquí solo va lo que, con esos documentos ya escritos, seguiría pasándose por alto.

## 1. Lo que estamos pasando por alto

### 1.1 Los 10 riesgos que más pueden hundir el piloto

| # | Riesgo | Por qué es grave | Prioridad | Tamaño |
|---|---|---|---|---|
| 1 | **Liquidez del marketplace** | Sin mentoras suficientes no hay reservas; sin reservas no hay mentoras. El código no arregla esto | P0 | S (operación) |
| 2 | **Trust & safety y salvaguarda de menores** | Una sola mala experiencia (acoso, fraude, adulta con menor) destruye la confianza y expone legalmente | P0 | M |
| 3 | **Ledger y conciliación de dinero** | Integrar una pasarela no es llevar la contabilidad; sin ledger de doble entrada los saldos mienten | P0 (H2) | L |
| 4 | **Entregabilidad del correo** | Reset de contraseña y avisos de reserva son el sistema nervioso; si caen en spam, el producto parece roto | P0 | S–M |
| 5 | **Ciclo de vida de la cuenta y privacidad** | Cambio de correo, revocación de sesiones, exportación/borrado, consentimiento y DSAR; hoy no existen | P0 | M |
| 6 | **Outbox e idempotencia** | Un correo o webhook perdido es una reserva o un pago perdido; hoy el correo es best-effort | P0 (H2) | M |
| 7 | **Operación de soporte** | Sin bandeja, SLA, macros y libro de reclamaciones, una sola persona no puede atender el piloto | P0 | S–M |
| 8 | **Verificación de mentoras** | Perfiles falsos o suplantación; antes de pagar hace falta KYC y contrato | P0/P1 | M |
| 9 | **Política de cancelación, no-show y reprogramación** | Es la principal fuente de conflicto y de reembolsos; hoy solo hay estados, no política | P0 | S–M |
| 10 | **Bus factor y respuesta a incidentes** | Un solo dev: si enferma o se cae la VM, no hay nadie; sin runbook ni status page el caos es total | P0 | S |

### 1.2 Inventario ampliado (priorizado)

| Área | Hallazgo no cubierto | Por qué importa | Prioridad | Tamaño |
|---|---|---|---|---|
| Producto/marketplace | Arranque por oferta: 10 mentoras verificadas por cada 30 mentoradas; matching manual las primeras 4 semanas | La liquidez se construye a mano, no con features | P0 | S |
| Producto | Onboarding con drop-off: medir paso a paso, guardar y reanudar, recordatorio a las 24 h | Es la mayor fuga de activación | P0 | S–M |
| Producto | Calidad de mentora: perfil completo, respuesta <24 h, formación inicial, código de conducta | La experiencia depende de la mentora, no solo del match | P0 | S–M |
| Producto | Política de cancelación/reprogramación/no-show con evidencia y strikes | Sin reglas, cada caso se resuelve a mano y con sesgo | P0 | S–M |
| Producto | Precio y empaquetado: gratis vs pago, precio sugerido, moneda, comisión visible | Define la propuesta de valor y la confianza | P1 | S |
| Producto | Reseñas dobles ciegas y reputación; remoción y apelación | Necesario para confiar y para ordenar el catálogo | P1 (H3) | M |
| Producto | Recordatorios y calendario (.ics, Google Calendar), reprogramación | Reduce no-show más que cualquier feature nueva | P1 | S–M |
| Producto | Preferencias de notificación y horarios de silencio | Evita fatiga y quejas | P1 | S |
| Producto | Referidos, comunidad y eventos | Crecimiento orgánico; no antes de retención | P2 | M |
| Confianza | Verificación de identidad de mentoras (LinkedIn/dominio/entrevista) y KYC antes de payout | Fraude y suplantación | P0/P1 | M |
| Confianza | Código de conducta, reportes, bloqueo, evidencia, escalado y apelación | Seguridad de la comunidad | P0 | M |
| Confianza | Salvaguarda de menores: edad mínima, consentimiento, contenido, contacto | Riesgo legal y reputacional | P0 | M |
| Confianza | Antifraude: autocompra, cuentas múltiples, abuso de gratis, card testing | Dinero real atrae abuso | P1 | M |
| Dinero | Ledger de doble entrada, asientos, saldos, holds y negativo | Sin esto no se puede pagar ni auditar | P0 (H2) | L |
| Dinero | Webhooks idempotentes, reintentos, dead-letter, reconciliación diaria | Un webhook perdido descuadra el dinero | P0 (H2) | M |
| Dinero | Payouts, KYC, contratos, retenciones, facturas y impuestos | Legal y operativo | P0 (H2) | L |
| Dinero | Multi-moneda/FX, redondeo, reembolsos parciales, chargebacks | Perú primero, LATAM después | P1 (H2) | M |
| Dinero | Conciliación de comisión de pasarela vs comisión propia | El take rate real no es el nominal | P0 (H2) | S–M |
| Identidad | Cambio de correo verificado, histórico de sesiones/dispositivos, revocar todas | Secuestro de cuenta y soporte | P0 | S–M |
| Identidad | Contraseñas filtradas (HIBP k-anonymity), política de contraseñas, bloqueo | Credential stuffing | P1 | S |
| Identidad | Consentimiento versionado y ledger de aceptación | Privacidad y defensa legal | P0 | S–M |
| Identidad | Exportación/borrado/anonimización y DSAR con plazo | Derechos ARCO y confianza | P0 | M |
| Datos | Inventario de PII, mapa de datos, subprocesadores, DPA y transferencia internacional | Obligación legal y de clientes | P0 | M |
| Datos | Retención y purga por tabla, backups cifrados, borrado en backups | La retención sin borrado es incumplimiento | P0 | M |
| Datos | Redacción de PII en logs, Sentry y analítica; pruebas | Fugas silenciosas | P0 | S |
| Datos | Reloj/zonas: DST, cambios de zona, visualización local | Errores de agenda y no-show | P1 | S |
| Datos | Actualización de datos de zona horaria (tzdata) y de tipos de cambio | Deriva silenciosa | P1 | S |
| Backend | OpenAPI generado, tipos de cliente, pruebas de contrato | El web duplica tipos y deriva | P1 | M |
| Backend | Versionado/deprecación de API y política de cambios | Evita romper clientes | P1 | S |
| Backend | Idempotency-Key en acciones críticas | Reintentos de red duplican reservas/pagos | P1 | S–M |
| Backend | Read models/materialized views para métricas del admin | No cargar OLTP con analítica | P1 | M |
| Backend | Migraciones con linter, locks, slow query log, bloat/vacuum | Operación a 12 meses | P1 | S–M |
| Backend | Pruebas de restauración y de caos (matar API, DB, correo) | Confianza operativa | P0 | S |
| Web | OpenAPI/contrato real frontend-API; hoy hay pruebas con mocks | Deriva silenciosa | P1 | S–M |
| Web | Manejo de sesión expirada, multi-pestaña, revocación | UX y seguridad | P1 | S |
| Web | SEO de perfiles públicos, canonical, sitemap, JSON-LD, OG | Adquisición orgánica | P1 | S–M |
| Web | i18n y accesibilidad ya cubiertos en 06; falta presupuesto y CI | — | P1 | S |
| Operación | Runbooks por incidente, severidades, comunicación, postmortem | Un solo dev no puede improvisar | P0 | S |
| Operación | Status page y changelog | Confianza durante caídas | P1 | S |
| Operación | On-call y escalado (aunque sea el propio dev) | Evitar caídas silenciosas | P0 | S |
| Operación | Inventario de proveedores, dominios, DNS, TLS, renovaciones | Un dominio vencido tumba todo | P0 | S |
| Operación | Presupuesto y alertas de costo (aunque sea $0) | Evitar sorpresas | P1 | S |
| Seguridad | Revisión de dependencias y SBOM; ya hay CI propuesto en 04 | Supply chain | P1 | S |
| Seguridad | Divulgación responsable y política de seguridad | Expectativa de usuarias | P1 | S |
| Legal | Entidad, RUC, facturación, contratos con mentoras, clasificación laboral | No cobrar sin esto | P0 (H2) | M |
| Legal | Consumidor, reembolsos, libro de reclamaciones, términos y privacidad | Ya listado en 03; aquí falta el **proceso** | P0 | M |
| Legal | Notificación de brechas y comunicación | Obligación y reputación | P0 | S |
| IA/matching | Recolectar resultados (vista, clic, solicitud, aceptación) con consentimiento | Sin datos no hay mejora ni equidad | P1 | M |
| IA/matching | Sesgo, posición, exploración y arranque en frío | Ya diseñado en 02; falta operarlo | P1 | M |
| IA/matching | LLM solo si aporta; evaluación, coste, inyección de prompt, PII | No meter IA por moda | P2 | M |
| Analítica | Taxonomía de eventos, calidad, reconciliación y dashboards | Decisiones con datos | P1 | M |
| Analítica | Consentimiento y retención; ya cubierto en 06 | — | P1 | S |
| Escalabilidad | Réplica de lectura, segunda instancia, HA | Solo cuando los límites gratuitos se rompan | P2 | L |
| Escalabilidad | Multi-región/LATAM | Después de validar Perú | P2 | L |

**Lectura de arquitecto:** el proyecto está fuerte en el núcleo transaccional y débil en **operación, confianza y dinero**. Las siguientes etapas no deben añadir features de producto hasta cerrar esos tres frentes.

## 2. Roadmap v3

### 2.1 Etapas, dependencias y tamaño

| Etapa | Contenido | Depende de | Tamaño | Decisión que necesito |
|---|---|---|---|---|
| **F0 · Decisiones y congelamiento** | Responder las 12 preguntas; aprobar ADR-024; fijar alcance del piloto; congelar features | — | S (3–5 días) | Las 12 preguntas de §3 |
| **F1 · Fundación de producción** | Oracle + Neon/Caddy/Docker, dominios, TLS, correo con SPF/DKIM/DMARC, CI, backups, Sentry/UptimeRobot/Grafana, staging/prod, runbook, simulacro de restauración | F0 | M (2–3 semanas) | Arquitectura A o B; proveedor de correo; aceptar tarjeta de verificación de Oracle |
| **F2 · Identidad y confianza** | Verificación de correo, 2FA, superadmin/finance/support/moderator, sesiones revocables, cambio de correo, HIBP, consentimiento, exportación/borrado | F1 | M (2–3 semanas) | ADR-024; edad mínima |
| **F3 · Plataforma de configuración y contenido** | Ajustes, taxonomías, i18n, plantillas, flags, perfiles de matching, config pública, import/export | F1, F2 | L (3–4 semanas) | Frontera 01/02; dependencia i18n |
| **F4 · Admin v2 P0** | Resumen, mentoras, personas, reservas, ajustes low/medium, taxonomías, legales, auditoría, salud, reclamos | F3 | M (2–3 semanas) | Priorización 07 |
| **F5 · Endurecimiento del piloto** | k6, índices, caché, rate limit, WAF, entregabilidad, legal, soporte, accesibilidad, contrato web-API | F2, F4 | M (2 semanas) | SLO 06; política de soporte |
| **F6 · Piloto cerrado** | 30 mentoradas / 10 mentoras, 6 semanas, matching manual, métricas, iteración semanal | F5 | M (6 semanas) | Cohorte y fechas |
| **F7 · Beta pública** | SEO, inglés, analítica, accesibilidad auditada, status page, referidos, prensa | F6 | M (4 semanas) | Idiomas; presupuesto |
| **F8 · Dinero en sandbox** | Pasarela, checkout alojado, webhooks idempotentes, ledger, comisión, refunds, payouts, facturas, conciliación, admin finance | F7 | L (6–8 semanas) | Proveedor; comisión; política |
| **F9 · Dinero en producción** | KYC, contratos, payout real, chargebacks, antifraude, impuestos, auditoría, go-live | F8 | M (4 semanas) | Entidad legal; impuestos |
| **F10 · Confianza y escala** | Reseñas, moderación con SLA, calendario/recordatorios, HA, multi-región, IA si aporta | F9 | L (continuo) | Presupuesto; alcance LATAM |

**Tamaños:** S ≤1 semana; M 2–3 semanas; L 4–8 semanas. Son estimaciones para un solo dev + agente, sin contar revisiones legales externas. `[supuesto]`

### 2.2 Ruta crítica y paralelismo

```text
F0 → F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9 → F10
              └→ F5 (en paralelo con F4, tras F2)
```

- **F1 y F2** no se paralelizan: sin infraestructura no se prueba identidad real.
- **F3** puede empezar cuando F1 esté estable; no espera a F4.
- **F5** puede adelantar k6, índices y WAF mientras F4 termina.
- **F8** no empieza hasta que F6 valide retención y F7 valide adquisición; cobrar antes de tener demanda es quemar dinero en comisión.
- **F10** es continuo; no bloquea F9.

### 2.3 Criterios de salida por etapa

| Etapa | Se cierra cuando… |
|---|---|
| F0 | Las 12 preguntas tienen respuesta escrita; ADR-024 aprobado; alcance del piloto firmado |
| F1 | Staging y producción separados; backup restaurado con éxito; monitor y alertas activos; correo autenticado |
| F2 | 2FA obligatoria; correo verificado; roles separados; exportación/borrado probados |
| F3 | Cero valores de negocio en código; config pública con ETag; taxonomías traducidas |
| F4 | Admin P0 usable por una persona no técnica; auditoría visible; rollback probado |
| F5 | k6 baseline pasa; WAF activo; entregabilidad >95 %; legal publicado; contrato web-API verde |
| F6 | 30 mentoradas y 10 mentoras activas; north star ≥10/semana; no-show <15 %; NPS cualitativo |
| F7 | 100 usuarias activas; SEO indexado; inglés completo; accesibilidad AA sin críticos |
| F8 | Sandbox: pago → ledger → payout → refund → conciliación sin descuadre |
| F9 | Primer payout real conciliado; chargeback simulado resuelto; impuestos emitidos |
| F10 | Reseñas y moderación operando; HA o plan de escalado aprobado |

## 3. Preguntas abiertas (máximo 12)

Cada pregunta tiene una **recomendación por defecto**; si no hay respuesta, se avanza con ella y se documenta como decisión provisional.

| # | Pregunta | Recomendación por defecto | Por qué / impacto | Se necesita en |
|---|---|---|---|---|
| 1 | ¿Alcance y fechas del piloto? | **Piloto cerrado de 6 semanas con 30 mentoradas y 10 mentoras verificadas, solo mentorías gratuitas 1:1**, tras F5 | Valida liquidez y operación sin distraer con pagos | F0 |
| 2 | ¿Edad mínima? | **18+ en el piloto**; evaluar 16+ con consentimiento parental y verificación después, con abogado | Menores elevan riesgo legal y de salvaguarda | F0 |
| 3 | ¿Pasarela para Perú? | **Spike de 2 semanas: Mercado Pago, Culqi e Izipay**; elegir la que tenga sandbox, payout y soporte; preferencia inicial por Mercado Pago si cumple | Comisiones, payout y cobertura de métodos cambian el modelo | F8 |
| 4 | ¿Comisión y payout? | **15 % al pagar la mentorada; payout semanal con retención de 7 días**; revisar a los 3 meses | Define ingreso y flujo de caja | F8 |
| 5 | ¿Política de cancelación/reembolso? | **Cancelación gratis ≥24 h; <24 h 50 %; no-show sin reembolso; cancelación de la mentora reembolso total + crédito** | Evita disputas y protege a la mentora | F8 |
| 6 | ¿Entidad legal e impuestos? | **Formalizar RUC/empresa y contratos con mentoras antes de cobrar**; contador revisa facturación y retenciones | No se puede cobrar ni pagar informalmente | F9 |
| 7 | ¿Dónde vive la base? | **Neon São Paulo para el piloto**; documentar transferencia y evaluar autoalojado en Oracle Santiago si el volumen o la latencia lo exigen | Latencia, residencia y costo | F1 |
| 8 | ¿Cuentas privilegiadas separadas y 2FA? | **Aprobar ADR-024: superadmin/admin/finance/support/moderator como cuentas separadas, 2FA obligatoria, mínimo 2 superadmins** | Sin esto no hay admin seguro ni auditoría creíble | F0/F2 |
| 9 | ¿Quién gobierna el matching? | **Superadmin propone; puerta de evaluación + sombra; el desarrollador aprueba durante el piloto; después, dos personas** | Evita cambios de pesos sin evidencia | F3 |
| 10 | ¿Idiomas al lanzar? | **Español (Perú) en el piloto; inglés en beta pública; quechua solo con demanda y revisión** | Traducir todo antes de validar es caro | F7 |
| 11 | ¿Canal y SLA de soporte? | **Correo + enlace a WhatsApp Business; respuesta <24 h hábiles; sin teléfono**; libro de reclamaciones visible | Una persona no puede sostener más | F5 |
| 12 | ¿Techo de gasto tras el plan gratuito? | **$0 hasta 100 usuarias activas; luego máximo $50/mes**; revisar mensualmente | Evita que un pico rompa la economía | F6/F7 |

**Decisión de infraestructura no numerada:** F1 exige aceptar la tarjeta de verificación de identidad de Oracle (no genera cobro) o renunciar a una VM siempre encendida gratuita. Si el requisito "sin tarjeta" es absoluto, la alternativa es Render Free con spin-down, que rompe la tarea `@Interval` y los webhooks; no se recomienda.

**Preguntas que NO se hacen aquí porque ya están decididas o documentadas:** rol único por cuenta (ADR-013), UUIDv7 y PostgreSQL 18 (ADR-015), sesiones de servidor (ADR-016), TTL de reserva configurable (ADR-021), correo best-effort en MVP (ADR-022). Las decisiones pendientes de `docs/07-DECISIONS.md` siguen sin tomarse por cuenta del agente.

## 4. Qué haría primero si solo hubiera 4 semanas

1. **F0 + F1** en paralelo con la operación: decisiones, VM, dominio, TLS, correo autenticado, backups y monitor. Sin esto no hay nada real.
2. **F2 mínimo**: verificación de correo + 2FA + superadmin + sesiones revocables. Sin esto no se invita a nadie.
3. **F5 mínimo**: k6, índices, WAF y runbook. Sin esto no se sabe si aguanta.
4. **F6**: piloto cerrado con 10 mentoras y 30 mentoradas, aunque el admin v2 esté a medias. La operación manual enseña más que un panel perfecto.

**Lo que no haría en 4 semanas:** pagos, reseñas, i18n completa, matching automático avanzado, app móvil, multi-región.

## 5. Evidencia de cierre

- 10 riesgos principales y 50+ hallazgos ampliados, priorizados y con tamaño. `[supuesto]` en estimaciones; `[leído en el código]` donde se apoya en el estado actual.
- Roadmap con 11 etapas, dependencias, criterios de salida y decisiones.
- 12 preguntas con recomendación por defecto.
- No se inició ninguna etapa de desarrollo; todo queda pendiente de aprobación.
