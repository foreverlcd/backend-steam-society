# Consentimiento verificable de madre, padre o tutor (menores de 14)

- **Repo:** ambos
- **Dificultad:** alta (planificador; zona roja: datos personales de menores, auth)
- **Rama:** feat/guardian-consent (backend y web)

## Objetivo
Hoy la menor de 14 marca una casilla "tengo autorización" y eso basta. Ahora el registro pide el correo del adulto responsable; el adulto recibe un enlace y autoriza con un botón. Hasta entonces la cuenta existe, pero no puede reservar ni enviar perfil (mismas rutas que exigen correo verificado).

## Contexto mínimo
- `src/modules/auth/{auth.service,auth.controller,auth.schemas,user.repository,account-policy.guard,auth-personal-data,mailer.service,legal-terms,auth.types}.ts`
- `prisma/schema.prisma` (User, EmailVerificationToken como modelo)
- Web: `src/components/auth/register-form.tsx`, `src/lib/api/auth.ts`, `src/app/(auth)/verify-email`, `src/app/privacidad/page.tsx`

## Archivos a tocar
- Backend: los de arriba, migración nueva `add_guardian_consent_token`, tests unit (`auth.service.spec`, `auth.guards.spec`) y e2e (`auth.e2e-spec`), README, `docs/FLOWS.md`, `docs/PROGRESS.md`.
- Web: formulario de registro + test, `src/lib/api/*`, página pública `/guardian-consent`, aviso en el panel con reenvío, `privacidad`, AGENTS.md.

## Pasos
1. Migración: `user.guardian_email` (texto, nulo) y tabla `guardian_consent_token` (hash único, vence a los 7 días, `used_at`).
2. Registro < 14: exige `guardianConsent: true` y `guardianEmail` distinto del propio; guarda el correo; `guardianConsentAt` queda nulo; encola `auth.guardian_consent_request` con `${APP_URL}/guardian-consent?token=`.
3. `POST /auth/guardian-consent/confirm { token }` (público, throttle): consume el token, marca `guardianConsentAt`, audita `user.guardian_consent_given`. Token inválido/vencido/usado: 400 `INVALID_GUARDIAN_TOKEN`.
4. `POST /me/guardian-consent/resend { guardianEmail? }` (throttle 3/min): 409 `GUARDIAN_CONSENT_NOT_PENDING` si no aplica; puede corregir el correo (400 si es el propio).
5. `AuthUser.guardianConsentPending` = menor de 14 hoy, con correo de tutor y sin `guardianConsentAt`. AccountPolicyGuard: 403 `GUARDIAN_CONSENT_PENDING` en rutas `@RequireVerifiedEmail`.
6. Exportación incluye `guardianEmail`; borrado lo limpia junto con tokens y correos en cola.
7. Web: campo de correo del adulto (solo < 14), página `/guardian-consent` con botón explícito "Autorizo" (nada se confirma al abrir el enlace), aviso con reenvío en el panel, texto de privacidad.

## Criterio de terminado
- [x] Registro < 14 sin `guardianEmail` → 400 `GUARDIAN_EMAIL_REQUIRED`; con el propio correo → 400 `GUARDIAN_EMAIL_SAME_AS_USER`.
- [x] El adulto confirma con el token una sola vez; después `/me` muestra `guardianConsentPending: false` y las reservas funcionan.
- [x] Con consentimiento pendiente, crear reserva → 403 `GUARDIAN_CONSENT_PENDING`.
- [x] Tests nuevos para: registro, confirmación (válido, usado, vencido), reenvío, guard, exportación y borrado.
- [x] `scripts/gate.sh full` (backend) y `scripts/gate.sh` (web) en verde
- [x] Docs actualizados: README, FLOWS, PROGRESS, AGENTS (web); capturas de la web.

## Fuera de alcance
- Verificar identidad del adulto más allá del control del correo (DA-01/DA-04 siguen abiertos para revisión legal).
- Revocar el consentimiento por parte del adulto (por ahora vía soporte).

## Bitácora
| Fecha | Quién | Qué pasó |
|---|---|---|
| 2026-11-20 | Planificador | Implementado en backend y web; gates en verde (backend `full`, 27 e2e de auth) |
| 2026-11-20 | codex (revisor backend, 1ª) | ALTA: confirmar un enlace sin efecto daba 204 → rollback y 400. MEDIA: reenvío sin comprobar estado bajo bloqueo → comprobado con `FOR UPDATE`. MEDIA: `toAuthUser` con `new Date()` → reloj inyectado obligatorio + test del cumpleaños 14 |
| 2026-11-20 | codex (revisor backend, 2ª) | Pidió e2e de enlace vencido → agregado |
| 2026-11-20 | codex (revisor web) | Token de un solo uso podía salir en `Referer` → `<meta name="referrer" content="no-referrer">` en guardian-consent, verify-email y reset-password (Caddy reescribe el header). Tabla de privacidad: la fecha se guarda al autorizar → corregido. Lo de "falta backend" es el límite conocido de `delegate.sh` por repo |
| 2026-11-20 | Planificador | Capturas escritorio y móvil: registro con correo del adulto, aviso con reenvío/cambio de correo, página del adulto antes y después de autorizar |
