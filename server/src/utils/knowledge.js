// Shared helpers for the two-layer Cultural Knowledge System:
// verified (institutional) layer + community-contributed layer.
// No AI result here ever changes verificationStatus — humans decide.

const VERIFICATION_STATUSES = ['draft', 'submitted', 'under_review', 'needs_changes', 'verified', 'rejected', 'published'];
const SOURCE_TYPES = ['institutional', 'government', 'museum', 'openDataset', 'community', 'AI'];

const STATUS_LABELS = {
  draft: { icon: '📄', label: 'Draft', color: 'bg-neutral-100 text-neutral-600' },
  submitted: { icon: '🟡', label: 'Submitted', color: 'bg-yellow-100 text-yellow-700' },
  under_review: { icon: '🔵', label: 'Under Review', color: 'bg-blue-100 text-blue-700' },
  needs_changes: { icon: '🟠', label: 'Needs Changes', color: 'bg-orange-100 text-orange-700' },
  verified: { icon: '🟢', label: 'Verified', color: 'bg-emerald-100 text-emerald-700' },
  rejected: { icon: '🔴', label: 'Rejected', color: 'bg-red-100 text-red-700' },
  published: { icon: '✅', label: 'Published', color: 'bg-mutegreen-500 text-white' }
};

// Trust / source labels surfaced on tradition pages, map, search, contributions, places.
function trustLabel(sourceType = '', verificationStatus = '', aiAssisted = false) {
  const st = (sourceType || '').toLowerCase();
  const vs = verificationStatus || '';
  const community = ['community'].includes(st);
  const institutional = ['institutional', 'government', 'museum', 'openDataset'].includes(st);

  const base = {
    aiAssisted: !!aiAssisted,
    sourceType: st || 'community',
    verificationStatus: vs
  };

  if (aiAssisted) {
    return {
      ...base,
      tone: 'ai',
      icon: '🤖',
      label: 'AI Assisted',
      hint: 'Information generated or classified with AI and requires human verification.'
    };
  }
  if (community) {
    if (['verified', 'published'].includes(vs)) {
      return {
        ...base,
        tone: 'verified-community',
        icon: '🟢',
        label: 'Verified Contribution',
        hint: 'Community information that has completed the verification process.'
      };
    }
    if (['submitted', 'under_review', 'needs_changes'].includes(vs)) {
      return {
        ...base,
        tone: 'under-verification',
        icon: '🟡',
        label: 'Under Verification',
        hint: 'Information is currently being reviewed.'
      };
    }
    return {
      ...base,
      tone: 'community',
      icon: '👥',
      label: 'Community Contribution',
      hint: 'Information submitted by a community member.'
    };
  }
  if (institutional) {
    let name = 'Institutional Source';
    let hint = 'Information from a trusted institution.';
    if (st === 'government') hint = 'Information from a government cultural institution.';
    if (st === 'museum') hint = 'Information from a museum collection.';
    if (st === 'openDataset') hint = 'Information from an open cultural dataset.';
    return { ...base, tone: 'institutional', icon: '🏛️', label: name, hint };
  }
  if (st === 'AI') {
    return { ...base, tone: 'ai', icon: '🤖', label: 'AI Assisted', hint: 'Generated or classified with AI and requires human verification.' };
  }
  return { ...base, tone: 'community', icon: '👥', label: 'Community Contribution', hint: 'Information submitted by a community member.' };
}

const PLACE_TYPES = [
  { id: 'heritage-place', label: 'Heritage Place', icon: '🏛️', cat: 'heritage' },
  { id: 'cultural-event', label: 'Cultural Event', icon: '🎭', cat: 'event' },
  { id: 'art-location', label: 'Traditional Art Location', icon: '🎨', cat: 'art-craft' },
  { id: 'artisan-workshop', label: 'Artisan Workshop', icon: '👨‍🎨', cat: 'artist' },
  { id: 'local-festival', label: 'Local Festival', icon: '🎉', cat: 'festival' },
  { id: 'historical-place', label: 'Historical Place', icon: '🏛️', cat: 'historical' }
];

function placeTypeLabel(id) {
  const p = PLACE_TYPES.find((x) => x.id === id);
  return p ? { ...p } : { id, label: id.replace(/-/g, ' '), icon: '📍', cat: 'heritage' };
}

// ---------- Similarity / duplicate detection ----------

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'there', 'their', 'about', 'which',
  'into', 'village', 'local', 'people', 'also', 'have', 'has', 'been', 'were', 'will', 'more'
]);

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim().replace(/^-+|-+$/g, ''))
    .filter((w) => w.length > 1);
}

function similarityScore(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  const set = new Set(ta);
  const hits = tb.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0);
  return Math.round((hits / Math.max(ta.length, tb.length)) * 100) / 100;
}

// Search across every cultural collection for records similar to the submission.
async function findSimilar({ title = '', description = '', stateId = '', excludeId = '', limit = 5 }) {
  const db = require('./db');
  const haystack = `${title} ${description}`;
  const [traditions, culturalItems, contributions, places, communityPlaces, stories] = await Promise.all([
    db.all('traditions'), db.all('culturalitems'), db.all('contributions'),
    db.all('places'), db.all('communityplaces'), db.all('stories')
  ]);

  const map = (arr, type, idOf, nameOf, textOf) => arr
    .map((x) => ({
      type,
      id: idOf(x),
      name: nameOf(x),
      stateId: x.stateId,
      match: similarityScore(haystack, `${x.title || x.name || ''} ${textOf(x)}`)
    }))
    .filter((r) => r.match > 0.12 && r.id !== excludeId)
    .sort((a, b) => b.match - a.match)
    .slice(0, limit);

  return [
    ...map(traditions, 'tradition', (x) => x.id, (x) => x.title, (x) => `${x.excerpt || ''} ${x.origin || ''}`),
    ...map(culturalItems, 'cultural-item', (x) => x.id, (x) => x.title, (x) => `${x.description || ''} ${x.district || ''}`),
    ...map(contributions, 'contribution', (x) => x.id, (x) => x.title, (x) => `${x.content || ''} ${x.region || ''}`),
    ...map(places, 'place', (x) => x.id, (x) => x.name, (x) => x.description || ''),
    ...map(communityPlaces, 'community-place', (x) => x.id, (x) => x.name, (x) => `${x.description || ''} ${x.location || ''}`),
    ...map(stories, 'story', (x) => x.id, (x) => x.title, (x) => x.content || '')
  ]
    .sort((a, b) => b.match - a.match)
    .slice(0, limit);
}

// ---------- Culture Gap Detection ----------

// MVP metric: number of verified traditions, cultural items, places, published
// contributions and verified community places in each state and district.
async function computeGaps() {
  const db = require('./db');
  const [traditions, culturalItems, contributions, places, communityPlaces, events, states] = await Promise.all([
    db.all('traditions'), db.all('culturalitems'), db.all('contributions'),
    db.all('places'), db.all('communityplaces'), db.all('events'), db.all('states')
  ]);

  const stateMap = {};
  states.forEach((s) => { stateMap[s.id] = s; });

  const state = {};
  traditions.forEach((t) => {
    const id = t.stateId || '';
    state[id] = state[id] || { traditions: 0, items: 0, places: 0, contributions: 0, events: 0, communityPlaces: 0 };
    state[id].traditions += 1;
  });

  const districts = {};
  const bump = (key, field) => {
    districts[key] = districts[key] || { count: 0, traditions: 0, items: 0, places: 0, contributions: 0, communityPlaces: 0 };
    districts[key][field] += 1;
    districts[key].count += 1;
  };

  culturalItems.filter((c) => ['published', 'verified'].includes(c.verificationStatus)).forEach((c) => {
    const id = c.stateId || '';
    state[id] = state[id] || { traditions: 0, items: 0, places: 0, contributions: 0, events: 0, communityPlaces: 0 };
    state[id].items += 1;
    if (c.district) bump(`${id}:${c.district}`, 'items');
  });

  contributions.filter((c) => !['rejected', 'draft'].includes(c.status)).forEach((c) => {
    const id = c.stateId || '';
    state[id] = state[id] || { traditions: 0, items: 0, places: 0, contributions: 0, events: 0, communityPlaces: 0 };
    state[id].contributions += 1;
    if (c.district || c.region) bump(`${id}:${c.district || c.region}`, 'contributions');
  });

  communityPlaces.filter((p) => ['published', 'verified'].includes(p.verificationStatus)).forEach((p) => {
    const id = p.stateId || '';
    state[id] = state[id] || { traditions: 0, items: 0, places: 0, contributions: 0, events: 0, communityPlaces: 0 };
    state[id].communityPlaces += 1;
    if (p.district) bump(`${id}:${p.district}`, 'communityPlaces');
  });

  places.forEach((p) => {
    const id = p.stateId || '';
    state[id] = state[id] || { traditions: 0, items: 0, places: 0, contributions: 0, events: 0, communityPlaces: 0 };
    state[id].places += 1;
    if (p.district || p.city) bump(`${id}:${p.district || p.city}`, 'places');
  });

  events.forEach((e) => {
    const id = e.stateId || '';
    state[id] = state[id] || { traditions: 0, items: 0, places: 0, contributions: 0, events: 0, communityPlaces: 0 };
    state[id].events += 1;
  });

  const stateSummary = Object.entries(state).map(([stateId, counts]) => {
    const s = stateMap[stateId] || { id: stateId, name: stateId, region: 'Unknown' };
    const total = counts.traditions + counts.items + counts.places + counts.contributions + counts.communityPlaces;
    return {
      stateId,
      stateName: s.name,
      region: s.region,
      ...counts,
      total,
      coverage: total >= 12 ? 'rich' : total >= 6 ? 'medium' : 'low',
      level: total >= 12 ? '🟢' : total >= 6 ? '🟠' : '⚠️'
    };
  }).sort((a, b) => b.total - a.total);

  const maxDistrict = Math.max(1, ...Object.values(districts).map((d) => d.count));

  const districtSummary = Object.entries(districts)
    .map(([key, counts]) => {
      const [stateId, district] = key.split(':');
      const s = stateMap[stateId] || { id: stateId, name: stateId };
      const total = counts.count;
      return {
        stateId,
        stateName: s.name,
        district: district.replace(/\b\w/g, (m) => m.toUpperCase()),
        ...counts,
        total,
        bar: Math.round((total / maxDistrict) * 10),
        low: total < 3
      };
    })
    .sort((a, b) => b.total - a.total);

  const maxState = Math.max(1, ...stateSummary.map((s) => s.total));
  stateSummary.forEach((s) => { s.bar = Math.round((s.total / maxState) * 10); s.low = s.total < 8; });

  const lowRegions = [
    ...districtSummary.filter((d) => d.low).map((d) => ({ ...d, kind: 'district' })),
    ...stateSummary.filter((s) => s.low).map((s) => ({ ...s, kind: 'state' }))
  ].slice(0, 12);

  const coverage = {
    traditions: stateSummary.reduce((n, s) => n + s.traditions, 0),
    items: stateSummary.reduce((n, s) => n + s.items, 0),
    places: stateSummary.reduce((n, s) => n + s.places, 0),
    contributions: stateSummary.reduce((n, s) => n + s.contributions, 0),
    communityPlaces: stateSummary.reduce((n, s) => n + s.communityPlaces, 0),
    events: stateSummary.reduce((n, s) => n + s.events, 0)
  };

  return { states: stateSummary, districts: districtSummary, lowRegions, coverage, maxState, maxDistrict };
}

// ---------- AI Assisted classification (assistant only, never the authority) ----------

async function classifySubmission({ title = '', description = '', stateId = '' }) {
  const db = require('./db');
  const gemini = require('./gemini');
  const [states, traditions] = await Promise.all([db.all('states'), db.all('traditions')]);
  const state = states.find((s) => s.id === stateId);

  let result = null;
  if (gemini.isConfigured()) {
    try {
      const ai = await gemini.classifyCultural(title, description);
      if (ai && ai.category) result = { ...ai, source: 'gemini' };
    } catch (e) {
      console.log('[knowledge] Gemini classification failed: ' + e.message);
    }
  }
  if (!result) result = heuristicClassify(title, description, state, traditions);

  return {
    ...result,
    aiAssisted: true,
    disclaimer: '🤖 AI Assisted Classification — this is a suggestion only and requires human verification before it can be published as verified content.'
  };
}

const CAT_KEYWORDS = {
  'art-craft': ['craft', 'weave', 'weaving', 'pottery', 'handloom', 'embroid', 'textile', 'saree', 'painting', 'sculpture', 'metal', 'loom', 'artisan', 'wood'],
  music: ['song', 'music', 'instrument', 'drum', 'flute', 'melody', 'lyric', 'dhak', 'nadaswaram'],
  dance: ['dance', 'dancing', 'performance', 'performer', 'choreograph'],
  festival: ['festival', 'puja', 'fair', 'celebration', 'utsav', 'navaratri', 'diwali', 'holi', 'melas', 'tihar', 'eid'],
  food: ['recipe', 'dish', 'food', 'cuisine', 'sweet', 'curry', 'brinjal', 'poha', 'prasad'],
  literature: ['story', 'poem', 'literature', 'tale', 'legend', 'myth', 'katha', 'proverb'],
  folk: ['folk', 'oral', 'ritual', 'legend', 'myth', 'bhajan', 'storytelling', 'song'],
  language: ['language', 'dialect', 'grammar', 'word', 'script'],
  heritage: ['heritage', 'temple', 'fort', 'monument', 'site', 'ghat', 'sanctuary', 'ruins'],
  history: ['history', 'historical', 'memories', 'partition', 'oral history', 'era'],
  tradition: ['tradition', 'custom', 'practice', 'martial', 'kalari', 'gurukul', 'ritual', 'customary']
};

function heuristicClassify(title, description, state, traditions) {
  const text = `${title} ${description}`.toLowerCase();
  let category = 'tradition';
  let best = 0;
  Object.entries(CAT_KEYWORDS).forEach(([cat, words]) => {
    const score = words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
    if (score > best) { best = score; category = cat; }
  });

  const language = state && state.language && state.language.length ? state.language[0] : '';

  const tagSet = new Set([category]);
  tokenize(text)
    .filter((w) => w.length > 4 && !STOP_WORDS.has(w))
    .slice(0, 6)
    .forEach((w) => tagSet.add(w));

  const related = traditions
    .map((t) => {
      const hay = `${t.title} ${t.excerpt || ''} ${t.origin || ''}`.toLowerCase();
      const score = tokenize(text).reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
      return { id: t.id, title: t.title, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => ({ id: r.id, title: r.title }));

  return {
    category,
    language,
    tags: [...tagSet],
    summary: description.slice(0, 200),
    relatedTraditions: related,
    canMatch: traditions.length
  };
}

module.exports = {
  VERIFICATION_STATUSES,
  SOURCE_TYPES,
  STATUS_LABELS,
  PLACE_TYPES,
  placeTypeLabel,
  trustLabel,
  tokenize,
  similarityScore,
  findSimilar,
  computeGaps,
  classifySubmission
};