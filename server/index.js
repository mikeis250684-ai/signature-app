require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const http  = require('http');

const adminRoutes = require('./routes/admin');
const signRoutes = require('./routes/sign');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/admin', adminRoutes);
app.use('/api/sign', signRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Self-ping every 14 minutes to prevent Render.com free tier from sleeping
  if (process.env.APP_URL) {
    setInterval(() => {
      try {
        const url = new URL(`${process.env.APP_URL}/health`);
        const lib = url.protocol === 'https:' ? https : http;
        lib.get(url.href, res => {
          console.log('Keep-alive ping OK:', res.statusCode);
        }).on('error', err => console.warn('Keep-alive ping failed:', err.message));
      } catch (e) {
        console.warn('Keep-alive error:', e.message);
      }
    }, 14 * 60 * 1000);
  }
});
