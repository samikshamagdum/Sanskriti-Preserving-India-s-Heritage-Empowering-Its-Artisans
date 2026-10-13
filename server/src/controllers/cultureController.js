const db = require('../utils/db');
const { toLevel, isVerifiedLevel, toAccuracy, accuracyLabel, levelLabel } = require('../constants/verification');
const { computeAuthenticity } = require('../utils/authenticity');

// Public workflow states that may pair with a VERIFIED_* level.
const WORKFLOW_VISIBLE = ['verified', 'published'];

// A record is publicly visible only when it carries a VERIFIED_* trust tier.
// Legacy records marked PENDING_VERIFICATION (or lacking a level) are never
// presented as verified — admins see everything, the public sees the truth.
function publicVisible(item) {
  return isVerifiedLevel(item.verificationLevel);
}

// Normalise one embedded/standalone location to the canonical API shape.
function shapeLocation(l) {
  if (!l) return l;
  const accuracy = toAccuracy(l.accuracy);
  return {
    name: l.name,
    locationType: l.locationType,
    state: l.state,
    stateId: l.stateId,
    district: l.district,
    cityOrVillage: l.cityOrVillage,
    latitude: l.private ? undefined : (l.latitude != null ? l.latitude : undefined),
    longitude: l.private ? undefined : (l.longitude != null ? l.longitude : undefined),
    accuracy,
    accuracyLabel: accuracyLabel(accuracy),
    source: l.source || l.locationSource || '',
    locationSource: l.locationSource || l.source || '',
    locationSourceUrl: l.locationSourceUrl || l.sourceUrl || '',
    sourceUrl: l.sourceUrl || l.locationSourceUrl || '',
    verificationLevel: toLevel(l.verificationLevel),
    lastVerified: l.lastVerified || ''
  };
}

// Shape one source record to the canonical per-source field set.
function shapeSource(s) {
  if (!s) return s;
  return {
    sourceName: s.name || s.sourceName || '',
    name: s.name || s.sourceName || '',
    organization: s.organization || s.attribution || '',
    sourceUrl: s.originalUrl || s.sourceUrl || '',
    originalUrl: s.originalUrl || s.sourceUrl || '',
    sourceType: s.sourceType || s.type || 'institutional',
    type: s.type || s.sourceType || 'institutional',
    attribution: s.attribution || '',
    license: s.license || 'Unknown',
    licenseUrl: s.licenseUrl || '',
    accessDate: s.accessDate || '',
    verificationLevel: toLevel(s.verificationLevel),
    lastChecked: s.lastChecked || ''
  };
}

// Hydrate a cultural item with its full provenance envelope:
//   images    -> array of { imageUrl, caption, sourceName, license, ... }
//   locations -> array of { name, locationType, latitude, longitude, accuracy, accuracyLabel, locationSource, ... }
//   sources   -> array of { sourceName, organization, sourceUrl, sourceType, verificationLevel, ... }
// It joins the standalone `culturalimages` / `locations` / `sources` collections with the
// item's embedded `imageMetadata` / `originLocations` / `sources` records, and exposes the
// canonical response shape { cultureName, description, category, location, images, sources,
// verificationStatus, verificationLevel, lastVerified }.
function hydrate(item, { sources = [], images = [], locations = [] } = {}) {
  const imageList = images
    .filter((i) => i && i.cultureId && i.cultureId === item.id)
    .map((i) => ({
      imageUrl: i.imageUrl,
      title: i.title || i.caption || '',
      caption: i.caption || '',
      description: i.description || '',
      isIllustrative: !!i.isIllustrative,
      sourceName: i.sourceName || '',
      sourceUrl: i.sourceUrl || '',
      photographerOrInstitution: i.photographerOrInstitution || i.creator || '',
      creator: i.creator || '',
      copyright: i.copyright || '',
      license: i.license || 'Unknown',
      location: i.location || {},
      verificationStatus: i.verificationStatus || 'needs_review',
      verificationLevel: toLevel(i.verificationLevel),
      lastVerified: i.lastVerified || '',
      matchConfidence: i.matchConfidence || 0
    }));

  // Merge embedded image metadata (kept in sync) so details always render.
  (item.imageMetadata || []).forEach((im) => {
    if (im && im.url && !imageList.some((x) => x.imageUrl === im.url)) {
      const level = toLevel(im.verificationLevel);
      imageList.push({
        imageUrl: im.url,
        title: im.title || im.caption || '',
        caption: im.caption || '',
        description: im.description || '',
        isIllustrative: !!im.isIllustrative,
        sourceName: im.sourceName || '',
        sourceUrl: im.sourceUrl || '',
        photographerOrInstitution: im.photographerOrInstitution || im.creator || '',
        creator: im.creator || '',
        copyright: im.copyright || '',
        license: im.license || 'Unknown',
        location: im.location || '',
        verificationStatus: im.verificationStatus || 'needs_review',
        verificationLevel: level,
        lastVerified: item.lastVerified || '',
        matchConfidence: im.matchConfidence || 0
      });
    }
  });

  // Linked sources (standalone matched by cultureId + embedded), de-duplicated by name.
  const embeddedSourceNames = new Set((item.sources || []).map((s) => s && s.name));
  const sourceList = (item.sources || []).map(shapeSource);
  sources.forEach((s) => {
    if (!s || !s.name) return;
    const linked = s.cultureId === item.id || (!s.cultureId && embeddedSourceNames.has(s.name));
    if (linked && !sourceList.some((x) => x.name === s.name)) sourceList.push(shapeSource(s));
  });

  // Locations (standalone + embedded), hiding private exact coordinates.
  const locList = (item.originLocations || []).map(shapeLocation);
  locations.filter((l) => l && l.cultureId && l.cultureId === item.id).forEach((l) => {
    if (!locList.some((x) => x.name === l.name && x.locationType === l.locationType)) locList.push(shapeLocation(l));
  });

  const verificationLevel = toLevel(item.verificationLevel);
  const levelMeta = levelLabel(verificationLevel);
  const primaryLocation = locList.find((l) => l && l.locationType === 'origin') || locList[0] || {};
  const authenticity = computeAuthenticity(item, { sources: sourceList, images: imageList, locations: locList });

  return {
    ...item,
    id: item.id,
    cultureName: item.cultureName || item.name || item.title || '',
    slug: item.slug || item.id,
    title: item.title || item.name || '',
    name: item.name || item.title || '',
    category: item.category || '',
    description: item.description || '',
    location: {
      state: item.stateName || '',
      stateId: item.stateId || '',
      district: item.district || '',
      cityOrVillage: item.cityOrVillage || item.location || '',
      latitude: primaryLocation.latitude != null ? primaryLocation.latitude : item.lat,
      longitude: primaryLocation.longitude != null ? primaryLocation.longitude : item.lng,
      accuracy: primaryLocation.accuracy || toAccuracy(item.accuracy),
      accuracyLabel: primaryLocation.accuracyLabel || accuracyLabel(item.accuracy),
      locationSource: primaryLocation.locationSource || ''
    },
    images: imageList,
    sources: sourceList,
    locations: locList,
    verificationStatus: item.verificationStatus || 'pending_review',
    verificationLevel,
    verificationLevelLabel: levelMeta,
    lastVerified: item.lastVerified || '',
    authenticityScore: authenticity.score,
    authenticityVerdict: authenticity.verdict,
    authenticityChecks: authenticity.checks,
    evidenceLabel: item.evidenceLabel || (isVerifiedLevel(verificationLevel) ? 'institutional' : 'archive')
  };
}

async function hydrateMany(list) {
  const [sources, images, locations] = await Promise.all([
    db.all('sources'), db.all('culturalimages'), db.all('locations')
  ]);
  return list.map((c) => hydrate(c, { sources, images, locations }));
}

// GET /api/source/items — list cultural items with full populated provenance.
// Public read shows only VERIFIED_* tier records; admins see the pending queue too.
async function getCultures(req, res) {
  let list = await db.all('culturalitems');
  const { stateId, category, sourceType, verificationStatus, verificationLevel, locationType, q } = req.query;

  if (stateId) list = list.filter((c) => c.stateId === stateId);
  if (category) list = list.filter((c) => c.category === category);
  if (sourceType) list = list.filter((c) => c.sourceType === sourceType);
  if (verificationStatus) list = list.filter((c) => c.verificationStatus === verificationStatus);
  if (verificationLevel) list = list.filter((c) => toLevel(c.verificationLevel) === toLevel(verificationLevel));
  if (locationType) list = list.filter((c) => (c.originLocations || []).some((l) => l.locationType === locationType));
  if (q) {
    const ql = q.toLowerCase();
    list = list.filter((c) =>
      (c.title || '').toLowerCase().includes(ql) ||
      (c.name || '').toLowerCase().includes(ql) ||
      (c.description || '').toLowerCase().includes(ql) ||
      (c.alternateNames || []).some((n) => n.toLowerCase().includes(ql)) ||
      (c.tags || []).some((t) => t.toLowerCase().includes(ql))
    );
  }

  // Public read: only verified tier. Never claim unverified as verified.
  const visible = req.user && req.user.role === 'admin'
    ? list
    : list.filter((c) => publicVisible(c));

  return res.json(await hydrateMany(visible));
}

// GET /api/source/items/:id — detailed envelope for one culture.
async function getCultureById(req, res) {
  const item = await db.findOne('culturalitems', { id: req.params.id });
  if (!item) return res.status(404).json({ error: 'Cultural item not found' });

  const [sources, images, locations, artists, events] = await Promise.all([
    db.all('sources'), db.all('culturalimages'), db.all('locations'),
    db.all('artists'), db.all('events')
  ]);

  const populated = hydrate(item, { sources, images, locations });

  const isAdmin = req.user && req.user.role === 'admin';
  if (!isAdmin && !publicVisible(item)) {
    return res.status(404).json({ error: 'Cultural item not found' });
  }

  const relatedArtists = artists.filter((a) => (item.relatedArtists || []).includes(a.id) || a.stateId === item.stateId).slice(0, 6);
  const relatedEvents = events.filter((e) => (item.relatedEvents || []).includes(e.id) || e.stateId === item.stateId).slice(0, 6);

  return res.json({
    ...populated,
    relatedArtists,
    relatedEvents,
    evidenceLabel: item.evidenceLabel || item.sourceType || 'institutional'
  });
}

// Export the workflow filter so routes share the same trust policy.
module.exports = { getCultures, getCultureById, hydrate, hydrateMany, publicVisible, shapeLocation, WORKFLOW_VISIBLE };