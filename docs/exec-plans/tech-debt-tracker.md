# Deuda técnica y desfases conocidos

Lista viva. El rol `doc-gardener` y los revisores agregan filas; el planificador las prioriza. Cuando se resuelve una fila, se borra y se anota el commit en `docs/PROGRESS.md`.

| Desde | Área | Problema | Requiere decisión | Propuesta |
|---|---|---|---|---|
| 2026-11-17 | Pagos | El puerto `PaymentGateway` solo admite los resultados `paid` y `failed`; no hay forma de ignorar estados intermedios de un proveedor real. Tampoco hay raw body para la firma HMAC. | No (antes de elegir pasarela) | Ver `docs/PAYMENTS.md` §7 |
| 2026-11-17 | Pagos | `settle`, `confirmPaid` y `markWebhookProcessed` corren en secuencia, sin una transacción única. Un pago cobrado sobre una reserva expirada requiere reembolso manual. | No | Outbox o transacción al conectar una pasarela real |
| 2026-11-17 | Arquitectura | `profiles` y `auth` son módulos planos (sin capas); `catalog` no tiene dominio. `check-boundaries` solo vigila capas donde existen. | No | Migrar a capas cuando se toquen |
| 2026-11-17 | Web / Pagos | La pantalla de pago de prueba del web (fake-checkout) llama a sus campos `feeBps` y `amount`; la API los llama `feeBasisPoints` y `amountMinor`. Solo es una diferencia de nombres. | No | Renombrarlos en el web al conectar la pasarela real (esa pantalla cambiará igual) |
| 2026-11-17 | 2FA | La zona roja del 2FA (TOTP, códigos de recuperación, step-up) fue escrita y revisada por agentes; falta la revisión del desarrollador. | Sí (desarrollador) | Revisar `src/modules/auth/mfa*`, `totp.ts` y `account-security.service.ts` |
| 2026-11-17 | 2FA | La activación muestra el secreto en texto, sin código QR. Un QR necesita una dependencia nueva. | Sí (dueño) | Proponer una librería QR y pedir permiso antes de instalarla |
| 2026-11-17 | 2FA | Si alguien pierde el teléfono **y** los códigos de recuperación, no hay forma de recuperar la cuenta. | Sí (dueño) | Definir un proceso manual con verificación de identidad por el equipo |
| 2026-11-17 | Datos personales | Exportar y eliminar cuenta no tocan los pagos (`payment`, `webhook_event`): se conservan tal cual. | Sí (P-03 pasarela) | Agregar un `PersonalDataContributor` en `payments` al elegir la pasarela, con la retención contable que corresponda |
| 2026-11-17 | Datos personales | La retención al eliminar (anonimizar usuario, conservar reservas y auditoría) es provisional. El consentimiento explícito aún no existe. | Sí (DA-04, abogado) | Ajustar los `erase` y agregar consentimiento cuando se decida DA-04 |
| 2026-11-17 | Sesiones | `auth_session` no tiene índice por usuario: listar o revocar sesiones recorre la tabla buscando en el JSON. | No | Bien para el piloto; agregar una columna `user_id` indexada si crece |
| 2026-11-17 | Roles | El rol `admin` es uno solo; separar permisos (soporte, finanzas, etc.) quedó aplazado. | Sí (dueño) | Retomar cuando haya más de un tipo de persona en el equipo |
