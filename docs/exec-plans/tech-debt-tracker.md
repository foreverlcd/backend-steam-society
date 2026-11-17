# Deuda técnica y desfases conocidos

Lista viva. El rol `doc-gardener` y los revisores agregan filas; el planificador las prioriza. Cuando se resuelve una fila, se borra y se anota el commit en `docs/PROGRESS.md`.

| Desde | Área | Problema | Requiere decisión | Propuesta |
|---|---|---|---|---|
| 2026-11-17 | Pagos | El puerto `PaymentGateway` solo admite los resultados `paid` y `failed`; no hay forma de ignorar estados intermedios de un proveedor real. Tampoco hay raw body para la firma HMAC. | No (antes de elegir pasarela) | Ver `docs/PAYMENTS.md` §7 |
| 2026-11-17 | Pagos | `settle`, `confirmPaid` y `markWebhookProcessed` corren en secuencia, sin una transacción única. Un pago cobrado sobre una reserva expirada requiere reembolso manual. | No | Outbox o transacción al conectar una pasarela real |
| 2026-11-17 | Arquitectura | `profiles` y `auth` son módulos planos (sin capas); `catalog` no tiene dominio. `check-boundaries` solo vigila capas donde existen. | No | Migrar a capas cuando se toquen |
| 2026-11-17 | Web UX | Quedan 12 hallazgos de la revisión de UX; el quick win de textos ya está hecho. Siguen la ficha de mentora (login arriba, 5 días con "Ver más", fechas en español) y móvil/disponibilidad (zona horaria automática, 44 px, menú). | No | Siguientes planes en `docs/exec-plans/` |
| 2026-11-17 | Web tests | `BookingsView` no tiene tests de los estados vacíos por rol ni del filtro "Por pagar" oculto. | No | Tarea baja para haiku |
| 2026-11-17 | Web copy | `admin-view.tsx` todavía muestra "Onboarding" (solo lo ve el equipo). | No | Opcional |
| 2026-11-17 | Arnés | codex no funciona con la cuenta actual, y agy headless necesita reglas de permiso de solo lectura. | Sí (dueño) | Ver `docs/harness/LOG.md` |
| 2026-11-17 | Web / Pagos | El fake-checkout del web usa los nombres `feeBps` y `amount`; la API usa `feeBasisPoints` y `amountMinor`. | No | Renombrar en el web (`feeBps`→`feeBasisPoints`, `amount`→`amountMinor`) cuando se decida la pasarela; aplazado hasta entonces |
