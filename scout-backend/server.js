const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── DATABASE SETUP ──────────────────────────────────────────
const db = new Database(path.join(__dirname, 'leads.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT,
    email     TEXT NOT NULL,
    whatsapp  TEXT,
    model     TEXT,
    location  TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ── MIDDLEWARE ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── EMAIL HELPER ─────────────────────────────────────────────
async function sendNotification(lead) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) return;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS, // Gmail App Password
    },
  });

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.GMAIL_USER,
    subject: '🏕️ Scout Camper — عميل جديد / New Lead!',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;border:1px solid #ddd;border-radius:12px;overflow:hidden;">
        <div style="background:#2d6a2d;color:white;padding:20px;text-align:center;">
          <h2 style="margin:0;">🏕️ عميل جديد — New Lead!</h2>
        </div>
        <div style="padding:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;color:#555;font-weight:bold;">الاسم / Name</td><td style="padding:8px;">${lead.name || '—'}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;color:#555;font-weight:bold;">البريد / Email</td><td style="padding:8px;"><a href="mailto:${lead.email}">${lead.email}</a></td></tr>
            <tr><td style="padding:8px;color:#555;font-weight:bold;">واتساب / WhatsApp</td><td style="padding:8px;">${lead.whatsapp || '—'}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;color:#555;font-weight:bold;">الموديل / Model</td><td style="padding:8px;">${lead.model || '—'}</td></tr>
            <tr><td style="padding:8px;color:#555;font-weight:bold;">الموقع / Location</td><td style="padding:8px;">${lead.location || '—'}</td></tr>
          </table>
        </div>
        <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:12px;color:#999;">
          Scout Campers Lead System · ${new Date().toLocaleString()}
        </div>
      </div>
    `,
  });
}

// ── ROUTES ───────────────────────────────────────────────────

// POST /submit — receives form data from landing page
app.post('/submit', async (req, res) => {
  const { name, email, whatsapp, model, location } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Save lead to database
  const stmt = db.prepare(
    'INSERT INTO leads (name, email, whatsapp, model, location) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(name || '', email, whatsapp || '', model || '', location || '');

  // Send email notification (non-blocking)
  sendNotification({ name, email, whatsapp, model, location }).catch(console.error);

  res.json({ success: true });
});

// GET /admin — HTML dashboard to view leads
app.get('/admin', (req, res) => {
  const { password } = req.query;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.send(`
      <html dir="ltr"><body style="font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5;">
        <form method="GET" action="/admin" style="background:white;padding:32px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);text-align:center;">
          <h2 style="margin-bottom:20px;">🔒 Admin Login</h2>
          <input name="password" type="password" placeholder="Enter admin password" style="padding:10px;border:2px solid #ddd;border-radius:8px;width:220px;font-size:15px;" />
          <br/><br/>
          <button type="submit" style="background:#2d6a2d;color:white;border:none;padding:10px 28px;border-radius:8px;font-size:15px;cursor:pointer;">Login</button>
        </form>
      </body></html>
    `);
  }

  const leads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();

  const rows = leads.map(l => `
    <tr>
      <td>${l.id}</td>
      <td>${l.name}</td>
      <td><a href="mailto:${l.email}">${l.email}</a></td>
      <td>${l.whatsapp}</td>
      <td>${l.model}</td>
      <td>${l.location}</td>
      <td>${l.created_at}</td>
    </tr>
  `).join('');

  res.send(`
    <html dir="ltr">
    <head>
      <title>Scout Leads Admin</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; background: #f5f5f5; }
        h1 { color: #2d6a2d; }
        table { width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        th { background: #2d6a2d; color: white; padding: 12px 16px; text-align: left; }
        td { padding: 10px 16px; border-bottom: 1px solid #eee; font-size: 14px; }
        tr:hover td { background: #f9fff9; }
        .export-btn { display: inline-block; margin: 16px 0; background: #c8a84b; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; }
        .count { color: #555; margin-bottom: 16px; }
      </style>
    </head>
    <body>
      <h1>🏕️ Scout Camper Leads</h1>
      <p class="count">Total leads: <strong>${leads.length}</strong></p>
      <a class="export-btn" href="/admin/csv?password=${password}">⬇️ Export CSV</a>
      <table>
        <thead>
          <tr><th>#</th><th>Name</th><th>Email</th><th>WhatsApp</th><th>Model</th><th>Location</th><th>Date</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#999;padding:32px;">No leads yet</td></tr>'}</tbody>
      </table>
    </body>
    </html>
  `);
});

// GET /admin/csv — download all leads as CSV
app.get('/admin/csv', (req, res) => {
  const { password } = req.query;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).send('Unauthorized');
  }

  const leads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();

  const escape = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
  const csv = [
    'ID,Name,Email,WhatsApp,Model,Location,Date',
    ...leads.map(l =>
      [l.id, l.name, l.email, l.whatsapp, l.model, l.location, l.created_at]
        .map(escape)
        .join(',')
    ),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=scout-leads.csv');
  res.send('﻿' + csv); // BOM for Excel Arabic support
});

// Health check
app.get('/', (req, res) => res.send('Scout Camper Lead Server ✅'));

// ── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
