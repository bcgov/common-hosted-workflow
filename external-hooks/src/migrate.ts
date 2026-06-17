import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import path from 'path';
import { CUSTOM_DATABASE_URL } from '@config';

async function main() {
  if (!CUSTOM_DATABASE_URL) {
    throw new Error('CUSTOM_DATABASE_URL is not set');
  }

  const db = drizzle(CUSTOM_DATABASE_URL);
  await migrate(db, { migrationsFolder: path.join(__dirname, 'drizzle') });
  console.log('Migrations completed!');
}

main();
