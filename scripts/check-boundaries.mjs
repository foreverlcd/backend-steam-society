#!/usr/bin/env node
// Architecture boundary check (harness, docs/HARNESS.md).
// Fails when an import breaks the module graph or the layer rules in
// docs/02-ARCHITECTURE.md. Error messages tell the agent HOW to fix it.
// No dependencies: plain Node, regex over import specifiers.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'src';

// Allowed dependencies between top-level units (src/modules/<m>, src/shared,
// src/config, src/health, src/generated, 'app' = files directly in src/).
// Adding an edge is an architecture decision: record it in docs/07-DECISIONS.md.
const ALLOWED = {
  app: '*',
  config: [],
  generated: [],
  shared: ['config', 'generated'],
  health: ['shared'],
  auth: ['shared', 'config', 'generated'],
  profiles: ['auth', 'shared', 'config', 'generated'],
  scheduling: ['auth', 'profiles', 'shared', 'config', 'generated'],
  bookings: ['auth', 'profiles', 'scheduling', 'shared', 'config', 'generated'],
  catalog: ['profiles', 'scheduling', 'shared', 'config', 'generated'],
  matching: ['auth', 'profiles', 'scheduling', 'shared', 'config', 'generated'],
  payments: ['auth', 'bookings', 'shared', 'config', 'generated'],
};

const LAYERS = ['domain', 'application', 'infrastructure', 'presentation'];
// Packages the domain layer must never import (keep it pure and testable).
const DOMAIN_FORBIDDEN_PKG = /^(@nestjs\/|@prisma\/|express|argon2|nodemailer)/;

const isTest = (f) => /\.(spec|e2e-spec)\.ts$/.test(f);

function unitOf(file) {
  const rel = path.relative(ROOT, file).split(path.sep);
  if (rel[0] === 'modules') return rel[1];
  return rel.length === 1 ? 'app' : rel[0];
}

function layerOf(file) {
  const parts = file.split(path.sep);
  return LAYERS.find((l) => parts.includes(l)) ?? null;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (p !== path.join(ROOT, 'generated')) walk(p, out);
    } else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const errors = [];

for (const file of walk(ROOT)) {
  if (isTest(file)) continue; // tests may wire concrete adapters
  const src = fs.readFileSync(file, 'utf8');
  const from = unitOf(file);
  const fromLayer = layerOf(file);
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    const line = src.slice(0, m.index).split('\n').length;
    const where = `${file}:${line}`;

    if (!spec.startsWith('.')) {
      if (fromLayer === 'domain' && DOMAIN_FORBIDDEN_PKG.test(spec)) {
        errors.push(
          `${where}: domain imports '${spec}'.\n  FIX: domain/ must be pure TypeScript. Move framework/DB code to infrastructure/ or application/, and pass plain data into the domain function.`,
        );
      }
      continue;
    }

    const target = path.normalize(path.join(path.dirname(file), spec));
    const to = unitOf(target);
    const toLayer = layerOf(target);

    if (from !== to) {
      const allowed = ALLOWED[from];
      if (allowed === undefined) {
        errors.push(
          `${where}: unit '${from}' is not registered in scripts/check-boundaries.mjs.\n  FIX: add it to ALLOWED with its real dependencies and document the module in docs/02-ARCHITECTURE.md.`,
        );
      } else if (allowed !== '*' && !allowed.includes(to)) {
        errors.push(
          `${where}: '${from}' must not depend on '${to}' (imports '${spec}').\n  FIX: invert the dependency with a port: declare an interface in ${from}/application/ports/ and implement it in the module that owns the data (see payments → BookingPaymentPort). If the new edge is truly needed, record an ADR in docs/07-DECISIONS.md and add it to ALLOWED.`,
        );
      }
      if (toLayer === 'infrastructure' || toLayer === 'presentation') {
        errors.push(
          `${where}: reaches into another module's ${toLayer}/ ('${spec}').\n  FIX: depend on that module's service, domain types or application/ports instead; adapters and controllers are private to their module.`,
        );
      }
      continue;
    }

    if (fromLayer === 'domain' && toLayer && toLayer !== 'domain') {
      errors.push(
        `${where}: domain imports ${toLayer}/ ('${spec}').\n  FIX: domain/ may only import other domain/ files. Move the logic up to application/ or pass the value in as a parameter.`,
      );
    }
    if (fromLayer === 'application' && (toLayer === 'infrastructure' || toLayer === 'presentation')) {
      errors.push(
        `${where}: application imports ${toLayer}/ ('${spec}').\n  FIX: define a port in application/ports/ and bind the implementation in <module>.module.ts.`,
      );
    }
  }
}

if (errors.length) {
  console.error(`check-boundaries: ${errors.length} violation(s)\n`);
  console.error(errors.join('\n\n'));
  console.error('\nRules: docs/02-ARCHITECTURE.md · Harness: docs/HARNESS.md');
  process.exit(1);
}
console.log('check-boundaries: OK');
