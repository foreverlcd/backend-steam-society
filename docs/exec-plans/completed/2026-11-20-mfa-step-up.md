# Pedir contraseña para activar la 2FA y avisar por correo

- **Repo:** ambos
- **Dificultad:** alta (planificador; zona roja: auth)
- **Rama:** fix/mfa-step-up

## Objetivo
Con una sesión robada de una cuenta sin 2FA, un atacante podía enrolar su propia app TOTP, cerrar las sesiones del dueño y quedarse con los códigos de recuperación (revisión de seguridad 2026-11-20, hallazgo Baja #2). Ahora `POST /me/mfa/totp/setup` exige la contraseña y, al confirmar, se avisa por correo.

## Contexto mínimo
- `src/modules/auth/mfa.service.ts`, `mfa.controller.ts`, `auth.schemas.ts`, `mailer.service.ts`
- `src/modules/auth/account-security.service.ts` (`assertStepUp`, patrón `notify`)
- Web: `src/lib/api/mfa.ts`, `src/components/account/security-view.tsx`

## Archivos a tocar
- Backend: los cuatro de arriba + `mfa.service.spec.ts`, `test/auth.e2e-spec.ts`, `test/account-security.e2e-spec.ts` (si enrola 2FA), README (contrato), `docs/FLOWS.md` si describe el alta de 2FA, `docs/PROGRESS.md`
- Web: `src/lib/api/mfa.ts`, `src/components/account/security-view.tsx` (+ test), `AGENTS.md`

## Pasos
1. `totpSetupSchema = { password }` estricto; `startTotpSetup(user, password)` verifica la contraseña (`INVALID_CREDENTIALS` 401) antes de generar el secreto.
2. `confirmTotpSetup` encola `auth.mfa_enabled` (aviso best effort) al activar.
3. Web: pedir la contraseña antes de mostrar el QR.

## Criterio de terminado
- [x] Setup sin contraseña → 400; con contraseña incorrecta → 401 y no se guarda secreto.
- [x] Al confirmar se encola el aviso `auth.mfa_enabled`.
- [x] Tests unitarios y e2e nuevos; web con test del formulario.
- [x] `scripts/gate.sh full` y gate web en verde; capturas de la pantalla de seguridad.
- [x] Docs: README, AGENTS (web), PROGRESS.

## Fuera de alcance
- Cambiar el flujo de desactivación (ya pide contraseña + código).

## Bitácora
| Fecha | Quién | Qué pasó |
|---|---|---|
| 2026-11-20 | Planificador | Plan creado a partir de la revisión de seguridad |
| 2026-11-20 | Planificador | Implementado en backend y web; gates en verde |
| 2026-11-20 | codex (revisor, dos pasadas) | Cada pasada vio un solo repo y pidió la mitad del otro; juntas, sin hallazgos de código |
