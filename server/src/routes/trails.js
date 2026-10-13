const express = require('express');
const router = express.Router();
const db = require('../utils/db');

// GET /api/trails — all culture trails
router.get('/', async (req, res) => {
  const trails = await db.all('culturetrails');
  const [traditions, artists, events, states] = await Promise.all([
    db.all('traditions'), db.all('artists'), db.all('events'), db.all('states')
  ]);
  const enriched = trails.map((t) => enrich(t, { traditions, artists, events, states }));
  res.json(enriched);
});

// GET /api/trails/:id — single enriched trail
router.get('/:id', async (req, res) => {
  const t = await db.findOne('culturetrails', { id: req.params.id });
  if (!t) return res.status(404).json({ error: 'Trail not found' });
  const [traditions, artists, events, states] = await Promise.all([
    db.all('traditions'), db.all('artists'), db.all('events'), db.all('states')
  ]);
  res.json(enrich(t, { traditions, artists, events, states }));
});

function enrich(t, refs) {
  return {
    ...t,
    traditions: refs.traditions.filter((x) => (t.traditions || []).includes(x.id)),
    artists: refs.artists.filter((x) => (t.artists || []).includes(x.id)),
    events: refs.events.filter((x) => (t.events || []).includes(x.id)),
    state: refs.states.find((x) => x.id === t.stateId)
  };
}

module.exports = router;