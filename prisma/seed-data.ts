import type { PrismaClient } from '../src/generated/prisma/client.js';

export const LANGUAGES = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'Inglés' },
  { code: 'qu', name: 'Quechua' },
] as const;

// Provisional STEAM taxonomy. The product team will replace these lists.
export const AREAS = [
  {
    name: 'Ciencia',
    children: [
      'Biología',
      'Química',
      'Ciencias ambientales',
      'Neurociencia',
      'Investigación científica',
      'Ciencia aplicada',
    ],
  },
  {
    name: 'Tecnología',
    children: [
      'Programación / desarrollo de software',
      'Data Science / análisis de datos',
      'Inteligencia artificial',
      'Ciberseguridad',
      'UX / producto digital',
      'Tecnología para impacto social',
    ],
  },
  {
    name: 'Ingeniería',
    children: [
      'Mecatrónica',
      'Automatización industrial',
      'Ingeniería de sistemas',
      'Electrónica',
      'Robótica',
      'Procesos industriales',
    ],
  },
  {
    name: 'Matemáticas',
    children: [
      'Estadística',
      'Modelamiento matemático',
      'Matemáticas aplicadas',
      'Finanzas',
    ],
  },
] as const;

export async function seedTaxonomies(prisma: PrismaClient): Promise<void> {
  for (const language of LANGUAGES) {
    await prisma.language.upsert({
      where: { code: language.code },
      update: { name: language.name },
      create: language,
    });
  }

  for (const root of AREAS) {
    const parent = await prisma.area.upsert({
      where: { name: root.name },
      update: { parentId: null, active: true },
      create: { name: root.name },
    });

    for (const childName of root.children) {
      await prisma.area.upsert({
        where: { name: childName },
        update: { parentId: parent.id, active: true },
        create: { name: childName, parentId: parent.id },
      });
    }
  }
}
