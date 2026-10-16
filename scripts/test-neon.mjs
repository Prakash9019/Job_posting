import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

async function run() {
  const connectionString = 'postgresql://neondb_owner:npg_IbWoODh2ZsR7@ep-proud-salad-b4rjbujn-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';
  const client = new Client({ connectionString });
  await client.connect();
  console.log('✓ Connected to Neon successfully!');

  const sqlPath = path.resolve('prisma/postgresql-migrations/20261013000000_initial/migration.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await client.query(sql);
  console.log('✓ Database schema tables created in Neon!');

  const tablesRes = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  console.log('✓ Public tables found in Neon:', tablesRes.rows.map(r => r.table_name));

  const userRes = await client.query('SELECT id, name FROM "User"');
  if (userRes.rows.length === 0) {
    await client.query(
      `INSERT INTO "User" (id, name, email, "updatedAt") 
       VALUES ('user_a', 'User A', 'user_a@example.com', NOW()),
              ('user_b', 'User B', 'user_b@example.com', NOW())`
    );
    console.log('✓ Seeded pilot users: user_a & user_b');
  } else {
    console.log('✓ Users already present:', userRes.rows);
  }

  await client.end();
  console.log('\n=============================================');
  console.log('🎉 NEON DATABASE TEST: 100% SUCCESSFUL & READY!');
  console.log('=============================================');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
