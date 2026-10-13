const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authRequired, adminRequired } = require('../utils/middleware');

// Submit a contribution (citizen). Workflow: draft → submitted → under_review → verified → published
router.post('/', authRequired, async (req, res) => {
  const {
    title, type, category, stateId, content, language, transcript, translation, region,
    district, city, village, culturalSignificance, sourceOfInfo, storyteller,
    lat, lng, tags, traditionRef
  } = req.body;
  if (!title || !type || !category || !stateId) {
    return res.status(400).json({ error: 'title, type, category and stateId required' });
  }
  const states = await db.all('states');
  const state = states.find((s) => s.id === stateId);
  const contribution = {
    id: db.uid('c'),
    title: (title || '').toString().trim().slice(0, 200),
    type,
    contentType: 'heritage',
    category,
    stateId,
    stateName: state ? state.name : stateId,
    region: region || (state && state.region) || 'Unknown',
    district: (district || '').toString().slice(0, 120),
    city: (city || '').toString().slice(0, 120),
    village: (village || '').toString().slice(0, 120),
    content: (content || '').toString().slice(0, 20000),
    culturalSignificance: (culturalSignificance || '').toString().slice(0, 4000),
    sourceOfInfo: (sourceOfInfo || '').toString().slice(0, 500),
    storyteller: (storyteller || '').toString().slice(0, 200),
    language: language || '',
    transcript: transcript || '',
    translation: translation || '',
    tags: Array.isArray(tags) ? tags.slice(0, 12) : [],
    lat: Number.isFinite(Number(lat)) ? Number(lat) : undefined,
    lng: Number.isFinite(Number(lng)) ? Number(lng) : undefined,
    status: 'submitted',
    reviewStatus: 'submitted',
    verificationStatus: 'submitted',
    author: req.user.name,
    authorId: req.user.id,
    createdAt: new Date().toISOString(),
    traditionRef: traditionRef || null
  };
  await db.insert('contributions', contribution);
  const user = await db.findOne('users', { id: req.user.id });
  await db.update('users', { id: req.user.id }, { contributions: [...(user.contributions || []), contribution.id] });
  res.status(201).json(contribution);
});

// User's own contributions
router.get('/mine', authRequired, async (req, res) => {
  const list = (await db.all('contributions')).filter((c) => c.authorId === req.user.id);
  res.json(list);
});

// Public published contributions (verified & published)
router.get('/public', async (req, res) => {
  const list = (await db.all('contributions')).filter((c) => c.status === 'published');
  res.json(list);
});

// Admin: list all contributions for review
router.get('/admin', [authRequired, adminRequired], async (req, res) => {
  const { status } = req.query;
  let list = await db.all('contributions');
  if (status) list = list.filter((c) => c.status === status);
  res.json(list);
});

// Admin: approve / reject / request changes / verify (the review flow)
router.put('/admin/:id', [authRequired, adminRequired], async (req, res) => {
  const { action } = req.body;
  const c = await db.findOne('contributions', { id: req.params.id });
  if (!c) return res.status(404).json({ error: 'Contribution not found' });
  const stateUpdate = {};
  switch (action) {
    case 'start-review':
      stateUpdate.reviewStatus = 'under_review'; stateUpdate.status = 'under_review'; stateUpdate.verificationStatus = 'under_review';
      break;
    case 'approve':
      stateUpdate.reviewStatus = 'approved'; stateUpdate.status = 'verified'; stateUpdate.verificationStatus = 'verified';
      break;
    case 'reject':
      stateUpdate.reviewStatus = 'rejected'; stateUpdate.status = 'rejected'; stateUpdate.verificationStatus = 'rejected';
      stateUpdate.rejectReason = (req.body.reason || 'Not accepted').toString().slice(0, 500);
      stateUpdate.feedback = (req.body.reason || 'Not accepted').toString().slice(0, 500);
      break;
    case 'request-changes':
    case 'needs-changes':
      stateUpdate.reviewStatus = 'needs_changes'; stateUpdate.status = 'needs_changes'; stateUpdate.verificationStatus = 'needs_changes';
      stateUpdate.feedback = (req.body.feedback || 'Please revise').toString().slice(0, 500);
      break;
    case 'verify':
      stateUpdate.verified = true; stateUpdate.verifiedBy = req.user.name;
      stateUpdate.verificationStatus = 'verified';
      if (!c.status || ['pending', 'submitted', 'under_review'].includes(c.status)) stateUpdate.status = 'verified';
      break;
    case 'publish':
      stateUpdate.reviewStatus = 'published'; stateUpdate.status = 'published'; stateUpdate.verificationStatus = 'published';
      stateUpdate.verified = true; stateUpdate.verifiedBy = req.user.name;
      stateUpdate.publishedAt = new Date().toISOString();
      if (c.authorId) {
        const author = await db.findOne('users', { id: c.authorId });
        if (author) await db.update('users', { id: author.id }, { xp: (author.xp || 0) + 50 });
      }
      break;
    case 'notes':
      stateUpdate.reviewerNotes = (req.body.reviewerNotes || '').toString().slice(0, 1000);
      break;
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
  const updated = await db.update('contributions', { id: c.id }, stateUpdate);
  res.json(await db.findOne('contributions', { id: c.id }) || updated);
});

// Admin: manage artists (verify/approve artist profiles)
router.put('/artists/:id', [authRequired, adminRequired], async (req, res) => {
  const { verified, art } = req.body;
  const update = {};
  if (verified !== undefined) update.verified = !!verified;
  if (art !== undefined) update.art = art;
  const artist = await db.update('artists', { id: req.params.id }, update);
  if (!artist) return res.status(404).json({ error: 'Artist not found' });
  res.json(artist);
});

// Admin: list pending artists (verification badge requests)
router.get('/artists/pending', [authRequired, adminRequired], async (req, res) => {
  res.json((await db.all('artists')).filter((a) => !a.verified));
});

// Admin: reports
router.post('/report', authRequired, async (req, res) => {
  const { targetId, targetType, reason } = req.body;
  const report = {
    id: db.uid('r'),
    targetId, targetType,
    reason: (reason || 'Reported content').toString().slice(0, 1000),
    reporter: req.user.name,
    reportedBy: req.user.id,
    status: 'open',
    createdAt: new Date().toISOString()
  };
  await db.insert('reports', report);
  res.status(201).json(report);
});

router.get('/reports', [authRequired, adminRequired], async (req, res) => {
  res.json(await db.all('reports'));
});

router.put('/reports/:id', [authRequired, adminRequired], async (req, res) => {
  const { status } = req.body;
  const updated = await db.update('reports', { id: req.params.id }, { status });
  if (!updated) return res.status(404).json({ error: 'Report not found' });
  res.json(updated);
});

// Public contribution types reference
router.get('/types', (req, res) => {
  res.json(['story', 'oral-history', 'folk-song', 'recipe', 'festival', 'practice', 'tradition', 'craft', 'music', 'dance', 'photo', 'video', 'audio']);
});

// Admin: dashboard statistics
router.get('/stats', [authRequired, adminRequired], async (req, res) => {
  const [totalUsers, totalContributions, pendingReviews, underReview, approved, published, rejected, totalArtists, totalEvents, totalTraditions, traditions, trialsCount, culturalItems, communityPlaces, places, voiceHeritage] = await Promise.all([
    db.count('users'),
    db.count('contributions'),
    db.count('contributions', { status: 'submitted' }),
    db.count('contributions', { status: 'under_review' }),
    db.count('contributions', { status: 'verified' }),
    db.count('contributions', { status: 'published' }),
    db.count('contributions', { status: 'rejected' }),
    db.count('artists'),
    db.count('events'),
    db.count('traditions'),
    db.all('traditions'),
    db.count('culturetrails'),
    db.all('culturalitems'),
    db.all('communityplaces'),
    db.count('places'),
    db.all('voiceheritage')
  ]);
  const pendingPlaces = communityPlaces.filter((p) => ['submitted', 'under_review', 'needs_changes'].includes(p.verificationStatus)).length;
  const pendingVoice = voiceHeritage.filter((v) => ['pending', 'submitted', 'under_review'].includes(v.status)).length;
  const mostExplored = traditions
    .map((t) => ({ id: t.id, title: t.title, views: t.views || 0, stateName: t.stateName }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);
  const stateBreakdown = {};
  traditions.forEach((t) => { stateBreakdown[t.stateName] = (stateBreakdown[t.stateName] || 0) + 1; });
  res.json({
    totalUsers, totalContributions, pendingReviews, underReview, approved: approved + published, published,
    rejected, totalArtists, totalEvents, totalTraditions, totalPlaces: places, trialsCount, mostExplored,
    culturalItems: culturalItems.length, communityPlaces: communityPlaces.length, pendingPlaces, pendingVoice,
    stateBreakdown: Object.entries(stateBreakdown)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)
  });
});

module.exports = router;