// In-memory database with MongoDB-like interface.
// Used as a fallback when MongoDB Atlas is not configured or unreachable.
// Prefers the generated authentic curated dataset (data/curated.js) when it exists;
// otherwise it falls back to the legacy demo seed.
const seed = require('../data/seed');
let curated = null;
try { curated = require('../data/curated'); } catch (e) { curated = null; }

const hasCuratedData = () => !!curated;
const clone = (v) => JSON.parse(JSON.stringify(v));
const cloneOr = (v, dflt) => (v ? clone(v) : clone(dflt || []));

class MemoryDB {
  constructor() {
    this.reset();
  }

  reset() {
    this.data = {
      states: seed.states,
      categories: seed.categories,
      periods: seed.periods,
      traditions: clone(seed.traditions),
      artists: clone(seed.artists),
      places: curated
        ? [...clone(curated.curatedPlaces), ...clone(seed.places).map((p) => ({ ...p, demoProfile: true }))]
        : clone(seed.places),
      events: clone(seed.events),
      stories: clone(seed.stories),
      artefacts: clone(seed.artefacts),
      contributions: clone(seed.contributions),
      culturetrails: clone(seed.cultureTrails),
      voiceheritage: clone(seed.voiceHeritage || []),
      culturepacks: clone(seed.culturePacks || []),
      badges: clone(seed.badges || []),
      culturalitems: cloneOr(curated && curated.curatedCulturalItems, curated ? [] : seed.culturalItems),
      communityplaces: clone(seed.communityPlaces || []).map((p) => ({
        ...p,
        verificationStatus: 'pending_review',
        status: 'pending_review',
        verificationLevel: 'PENDING_VERIFICATION',
        demoProfile: true
      })),
      sources: cloneOr(curated && curated.curatedSources, curated ? [] : seed.culturalSources),
      culturalimages: cloneOr(curated && curated.curatedImages, curated ? [] : seed.culturalImages),
      locations: cloneOr(curated && curated.curatedLocations, curated ? [] : seed.culturalLocations),
      institutions: cloneOr(curated && curated.curatedInstitutions, curated ? [] : seed.culturalInstitutions),
      users: [],
      reports: []
    };
  }

  match(item, filter) {
    return Object.keys(filter).every((k) => {
      const v = filter[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && '$in' in v) {
        return item[k] !== undefined && v.$in.includes(item[k]);
      }
      if (v && typeof v === 'object' && !Array.isArray(v) && '$regex' in v) {
        return new RegExp(v.$regex, 'i').test(String(item[k] || ''));
      }
      if (v && typeof v === 'object' && !Array.isArray(v) && '$ne' in v) {
        return item[k] !== v.$ne;
      }
      return item[k] === v;
    });
  }

  find(collection, filter = {}) {
    const arr = this.data[collection] || [];
    return arr.filter((item) => this.match(item, filter));
  }

  findOne(collection, filter = {}) {
    const arr = this.data[collection] || [];
    return arr.find((item) => this.match(item, filter)) || null;
  }

  insert(collection, doc) {
    const arr = this.data[collection] || [];
    const newDoc = JSON.parse(JSON.stringify(doc));
    arr.push(newDoc);
    this.data[collection] = arr;
    return newDoc;
  }

  update(collection, filter, update) {
    const arr = this.data[collection] || [];
    let updated = null;
    for (let i = 0; i < arr.length; i++) {
      if (this.match(arr[i], filter)) {
        arr[i] = { ...arr[i], ...update };
        updated = arr[i];
        break;
      }
    }
    return updated;
  }

  remove(collection, filter) {
    const arr = this.data[collection] || [];
    const idx = arr.findIndex((item) => this.match(item, filter));
    if (idx >= 0) return arr.splice(idx, 1)[0];
    return null;
  }

  all(collection) {
    return this.data[collection] || [];
  }

  count(collection, filter = {}) {
    return this.find(collection, filter).length;
  }
}

module.exports = { MemoryDB, hasCuratedData };