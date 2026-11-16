# Guion de demo (5 minutos)

Objetivo (1.7): que tres personas del equipo completen el flujo sin ayuda.
Todos los datos son ficticios (`@demo.steamsociety.local`).

## Preparación (una vez)

1. Backend: `docker compose up -d`, `pnpm db:migrate`, `pnpm db:seed`.
2. API con pagos simulados: `pnpm build && PAYMENTS_PROVIDER=fake node dist/main`.
3. Datos demo: `DEMO_PASSWORD='…' pnpm db:seed:demo`.
4. Web: en `../frontend-steam-society`, `pnpm dev` → http://localhost:3001.
5. Mailpit para ver los correos: http://localhost:8025.

| Cuenta | Rol | Para qué |
|---|---|---|
| `camila.huaman@demo.steamsociety.local` | Mentorada (Tecnología/IA) | Buscar, reservar y pagar |
| `andrea.flores@demo.steamsociety.local` | Mentorada (Ciencia) | Recomendaciones distintas |
| `valeria.quispe@demo.steamsociety.local` | Mentora (datos/IA) | Oferta gratuita y de pago |
| `rosa.mamani@demo.steamsociety.local` | Mentora (biología) | Oferta gratuita |
| `lucia.torres@demo.steamsociety.local` | Mentora (mecatrónica) | Oferta gratuita |
| `ADMIN_EMAIL` del `.env` | Admin | Revisar mentoras |

Contraseña de las cuentas demo: el `DEMO_PASSWORD` que usaste.

## Guion

1. **(0:00) Catálogo público.** Sin sesión, abre `/mentors`. Busca "datos".
   Filtra por "gratis". Abre el perfil de Valeria.
2. **(0:45) Recomendaciones.** Inicia sesión como Camila. En `/dashboard`
   aparecen hasta 3 mentoras con su razón ("comparte tu interés en…").
3. **(1:30) Reserva gratuita.** En el perfil de Valeria elige "Primera
   conversación", un horario y envía la solicitud. Queda `Solicitada`.
4. **(2:15) La mentora acepta.** En otra ventana (o en una ventana privada),
   entra como Valeria → `/dashboard/bookings`, pega un enlace `https://…` y
   acepta. Camila ve `Confirmada` y el enlace; llega un correo a Mailpit.
5. **(3:00) Reserva de pago.** Camila reserva "Revisión de portafolio"
   (S/ 50). Valeria la acepta: queda `Pendiente de pago`. Camila pulsa
   **Pagar**, llega al pago simulado y elige "Simular pago aprobado". La
   reserva pasa a `Confirmada`.
6. **(4:00) Admin.** Entra como admin → `/admin`: bandeja de mentoras,
   detalle del onboarding y acciones aprobar/rechazar/suspender.
7. **(4:40) Cierre.** Muestra que una reserva rechazada o cancelada libera el
   horario, y que con `PAYMENTS_PROVIDER=disabled` el botón Pagar desaparece.

## Si algo falla

- 429 "Demasiados intentos": espera un minuto (límite de login por correo).
- Catálogo vacío: falta `pnpm db:seed:demo` o la API no está en el puerto 3000.
- No hay horarios: la disponibilidad demo cubre los próximos 60 días de lunes a
  sábado; vuelve a ejecutar `pnpm db:seed:demo` para renovarla.
