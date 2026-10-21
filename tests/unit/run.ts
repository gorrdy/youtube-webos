// Runs every *.test.ts in this directory. The TypeScript sources need a
// transpiler, so this runs through jiti: `pnpm run test:unit`.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

for (const file of readdirSync(dir).filter((f) => f.endsWith('.test.ts'))) {
  await import(join(dir, file));
}
