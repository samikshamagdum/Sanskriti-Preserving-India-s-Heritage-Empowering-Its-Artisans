const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../utils/db');
const cloudinary = require('../utils/cloudinary');
const knowledge = require('../utils/knowledge');
const { authRequired, adminRequired } = require('../utils/middleware');

const upload = multer({ storage: multer.memoryStorage() });

async function resolveStateName(doc) {
  if (doc.stateId && !doc.stateName) {
    const states = await db.all('states');
    const s = states.find((x) => x.id === doc.stateId);
    if (s) doc.stateName = s.name;
  }
  return doc;
}

// Trust / source label configuration for the UI.
router.get('/labels', (req, res) => {
  res.json({
    statuses: knowledge.VERIFICATION_STATUSES,
    sourceTypes: knowledge.SOURCE_TYPES,
    statusLabels: knowledge.STATUS_LABELS,
    placeTypes: knowledge.PLACE_TYPES
  });
});

// ============================================================
// VERIFIED CULTURAL KNOWLEDGE LAYER
// ============================================================

// GET /api/knowledge/items — the verified layer. Filters + public status gating.
router.get('/items', async (req, res) => {
  let list = await db.all('culturalitems');
  const { stateId, district, category, sourceType, verificationStatus, q } = req.query;
  if (stateId) list = list.filter((x) => x.stateId === stateId);
  if (district) list = list.filter((x) => (x.district || '').toLowerCase().includes(district.toLowerCase()));
  if (category) list = list.filter((x) => x.category === category);
  if (sourceType) list = list.filter((x) => x.sourceType === sourceType);
  if (verificationStatus) list = list.filter((x) => x.verificationStatus === verificationStatus);
  if (q) {
    const ql = q.toLowerCase();
    list = list.filter((x) => `${x.title} ${x.description} ${x.tags.join(' ')} ${x.district}`.toLowerCase().includes(ql));
  }
  if (!req.user || req.user.role !== 'admin') {
    list = list.filter((x) => ['published', 'verified'].includes(x.verificationStatus));
  }
  const enriched = list.map((x) => ({ ...x, label: knowledge.trustLabel(x.sourceType, x.verificationStatus, x.aiMeta && x.aiMeta.aiAssisted) }));
  res.json(enriched);
});

// GET /api/knowledge/items/:id — single verified item (detail page).
router.get('/items/:id', async (req, res) => {
  let item = await db.findOne('culturalitems', { id: req.params.id });
  if (!item) return res.status(404).json({ error: 'Cultural item not found' });
  if (!['published', 'verified'].includes(item.verificationStatus) && !(req.user && req.user.role === 'admin')) {
    return res.status(403).json({ error: 'Not yet published' });
  }
  item = await resolveStateName(item);
  const relatedTraditions = await db.find('traditions', { id: { $in: item.relatedTraditions || [] } });
  const relatedArtists = await db.find('artists', { id: { $in: item.relatedArtists || [] } });
  const places = await db.all('places');
  const traditions = await db.all('traditions');
  const sameStateTraditions = traditions.filter((t) => t.stateId === item.stateId && !(item.relatedTraditions || []).includes(t.id)).slice(0, 3);
  const statePlaces = places.filter((p) => p.stateId === item.stateId).slice(0, 4);
  res.json({
    ...item,
    label: knowledge.trustLabel(item.sourceType, item.verificationStatus, item.aiMeta && item.aiMeta.aiAssisted),
    relatedTraditions,
    relatedArtists,
    sameStateTraditions,
    statePlaces
  });
});

// POST /api/knowledge/items — admin adds a curated verified item.
router.post('/items', [authRequired, adminRequired], async (req, res) => {
  const b = req.body || {};
  const item = {
    id: db.uid('ci'),
    title: (b.title || '').toString().trim().slice(0, 200),
    category: (b.category || 'tradition').toString().slice(0, 60),
    description: (b.description || '').toString().slice(0, 8000),
    stateId: b.stateId || '',
    stateName: '',
    district: (b.district || '').toString().slice(0, 120),
    location: (b.location || '').toString().slice(0, 150),
    lat: Number.isFinite(Number(b.lat)) ? Number(b.lat) : undefined,
    lng: Number.isFinite(Number(b.lng)) ? Number(b.lng) : undefined,
    images: Array.isArray(b.images) ? b.images.slice(0, 12) : [],
    language: (b.language || '').toString().slice(0, 60),
    sourceName: (b.sourceName || '').toString().slice(0, 200),
    sourceUrl: (b.sourceUrl || '').toString().slice(0, 500),
    sourceType: knowledge.SOURCE_TYPES.includes(b.sourceType) ? b.sourceType : 'institutional',
    contributorId: req.user.id,
    verificationStatus: knowledge.VERIFICATION_STATUSES.includes(b.verificationStatus) ? b.verificationStatus : 'published',
    reviewerNotes: (b.reviewerNotes || '').toString().slice(0, 1000),
    tags: (Array.isArray(b.tags) ? b.tags : []).slice(0, 12).map((t) => String(t).trim()).filter(Boolean),
    relatedTraditions: (Array.isArray(b.relatedTraditions) ? b.relatedTraditions : []).slice(0, 12)
  };
  if (!item.title) return res.status(400).json({ error: 'title required' });
  const saved = await resolveStateName(item);
  await db.insert('culturalitems', saved);
  res.status(201).json(saved);
});

// PUT /api/knowledge/items/:id — admin updates / verifies a curated item.
router.put('/items/:id', [authRequired, adminRequired], async (req, res) => {
  const existing = await db.findOne('culturalitems', { id: req.params.id });
  if (!existing) return res.status(404).json({ error: 'Cultural item not found' });
  const b = req.body || {};
  const patch = {};
  ['title', 'description', 'category', 'stateId', 'district', 'location', 'language', 'sourceName', 'sourceUrl', 'reviewerNotes'].forEach((k) => {
    if (b[k] !== undefined) patch[k] = String(b[k]).slice(0, k === 'description' ? 8000 : 500);
  });
  if (b.sourceType !== undefined && knowledge.SOURCE_TYPES.includes(b.sourceType)) patch.sourceType = b.sourceType;
  if (b.verificationStatus !== undefined && knowledge.VERIFICATION_STATUSES.includes(b.verificationStatus)) {
    patch.verificationStatus = b.verificationStatus;
  }
  if (Number.isFinite(Number(b.lat))) patch.lat = Number(b.lat);
  if (Number.isFinite(Number(b.lng))) patch.lng = Number(b.lng);
  if (Array.isArray(b.images)) patch.images = b.images.slice(0, 12);
  if (Array.isArray(b.tags)) patch.tags = b.tags.slice(0, 12).map((t) => String(t).trim()).filter(Boolean);
  if (Array.isArray(b.relatedTraditions)) patch.relatedTraditions = b.relatedTraditions.slice(0, 12);
  patch.updatedAt = new Date().toISOString();
  if (patch.stateId && patch.stateId !== existing.stateId) {
    const states = await db.all('states');
    const s = states.find((x) => x.id === patch.stateId);
    if (s) patch.stateName = s.name;
  }
  const updated = await db.update('culturalitems', { id: existing.id }, patch);
  res.json(updated || (await db.findOne('culturalitems', { id: existing.id })));
});

// ============================================================
// MEDIA UPLOAD (optional Cloudinary; small-image data-URI fallback)
// ============================================================

// POST /api/knowledge/upload — attach an image/video/audio to a submission.
router.post('/upload', authRequired, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'A file is required' });
  const mime = file.mimetype;
  let url = '';
  let publicId = '';
  let type = 'image';
  if (mime.startsWith('video/')) type = 'video';
  else if (mime.startsWith('audio/')) type = 'audio';
  try {
    if (type === 'image') cloudinary.validateImage(mime, file.size);
    else if (type === 'video') cloudinary.validateVideo(mime, file.size);
    else cloudinary.validateAudio(mime, file.size);
    const resourceType = type === 'video' ? 'video' : type === 'audio' ? 'raw' : 'image';
    const up = await cloudinary.uploadBuffer(file.buffer, { folder: 'sanskriti/knowledge', resource_type: resourceType });
    url = up.url;
    publicId = up.publicId;
  } catch (e) {
    // No Cloudinary: allow a small image to be stored inline so the demo still works.
    if (type === 'image' && file.size <= 1200000) {
      url = `data:${mime};base64,${file.buffer.toString('base64')}`;
    } else {
      return res.status(400).json({ error: 'Media storage unavailable. Paste a direct image URL instead.', detail: String(e.message || e) });
    }
  }
  res.status(201).json({ url, publicId, type, mime, sizeBytes: file.size });
});

// ============================================================
// AI ASSISTANCE (suggestion only — never auto-verifies)
// ============================================================

// POST /api/knowledge/classify — AI-assisted classification of a submission.
router.post('/classify', authRequired, async (req, res) => {
  const { title, description, stateId } = req.body || {};
  const suggestion = await knowledge.classifySubmission({ title, description, stateId });
  res.json(suggestion);
});

// GET /api/knowledge/similar — duplicate / related record detection.
router.get('/similar', async (req, res) => {
  const { title, description, excludeId } = req.query;
  const matches = await knowledge.findSimilar({ title: title || '', description: description || '', excludeId });
  res.json(matches);
});

// GET /api/knowledge/gaps — Culture Gap Detection.
router.get('/gaps', async (req, res) => {
  res.json(await knowledge.computeGaps());
});

// ============================================================
// COMMUNITY CULTURAL PLACES
// ============================================================

// POST /api/knowledge/places — user suggests a new place on the culture map.
router.post('/places', authRequired, async (req, res) => {
  const b = req.body || {};
  const name = (b.name || '').toString().trim();
  if (!name) return res.status(400).json({ error: 'Place name is required' });
  const place = {
    id: db.uid('pp'),
    name: name.slice(0, 200),
    placeType: b.placeType || 'heritage-place',
    category: (b.category || 'heritage').toString().slice(0, 60),
    stateId: b.stateId || '',
    stateName: '',
    district: (b.district || '').toString().slice(0, 120),
    location: (b.location || '').toString().slice(0, 150),
    lat: Number.isFinite(Number(b.lat)) ? Number(b.lat) : undefined,
    lng: Number.isFinite(Number(b.lng)) ? Number(b.lng) : undefined,
    description: (b.description || '').toString().slice(0, 8000),
    sourceInfo: (b.sourceInfo || '').toString().slice(0, 500),
    media: (Array.isArray(b.media) ? b.media : []).map((m) => ({ url: String(m.url || ''), type: m.type || 'image' })).filter((m) => m.url),
    images: (Array.isArray(b.images) ? b.images : []).slice(0, 12),
    contributorId: req.user.id,
    contributorName: req.user.name,
    verificationStatus: 'submitted',
    status: 'submitted',
    tags: Array.isArray(b.tags) ? b.tags.slice(0, 12) : [],
    isEvent: !!b.isEvent,
    eventDate: b.eventDate || ''
  };
  const saved = await resolveStateName(place);
  await db.insert('communityplaces', saved);
  res.status(201).json(saved);
});

// GET /api/knowledge/places — public listing: published, verified (and under review, labelled).
router.get('/places', async (req, res) => {
  let list = await db.all('communityplaces');
  const { stateId, district, category, placeType, status } = req.query;
  const visible = (p) => ['published', 'verified', 'under_review'].includes(p.verificationStatus || p.status);
  list = list.filter(visible);
  if (stateId) list = list.filter((p) => p.stateId === stateId);
  if (district) list = list.filter((p) => (p.district || '').toLowerCase().includes(district.toLowerCase()));
  if (category) list = list.filter((p) => p.category === category);
  if (placeType) list = list.filter((p) => p.placeType === placeType);
  if (status) list = list.filter((p) => (p.verificationStatus || p.status) === status);
  const enriched = list.map((p) => ({ ...p, label: knowledge.trustLabel('community', p.verificationStatus || p.status) }));
  res.json(enriched);
});

// GET /api/knowledge/places/mine — my place suggestions.
router.get('/places/mine', authRequired, async (req, res) => {
  const list = (await db.all('communityplaces')).filter((p) => p.contributorId === req.user.id);
  res.json(list);
});

// PUT /api/knowledge/places/:id/review — owner edits a draft/submitted place.
router.put('/places/:id/review', authRequired, async (req, res) => {
  const p = await db.findOne('communityplaces', { id: req.params.id });
  if (!p) return res.status(404).json({ error: 'Place not found' });
  if (p.contributorId !== req.user.id) return res.status(403).json({ error: 'Not allowed' });
  const b = req.body || {};
  const patch = {};
  ['name', 'district', 'location', 'description', 'sourceInfo', 'placeType', 'category'].forEach((k) => {
    if (b[k] !== undefined) patch[k] = String(b[k]).slice(0, k === 'description' ? 8000 : 300);
  });
  if (Number.isFinite(Number(b.lat))) patch.lat = Number(b.lat);
  if (Number.isFinite(Number(b.lng))) patch.lng = Number(b.lng);
  if (Array.isArray(b.images)) patch.images = b.images.slice(0, 12);
  if (Array.isArray(b.tags)) patch.tags = b.tags.slice(0, 12);
  if (b.isEvent !== undefined) patch.isEvent = !!b.isEvent;
  if (b.eventDate !== undefined) patch.eventDate = b.eventDate;
  res.json(await db.update('communityplaces', { id: p.id }, patch));
});

// PUT /api/knowledge/places/:id/submit — owner submits the place for verification.
router.put('/places/:id/submit', authRequired, async (req, res) => {
  const p = await db.findOne('communityplaces', { id: req.params.id });
  if (!p) return res.status(404).json({ error: 'Place not found' });
  if (p.contributorId !== req.user.id) return res.status(403).json({ error: 'Not allowed' });
  const updated = await db.update('communityplaces', { id: p.id }, { verificationStatus: 'submitted', status: 'submitted', feedback: '' });
  res.json(updated);
});

// GET /api/knowledge/places/admin — admin moderation queue.
router.get('/places/admin', [authRequired, adminRequired], async (req, res) => {
  const { status } = req.query;
  let list = await db.all('communityplaces');
  if (status) list = list.filter((p) => (p.verificationStatus || p.status) === status);
  res.json(list);
});

// PUT /api/knowledge/places/admin/:id — admin moderation workflow.
router.put('/places/admin/:id', [authRequired, adminRequired], async (req, res) => {
  const p = await db.findOne('communityplaces', { id: req.params.id });
  if (!p) return res.status(404).json({ error: 'Place not found' });
  const { action } = req.body;
  const patch = {};
  const map = {
    'start-review': 'under_review',
    approve: 'verified',
    verify: 'verified',
    publish: 'published',
    reject: 'rejected',
    'request-changes': 'needs_changes'
  };
  const nextStatus = map[action];
  if (!nextStatus) return res.status(400).json({ error: 'Invalid action' });
  patch.verificationStatus = nextStatus;
  patch.status = nextStatus;
  if (action === 'reject') patch.feedback = (req.body.reason || 'Not accepted').toString().slice(0, 500);
  if (action === 'request-changes') patch.feedback = (req.body.feedback || 'Please revise with more detail').toString().slice(0, 500);
  if (req.body.reviewerNotes !== undefined) patch.reviewerNotes = String(req.body.reviewerNotes).slice(0, 1000);
  patch.updatedAt = new Date().toISOString();
  res.json(await db.update('communityplaces', { id: p.id }, patch));
});

module.exports = router;