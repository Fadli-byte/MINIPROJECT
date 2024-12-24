// Impor dependensi
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2');
const http = require('http');
const { Server } = require('socket.io');
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

// Setup aplikasi Express
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// WebSocket
io.on('connection', (socket) => {
  console.log('Klien terhubung');
});

// Fungsi pembantu
const notifyClients = (pesan, data) => {
  io.emit('data_changed', { event: 'data_changed', message: pesan, data });
  console.log(`Notifikasi: ${pesan}`, data);
};

// Middleware untuk verifikasi JWT
const authMiddleware = (roles = []) => {
  return (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ message: 'Token diperlukan' });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return res.status(403).json({ message: 'Token tidak valid' });
      req.user = decoded;

      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ message: 'Akses ditolak' });
      }
      next();
    });
  };
};

// Rute
// Rute Autentikasi
app.post('/auth/register', authMiddleware(['admin']), async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) return res.status(400).json({ message: 'Semua field diperlukan' });

  const hashedPassword = await bcrypt.hash(password, 10);

  db.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashedPassword, role], (err) => {
    if (err) return res.status(500).json({ message: 'Gagal membuat pengguna' });
    res.status(201).json({ message: 'Pengguna berhasil dibuat' });
  });
});

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;

  const adminUsername = 'admin'; 
  const adminPassword = 'password123'; 

  // Memeriksa apakah username dan password cocok dengan admin
  if (username === adminUsername && password === adminPassword) {
    const token = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    return res.json({ token, username: adminUsername });
  }

  db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
    if (err) return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    if (results.length === 0) return res.status(404).json({ message: 'Pengguna tidak ditemukan' });

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) return res.status(401).json({ message: 'Kredensial tidak valid' });

    const token = jwt.sign({ id: user.id_user, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, username: user.username });
  });
});

// Rute CRUD Kapal
app.post('/kapal', authMiddleware(['admin']), (req, res) => {
  const { nama_kapal, jenis_kapal, kapasitas_muatan } = req.body;

  if (!nama_kapal || !jenis_kapal || !kapasitas_muatan || kapasitas_muatan <= 0) {
    return res.status(400).json({ message: 'Nama Kapal Tidak Boleh Kosong dan Kapasitas Harus Bernilai Positif' });
  }

  db.query('INSERT INTO kapal (nama_kapal, jenis_kapal, kapasitas_muatan, waktu_terdaftar) VALUES (?, ?, ?, NOW())', [nama_kapal, jenis_kapal, kapasitas_muatan], (err, result) => {
    if (err) return res.status(500).json({ message: 'Gagal menambahkan kapal' });

    notifyClients('Data kapal telah ditambahkan.', { id_kapal: result.insertId, nama_kapal, jenis_kapal, kapasitas_muatan });
    res.status(201).json({ message: 'Kapal berhasil ditambahkan' });
  });
});

app.get('/kapal', authMiddleware(), (req, res) => {
  db.query('SELECT * FROM kapal', (err, results) => {
    if (err) return res.status(500).json({ message: 'Gagal mengambil data' });
    res.json(results);
  });
});

app.get('/kapal/:id', authMiddleware(), (req, res) => {
  const { id } = req.params;

  db.query('SELECT * FROM kapal WHERE id_kapal = ?', [id], (err, results) => {
    if (err || results.length === 0) return res.status(404).json({ message: 'Kapal tidak ditemukan' });
    res.json(results[0]);
  });
});

app.put('/kapal/:id', authMiddleware(['admin']), (req, res) => {
  const { id } = req.params;
  const { nama_kapal, jenis_kapal, kapasitas_muatan } = req.body;

  if (!nama_kapal || !jenis_kapal || !kapasitas_muatan || kapasitas_muatan <= 0) {
    return res.status(400).json({ message: 'Data tidak valid' });
  }

  db.query('UPDATE kapal SET nama_kapal = ?, jenis_kapal = ?, kapasitas_muatan = ? WHERE id_kapal = ?', [nama_kapal, jenis_kapal, kapasitas_muatan, id], (err) => {
    if (err) return res.status(500).json({ message: 'Gagal memperbarui kapal' });

    notifyClients('Data kapal telah diperbarui.', { id_kapal: id, nama_kapal, jenis_kapal, kapasitas_muatan });
    res.json({ message: 'Kapal berhasil diperbarui' });
  });
});

app.delete('/kapal/:id', authMiddleware(['admin']), (req, res) => {
  const { id } = req.params;

  db.query('DELETE FROM kapal WHERE id_kapal = ?', [id], (err) => {
    if (err) return res.status(500).json({ message: 'Gagal menghapus kapal' });

    notifyClients('Data kapal telah dihapus.', { id_kapal: id });
    res.json({ message: 'Kapal berhasil dihapus' });
  });
});

// Jalankan server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
