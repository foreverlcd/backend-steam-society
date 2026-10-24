# 08 · Matching: recomendaciones explicables (Etapa 1.6)

Estado: **borrador**. Las señales, pesos y preguntas de onboarding dependen del equipo de producto [PLACEHOLDER]. El diseño garantiza que cambiarlos sea cambiar configuración, no reescribir código.

## Principios
- El sistema recomienda; la mentee elige (R-05). Nunca asigna.
- Dos capas: **filtros duros** (descartan) y **puntaje ponderado** (ordena). Sin caja negra, sin ML ni LLM en el MVP: no hay datos para entrenar, y una fórmula se puede depurar.
- Cada recomendación trae un **desglose** y una **razón** generada solo desde ese desglose (R-13).
- El matching es una **función pura**: `recommend(mentee, candidatas, config) → lista ordenada con puntaje, desglose y razón`. No toca la base; un servicio fino carga los datos y la llama.

## Capa 1: filtros duros (una mentora debe cumplirlos todos)
1. Perfil `approved` y cuenta activa (R-02).
2. Al menos un idioma en común con la mentee.
3. Al menos un área en común, si la mentee declaró intereses. Si no declaró, el filtro se omite.
4. Al menos un slot libre dentro de los próximos 14 días [PLACEHOLDER] (calculado con el módulo de disponibilidad).
5. Si la mentee eligió "solo gratuitas" o un presupuesto máximo, al menos una oferta que lo cumpla.
6. La mentee no ha bloqueado a la mentora, ni al revés (Hito 3).

Si hay menos de N recomendadas [PLACEHOLDER: 3], se muestran las que haya y el catálogo completo queda siempre accesible.

## Capa 2: puntaje (0 a 100; pesos en configuración, suman 100)
| Señal | Peso inicial [PLACEHOLDER] | Cómo se calcula |
|---|---|---|
| `areas` | 35 | Fracción de los intereses de la mentee cubiertos por las áreas de la mentora; un área exacta pesa más que una raíz común |
| `availability` | 20 | Horas de solape entre la disponibilidad declarada de la mentee y los slots libres de la mentora en los próximos 14 días, convertidas a UTC y normalizadas |
| `language` | 15 | Idiomas en común sobre idiomas de la mentee |
| `level_fit` | 15 | Cercanía entre los años de experiencia de la mentora y el nivel (`education_level`, etapa de carrera) de la mentee |
| `price_fit` | 10 | 10 si hay una oferta gratuita o dentro del presupuesto; escala hacia 0 si no |
| `reliability` | 5 | Tasa de respuesta y calificaciones de la mentora; neutral (50 %) mientras no haya datos |

Salida por mentora: `{ mentorId, score, breakdown: [{ signal, points, max, detail }], reason }`.

## Razón visible
La frase "te la recomendamos porque…" se arma con plantillas a partir de los **dos componentes con más puntos** (y solo componentes con `points > 0`). Ejemplo: "Comparte tu interés en Robótica y habla español". Está prohibido que un LLM la redacte libremente. Más adelante podría reformular la frase sin añadir hechos, y eso se verifica con un test.

## Qué preguntas del onboarding alimentan cada señal
- Mentee: áreas de interés → `areas`; idiomas → `language`; nivel educativo y etapa → `level_fit`; disponibilidad semanal → `availability`; presupuesto o "solo gratuitas" → `price_fit`.
- Mentora: áreas → `areas`; idiomas → `language`; años de experiencia → `level_fit`; reglas de disponibilidad → `availability`; ofertas → `price_fit`.
- Texto libre (objetivos, bio): no puntúa en el MVP; solo se muestra. Candidato a embeddings en etapas posteriores.

## Evaluación (evidencia exigida)
- **Personas sintéticas**: fixture versionado de ~20 mentees y ~30 mentoras con un top-3 esperado escrito a mano.
- **precision@3** calculada por un script (`scripts/eval-matching`) y reportada en cada cambio de pesos. Meta inicial: 0,6 [PLACEHOLDER].
- **Juicio humano**: el equipo empareja a mano a 10 mentees reales con mentoras reales; se compara con la salida del motor. Es evidencia externa y reemplaza cualquier opinión interna.
- Tests de propiedad: nunca aparece una mentora no aprobada; el puntaje está entre 0 y 100; cada frase de la razón corresponde a un componente con puntos > 0; cambiar los pesos cambia el orden de forma predecible.
- Sesgos: revisar que ningún peso favorezca sistemáticamente a ciertos perfiles (país, idioma, área). Registrar hallazgos en `PROGRESS.md`.

## Mejoras posteriores (no ahora)
1. Persistir cada recomendación mostrada y su resultado (reservó, descartó) para evaluar y ajustar.
2. Embeddings para similitud de textos (bio y objetivos), con costo y valor evaluados antes.
3. Análisis de CV con LLM (extraer áreas y experiencia): solo con consentimiento y sin enviar datos personales a terceros sin decisión explícita.
4. Aprender los pesos desde datos reales cuando existan cientos de interacciones.
