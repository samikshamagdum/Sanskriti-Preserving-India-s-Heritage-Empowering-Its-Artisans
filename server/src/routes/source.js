const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../utils/db');
const cultureController = require('../controllers/cultureController');
const { authRequired, adminRequired } = require('../utils/middleware');
const gemini = require('../utils/gemini');
const cloudinary = require('../utils/cloudinary');
const { toLevel, toAccuracy, isVerifiedLevel, levelLabel, sourceTypeFromLabel, VERIFICATION_LEVELS } = require('../constants/verification');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: cloudinary.MAX_IMAGE } });

const PUBLISHED = ['published', 'verified'];

router.get('/verification-levels', (req, res) => {
  res.json(VERIFICATION_LEVELS.map((id) => ({ id, label: levelLabel(id), verified: isVerifiedLevel(id) })));
});

// ---- Trusted sources / institutions / images / locations ----

router.get('/institutions', async (req, res) => {
  res.json(await db.all('institutions'));
});

router.post('/institutions', [authRequired, adminRequired], async (req, res) => {
  const { name, type, website, location, stateName, description, license, apiUrl, country, reliabilityLevel, lastChecked } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const doc = {
    id: db.uid('inst'),
    name, type: type || 'museum', website: website || '', location: location || '',
    stateName: stateName || '', description: description || '',
    apiUrl: apiUrl || '', license: license || 'Unknown',
    country: country || 'India', reliabilityLevel: reliabilityLevel || 'medium',
    verificationStatus: 'verified', lastChecked: lastChecked || new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString()
  };
  await db.insert('institutions', doc);
  res.status(201).json(doc);
});

router.put('/institutions/:id', [authRequired, adminRequired], async (req, res) => {
  const existing = await db.findOne('institutions', { id: req.params.id });
  if (!existing) return res.status(404).json({ error: 'Institution not found' });
  const { name, type, website, location, stateName, description, license, apiUrl, country, reliabilityLevel, lastChecked } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (type !== undefined) update.type = type;
  if (website !== undefined) update.website = website;
  if (location !== undefined) update.location = location;
  if (stateName !== undefined) update.stateName = stateName;
  if (description !== undefined) update.description = description;
  if (license !== undefined) update.license = license;
  if (apiUrl !== undefined) update.apiUrl = apiUrl;
  if (country !== undefined) update.country = country;
  if (reliabilityLevel !== undefined) update.reliabilityLevel = reliabilityLevel;
  if (lastChecked !== undefined) update.lastChecked = lastChecked;
  const updated = await db.update('institutions', { id: existing.id }, update);
  res.json(updated || existing);
});

router.delete('/institutions/:id', [authRequired, adminRequired], async (req, res) => {
  const removed = await db.remove('institutions', { id: req.params.id });
  if (!removed) return res.status(404).json({ error: 'Institution not found' });
  res.json({ ok: true, removed: removed.id });
});

router.get('/sources', async (req, res) => {
  let list = await db.all('sources');
  const { type, verificationLevel } = req.query;
  if (type) list = list.filter((s) => s.type === type);
  if (verificationLevel) list = list.filter((s) => toLevel(s.verificationLevel) === toLevel(verificationLevel));
  res.json(list);
});

router.post('/sources', [authRequired, adminRequired], async (req, res) => {
  const { name, type, originalUrl, attribution, license, licenseUrl, description, institutionId, organization, website, country, reliabilityLevel, verificationLevel, lastChecked } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const st = sourceTypeFromLabel(type);
  const doc = {
    id: db.uid('src'),
    name, type: st || 'institutional',
    organization: organization || '', website: website || originalUrl || '',
    country: country || 'India', reliabilityLevel: reliabilityLevel || 'medium',
    originalUrl: originalUrl || '', attribution: attribution || '', license: license || 'Unknown',
    licenseUrl: licenseUrl || '', description: description || '',
    institutionId: institutionId || '', accessDate: new Date().toISOString().slice(0, 10),
    verificationStatus: isVerifiedLevel(verificationLevel) ? 'verified' : 'pending',
    verificationLevel: toLevel(verificationLevel),
    lastChecked: lastChecked || new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString()
  };
  await db.insert('sources', doc);
  res.status(201).json(doc);
});

router.put('/sources/:id', [authRequired, adminRequired], async (req, res) => {
  const existing = await db.findOne('sources', { id: req.params.id });
  if (!existing) return res.status(404).json({ error: 'Source not found' });
  const { name, type, originalUrl, attribution, license, licenseUrl, description, institutionId, organization, website, country, reliabilityLevel, verificationLevel, lastChecked, accessDate } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (type !== undefined) update.type = sourceTypeFromLabel(type);
  if (organization !== undefined) update.organization = organization;
  if (website !== undefined) update.website = website;
  if (country !== undefined) update.country = country;
  if (reliabilityLevel !== undefined) update.reliabilityLevel = reliabilityLevel;
  if (originalUrl !== undefined) update.originalUrl = originalUrl;
  if (attribution !== undefined) update.attribution = attribution;
  if (license !== undefined) update.license = license;
  if (licenseUrl !== undefined) update.licenseUrl = licenseUrl;
  if (description !== undefined) update.description = description;
  if (institutionId !== undefined) update.institutionId = institutionId;
  if (accessDate !== undefined) update.accessDate = accessDate;
  if (verificationLevel !== undefined) {
    update.verificationLevel = toLevel(verificationLevel);
    update.verificationStatus = isVerifiedLevel(verificationLevel) ? 'verified' : 'pending';
  }
  if (lastChecked !== undefined) update.lastChecked = lastChecked;
  const updated = await db.update('sources', { id: existing.id }, update);
  res.json(updated || existing);
});

router.delete('/sources/:id', [authRequired, adminRequired], async (req, res) => {
  const removed = await db.remove('sources', { id: req.params.id });
  if (!removed) return res.status(404).json({ error: 'Source not found' });
  res.json({ ok: true, removed: removed.id });
});

router.get('/images', async (req, res) => {
  let list = await db.all('culturalimages');
  const { cultureId, verificationStatus } = req.query;
  if (cultureId) list = list.filter((im) => im.cultureId === cultureId);
  if (verificationStatus) list = list.filter((im) => im.verificationStatus === verificationStatus);
  res.json(list);
});

// Upload + AI-analyse + match a cultural image, then store with provenance.
router.post('/images', authRequired, upload.single('image'), async (req, res) => {
  const { cultureId, caption, sourceName, sourceUrl, creator, license, isIllustrative, verificationLevel } = req.body;
  if (!req.file) return res.status(400).json({ error: 'image file required' });
  let imageUrl = '';
  try {
    cloudinary.validateImage(req.file.mimetype, req.file.size);
    const up = await cloudinary.uploadBuffer(req.file.buffer, { folder: 'sanskriti/source', resource_type: 'image' });
    imageUrl = up.url;
  } catch (e) {
    return res.status(400).json({ error: 'Image storage failed: ' + e.message });
  }

  // AI vision analysis + database match (assistant only, never final authority).
  let match = null;
  if (gemini.isConfigured()) {
    try {
      const ai = await gemini.analyzeImage(req.file.buffer, req.file.mimetype);
      match = await matchAgainstDatabase(ai);
    } catch (e) {
      // fall through — image saved as needs_review
    }
  }

  const verificationStatus = match && match.best && match.best.confidence >= 80 ? 'ai_match' : 'needs_review';
  const doc = {
    id: db.uid('img'),
    imageUrl,
    cultureId: cultureId || '',
    caption: caption || '',
    description: req.body.description || caption || '',
    sourceName: sourceName || '',
    sourceUrl: sourceUrl || '',
    photographerOrInstitution: creator || req.body.photographerOrInstitution || '',
    creator: creator || '',
    copyright: req.body.copyright || '',
    license: license || 'Unknown',
    location: { name: req.body.locationName || '', state: req.body.stateName || '' },
    isIllustrative: !!isIllustrative,
    verificationStatus,
    verificationLevel: toLevel(verificationLevel || 'PENDING_VERIFICATION'),
    lastVerified: '',
    matchConfidence: match && match.best ? match.best.confidence : 0,
    matchDetails: match,
    uploadedById: req.user ? req.user.id : '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await db.insert('culturalimages', doc);
  res.status(201).json(doc);
});

// Verify / edit an image (admin) — level-aware, records who verified it.
router.put('/images/:id', [authRequired, adminRequired], async (req, res) => {
  const { verificationStatus, cultureId, reviewNotes, verificationLevel, isIllustrative, lastVerified } = req.body;
  const existing = await db.findOne('culturalimages', { id: req.params.id });
  if (!existing) return res.status(404).json({ error: 'Image not found' });
  const update = {};
  if (verificationStatus) update.verificationStatus = verificationStatus;
  if (verificationLevel) update.verificationLevel = toLevel(verificationLevel);
  if (isIllustrative !== undefined) update.isIllustrative = !!isIllustrative;
  if (cultureId !== undefined) update.cultureId = cultureId;
  if (reviewNotes !== undefined) update.reviewNotes = reviewNotes;
  if (lastVerified !== undefined) update.lastVerified = lastVerified;
  if (isVerifiedLevel(update.verificationLevel || existing.verificationLevel) && ['verified', 'published'].includes(update.verificationStatus || existing.verificationStatus)) {
    update.lastVerified = lastVerified || new Date().toISOString().slice(0, 10);
    update.verifiedById = req.user.id;
  }
  update.updatedAt = new Date().toISOString();
  const updated = await db.update('culturalimages', { id: existing.id }, update);
  res.json(await db.findOne('culturalimages', { id: existing.id }) || updated);
});

router.delete('/images/:id', [authRequired, adminRequired], async (req, res) => {
  const removed = await db.remove('culturalimages', { id: req.params.id });
  if (!removed) return res.status(404).json({ error: 'Image not found' });
  res.json({ ok: true, removed: removed.id });
});

router.get('/locations', async (req, res) => {
  let list = await db.all('locations');
  const { cultureId, locationType } = req.query;
  if (cultureId) list = list.filter((l) => l.cultureId === cultureId);
  if (locationType) list = list.filter((l) => l.locationType === locationType);
  // Never leak private exact coordinates.
  list.forEach((l) => { if (l.private) { l.latitude = undefined; l.longitude = undefined; } });
  res.json(list);
});

router.post('/locations', [authRequired, adminRequired], async (req, res) => {
  const { name, cultureId, locationType, state, stateId, district, cityOrVillage, latitude, longitude, accuracy, source, sourceUrl, locationSource, locationSourceUrl, verificationLevel, lastVerified, private: isPrivate } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const lv = toLevel(verificationLevel || 'PENDING_VERIFICATION');
  const doc = {
    id: db.uid('loc'),
    name, cultureId: cultureId || '', locationType: locationType || 'origin',
    state: state || '', stateId: stateId || '', district: district || '',
    cityOrVillage: cityOrVillage || '',
    latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : undefined,
    longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : undefined,
    accuracy: toAccuracy(accuracy), source: source || '', sourceUrl: sourceUrl || '',
    locationSource: locationSource || source || '', locationSourceUrl: locationSourceUrl || sourceUrl || '',
    verificationLevel: lv,
    lastVerified: isVerifiedLevel(lv) ? (lastVerified || new Date().toISOString().slice(0, 10)) : '',
    private: !!isPrivate, createdAt: new Date().toISOString()
  };
  await db.insert('locations', doc);
  res.json(doc);
});

router.put('/locations/:id', [authRequired, adminRequired], async (req, res) => {
  const existing = await db.findOne('locations', { id: req.params.id });
  if (!existing) return res.status(404).json({ error: 'Location not found' });
  const { name, locationType, state, stateId, district, cityOrVillage, latitude, longitude, accuracy, source, sourceUrl, locationSource, locationSourceUrl, verificationLevel, lastVerified, private: isPrivate } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (locationType !== undefined) update.locationType = locationType;
  if (state !== undefined) update.state = state;
  if (stateId !== undefined) update.stateId = stateId;
  if (district !== undefined) update.district = district;
  if (cityOrVillage !== undefined) update.cityOrVillage = cityOrVillage;
  if (latitude !== undefined) update.latitude = Number.isFinite(Number(latitude)) ? Number(latitude) : undefined;
  if (longitude !== undefined) update.longitude = Number.isFinite(Number(longitude)) ? Number(longitude) : undefined;
  if (accuracy !== undefined) update.accuracy = toAccuracy(accuracy);
  if (source !== undefined) update.source = source;
  if (sourceUrl !== undefined) update.sourceUrl = sourceUrl;
  if (locationSource !== undefined) update.locationSource = locationSource;
  if (locationSourceUrl !== undefined) update.locationSourceUrl = locationSourceUrl;
  if (verificationLevel !== undefined) update.verificationLevel = toLevel(verificationLevel);
  if (lastVerified !== undefined) update.lastVerified = lastVerified;
  if (isVerifiedLevel(update.verificationLevel || existing.verificationLevel)) {
    update.lastVerified = update.lastVerified || new Date().toISOString().slice(0, 10);
  }
  if (isPrivate !== undefined) update.private = !!isPrivate;
  const updated = await db.update('locations', { id: existing.id }, update);
  res.json(updated || existing);
});

router.delete('/locations/:id', [authRequired, adminRequired], async (req, res) => {
  const removed = await db.remove('locations', { id: req.params.id });
  if (!removed) return res.status(404).json({ error: 'Location not found' });
  res.json({ ok: true, removed: removed.id });
});

// ---- Cultural Items (source intelligence envelope) ----

// List/serve published cultural items with their full populated provenance
// (images, locations, sources merged from standalone collections + embedded records).
router.get('/items', cultureController.getCultures);

// Detailed envelope for one culture: items + linked sources, images, locations, artists, events.
router.get('/items/:id', cultureController.getCultureById);

// ---- Duplicate / similarity check ----
router.get('/duplicates/check', async (req, res) => {
  const { name = '', stateId = '', category = '' } = req.query;
  const q = name.toLowerCase().trim();
  const [items, communityPlaces, contributions] = await Promise.all([
    db.all('culturalitems'), db.all('communityplaces'), db.all('contributions')
  ]);
  const matches = (list) => list.filter((it) => {
    const hay = [it.title, it.name, it.description, it.location, it.district, ...(it.alternateNames || [])]
      .join(' ').toLowerCase();
    let score = 0;
    if (q && q.length >= 3 && hay.includes(q)) score += 5;
    if (stateId && it.stateId === stateId) score += 2;
    if (category && it.category === category) score += 1;
    return score >= 3;
  }).map((it) => ({ id: it.id, name: it.title || it.name, kind: 'cultural-item', state: it.stateName, category: it.category }));
  const cpl = matches(communityPlaces.map((p) => ({ ...p, title: p.name }))).map((m) => ({ ...m, kind: 'community-place' }));
  const conl = matches(contributions.map((c) => ({ ...c, name: c.title, stateName: c.stateName }))).map((m) => ({ ...m, kind: 'contribution' }));
  res.json([...matches(items), ...cpl, ...conl]);
});

// Reject/merge a duplicate (admin) — marks the target record as duplicate.
router.put('/duplicates/:id', [authRequired, adminRequired], async (req, res) => {
  const { action, mergeIntoId, notes } = req.body;
  const item = await db.findOne('culturalitems', { id: req.params.id });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (action === 'reject') {
    const updated = await db.update('culturalitems', { id: item.id }, { verificationStatus: 'rejected', reviewerNotes: notes || 'Rejected as duplicate' });
    return res.json(await db.findOne('culturalitems', { id: item.id }) || updated);
  }
  if (action === 'merge' && mergeIntoId) {
    const target = await db.findOne('culturalitems', { id: mergeIntoId });
    if (!target) return res.status(404).json({ error: 'Target item not found' });
    const mergedTags = [...new Set([...(target.tags || []), ...(item.tags || [])])];
    const mergedAlt = [...new Set([...(target.alternateNames || []), ...(item.alternateNames || [])])];
    await db.update('culturalitems', { id: target.id }, { tags: mergedTags, alternateNames: mergedAlt, reviewerNotes: 'Merged with ' + item.id });
    await db.update('culturalitems', { id: item.id }, { verificationStatus: 'rejected', reviewerNotes: 'Merged into ' + mergeIntoId });
    return res.json(await db.findOne('culturalitems', { id: target.id }));
  }
  return res.status(400).json({ error: 'Invalid action' });
});

// ---- Data import (admin) ----
// Import approved JSON/CSV datasets. Every record keeps its source, URL, license,
// import date and verification status. Records are staged for review, not auto-published.
router.post('/import', [authRequired, adminRequired], async (req, res) => {
  const { records = [], sourceName, sourceUrl, license, attribution } = req.body;
  if (!Array.isArray(records) || !records.length) return res.status(400).json({ error: 'records array required' });
  const states = await db.all('states');
  let added = 0;
  const results = [];
  for (const r of records) {
    if (!r.title) continue;
    const state = states.find((s) => s.id === r.stateId || s.name === r.stateName);
    const item = {
      id: db.uid('ci'),
      title: (r.title || '').toString().slice(0, 300),
      name: (r.name || r.title || '').toString().slice(0, 300),
      alternateNames: Array.isArray(r.alternateNames) ? r.alternateNames : [],
      category: r.category || 'tradition',
      description: r.description || '',
      history: r.history || '',
      culturalSignificance: r.significance || r.culturalSignificance || '',
      stateId: (state && state.id) || r.stateId || '',
      stateName: (state && state.name) || r.stateName || '',
      district: r.district || '',
      location: r.location || '',
      lat: Number.isFinite(Number(r.lat)) ? Number(r.lat) : undefined,
      lng: Number.isFinite(Number(r.lng)) ? Number(r.lng) : undefined,
      traditionalRegions: Array.isArray(r.traditionalRegions) ? r.traditionalRegions : [],
      culturalCentres: Array.isArray(r.culturalCentres) ? r.culturalCentres : [],
      originLocations: Array.isArray(r.originLocations) ? r.originLocations : [],
      images: Array.isArray(r.images) ? r.images : [],
      imageMetadata: Array.isArray(r.imageMetadata) ? r.imageMetadata : [],
      tags: Array.isArray(r.tags) ? r.tags : [],
      sourceName: sourceName || r.sourceName || 'Imported dataset',
      sourceUrl: sourceUrl || r.sourceUrl || '',
      sourceType: r.sourceType || 'openDataset',
      sources: [{ name: sourceName || r.sourceName || 'Imported dataset', type: r.sourceType || 'openDataset', originalUrl: sourceUrl || r.sourceUrl || '', attribution: attribution || '', license: license || 'Open Dataset', accessDate: new Date().toISOString().slice(0, 10) }],
      verificationStatus: 'under_review',
      verificationLevel: 'PENDING_VERIFICATION',
      lastVerified: '',
      slug: r.slug || '',
      evidenceLabel: 'openDataset',
      reviewerNotes: 'Imported for admin review',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.insert('culturalitems', item);
    (item.originLocations || []).forEach((ol, i) => {
      db.insert('locations', { id: db.uid('loc'), name: ol.name, cultureId: item.id, locationType: ol.locationType || 'origin', state: ol.state, stateId: ol.stateId, district: ol.district, cityOrVillage: ol.cityOrVillage || ol.city || '', latitude: ol.latitude, longitude: ol.longitude, accuracy: toAccuracy(ol.accuracy), locationSource: ol.locationSource || ol.source || sourceName || 'Imported dataset', locationSourceUrl: ol.locationSourceUrl || ol.sourceUrl || '', source: ol.source || sourceName || 'Imported dataset', sourceUrl: sourceUrl || ol.sourceUrl || '', verificationLevel: 'PENDING_VERIFICATION', lastVerified: '' });
    });
    results.push(item.id);
    added++;
  }
  res.status(201).json({ added, ids: results });
});

// ---- AI vision + cultural database matching ----
async function matchAgainstDatabase(ai) {
  const items = await db.all('culturalitems');
  const traits = (ai.visualDetails || '') + ' ' + (ai.possibleIdentification || '') + ' ' + (ai.artForm || '') + ' ' + (ai.region || '');
  const tl = traits.toLowerCase();
  let best = null;
  let bestScore = 0;
  items.filter((c) => PUBLISHED.includes(c.verificationStatus)).forEach((c) => {
    const hay = [c.title, c.name, c.category, c.stateName, c.description, c.history, ...(c.tags || []), ...(c.alternateNames || []), ...(c.culturalCentres || []), ...(c.traditionalRegions || [])]
      .join(' ').toLowerCase();
    let score = 0;
    const aiConf = Number(ai.confidence) || 40;
    // Name match
    if ((c.title && tl.includes(c.title.toLowerCase())) || (c.name && tl.includes(c.name.toLowerCase()))) score += 30;
    (c.alternateNames || []).forEach((n) => { if (tl.includes(n.toLowerCase())) score += 20; });
    // Region match
    const region = (ai.region || '').toLowerCase();
    if (region && c.stateName && (region.includes(c.stateName.toLowerCase()) || c.stateName.toLowerCase().includes(region))) score += 15;
    (c.traditionalRegions || []).forEach((r) => { if (region && region.includes(r.toLowerCase())) score += 10; });
    // Category match
    if (c.category && (ai.artForm || '').toLowerCase() && (c.category.includes(ai.artForm.toLowerCase()) || ai.artForm.toLowerCase().includes(c.category))) score += 8;
    // Tag / trait keyword overlap
    tl.split(/\W+/).filter((w) => w.length > 3).forEach((w) => { if (hay.includes(w)) score += 1; });
    // Blend GPT confidence so a cautious AI never dominates
    score += Math.round(aiConf / 10);
    if (score > bestScore) { bestScore = score; best = c; }
  });
  const confidence = Math.min(98, Math.round((bestScore / 60) * 100));
  const level = confidence >= 80 ? 'likely-match' : confidence >= 55 ? 'partial-match' : 'weak-match';
  return {
    best: best ? { id: best.id, title: best.title, name: best.name, category: best.category, stateName: best.stateName, confidence, level } : null,
    all: [],
    aiSuggestion: { possibleIdentification: ai.possibleIdentification, confidence: Number(ai.confidence) || 40 }
  };
}

// Public entry: analyse a cultural image and return the AI + database match.
// AI is an ASSISTANT only; it can never mark a record officially verified.
router.post('/match', upload.single('image'), async (req, res) => {
  const query = (req.body?.query || '').toString();
  const culturalItems = await db.all('culturalitems');
  let dr = null;
  if (req.file) {
    dr = await matchAgainstDatabase(
      gemini.isConfigured()
        ? await gemini.analyzeImage(req.file.buffer, req.file.mimetype).catch(() => ({ possibleIdentification: query || 'Unidentified cultural object', artForm: '', region: '', confidence: 30, visualDetails: '' }))
        : { possibleIdentification: '', artForm: '', region: '', confidence: 0, visualDetails: '' }
    );
  } else if (query.trim()) {
    dr = await matchAgainstDatabase({
      possibleIdentification: query,
      artForm: '', region: '', confidence: 40, visualDetails: query
    });
  }
  if (!dr) return res.status(400).json({ error: 'Provide an image or a description' });
  if (!req.file && !gemini.isConfigured()) {
    // keyword heuristic over full dataset when no vision configured
    const ql = query.toLowerCase();
    const scored = culturalItems
      .filter((c) => PUBLISHED.includes(c.verificationStatus))
      .map((c) => {
        const hay = [c.title, c.name, c.description, c.stateName, ...(c.tags || []), ...(c.alternateNames || [])].join(' ').toLowerCase();
        let s = 0;
        ql.split(/\W+/).filter((w) => w.length > 3).forEach((w) => { if (hay.includes(w)) s += 2; });
        return { c, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 1);
    if (scored.length) {
      const c = scored[0].c;
      dr = { best: { id: c.id, title: c.title, category: c.category, stateName: c.stateName, confidence: Math.min(94, 55 + scored[0].s * 6), level: 'likely-match' }, all: [] };
    }
  }
  res.json({
    ...dr,
    mode: req.file ? (gemini.isConfigured() ? 'gemini-vision' : 'metadata') : 'keyword',
    disclaimer: 'AI-assisted match only. Not a final verification. Suggested matches must be reviewed by an administrator against trusted sources before being marked verified.'
  });
});

// Admin verification of cultural items (content + image + location accuracy).
// Approving NEVER manufactures a verification level: if an admin marks a record
// verified/published without a VERIFIED_* level, it stays PENDING_VERIFICATION.
router.put('/items/:id/verify', [authRequired, adminRequired], async (req, res) => {
  const { action, reviewerNotes, evidenceLabel, verificationLevel } = req.body;
  const item = await db.findOne('culturalitems', { id: req.params.id });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const lvl = verificationLevel !== undefined ? toLevel(verificationLevel) : toLevel(item.verificationLevel);
  const update = {};
  switch (action) {
    case 'approve-verify':
      update.verificationStatus = 'verified';
      update.reviewerNotes = reviewerNotes || 'Approved by reviewer';
      if (evidenceLabel) update.evidenceLabel = evidenceLabel;
      if (lvl) update.verificationLevel = lvl;
      break;
    case 'publish':
      update.verificationStatus = 'published';
      update.reviewerNotes = reviewerNotes || 'Published';
      if (lvl) update.verificationLevel = lvl;
      break;
    case 'set-level':
      if (!lvl) return res.status(400).json({ error: 'verificationLevel required' });
      update.verificationLevel = lvl;
      update.reviewerNotes = reviewerNotes || 'Verification level updated';
      break;
    case 'needs-changes':
      update.verificationStatus = 'needs_changes';
      update.reviewerNotes = reviewerNotes || 'Requesting changes';
      break;
    case 'reject':
      update.verificationStatus = 'rejected';
      update.reviewerNotes = reviewerNotes || 'Rejected';
      break;
    case 'notes':
      update.reviewerNotes = reviewerNotes || '';
      break;
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
  if (['verified', 'published'].includes(update.verificationStatus) && isVerifiedLevel(update.verificationLevel || item.verificationLevel)) {
    update.lastVerified = new Date().toISOString().slice(0, 10);
    update.verifiedById = req.user.id;
  }
  update.updatedAt = new Date().toISOString();
  await db.update('culturalitems', { id: item.id }, update);
  res.json(await db.findOne('culturalitems', { id: item.id }));
});

module.exports = router;
