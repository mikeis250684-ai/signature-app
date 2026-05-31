require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

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
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
