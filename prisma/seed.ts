import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedTaxonomies } from './seed-data.js';

const email = process.env.ADMIN_EMAIL?.trim().normalize('NFC').toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required to seed the admin');
}

if (password.length < 12) {
  throw new Error('ADMIN_PASSWORD must have at least 12 characters');
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed the admin');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

try {
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing && existing.role !== 'admin') {
    throw new Error(
      'ADMIN_EMAIL belongs to a non-admin user; refusing to escalate it',
    );
  }

  const passwordHash = await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'admin', status: 'active', deletedAt: null },
    create: { email, passwordHash, role: 'admin', status: 'active' },
  });

  await seedTaxonomies(prisma);

  console.log('Admin user and taxonomies are ready.');
} finally {
  await prisma.$disconnect();
}
