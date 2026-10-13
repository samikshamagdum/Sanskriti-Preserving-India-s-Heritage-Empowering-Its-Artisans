require('dotenv').config();

const express = require('express');

const cors = require('cors');

const mongoose = require('mongoose');

const rateLimit = require('express-rate-limit');

const helmet = require('helmet');

const db = require('./utils/db');

const { seedAdmin } = require('./utils/seedAdmin');



const app = express();

app.use(helmet());



const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean) : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({

  origin: function(origin, callback) {

    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    return callback(new Error('Not allowed by CORS'));

  },

  credentials: true

}));

app.use(express.json({ limit: '1mb' }));

app.use(express.urlencoded({ extended: true, limit: '100kb' }));



// Basic rate limiting for the public API.

app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 150, standardHeaders: true }));



app.use('/api/culture', require('./routes/culture'));

app.use('/api/source', require('./routes/source'));

app.use('/api/auth', require('./routes/auth'));

app.use('/api/contributions', require('./routes/contributions'));

app.use('/api/ai', require('./routes/assistant'));

app.use('/api/ai', require('./routes/ai'));

app.use('/api/knowledge', require('./routes/knowledge'));

app.use('/api/voice', require('./routes/voice'));

app.use('/api/studio', require('./routes/studio'));

app.use('/api/trails', require('./routes/trails'));

app.use('/api/packs', require('./routes/packs'));

app.use('/api/whatsapp', require('./routes/whatsapp'));

app.use('/api/marketplace', require('./routes/marketplace'));

app.use('/api/catalog', require('./routes/catalog'));



app.get('/api/health', (req, res) => {

  res.json({

    status: 'ok',

    service: 'sanskriti',

    db: db.mode(),

    dataset: db.dataset(),

    gemini: !!process.env.GEMINI_API_KEY,

    cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,

    time: new Date().toISOString()

  });

});



// Multer / validation error handler

app.use((err, req, res, next) => {

  if (err && err.code === 'LIMIT_FILE_SIZE') {

    return res.status(400).json({ error: 'Uploaded file exceeds the allowed size limit' });

  }

  if (err && err.message && (err.message.includes('Unsupported') || err.message.includes('smaller'))) {

    return res.status(400).json({ error: err.message });

  }

  if (err) {

    return res.status(err.status || 500).json({ error: err.message || 'Server error' });

  }

  next();

});



async function connectMongo() {

  const uri = process.env.MONGO_URI;

  if (!uri) {

    console.log('[db] MONGO_URI not set - using in-memory demo database (fully functional).');

    return;

  }

  try {

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

    db.setMongo(true);

    console.log(Connected to MongoDB Atlas.);

    await db.seedIfNeeded();

  } catch (e) {

    console.log('[db] MongoDB unavailable - using in-memory demo database. Cause: ' + e.message);

    db.setMongo(false);

  }

}



const PORT = process.env.PORT || 5000;



function start() {

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {

    throw new Error('JWT_SECRET must be set and at least 32 characters long');

  }

  app.listen(PORT, async () => {

    await connectMongo();

    await seedAdmin();

    console.log(SANSKRITI server running on http://localhost:);

    console.log(  Mode:  | Gemini:  | Cloudinary: );

  });

}



start();



module.exports = { app, start };