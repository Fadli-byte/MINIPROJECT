// db.js
const mysql = require('mysql2');
const dotenv = require('dotenv');

// Memuat variabel lingkungan
dotenv.config();

// Koneksi database
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect((err) => {
  if (err) throw err;
  console.log('Terhubung ke MySQL');
});

module.exports = db;node 