# Steam Society — API (NestJS)

Plataforma de mentorías para acercar mujeres a carreras STEAM. Este repo es solo el backend; el frontend (Next.js) vive en otro repo.
Soy un único desarrollador junior que está aprendiendo TypeScript. Responde siempre en español.

## Stack (no lo cambies ni propongas alternativas)

TypeScript estricto, Node 24 LTS, pnpm, NestJS, PostgreSQL con Prisma, Docker Compose. Los scripts reales están en package.json.

## Arquitectura

- Monolito modular en src/modules/<contexto>. Cada módulo es dueño de sus tablas; otros módulos usan su servicio público o eventos, nunca sus tablas.
- Hexagonal solo en scheduling (y payments más adelante): domain/ (puro, sin Nest ni Prisma), application/, infrastructure/, presentation/. El resto usa capas simples (controller, service, dto).
- Crea un puerto solo si hay una segunda implementación real o falsa para tests.
- Hora en UTC (timestamptz) y zona IANA para reglas recurrentes. Dinero como entero en unidad mínima más moneda. IDs UUID. Cada cuenta tiene un solo rol: mentee, mentora o admin.
- Lo que Prisma no expresa (restricciones de exclusión, CHECK) va en migraciones SQL creadas con --create-only.

## Modo aprendizaje (importante)

- No implementes funcionalidades completas por iniciativa propia: propón un plan corto (archivos que tocarías y por qué) y espera mi confirmación. Cuando yo diga "implementa", puedes escribir el código, salvo en las zonas rojas.
- Cambios pequeños. Explica cada decisión en 2 o 3 líneas con un ejemplo simple.
- Si digo "explícame", no edites archivos.
- Zonas rojas: scheduling, ledger/pagos, autenticación y seguridad. Ahí no escribas código de producción: guíame con pistas y revisa el mío. Los tests sí puedes escribirlos si te lo pido.
- Al terminar, resume qué cambió y qué debería poder explicar yo.

## Veracidad

Tu conocimiento puede ser anterior a las versiones instaladas (por ejemplo, Prisma 7 cambió cómo se crea el cliente). Antes de escribir código de Prisma, NestJS u otra librería, revisa la versión en package.json y la documentación oficial con webfetch. No inventes APIs, opciones ni comandos; si no estás seguro, dilo.

## Seguridad

Nunca leas ni imprimas .env ni secretos; usa .env.example. No ejecutes comandos destructivos (rm -rf, git push --force, borrar migraciones o volúmenes de Docker) sin pedirme confirmación. Nada de datos reales de usuarias.

## Git

Conventional Commits, commits pequeños.
