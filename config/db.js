const mysql = require('mysql2/promise');
require('dotenv').config();

// Connection pool to RDS MySQL instance
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Connected to MySQL (RDS) successfully');
    conn.release();
  } catch (err) {
    console.error('❌ Failed to connect to MySQL (RDS):', err.message);
  }
}

module.exports = { pool, testConnection };
