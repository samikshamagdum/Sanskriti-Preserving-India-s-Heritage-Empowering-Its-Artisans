const express = require('express');
const router = express.Router();
const db = require('../utils/db');

// GET /api/packs — all offline culture packs
router.get('/', async (req, res) => {
  res.json(await db.all('culturepacks'));
});

// GET /api/packs/:id — full pack contents (stories, images, audio, quizzes)
router.get('/:id', async (req, res) => {
  const pack = await db.findOne('culturepacks', { id: req.params.id });
  if (!pack) return res.status(404).json({ error: 'Pack not found' });
  res.json(pack);
});

// POST /api/packs/:id/download — record a download (metdata only, no spoofing the file)
router.post('/:id/download', async (req, res) => {
  const pack = await db.findOne('culturepacks', { id: req.params.id });
  if (!pack) return res.status(404).json({ error: 'Pack not found' });
  const updated = await db.update('culturepacks', { id: pack.id }, { downloads: (pack.downloads || 0) + 1 });
  res.json({ id: pack.id, downloads: (updated && updated.downloads) || (pack.downloads || 0) + 1 });
});

module.exports = router;