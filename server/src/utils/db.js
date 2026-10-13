// Repository layer.
// Uses MongoDB Atlas (via Mongoose) whenever MONGO_URI is configured and reachable.
// Falls back to the in-memory demo database otherwise, so the app is always fully functional.
const models = require('../models');
const { MemoryDB, hasCuratedData } = require('./memorydb');

const memory = new MemoryDB();
let mongoEnabled = false;

function setMongo(enabled) { mongoEnabled = enabled; }
function isMongo() { return mongoEnabled; }
function mode() { return mongoEnabled ? 'mongo' : 'memory'; }
function dataset() { return mongoEnabled ? (hasCuratedData() ? 'curated+mongo' : 'mongo') : (hasCuratedData() ? 'curated-memory' : 'demo-memory'); }

function model(collection) {
  const M = models[collection];
  if (!M) throw new Error(`No model registered for collection: ${collection}`);
  return M;
}

// Reserved reference collections that always live in the in-memory seed (static config).
const REFERENCE = new Set(['states', 'categories', 'periods']);

function usable(collection) {
  return mongoEnabled && !REFERENCE.has(collection) && !!models[collection];
}

function toFilter(filter = {}) {
  const out = {};
  for (const [k, v] of Object.entries(filter)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if ('$in' in v) out[k] = { $in: v.$in };
      else if ('$regex' in v) out[k] = { $regex: v.$regex, $options: 'i' };
      else if ('$ne' in v) out[k] = { $ne: v.$ne };
      else out[k] = v;
    } else out[k] = v;
  }
  return out;
}

// Generate a short unique logical id (used when Mongo is the backing store).
function uid(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function find(collection, filter = {}) {
  if (!usable(collection)) return memory.find(collection, filter);
  return model(collection).find(toFilter(filter)).lean().exec();
}

async function findOne(collection, filter = {}) {
  if (!usable(collection)) return memory.findOne(collection, filter);
  return model(collection).findOne(toFilter(filter)).lean().exec();
}

async function insert(collection, doc) {
  if (!usable(collection)) return memory.insert(collection, doc);
  const created = await model(collection).create(doc);
  return created.toObject();
}

async function insertMany(collection, docs) {
  if (!usable(collection)) {
    const inserted = docs.map((d) => memory.insert(collection, d));
    return inserted;
  }
  return model(collection).insertMany(docs);
}

async function update(collection, filter, update) {
  if (!usable(collection)) return memory.update(collection, filter, update);
  return model(collection).findOneAndUpdate(toFilter(filter), { $set: update }, { new: true, lean: true }).exec();
}

async function remove(collection, filter) {
  if (!usable(collection)) return memory.remove(collection, filter);
  return model(collection).findOneAndDelete(toFilter(filter)).lean().exec();
}

async function count(collection, filter = {}) {
  if (!usable(collection)) return memory.count(collection, filter);
  return model(collection).countDocuments(toFilter(filter)).exec();
}

async function all(collection) {
  return find(collection, {});
}

// Seed reference/meta collections into Mongo on first boot so demo content persists.
// The cultural knowledge layer (culturalitems/places/sources/culturalimages/
// locations/institutions) is populated from the AUTHENTIC curated dataset via the
// migration pipeline — legacy demo rows are marked PENDING_VERIFICATION, never deleted.
async function seedIfNeeded() {
  if (!mongoEnabled) return;
  const seed = require('../data/seed');
  const { hash } = require('./auth');
  const pipeline = require('../scripts/migrate-curated');

  const batches = {
    traditions: seed.traditions,
    artists: seed.artists,
    events: seed.events,
    stories: seed.stories,
    artefacts: seed.artefacts,
    contributions: seed.contributions,
    culturetrails: seed.cultureTrails,
    culturepacks: seed.culturePacks,
    badges: seed.badges,
    communityplaces: seed.communityPlaces || [],
    voiceheritage: seed.voiceHeritage || []
  };

  for (const [key, docs] of Object.entries(batches)) {
    const existing = await models[key].estimatedDocumentCount().exec();
    if (existing === 0 && docs.length) {
      await models[key].insertMany(docs);
      console.log(`[seed] ${key}: inserted ${docs.length} demo docs`);
    }
  }

  // Authentic curated knowledge layer — upsert once, downgrade any legacy leftovers.
  const curatedCount = await models.culturalitems.countDocuments({ id: { $regex: '^ci-' } }).exec();
  if (curatedCount === 0) {
    console.log('[seed] Inserting authentic curated knowledge layer…');
    const counts = await pipeline.upsertMongo(pipeline.build());
    console.log('[seed] curated upsert:', counts);
  } else {
    await pipeline.downgradeLegacy();
    console.log('[seed] Curated data present; legacy demo rows kept as PENDING_VERIFICATION.');
  }

  const admin = await models.users.findOne({ email: 'admin@sanskriti.in' }).exec();
  if (!admin) {
    await models.users.create({
      id: 'u000',
      name: 'Admin',
      email: 'admin@sanskriti.in',
      password: hash('admin123'),
      role: 'admin',
      stateId: 'dl',
      interests: ['dance', 'art-craft'],
      xp: 1000,
      badges: [{ id: 'b-guardian', name: 'Heritage Guardian', icon: '🏛️' }],
      streak: 5
    });
    console.log('[seed] Admin account created: admin@sanskriti.in / admin123');
  }
}

module.exports = {
  setMongo,
  isMongo,
  mode,
  dataset,
  uid,
  find,
  findOne,
  insert,
  insertMany,
  update,
  remove,
  count,
  all,
  seedIfNeeded
};