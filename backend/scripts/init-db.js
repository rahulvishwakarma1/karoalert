const mysql   = require('mysql2/promise');
require('dotenv').config();

const DB_CONFIG = {
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'qr_parking',
};

// ── Safe multi-statement splitter (handles ENUM / quoted / comments) ──────
function sqlStatements(sql) {
  // Strip /* block comments */ and -- line comments
  const clean = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');

  // Split on ';' that are outside single-quotes
  const tokens = [];
  let cur = '', inQ = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === "'" && clean[i - 1] !== '\\') { inQ = !inQ; }
    if (ch === ';' && !inQ) {
      const stmt = cur.trim();
      if (stmt) tokens.push(stmt);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) tokens.push(cur.trim());
  return tokens;
}

function readSchema() {
  const fs   = require('fs');
  const path = require('path');
  const p    = path.join(__dirname, '..', 'database', 'schema.sql');
  return fs.readFileSync(p, 'utf8');
}

async function init() {
  console.log('🗄️  Initializing qralertgo Database…');

  try {
    // 1. Connect without DB
    const conn = await mysql.createConnection({
      host: DB_CONFIG.host,
      user: DB_CONFIG.user,
      password: DB_CONFIG.password,
    });
    console.log('✅ Connected to MySQL');

    // 2. Drop + recreate for clean state (as currently specified)
    await conn.query(`DROP DATABASE IF EXISTS ${DB_CONFIG.database}`);
    console.log('✅ Dropped existing database');

    await conn.query(
      `CREATE DATABASE ${DB_CONFIG.database}
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`📊 Database '${DB_CONFIG.database}' recreated`);

    await conn.changeUser({ database: DB_CONFIG.database });
    console.log('📋 Selected database');

    // 3. Execute schema
    const raw = readSchema();
    const stmts = sqlStatements(raw);

    // Count before schema expansion
    if (!stmts.length) {
      console.warn('⚠️  schema.sql is empty, skipping');
    } else {
      console.log(`📝 Executing ${stmts.length} SQL statements…`);
    }

    let ok = 0, warn = 0;
    for (const stmt of stmts) {
      try {
        await conn.query(stmt);
        ok++;
      } catch (err) {
        // DROP DATABASE IF EXISTS inside a USE'd DB throws ER_BAD_DB_ERROR
        // — that's harmless.  CREATE TABLE IF NOT EXISTS "table exists" same.
        warn++;
      }
    }
    console.log(`✅ Executed: ${ok} OK, ${warn} warnings/dropped`);

    // 4. Print tables
    const [rows] = await conn.execute('SHOW TABLES');
    if (rows.length > 0) {
      console.log('\n📋 Tables created:');
      rows.forEach(r => console.log(`   📁 ${Object.values(r)[0]}`));
    }

    console.log('\n🎉 Database initialization complete!\n');
    await conn.end();
  } catch (err) {
    console.error('❌ Init failed:', err.message);
    process.exit(1);
  }
}

init();
