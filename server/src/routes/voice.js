const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../utils/db');
const gemini = require('../utils/gemini');
const cloudinary = require('../utils/cloudinary');
const { authRequired, adminRequired } = require('../utils/middleware');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: cloudinary.MAX_AUDIO } });

// POST /api/voice/upload — audio upload → Cloudinary → speech-to-text → language detection → draft for review.
router.post('/upload', authRequired, upload.single('audio'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'An audio file is required' });

  try {
    cloudinary.validateAudio(file.mimetype, file.size);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  let audioUrl = '';
  let cloudinaryPublicId = '';
  try {
    const up = await cloudinary.uploadBuffer(file.buffer, { folder: 'sanskriti/voice', resource_type: 'raw' });
    audioUrl = up.url;
    cloudinaryPublicId = up.publicId;
  } catch (e) {
    console.log('[voice] Cloudinary unavailable: ' + e.message);
  }

  let transcript = '';
  let detectedLanguage = '';
  let summary = '';
  let suggestedCategory = 'oral-history';
  let translation = '';

  if (gemini.isConfigured()) {
    try {
      const ai = await gemini.transcribeAudio(file.buffer, file.mimetype);
      transcript = (ai.transcript || '').trim();
      detectedLanguage = ai.detectedLanguage || 'Unknown';
      summary = ai.summary || '';
      suggestedCategory = ai.suggestedCategory || 'oral-history';
      if (transcript) {
        try {
          translation = await gemini.translateText(transcript);
        } catch (e) { translation = ''; }
      }
    } catch (e) {
      console.log('[voice] Transcription failed: ' + e.message);
    }
  }

  const body = req.body || {};
  const record = {
    id: db.uid('v'),
    title: (body.title || '').toString().trim() || 'Untitled voice contribution',
    audioUrl,
    cloudinaryPublicId,
    audioName: file.originalname || 'recording',
    audioSize: file.size,
    mime: file.mimetype,
    language: (body.language || detectedLanguage || '').toString().slice(0, 100),
    detectedLanguage,
    region: (body.region || '').toString().slice(0, 100),
    stateId: body.stateId || '',
    stateName: '',
    category: (body.category || suggestedCategory).toString().slice(0, 60),
    transcript,
    translation,
    summary: summary || '',
    storyteller: (body.storyteller || '').toString().slice(0, 200),
    sourceInfo: (body.source === 'record' ? 'Browser recording' : 'File upload'),
    status: 'draft',
    reviewStatus: 'draft',
    author: req.user.name,
    authorId: req.user.id
  };

  if (record.stateId) {
    const states = await db.all('states');
    const s = states.find((x) => x.id === record.stateId);
    if (s) record.stateName = s.name;
  }

  await db.insert('voiceheritage', record);
  res.status(201).json(record);
});

// GET /api/voice/:id — single draft (owner) or published record.
router.get('/:id', authRequired, async (req, res) => {
  const v = await db.findOne('voiceheritage', { id: req.params.id });
  if (!v) return res.status(404).json({ error: 'Voice contribution not found' });
  if (v.authorId !== req.user.id && req.user.role !== 'admin' && v.status !== 'published') {
    return res.status(403).json({ error: 'Not allowed' });
  }
  res.json(v);
});

// PUT /api/voice/:id/review — user reviews/edits transcript/language/category then submits for verification.
router.put('/:id/review', authRequired, async (req, res) => {
  const v = await db.findOne('voiceheritage', { id: req.params.id });
  if (!v) return res.status(404).json({ error: 'Voice contribution not found' });
  if (v.authorId !== req.user.id) return res.status(403).json({ error: 'Not allowed' });
  const update = {
    transcript: (req.body.transcript ?? v.transcript).toString().slice(0, 20000),
    language: (req.body.language ?? v.language).toString().slice(0, 100),
    translation: (req.body.translation ?? v.translation).toString().slice(0, 20000),
    region: (req.body.region ?? v.region).toString().slice(0, 100),
    category: (req.body.category ?? v.category).toString().slice(0, 60),
    storyteller: (req.body.storyteller ?? v.storyteller).toString().slice(0, 200),
    title: (req.body.title ?? v.title).toString().slice(0, 200),
    story_content: undefined // reserved
  };
  delete update.story_content;
  if (req.body.stateId && req.body.stateId !== v.stateId) {
    update.stateId = req.body.stateId;
    const states = await db.all('states');
    const s = states.find((x) => x.id === req.body.stateId);
    if (s) update.stateName = s.name;
  }
  const updated = await db.update('voiceheritage', { id: v.id }, update);
  res.json(updated);
});

// PUT /api/voice/:id/submit — user submits the reviewed draft for verification.
router.put('/:id/submit', authRequired, async (req, res) => {
  const v = await db.findOne('voiceheritage', { id: req.params.id });
  if (!v) return res.status(404).json({ error: 'Voice contribution not found' });
  if (v.authorId !== req.user.id) return res.status(403).json({ error: 'Not allowed' });
  const updated = await db.update('voiceheritage', { id: v.id }, { status: 'pending', reviewStatus: 'submitted' });

  // Track on the user profile: storyteller badge + XP.
  const user = await db.findOne('users', { id: req.user.id });
  let badges = [...(user.badges || [])];
  if (!badges.find((b) => b.id === 'b-storyteller')) badges.push({ id: 'b-storyteller', name: 'Storyteller', icon: '🎙️' });
  await db.update('users', { id: req.user.id }, {
    voiceHeritage: (user.voiceHeritage || 0) + 1,
    xp: (user.xp || 0) + 15,
    badges
  });
  res.json(updated);
});

// GET /api/voice/mine — my submissions.
router.get('/', authRequired, async (req, res) => {
  const list = (await db.all('voiceheritage')).filter((v) => v.authorId === req.user.id);
  res.json(list);
});

// GET /api/voice/public — published voice heritage.
router.get('/public', async (req, res) => {
  const list = (await db.all('voiceheritage')).filter((v) => v.status === 'published');
  res.json(list);
});

// GET /api/voice/admin — admin moderation queue.
router.get('/admin', [authRequired, adminRequired], async (req, res) => {
  const list = await db.all('voiceheritage');
  res.json(list);
});

// PUT /api/voice/admin/:id — admin moderation actions.
router.put('/admin/:id', [authRequired, adminRequired], async (req, res) => {
  const v = await db.findOne('voiceheritage', { id: req.params.id });
  if (!v) return res.status(404).json({ error: 'Voice contribution not found' });
  const { action } = req.body;
  const update = {};
  switch (action) {
    case 'approve':
      update.reviewStatus = 'approved'; update.status = 'verified'; update.verified = true; update.verifiedBy = req.user.name;
      break;
    case 'publish':
      update.reviewStatus = 'published'; update.status = 'published'; update.verified = true;
      update.verifiedBy = req.user.name; update.submittedAt = new Date().toISOString();
      break;
    case 'reject':
      update.reviewStatus = 'rejected'; update.status = 'rejected';
      update.feedback = (req.body.reason || 'Not accepted').toString().slice(0, 500);
      break;
    case 'request-changes':
      update.reviewStatus = 'changes-requested'; update.status = 'changes-requested';
      update.feedback = (req.body.feedback || 'Please review').toString().slice(0, 500);
      break;
    default: return res.status(400).json({ error: 'Invalid action' });
  }
  const updated = await db.update('voiceheritage', { id: v.id }, update);
  res.json(updated);
});

module.exports = router;