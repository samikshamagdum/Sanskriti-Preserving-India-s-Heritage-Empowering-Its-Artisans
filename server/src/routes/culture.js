const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const seed = require('../data/seed');
const { publicVisible, shapeLocation } = require('../controllers/cultureController');
const { toLevel, toAccuracy, accuracyLabel, levelLabel, isVerifiedLevel, VERIFICATION_LEVELS } = require('../constants/verification');

// State capital coordinates used to place "tradition" markers on the map.
const CAPITALS = {
  dl: [28.6139, 77.2090], rj: [26.9124, 75.7873], up: [26.8467, 80.9462], pb: [30.7333, 76.7794],
  jk: [34.0837, 74.7973], hp: [31.1048, 77.1734], uk: [30.3165, 78.0322], hr: [29.0588, 76.0856],
  bh: [25.5941, 85.1376], jh: [23.3441, 85.3096], wb: [22.5726, 88.3639], od: [20.2961, 85.8245],
  mp: [23.2599, 77.4126], cg: [21.2787, 81.8661], gj: [23.0225, 72.5714], mh: [19.0760, 72.8777],
  ga: [15.2993, 74.1240], ka: [12.9716, 77.5946], kl: [8.5241, 76.9366], tn: [13.0827, 80.2707],
  ap: [16.5062, 80.6480], ts: [17.3850, 78.4867], ar: [27.1004, 93.6150], as: [26.2006, 92.9376],
  mz: [23.1645, 92.9376], mn: [24.8170, 93.9368], ml: [25.5788, 91.8933], nl: [25.6660, 94.1160],
  tr: [23.8315, 91.2868], sk: [27.3314, 88.6138]
};

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function value(item, stateId, region, category, language, period, district, sourceType, verificationStatus, verificationLevel, q) {
  const textFields = 'title name excerpt history origin significance biography art content description'.split(' ');
  let s = 0;
  const walk = (val) => {
    if (val == null) return;
    if (typeof val === 'string') {
      const v = val.toLowerCase();
      if (q && v.includes(q)) s += 3;
    } else if (Array.isArray(val)) {
      val.forEach(walk);
    }
  };
  if (q) {
    const ql = q.toLowerCase();
    walk(item.title || item.name || '');
    walk(item.excerpt || item.biography || item.description || '');
    walk(item.content || '');
    walk(item.region || '');
    walk(item.district || '');
    walk(item.keywords || []);
    walk(item.tags || []);
    walk(item.cityOrVillage || item.city || '');
    if ((item.stateName || '').toLowerCase().includes(ql)) s += 3;
    if ((item.category || '').toLowerCase().includes(ql)) s += 3;
    if ((item.art || '').toLowerCase().includes(ql)) s += 3;
  }
  if (stateId && item.stateId === stateId) s += 4;
  if (region && item.region === region) s += 4;
  if (category && item.category === category) s += 4;
  if (language && item.language === language) s += 4;
  if (period && item.period === period) s += 4;
  if (district && (item.district === district || item.city === district || item.cityOrVillage === district || item.region === district)) s += 4;
  if (sourceType && item.sourceType === sourceType) s += 4;
  if (verificationStatus && (item.verificationStatus === verificationStatus || item.status === verificationStatus)) s += 4;
  if (verificationLevel && toLevel(item.verificationLevel) === toLevel(verificationLevel)) s += 4;
  return s;
}

// Unified search across all cultural content types
router.get('/search', async (req, res) => {
  const { q, stateId, category, language, region, period, district, sourceType, verificationStatus, verificationLevel, type } = req.query;
  const query = (q || '').toString().toLowerCase().trim();

  const [traditions, artists, places, events, stories, artefacts, culturalItems, contributions] = await Promise.all([
    db.all('traditions'), db.all('artists'), db.all('places'), db.all('events'), db.all('stories'),
    db.all('artefacts'), db.all('culturalitems'), db.all('contributions')
  ]);

  // Community layer: only published/verified contributions are indexed.
  const community = contributions.filter((c) => c.status === 'published' || c.verificationStatus === 'published');
  // Verified layer: only VERIFIED_* tier records (never unverified as verified).
  const items = culturalItems.filter((c) => publicVisible(c));

  const collections = { traditions, artists, places, events, stories, artefacts, items, community };
  const results = {};

  Object.keys(collections).forEach((key) => {
    if (type && type !== key) return;
    const filtered = collections[key]
      .map((item) => ({ item, score: value(item, stateId, region, category, language, period, district, sourceType, verificationStatus, verificationLevel, query) }))
      .filter((r) => {
        if (query && !r.score) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .map((r) => ({
        ...r.item,
        type: key,
        matchScore: r.score,
        verificationLevel: key === 'community' ? 'COMMUNITY_SUBMITTED' : toLevel(r.item.verificationLevel),
        verificationLevelLabel: key === 'community' ? levelLabel('COMMUNITY_SUBMITTED') : levelLabel(r.item.verificationLevel)
      }));
    results[key] = filtered;
  });

  const total = Object.values(results).reduce((n, arr) => n + arr.length, 0);
  res.json({ results, total });
});

// Facets / filters metadata
router.get('/facets', async (req, res) => {
  const [traditions, culturalItems, contributions] = await Promise.all([
    db.all('traditions'), db.all('culturalitems'), db.all('contributions')
  ]);
  const districtSet = new Set();
  culturalItems.forEach((c) => c.district && districtSet.add(c.district));
  contributions.forEach((c) => c.district && districtSet.add(c.district));
  res.json({
    states: seed.states.map((s) => ({ id: s.id, name: s.name, region: s.region })),
    categories: seed.categories,
    periods: seed.periods,
    regions: [...new Set(seed.states.map((s) => s.region))],
    languages: [...new Set(traditions.map((t) => t.language).filter(Boolean))],
    districts: [...districtSet].sort(),
    sourceTypes: ['institutional', 'government', 'museum', 'academic', 'openDataset', 'archive', 'cultural-organization', 'community', 'AI'],
    verificationStatuses: ['draft', 'pending_review', 'submitted', 'under_review', 'needs_changes', 'verified', 'rejected', 'published'],
    verificationLevels: VERIFICATION_LEVELS.map((id) => ({ id, label: levelLabel(id) }))
  });
});

// Individual content types
router.get('/traditions', async (req, res) => {
  let [all, artists, places, stories, events] = await Promise.all([
    db.all('traditions'), db.all('artists'), db.all('places'), db.all('stories'), db.all('events')
  ]);
  let list = all.map((t) => ({
    ...t,
    artists: artists.filter((a) => a.art === t.title || a.category === t.category).slice(0, 3),
    places: places.filter((p) => (p.traditions || []).includes(t.id)).slice(0, 4),
    stories: stories.filter((s) => s.traditionId === t.id).slice(0, 3),
    festivals: events.filter((e) => e.category === t.category).slice(0, 3).map((e) => e.title)
  }));
  const { stateId, region, category, language, period } = req.query;
  if (stateId) list = list.filter((t) => t.stateId === stateId);
  if (region) list = list.filter((t) => t.region === region);
  if (category) list = list.filter((t) => t.category === category);
  if (language) list = list.filter((t) => t.language === language);
  if (period) list = list.filter((t) => t.period === period);
  res.json(list);
});

router.get('/traditions/:id', async (req, res) => {
  const t = await db.findOne('traditions', { id: req.params.id });
  if (!t) return res.status(404).json({ error: 'Tradition not found' });
  const [traditions, artists, places, stories, events, artefacts] = await Promise.all([
    db.all('traditions'), db.all('artists'), db.all('places'), db.all('stories'), db.all('events'), db.all('artefacts')
  ]);
  const enriched = {
    ...t,
    artists: artists.filter((a) => a.category === t.category || a.stateId === t.stateId).slice(0, 5),
    places: places.filter((p) => (p.traditions || []).includes(t.id) || p.stateId === t.stateId).slice(0, 5),
    stories: stories.filter((s) => s.traditionId === t.id),
    artefacts: (t.artefacts || []).map((id) => artefacts.find((a) => a.id === id)).filter(Boolean),
    festivals: events.filter((e) => e.category === t.category || e.stateId === t.stateId).slice(0, 4),
    related: traditions.filter((x) => x.category === t.category && x.id !== t.id).slice(0, 3)
  };
  res.json(enriched);
});

router.get('/artists', async (req, res) => {
  let list = await db.all('artists');
  const { stateId, category, region } = req.query;
  if (stateId) list = list.filter((a) => a.stateId === stateId);
  if (category) list = list.filter((a) => a.category === category);
  if (region) list = list.filter((a) => a.region === region);
  res.json(list);
});

router.get('/artists/:id', async (req, res) => {
  const a = await db.findOne('artists', { id: req.params.id });
  if (!a) return res.status(404).json({ error: 'Artist not found' });
  const traditions = await db.all('traditions');
  res.json({ ...a, traditions: traditions.filter((t) => t.category === a.category).slice(0, 4) });
});

router.get('/places', async (req, res) => {
  let [places, traditions] = await Promise.all([db.all('places'), db.all('traditions')]);
  let list = places.map((p) => ({
    ...p,
    traditions: (p.traditions || []).map((tid) => traditions.find((t) => t.id === tid)).filter(Boolean)
  }));
  const { stateId, region, category } = req.query;
  if (stateId) list = list.filter((p) => p.stateId === stateId);
  if (region) list = list.filter((p) => p.region === region);
  if (category) list = list.filter((p) => p.category === category);
  res.json(list);
});

router.get('/events', async (req, res) => {
  let list = (await db.all('events')).sort((a, b) => new Date(a.date) - new Date(b.date));
  const { stateId, region, category } = req.query;
  if (stateId) list = list.filter((e) => e.stateId === stateId);
  if (region) list = list.filter((e) => e.region === region);
  if (category) list = list.filter((e) => e.category === category);
  res.json(list);
});

router.get('/stories', async (req, res) => {
  let list = await db.all('stories');
  const { stateId, category } = req.query;
  if (stateId) list = list.filter((s) => s.stateId === stateId);
  if (category) list = list.filter((s) => s.category === category);
  res.json(list);
});

router.get('/artefacts', async (req, res) => {
  let list = await db.all('artefacts');
  const { stateId, category } = req.query;
  if (stateId) list = list.filter((a) => a.stateId === stateId);
  if (category) list = list.filter((a) => a.category === category);
  res.json(list);
});

router.get('/artefacts/:id', async (req, res) => {
  const a = await db.findOne('artefacts', { id: req.params.id });
  if (!a) return res.status(404).json({ error: 'Artefact not found' });
  res.json(a);
});

// Map data - all cultural markers with type filtering and Near-Me support
router.get('/map', async (req, res) => {
  const { stateId, city, district, category, type, lat, lng, radius, sourceType, verificationStatus, verificationLevel, locationType, risk } = req.query;
  const myLat = parseFloat(lat);
  const myLng = parseFloat(lng);
  const maxKm = parseFloat(radius) || 100;

  const [places, artists, events, traditions, culturalItems, communityPlaces, contributions] = await Promise.all([
    db.all('places'), db.all('artists'), db.all('events'), db.all('traditions'),
    db.all('culturalitems'), db.all('communityplaces'), db.all('contributions')
  ]);

  const markers = [];

  const publishedContrib = contributions.filter((c) => c.status === 'published' || c.verificationStatus === 'published');
  const visiblePlaces = communityPlaces.filter((p) => {
    const vs = p.verificationStatus || p.status;
    return ['published', 'verified'].includes(vs) && isVerifiedLevel(p.verificationLevel);
  });

  // Trust-first map layer: curated places and the cultural knowledge layer only.
  // Demo/legacy places (demoProfile) and state-capital approximations never appear.
  places.filter((p) => !p.demoProfile).forEach((p) => {
    if (!p.lat || !p.lng) return;
    const accuracy = toAccuracy(p.accuracy);
    markers.push({
      id: p.id, name: p.name, lat: p.lat, lng: p.lng, stateId: p.stateId,
      stateName: p.stateName, region: p.region, city: p.city || p.cityOrVillage || '', district: p.district || '',
      markerType: p.type || 'heritage', sourceLayer: 'institutional', category: p.category, description: p.description,
      traditions: p.traditions || [], image: p.image || '',
      accuracy, accuracyLabel: accuracyLabel(accuracy),
      verificationLevel: 'VERIFIED_MUSEUM',
      verificationLevelLabel: levelLabel('VERIFIED_MUSEUM'),
      locationSource: p.locationSource || p.source || 'Curated reference'
    });
  });

  artists.forEach((a) => {
    if (a.lat == null || a.lng == null) return;
    markers.push({
      id: a.id, name: a.name, lat: a.lat, lng: a.lng, stateId: a.stateId,
      stateName: a.stateName, region: a.region, city: a.city || '',
      markerType: 'artist', category: a.category, description: a.biography || a.art,
      art: a.art, image: a.image || '', workshops: a.workshops || [], verified: a.verified
    });
  });

  events.forEach((e) => {
    if (e.lat == null || e.lng == null) return;
    markers.push({
      id: e.id, name: e.title, lat: e.lat, lng: e.lng, stateId: e.stateId,
      stateName: e.stateName, region: e.region, city: e.city || '',
      markerType: 'event', category: e.category, description: e.description,
      date: e.date, location: e.location, image: e.image || ''
    });
  });

  // VERIFIED CULTURAL KNOWLEDGE LAYER — only VERIFIED_* tier records get markers,
  // and every marker keeps its coordinate accuracy + source so the map never
  // pretends a district/region marker is a precise site.
  culturalItems.filter((c) => publicVisible(c)).forEach((c) => {
    if (c.lat == null || c.lng == null) return;
    const origin = (c.originLocations || []).find((l) => l.locationType === 'origin') || (c.originLocations || [])[0] || {};
    const accuracy = toAccuracy(origin.accuracy || c.accuracy);
    markers.push({
      id: 'ci-' + c.id, name: c.title, lat: origin.latitude != null ? origin.latitude : c.lat, lng: origin.longitude != null ? origin.longitude : c.lng, stateId: c.stateId,
      stateName: c.stateName, region: '', city: c.cityOrVillage || c.location || '', district: c.district || '',
      markerType: c.sourceType === 'community' ? 'community' : 'knowledge',
      category: c.category, description: c.description,
      sourceType: c.sourceType, verificationStatus: c.verificationStatus,
      verificationLevel: toLevel(c.verificationLevel),
      verificationLevelLabel: levelLabel(c.verificationLevel),
      lastVerified: c.lastVerified || '',
      accuracy, accuracyLabel: accuracyLabel(accuracy),
      locationSource: origin.locationSource || origin.source || c.sourceName || '',
      locationSourceUrl: origin.locationSourceUrl || origin.sourceUrl || '',
      sourceName: c.sourceName, sourceUrl: c.sourceUrl,
      culturalCentres: c.culturalCentres || [], locationTypes: (c.originLocations || []).map((l) => l.locationType).filter(Boolean),
      images: c.images || [], image: (c.images || [])[0] || '',
      traditions: c.relatedTraditions || [], linkId: c.id, linkKind: 'item',
      risk: c.riskAssessment || { status: 'INSUFFICIENT_DATA' }
    });
  });

  // COMMUNITY CULTURAL PLACES
  visiblePlaces.forEach((p) => {
    if (p.lat == null || p.lng == null) return;
    const vs = p.verificationStatus || p.status;
    markers.push({
      id: 'cp-' + p.id, name: p.name, lat: p.lat, lng: p.lng, stateId: p.stateId,
      stateName: p.stateName, region: '', city: p.location || '', district: p.district || '',
      markerType: p.isEvent ? 'event' : 'community',
      category: p.category, description: p.description,
      sourceType: 'community', verificationStatus: vs,
      sourceName: p.contributorName || 'Community member', sourceInfo: p.sourceInfo,
      images: p.images || [], image: (p.images || [])[0] || '',
      linkId: p.id, linkKind: 'place'
    });
  });

  // PUBLISHED COMMUNITY HERITAGE (contributions with coordinates)
  publishedContrib.forEach((c) => {
    if (c.lat == null || c.lng == null) return;
    markers.push({
      id: 'cc-' + c.id, name: c.title, lat: c.lat, lng: c.lng, stateId: c.stateId,
      stateName: c.stateName, region: c.region, city: c.city || c.village || '', district: c.district || '',
      markerType: 'community', category: c.category, description: c.content,
      sourceType: 'community', verificationStatus: 'published',
      sourceName: c.author || 'Community member',
      images: (c.media || []).map((m) => m.url).filter(Boolean).slice(0, 3), image: '',
      linkId: c.id, linkKind: 'contribution'
    });
  });

  let filtered = markers;

  if (stateId) filtered = filtered.filter((m) => m.stateId === stateId);
  if (category) filtered = filtered.filter((m) => m.category === category);
  if (city) filtered = filtered.filter((m) => m.city === city || m.district === city);
  if (district) filtered = filtered.filter((m) => (m.district || '').toLowerCase() === district.toLowerCase());
  if (type && type !== 'all') filtered = filtered.filter((m) => m.markerType === type);
  if (sourceType) filtered = filtered.filter((m) => m.sourceType === sourceType);
  if (verificationStatus) filtered = filtered.filter((m) => (m.verificationStatus || '') === verificationStatus);
  if (verificationLevel) filtered = filtered.filter((m) => toLevel(m.verificationLevel) === toLevel(verificationLevel));
  if (locationType) filtered = filtered.filter((m) => m.locationTypes && m.locationTypes.includes(locationType));
  if (risk && risk !== 'ALL') filtered = filtered.filter((m) => (m.risk && m.risk.status) === risk);

  if (!Number.isNaN(myLat) && !Number.isNaN(myLng)) {
    filtered = filtered
      .map((m) => ({ ...m, distanceKm: Math.round(haversine(myLat, myLng, m.lat, m.lng) * 10) / 10 }))
      .filter((m) => m.distanceKm <= maxKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  const cities = [...new Set(markers.map((m) => m.city || m.district || '').filter(Boolean))].sort();
  res.json({ markers: filtered, cities, total: filtered.length });
});

// Health & impact dashboard — real aggregates from the verified corpus only.
// Every number is derived from stored records; no invented metrics.
router.get('/stats', async (req, res) => {
  const [culturalItems, places, sources, culturalImages, institutions, communityPlaces, contributions] = await Promise.all([
    db.all('culturalitems'), db.all('places'), db.all('sources'),
    db.all('culturalimages'), db.all('institutions'), db.all('communityplaces'), db.all('contributions')
  ]);

  const verified = culturalItems.filter((c) => isVerifiedLevel(toLevel(c.verificationLevel)));
  const publicItems = culturalItems.filter((c) => publicVisible(c) && c.verificationStatus === 'verified');
  const verifiedImages = culturalImages.filter((im) => isVerifiedLevel(toLevel(im.verificationLevel)));
  const publishedCommunityPlaces = communityPlaces.filter((p) => ['published', 'verified'].includes(p.verificationStatus || p.status) || isVerifiedLevel(p.verificationLevel));
  const publishedContributions = contributions.filter((c) => c.status === 'published' || c.verificationStatus === 'published');

  const byCategory = {};
  const byState = {};
  const byRisk = { THRIVING: 0, VULNERABLE: 0, DECLINING: 0, CRITICAL: 0, INSUFFICIENT_DATA: 0 };
  const byLevel = {};
  publicItems.forEach((c) => {
    const cat = c.category || 'other';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    const st = c.stateName || 'Unknown';
    byState[st] = (byState[st] || 0) + 1;
    const r = (c.riskAssessment && c.riskAssessment.status) || 'INSUFFICIENT_DATA';
    byRisk[r] = (byRisk[r] || 0) + 1;
    const lv = toLevel(c.verificationLevel);
    byLevel[lv] = (byLevel[lv] || 0) + 1;
  });
  const riskAtRisk = (byRisk.VULNERABLE || 0) + (byRisk.DECLINING || 0) + (byRisk.CRITICAL || 0);

  const sourceTypes = {};
  sources.forEach((s) => { const st = s.type || 'other'; sourceTypes[st] = (sourceTypes[st] || 0) + 1; });

  res.json({
    totals: {
      culturalItems: culturalItems.length,
      verifiedTierItems: verified.length,
      publicItems: publicItems.length,
      places: places.length,
      sources: sources.length,
      institutions: institutions.length,
      verifiedImages,
      communityContributions: publishedContributions.length,
      communityPlaces: publishedCommunityPlaces.length
    },
    distribution: { byCategory, byState, byLevel, byRisk, sourceTypes },
    impact: {
      riskAtRisk,
      riskSafe: byRisk.THRIVING || 0,
      documented: publicItems.length,
      verifiedEvidence: verifiedImages,
      sourceNetwork: sources.length,
      institutionalPartners: institutions.length,
      communityVoices: publishedContributions.length + publishedCommunityPlaces.length
    }
  });
});

// Personalised discovery
router.get('/home', async (req, res) => {
  const state = (req.user && req.user.stateId) || 'up';
  const interests = (req.user && req.user.interests) || ['dance', 'art-craft'];
  const [traditions, events, places] = await Promise.all([
    db.all('traditions'), db.all('events'), db.all('places')
  ]);
  const stateTraditions = traditions.filter((t) => t.stateId === state);
  const interestTraditions = traditions.filter((t) => interests.includes(t.category));
  const trending = traditions.slice().sort(() => Math.random() - 0.5).slice(0, 6);
  const today = events.slice(0, 3);
  const nearYou = places.filter((p) => p.stateId === state).slice(0, 5);
  res.json({
    recommended: interestTraditions.length ? interestTraditions : stateTraditions,
    nearYou,
    trending,
    todayCulture: today,
    yourState: seed.states.find((s) => s.id === state)
  });
});

module.exports = router;