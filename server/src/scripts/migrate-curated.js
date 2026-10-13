#!/usr/bin/env node
// SANSKRITI — migration: curated client dataset -> canonical cultural knowledge layer.
//
// The curated data in `client/src/data` (items, places, imageMap) is the trusted,
// hand-reviewed source. This script lifts it into the server MongoDB collections
// (culturalitems, sources, culturalimages, locations, institutions, places) with
// canonical verification levels and location accuracy, and marks the legacy demo
// seed records as PENDING_VERIFICATION (they are never deleted, never falsely verified).
//
// It also writes `server/src/data/curated.js` — a generated, source-controlled CJS
// cache so the in-memory fallback mode serves the same authentic dataset.
//
// Usage:
//   node src/scripts/migrate-curated.js            # Mongo if reachable, else dry-run
//   node src/scripts/migrate-curated.js --apply    # force Mongo apply (fails if unreachable)
//   node src/scripts/migrate-curated.js --dry-run  # compute + report only
//   node src/scripts/migrate-curated.js --memory   # apply into an in-memory instance (smoke test)
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { toLevel, isVerifiedLevel, toAccuracy, sourceTypeFromLabel, evidenceFromLevel } = require('../constants/verification');
const models = require('../models');
const { MemoryDB } = require('../utils/memorydb');

const ROOT = path.join(__dirname, '..', '..', '..');
const CLIENT_DATA = path.join(ROOT, 'client', 'src', 'data');
const CACHE_OUT = path.join(__dirname, '..', 'data', 'curated.js');

const { ITEMS } = require(path.join(CLIENT_DATA, 'items.js'));
const { PLACES } = require(path.join(CLIENT_DATA, 'places.js'));
const { IMAGE_MAP } = require(path.join(CLIENT_DATA, 'imageMap.js'));
const { RISK } = require(path.join(CLIENT_DATA, 'risk.js'));

const TODAY = new Date().toISOString().slice(0, 10);
const NOW = new Date().toISOString();

// ---- helpers ----------------------------------------------------------------

const relFor = (t) => (['government', 'museum', 'academic'].includes(t) ? 'high' : t === 'AI' ? 'low' : 'medium');
const orgOf = (name) => (name.includes(',') ? name.split(',')[0] : name.length > 48 ? `${name.slice(0, 48)}…` : name);
const firstPeriod = (tl) => (Array.isArray(tl) && tl.length ? tl[0].period || '' : '');
const locName = (it) => it.city || (it.district ? `${it.district}, ${it.state}` : it.state || 'Region');

function itemDocument(it) {
  const level = toLevel(it.verification && it.verification.level);
  const verified = isVerifiedLevel(level);
  const lastVerified = verified ? (it.verification && it.verification.date) || TODAY : '';
  const accuracy = toAccuracy(it.accuracy);
  const imgRec = IMAGE_MAP[`item:${it.id}`];
  const inlineVerified = (it.images || []).filter((im) => im && im.url && im.verification === 'verified');
  const primary = (it.sources || [])[0] || {};
  const primaryType = sourceTypeFromLabel(primary.type);
  const risk = (RISK || {})[it.id] || { status: 'INSUFFICIENT_DATA', reasons: [], notes: 'Verifiable risk documentation pending.' };

  const originLocations = [{
    name: locName(it),
    locationType: 'origin',
    state: it.state || '',
    stateId: it.stateId || '',
    district: it.district || '',
    cityOrVillage: it.city || '',
    latitude: Number.isFinite(Number(it.lat)) ? Number(it.lat) : undefined,
    longitude: Number.isFinite(Number(it.lng)) ? Number(it.lng) : undefined,
    accuracy,
    source: primary.name || 'SANSKRITI Editorial',
    sourceUrl: primary.url || '',
    locationSource: primary.name || 'SANSKRITI Editorial',
    locationSourceUrl: primary.url || '',
    verificationLevel: level,
    lastVerified
  }];

  const sources = (it.sources || []).map((s) => {
    const st = sourceTypeFromLabel(s.type);
    return {
      name: s.name,
      organization: orgOf(s.name),
      type: st,
      sourceType: st,
      originalUrl: s.url || '',
      attribution: s.name,
      license: 'Referenced record — see source',
      accessDate: (it.verification && it.verification.date) || TODAY,
      verificationLevel: level,
      lastChecked: TODAY
    };
  });

  // Primary verified image resolved from Wikimedia Commons (imageMap), plus inline authenticated images.
  const imageMetadata = [];
  if (imgRec && imgRec.status === 'verified' && imgRec.url) {
    imageMetadata.push({
      url: imgRec.url,
      title: it.name,
      description: imgRec.description || '',
      caption: imgRec.description || `${it.name} — Wikimedia Commons`,
      sourceName: 'Wikimedia Commons (verification pipeline)',
      sourceUrl: `https://commons.wikimedia.org/wiki/${imgRec.file || ''}`,
      creator: imgRec.credit || 'Wikimedia Commons contributor',
      photographerOrInstitution: imgRec.credit || 'Wikimedia Commons contributor',
      license: imgRec.license || 'See file page',
      location: [it.city, it.state].filter(Boolean).join(', '),
      isIllustrative: !verified,
      verificationStatus: verified ? 'verified' : 'needs_review',
      verificationLevel: verified ? level : 'PENDING_VERIFICATION',
      matchConfidence: verified ? 97 : 0
    });
  }
  inlineVerified.forEach((im) => {
    imageMetadata.push({
      url: im.url,
      title: it.name,
      description: im.caption || '',
      caption: im.caption || it.name,
      sourceName: im.sourceName || 'Wikimedia Commons',
      sourceUrl: im.sourceUrl || '',
      creator: im.creator || '',
      photographerOrInstitution: im.creator || im.sourceName || '',
      license: im.license || 'See file page',
      location: [it.city, it.state].filter(Boolean).join(', '),
      isIllustrative: false,
      verificationStatus: 'verified',
      verificationLevel: level,
      matchConfidence: 95
    });
  });
  // No verified image at all -> explicit placeholders only (never random stock).
  const walls = imageMetadata.length;

  const images = imageMetadata.map((m) => m.url).filter(Boolean).slice(0, 4);

  const doc = {
    id: `ci-${it.id}`,
    slug: it.id,
    title: it.name,
    cultureName: it.name,
    nativeName: it.nativeName || '',
    name: it.name,
    alternateNames: it.alternateNames || [],
    category: it.category || 'heritage',
    subCategory: it.subCategory || '',
    description: it.description || it.summary || '',
    history: it.history || '',
    historicalPeriod: firstPeriod(it.timeline),
    community: (it.dna && it.dna.people) || '',
    culturalSignificance: [it.dna && it.dna.rituals, it.dna && it.dna.festivals].filter(Boolean).join(' '),
    stateId: it.stateId || '',
    stateName: it.state || '',
    district: it.district || '',
    cityOrVillage: it.city || '',
    location: [it.city, it.state].filter(Boolean).join(', '),
    lat: Number.isFinite(Number(it.lat)) ? Number(it.lat) : undefined,
    lng: Number.isFinite(Number(it.lng)) ? Number(it.lng) : undefined,
    originLocations,
    traditionalRegions: it.region ? [it.region] : [],
    culturalCentres: it.city ? [it.city] : [],
    images,
    media: [],
    imageMetadata,
    sources,
    sourceName: primary.name || 'SANSKRITI Editorial',
    sourceUrl: primary.url || '',
    sourceType: primaryType,
    languages: (it.dna && it.dna.language) ? [it.dna.language] : [],
    relatedArtists: [],
    relatedPlaces: [],
    relatedEvents: [],
    relatedTraditions: (it.relatedCultures || []).map((rc) => `ci-${rc.id}`),
    contributorId: '',
    verificationStatus: verified ? 'verified' : 'pending_review',
    verificationLevel: level,
    lastVerified,
    evidenceLabel: evidenceFromLevel(level),
    reviewerNotes: walls === 0 ? 'Curated record preserved; image resolution pending.' : '',
    riskAssessment: {
      status: risk.status,
      reasons: risk.reasons || [],
      notes: risk.notes || ''
    },
    aiMeta: null,
    tags: it.tags || [],
    views: 0,
    createdAt: NOW,
    updatedAt: NOW
  };
  return doc;
}

function placeDocument(p) {
  const level = toLevel((p.verification && p.verification.level) || 'Verified Museum');
  const imgRec = IMAGE_MAP[`place:${p.id}`];
  return {
    id: `cp-${p.id}`,
    name: p.name,
    stateId: p.stateId || '',
    stateName: p.state || '',
    region: p.region || '',
    district: p.district || '',
    city: p.city || '',
    lat: Number.isFinite(Number(p.lat)) ? Number(p.lat) : null,
    lng: Number.isFinite(Number(p.lng)) ? Number(p.lng) : null,
    category: p.type === 'museum' ? 'heritage' : p.category || 'heritage',
    description: p.description || '',
    traditions: (p.relatedItems || []).map((rid) => `ci-${rid}`),
    type: p.type === 'museum' ? 'heritage' : p.type || 'heritage',
    image: imgRec && imgRec.status === 'verified' ? imgRec.url : '',
    demoProfile: false
  };
}

// ---- build ---------------------------------------------------------------

function build() {
  const items = ITEMS.map(itemDocument);
  const places = PLACES.map(placeDocument);
  const today = TODAY;

  const sourceIndex = new Map(); // url -> source row (canonical unique source)
  const institutionIndex = new Map(); // url -> institution row

  const ensureSource = (it, s, level) => {
    const url = (s && s.url) || '';
    const key = url || it.id;
    if (!sourceIndex.has(key)) {
      const st = sourceTypeFromLabel(s && s.type);
      const name = (s && s.name) || 'SANSKRITI Editorial';
      sourceIndex.set(key, {
        id: `src-${(it.id || 'item').replace(/[^a-z0-9-]/gi, '').slice(0, 40)}`,
        name,
        organization: orgOf(name),
        website: url,
        type: st,
        country: 'India',
        reliabilityLevel: relFor(st),
        originalUrl: url,
        attribution: name,
        license: 'Referenced record — see source',
        institutionId: '',
        accessDate: today,
        verificationStatus: isVerifiedLevel(level) ? 'verified' : 'pending',
        verificationLevel: level,
        lastChecked: today
      });
    }
  };
  const ensureInstitution = (s) => {
    const url = (s && s.url) || '';
    const key = url || (s && s.name) || 'SANSKRITI Editorial';
    if (!institutionIndex.has(key)) {
      const name = s && s.name ? orgOf(s.name) : 'SANSKRITI Editorial';
      institutionIndex.set(key, {
        id: `inst-${name.toLowerCase().replace(/[^a-z0-9-]/gi, '-').slice(0, 36)}`,
        name,
        type: s && s.type ? (sourceTypeFromLabel(s.type) === 'academic' ? 'university' : sourceTypeFromLabel(s.type) === 'museum' ? 'museum' : sourceTypeFromLabel(s.type) === 'government' ? 'government' : 'cultural-organization') : 'cultural-organization',
        website: url,
        location: s && s.state ? s.state : 'India',
        stateName: (s && s.state) || '',
        description: 'Cultural reference institution recorded in the curated dataset.',
        apiUrl: '',
        license: 'Referenced record — see institution',
        country: 'India',
        reliabilityLevel: 'high',
        verificationStatus: 'verified',
        lastChecked: today
      });
    }
  };

  const curatedCulturalItems = items;
  const curatedPlaces = places;

  const curatedSources = [];
  const curatedInstitutions = [];
  const curatedImages = [];
  const curatedLocations = [];

  ITEMS.forEach((it) => {
    const doc = items.find((d) => d.id === `ci-${it.id}`);
    const level = doc.verificationLevel;
    (it.sources || []).forEach((s) => {
      ensureSource(it, s, level);
      ensureInstitution(s);
    });
    const usedSource = sourceIndex.get(((it.sources || [])[0] || {}).url || it.id);
    (doc.imageMetadata || []).forEach((im) => {
      curatedImages.push({
        id: `img-${it.id}`,
        imageUrl: im.url,
        cultureId: doc.id,
        title: im.title || it.name,
        caption: im.caption || '',
        description: im.description || '',
        isIllustrative: !!im.isIllustrative,
        sourceName: im.sourceName || '',
        sourceUrl: im.sourceUrl || '',
        creator: im.creator || '',
        photographerOrInstitution: im.photographerOrInstitution || '',
        copyright: '',
        license: im.license || 'See file page',
        location: { name: im.location || '', state: it.state || '' },
        verificationStatus: im.verificationStatus,
        verificationLevel: im.verificationLevel,
        lastVerified: doc.lastVerified,
        matchConfidence: im.matchConfidence || 0
      });
    });
    (doc.originLocations || []).forEach((ol) => {
      curatedLocations.push({
        id: `loc-${it.id}`,
        name: ol.name,
        cultureId: doc.id,
        locationType: 'origin',
        state: ol.state,
        stateId: ol.stateId,
        district: ol.district,
        cityOrVillage: ol.cityOrVillage,
        latitude: ol.latitude,
        longitude: ol.longitude,
        accuracy: ol.accuracy,
        source: ol.source,
        sourceUrl: ol.sourceUrl,
        locationSource: ol.locationSource,
        locationSourceUrl: ol.locationSourceUrl,
        verificationLevel: ol.verificationLevel,
        lastVerified: ol.lastVerified,
        private: false
      });
    });
  });

  curatedSources.push(...sourceIndex.values());
  curatedInstitutions.push(...institutionIndex.values());

  return { curatedCulturalItems, curatedPlaces, curatedSources, curatedImages, curatedLocations, curatedInstitutions };
}

// ---- persistence ----------------------------------------------------------

function writeCache(rows) {
  const fieldKeys = {
    curatedCulturalItems: rows.curatedCulturalItems,
    curatedPlaces: rows.curatedPlaces,
    curatedSources: rows.curatedSources,
    curatedImages: rows.curatedImages,
    curatedLocations: rows.curatedLocations,
    curatedInstitutions: rows.curatedInstitutions
  };
  const body = Object.entries(fieldKeys)
    .map(([k, v]) => `const ${k} = ${JSON.stringify(v, null, 2)};\n`)
    .join('\n');
  const header = '// GENERATED by migrate-curated.js — do not edit by hand.\n// Authentic dataset cache for the in-memory fallback mode.\n\n';
  fs.writeFileSync(CACHE_OUT, header + body + '\nmodule.exports = { ' + Object.keys(fieldKeys).join(', ') + ' };\n');
  console.log(`[cache] wrote ${CACHE_OUT}`);
}

async function upsertMongo(rows) {
  const write = async (collection, docs) => {
    const M = models[collection];
    let inserted = 0, updated = 0;
    for (const doc of docs) {
      const existing = await M.findOne({ id: doc.id }).exec();
      if (existing) { await M.updateOne({ id: doc.id }, { $set: doc }).exec(); updated++; }
      else {
        await M.create(doc).catch(async () => { await M.updateOne({ id: doc.id }, { $set: doc }).exec(); });
        inserted++;
      }
    }
    return { inserted, updated };
  };
  const nItems = await write('culturalitems', rows.curatedCulturalItems);
  const nPlaces = await write('places', rows.curatedPlaces);
  const nSrc = await write('sources', rows.curatedSources);
  const nImgs = await write('culturalimages', rows.curatedImages);
  const nLocs = await write('locations', rows.curatedLocations);
  const nInst = await write('institutions', rows.curatedInstitutions);

  await downgradeLegacy();

  return { items: nItems, places: nPlaces, sources: nSrc, images: nImgs, locations: nLocs, institutions: nInst };
}

// Downgrade legacy demo records to PENDING_VERIFICATION (never deleted, never falsely verified).
// Idempotent and safe to run on every boot.
async function downgradeLegacy() {
  const today = TODAY;
  const demoItemIds = ['ci1', 'ci2', 'ci3', 'ci4', 'ci5', 'ci6', 'ci7', 'ci8', 'ci9', 'ci10'];
  await models.culturalitems.updateMany({ id: { $in: demoItemIds } }, { $set: { verificationStatus: 'pending_review', verificationLevel: 'PENDING_VERIFICATION', lastVerified: '', reviewerNotes: 'Legacy demo record — awaiting source-backed verification.' } }).exec();
  const demoPlaceIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15'];
  await models.places.updateMany({ id: { $in: demoPlaceIds } }, { $set: { demoProfile: true } }).exec();
  const demoSourceIds = ['src1', 'src2', 'src3', 'src4', 'src5'];
  await models.sources.updateMany({ id: { $in: demoSourceIds } }, { $set: { verificationStatus: 'pending', verificationLevel: 'PENDING_VERIFICATION', lastChecked: today } }).exec();
  // Legacy seeded images have no `id` field; curated/user images always do.
  await models.culturalimages.updateMany({ id: { $exists: false } }, { $set: { verificationStatus: 'needs_review', verificationLevel: 'PENDING_VERIFICATION' } }).exec();
  await models.locations.updateMany({ verificationLevel: { $exists: false } }, { $set: { verificationLevel: 'PENDING_VERIFICATION' } }).exec();
  // Legacy demo community places follow the contribution workflow; mark them pending.
  const demoCommunityIds = ['cp1', 'cp2', 'cp3', 'cp4'];
  await models.communityplaces.updateMany(
    { id: { $in: demoCommunityIds } },
    { $set: { verificationStatus: 'pending_review', status: 'pending_review', verificationLevel: 'PENDING_VERIFICATION', demoProfile: true, reviewerNotes: 'Legacy demo place — awaiting verification.' } }
  ).exec();
}

async function applyMemory(rows) {
  const mem = new MemoryDB();
  const put = (collection, docs) => {
    docs.forEach((d) => {
      const existing = mem.findOne(collection, { id: d.id });
      if (existing) mem.update(collection, { id: d.id }, d);
      else mem.insert(collection, d);
    });
  };
  mem.reset();
  put('culturalitems', rows.curatedCulturalItems);
  put('places', rows.curatedPlaces);
  put('sources', rows.curatedSources);
  put('culturalimages', rows.curatedImages);
  put('locations', rows.curatedLocations);
  put('institutions', rows.curatedInstitutions);
  // Flag the legacy demo rows as pending within this instance.
  ['ci1', 'ci2', 'ci3', 'ci4', 'ci5', 'ci6', 'ci7', 'ci8', 'ci9', 'ci10'].forEach((id) => {
    const it = mem.findOne('culturalitems', { id });
    if (it) mem.update('culturalitems', { id }, { verificationStatus: 'pending_review', verificationLevel: 'PENDING_VERIFICATION' });
  });
  return {
    culturalitems: mem.count('culturalitems'),
    places: mem.count('places'),
    sources: mem.count('sources'),
    culturalimages: mem.count('culturalimages'),
    locations: mem.count('locations'),
    institutions: mem.count('institutions')
  };
}

// ---- main -----------------------------------------------------------------

function report(rows) {
  console.log('\n=== Migration build report ===');
  const stub = (arr) => `${arr.length} rows`;
  console.log(`culturalitems  : ${stub(rows.curatedCulturalItems)}`);
  console.log(`places         : ${stub(rows.curatedPlaces)}`);
  console.log(`sources        : ${stub(rows.curatedSources)}`);
  console.log(`culturalimages : ${stub(rows.curatedImages)}`);
  console.log(`locations      : ${stub(rows.curatedLocations)}`);
  console.log(`institutions   : ${stub(rows.curatedInstitutions)}`);

  const byLevel = {};
  rows.curatedCulturalItems.forEach((c) => { byLevel[c.verificationLevel] = (byLevel[c.verificationLevel] || 0) + 1; });
  console.log('\nVerification level distribution (curated culturalitems):');
  Object.entries(byLevel).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  const noLoc = rows.curatedCulturalItems.filter((c) => !Number.isFinite(Number(c.lat)) || !Number.isFinite(Number(c.lng)));
  const approx = rows.curatedCulturalItems.filter((c) => c.originLocations && c.originLocations[0] && ['DISTRICT_LEVEL', 'REGION_LEVEL'].includes(c.originLocations[0].accuracy));
  console.log(`\nLocation audit:`);
  console.log(`  missing coords        : ${noLoc.length}`);
  console.log(`  district/region approx: ${approx.length} (labelled approximations, not hidden)`);
  console.log(`  sample                : ${rows.curatedCulturalItems.slice(0, 3).map((c) => `${c.id} [${c.verificationLevel}] (${c.lat},${c.lng})`).join(' · ')}`);
  return byLevel;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('--preview');
  const forceApply = args.includes('--apply');
  const memoryApply = args.includes('--memory');

  console.log('SANSKRITI curated-data migration');
  console.log(`  source: ${CLIENT_DATA}`);
  const rows = build();
  writeCache(rows);
  report(rows);

  if (memoryApply) {
    console.log('\n=== Memory apply ===');
    const counts = applyMemory(rows);
    console.log('In-memory instance counts:', counts);
    process.exit(0);
  }

  const uri = process.env.MONGO_URI;
  if (dryRun || !uri) {
    console.log('\nNo {MONGO_URI} configured' + (dryRun ? ' (dry-run requested)' : '') + ' — dry-run only. Re-run with MONGO_URI set or --apply.');
    if (uri) console.log('MONGO_URI is present but dry-run was requested.');
    process.exit(0);
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 6000 });
    console.log(`\nConnected: ${mongoose.connection.name}`);
  } catch (e) {
    if (forceApply) { console.error('Mongo connect failed:', e.message); process.exit(1); }
    console.log('\nMongo unavailable (' + e.message + ') — dry-run only.');
    process.exit(0);
  }

  const counts = await upsertMongo(rows);
  console.log('\n=== Mongo upsert result (inserted/updated) ===');
  Object.entries(counts).forEach(([k, v]) => console.log(`  ${k}: inserted=${v.inserted} updated=${v.updated}`));
  console.log('\nLegacy demo records marked PENDING_VERIFICATION (never deleted, never shown as verified).');
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((e) => { console.error('Migration failed:', e); process.exit(1); });
}

module.exports = { build, writeCache, report, upsertMongo, downgradeLegacy, applyMemory, MemoryDB };