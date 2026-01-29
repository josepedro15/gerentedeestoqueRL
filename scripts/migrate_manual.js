
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env from frontend/.env
const envPath = path.resolve(__dirname, '../frontend/.env');
dotenv.config({ path: envPath });

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
  ssl: { rejectUnauthorized: false }
});

const sqlFiles = [
  'database/schema.sql',
  'database/create_user_profiles.sql',
  'database/create_user_settings.sql',
  'database/create_chat_tables.sql',
  'database/create_simulation_log.sql'
];

async function migrate() {
  try {
    console.log('🔌 Conectando ao banco de dados...');
    await client.connect();
    console.log('✅ Conectado!');

    for (const file of sqlFiles) {
      console.log(`\n📄 Executando ${file}...`);
      const filePath = path.resolve(__dirname, '..', file);
      if (fs.existsSync(filePath)) {
        const sql = fs.readFileSync(filePath, 'utf8');
        try {
            await client.query(sql);
            console.log(`✅ ${file} executado com sucesso.`);
        } catch (err) {
            console.error(`❌ Erro ao executar ${file}:`, err.message);
            // Dont stop, keep trying other files (some flags create table if not exists)
        }
      } else {
        console.warn(`⚠️ Arquivo não encontrado: ${filePath}`);
      }
    }
    
    console.log('\n🏁 Migração finalizada!');
  } catch (err) {
    console.error('❌ Erro fatal:', err);
  } finally {
    await client.end();
  }
}

migrate();
