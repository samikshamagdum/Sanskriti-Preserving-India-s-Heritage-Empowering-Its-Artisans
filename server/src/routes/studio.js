const express = require('express');
const multer = require('multer');
const gemini = require('../utils/gemini');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const craftCatalog = [
  { id: 'madhubani', name: 'Madhubani Painting', region: 'Bihar', wage: 280, materials: 800, laborHours: 10, keywords: ['madhubani', 'mithila', 'painting', 'natural dye'] },
  { id: 'banarasi', name: 'Banarasi Silk Weaving', region: 'Uttar Pradesh', wage: 360, materials: 7500, laborHours: 48, keywords: ['banarasi', 'saree', 'silk', 'zari', 'weaving'] },
  { id: 'warli', name: 'Warli Painting', region: 'Maharashtra', wage: 300, materials: 500, laborHours: 7, keywords: ['warli', 'tribal', 'painting', 'rice paste'] },
  { id: 'pashmina', name: 'Pashmina Weaving', region: 'Jammu & Kashmir', wage: 420, materials: 12000, laborHours: 60, keywords: ['pashmina', 'shawl', 'sozni', 'kashmir', 'embroidery'] },
  { id: 'dhokra', name: 'Dhokra Metal Casting', region: 'West Bengal', wage: 380, materials: 900, laborHours: 9, keywords: ['dhokra', 'metal', 'brass', 'lost wax'] },
  { id: 'pochampally', name: 'Pochampally Ikat', region: 'Telangana', wage: 340, materials: 2500, laborHours: 18, keywords: ['pochampally', 'ikat', 'saree', 'weaving'] },
  { id: 'kondapalli', name: 'Kondapalli Toys', region: 'Andhra Pradesh', wage: 290, materials: 400, laborHours: 6, keywords: ['kondapalli', 'toy', 'wood', 'lacquer'] },
  { id: 'default', name: 'Indian Handicraft', region: 'India', wage: 320, materials: 650, laborHours: 8, keywords: ['craft', 'handmade', 'artisan', 'heritage'] }
];

const stateWages = {
  Bihar: 280,
  'Uttar Pradesh': 320,
  Maharashtra: 330,
  Rajasthan: 310,
  'Jammu & Kashmir': 420,
  'West Bengal': 350,
  Odisha: 290,
  Karnataka: 340,
  'Tamil Nadu': 360,
  Telangana: 330,
  'Andhra Pradesh': 300,
  Kerala: 370,
  Assam: 280,
  'Madhya Pradesh': 290,
  Gujarat: 320
};

const seedDemands = [
  { id: 'demand-1', buyer: 'Delhi Sustainability Office', craft: 'Jute bags', region: 'West Bengal', quantity: 500, unit: 'bags', deadline: 'Before Diwali', budget: 450000, status: 'open', createdAt: '2026-08-18T08:00:00.000Z', note: 'Government procurement · reusable packaging' },
  { id: 'demand-2', buyer: 'Kolkata Design House', craft: 'Kantha embroidery', region: 'West Bengal', quantity: 120, unit: 'sarees', deadline: '30 September 2026', budget: 720000, status: 'open', createdAt: '2026-08-20T08:00:00.000Z', note: 'Handloom partnership for festive collection' },
  { id: 'demand-3', buyer: 'Jaipur Heritage Retail', craft: 'Blue pottery', region: 'Rajasthan', quantity: 80, unit: 'pieces', deadline: '15 November 2026', budget: 280000, status: 'open', createdAt: '2026-08-22T08:00:00.000Z', note: 'GI-labelled tableware for museum store' },
  { id: 'demand-4', buyer: 'Northern Railways Procurement', craft: 'Handloom fabric', region: 'Uttar Pradesh', quantity: 2000, unit: 'metres', deadline: '20 December 2026', budget: 900000, status: 'open', createdAt: '2026-08-24T08:00:00.000Z', note: 'Pilot order · accessibility and heritage procurement' }
];

const seedHeritage = [
  { id: 'heritage-1', contributor: 'Ravi Shankar', role: 'Community member', craft: 'Channapatna toys', region: 'Karnataka', title: 'The first lacquer smell of childhood', story: 'Every Channapatna toy begins with the selection of hale wood and a lesson in patience. The first coat of lac is the moment the wood starts to sing.', status: 'verified', verifiedBy: 'SANSKRITI community review', createdAt: '2026-08-12T10:00:00.000Z' },
  { id: 'heritage-2', contributor: 'Dr. Meera Iyer', role: 'Historian', craft: 'Kanchipuram weaving', region: 'Tamil Nadu', title: 'A loom is a family archive', story: 'The borders of a Kanchipuram saree carry the names of motifs that families have passed between generations for more than a century.', status: 'pending', verifiedBy: '', createdAt: '2026-08-25T10:00:00.000Z' },
  { id: 'heritage-3', contributor: 'Amitabh Verma', role: 'Tourist', craft: 'Banarasi weaving', region: 'Uttar Pradesh', title: 'The loom I heard in Varanasi', story: 'At a weaver\'s workshop, the shuttle answered the rhythm of the room. What looked like decoration from the street was a language of work and time.', status: 'verified', verifiedBy: 'SANSKRITI community review', createdAt: '2026-08-15T10:00:00.000Z' }
];

const passports = new Map();

function text(value, fallback = '') {
  const result = String(value == null ? '' : value).trim();
  return result || fallback;
}

function list(value) {
  if (Array.isArray(value)) return value.map((v) => text(v)).filter(Boolean);
  return text(value).split(',').map((v) => v.trim()).filter(Boolean);
}

function pickCraft(transcript, requested) {
  const q = `${text(transcript)} ${text(requested)}`.toLowerCase();
  return craftCatalog.find((entry) => entry.keywords.some((keyword) => q.includes(keyword))) || craftCatalog[craftCatalog.length - 1];
}

function roundMoney(value) {
  return Math.max(0, Math.round(Number(value || 0) / 50) * 50);
}

function slug(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50) || 'craft';
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultOutputs(input) {
  const transcript = text(input.transcript, 'I made this piece by hand in my village using local materials and time-honoured techniques.');
  const craft = pickCraft(transcript, input.artForm);
  const region = text(input.region, craft.region);
  const materials = list(input.materials).length ? list(input.materials) : [craft.materials ? 'locally sourced materials' : 'traditional materials'];
  const rawMaterials = roundMoney(input.rawMaterials || craft.materials);
  const wageBenchmark = Number(input.wageBenchmark || stateWages[region] || craft.wage || 320);
  const laborHours = Math.max(1, Number(input.laborHours || craft.laborHours));
  const fairLabor = roundMoney(laborHours * wageBenchmark);
  const marketMargin = roundMoney((rawMaterials + fairLabor) * 0.28);
  const total = rawMaterials + fairLabor + marketMargin;
  const artisanName = text(input.artisanName, 'the artisan');
  const title = text(input.title, `${craft.name} · ${region}`);
  const keywords = [...new Set([...craft.keywords, ...materials.slice(0, 2).map((m) => m.toLowerCase()), region.toLowerCase(), 'handmade India'])].slice(0, 12);
  const story = `${artisanName} works with ${materials.join(', ')} in ${region}. This ${craft.name.toLowerCase()} carries the rhythm of ${craft.name.toLowerCase()} traditions, where every deliberate mark is a record of skill, patience and place.`;
  const steps = [
    `Source ${materials[0]} from a trusted local supplier.`,
    `Shape and finish the piece using the ${craft.name.toLowerCase()} method.`,
    'Add the maker mark, photograph the result and keep the making record with the piece.'
  ];
  return {
    listing: {
      title,
      seoDescription: `${title} by ${artisanName} in ${region}. ${story} Each piece is made slowly with ${materials.join(', ')} and can be traced through its Digital Provenance Passport.`,
      keywords,
      price: total,
      currency: 'INR',
      status: 'draft'
    },
    heritageStory: {
      headline: `Made in ${region}, remembered beyond the market`,
      story,
      storyPrompt: `What should future generations know about the moment you made this ${craft.name.toLowerCase()}?`,
      makingSteps: steps,
      tags: [craft.name, region, 'living heritage', ...craft.keywords.slice(0, 2)]
    },
    pricing: {
      rawMaterials,
      fairLabor,
      marketMargin,
      total,
      wageBenchmark,
      laborHours,
      formula: `₹${rawMaterials.toLocaleString('en-IN')} + ₹${fairLabor.toLocaleString('en-IN')} + ₹${marketMargin.toLocaleString('en-IN')} = ₹${total.toLocaleString('en-IN')}`,
      rationale: `Labor uses a ₹${wageBenchmark.toLocaleString('en-IN')}/hour regional benchmark. The market margin is a transparent 28% for packaging, visibility and platform costs.`,
      marginRate: 0.28
    },
    provenance: {
      passportId: makeId('passport'),
      status: 'artisan-declared',
      giTag: /gi|g\.i\.|geographical indication/i.test(transcript) ? 'declared' : 'not declared',
      verification: 'Artisan self-declaration · community review required',
      makingOfVideo: 'ready to record',
      sourceChain: ['Artisan voice note', 'SANSKRITI catalogue', 'Community heritage layer'],
      createdAt: new Date().toISOString()
    },
    demandMatches: [
      { buyer: seedDemands[0].buyer, craft: 'Reusable jute goods', fit: 68, reason: 'Related natural-fibre procurement in the same region.' },
      { buyer: seedDemands[3].buyer, craft: 'Handmade regional goods', fit: 61, reason: 'Government-style pilot order for a heritage supplier.' }
    ],
    craft: { id: craft.id, name: craft.name, region, keywords: craft.keywords },
    aiMode: 'heuristic',
    input: { transcript, audioAttached: Boolean(input.audioAttached), photoAttached: Boolean(input.photoAttached) }
  };
}

function mergePipeline(base, ai) {
  if (!ai || typeof ai !== 'object') return base;
  const mergedPricing = { ...base.pricing, ...(ai.pricing || {}) };
  const rawMaterials = roundMoney(mergedPricing.rawMaterials);
  const fairLabor = roundMoney(mergedPricing.fairLabor);
  const marketMargin = roundMoney(mergedPricing.marketMargin);
  const total = rawMaterials + fairLabor + marketMargin;
  const pricing = {
    ...mergedPricing,
    rawMaterials,
    fairLabor,
    marketMargin,
    total,
    formula: `₹${rawMaterials.toLocaleString('en-IN')} + ₹${fairLabor.toLocaleString('en-IN')} + ₹${marketMargin.toLocaleString('en-IN')} = ₹${total.toLocaleString('en-IN')}`,
    rationale: text(mergedPricing.rationale, base.pricing.rationale)
  };
  const aiListing = ai.listing || {};
  const aiStory = ai.heritageStory || {};
  return {
    ...base,
    listing: { ...base.listing, ...aiListing, keywords: Array.isArray(aiListing.keywords) ? aiListing.keywords : base.listing.keywords, price: total },
    heritageStory: {
      ...base.heritageStory,
      ...aiStory,
      makingSteps: Array.isArray(aiStory.makingSteps) ? aiStory.makingSteps : base.heritageStory.makingSteps,
      tags: Array.isArray(aiStory.tags) ? aiStory.tags : base.heritageStory.tags
    },
    pricing,
    provenance: { ...base.provenance, ...(ai.provenance || {}) },
    aiMode: 'gemini'
  };
}

function demandMatches(craft, region) {
  const q = `${craft} ${region}`.toLowerCase();
  return seedDemands.map((demand) => {
    const words = `${demand.craft} ${demand.region}`.toLowerCase().split(/\s+/).filter(Boolean);
    const overlap = words.filter((word) => q.includes(word)).length;
    return { ...demand, fit: Math.min(96, 42 + overlap * 22), reason: overlap ? 'Craft and geography overlap with this open procurement request.' : 'A related craft lane that can be proposed to the buyer.' };
  }).sort((a, b) => b.fit - a.fit);
}

function createDemand(body = {}) {
  const demand = {
    id: makeId('demand'),
    buyer: text(body.buyer, 'Open buyer request'),
    craft: text(body.craft, 'Handicraft'),
    region: text(body.region, 'India'),
    quantity: Math.max(1, Number(body.quantity || 1)),
    unit: text(body.unit, 'pieces'),
    deadline: text(body.deadline, 'Flexible'),
    budget: Math.max(0, Number(body.budget || 0)),
    status: 'open',
    createdAt: new Date().toISOString(),
    note: text(body.note, 'Posted through the SANSKRITI demand board')
  };
  seedDemands.unshift(demand);
  return demand;
}

function createHeritage(body = {}) {
  const contribution = {
    id: makeId('heritage'),
    contributor: text(body.contributor, 'Anonymous contributor'),
    role: text(body.role, 'Community member'),
    craft: text(body.craft, 'Indian craft'),
    region: text(body.region, 'India'),
    title: text(body.title, 'A story worth keeping'),
    story: text(body.story),
    status: 'pending',
    verifiedBy: '',
    createdAt: new Date().toISOString()
  };
  if (!contribution.story) return null;
  seedHeritage.unshift(contribution);
  return contribution;
}

router.get('/status', (req, res) => {
  res.json({
    name: 'KalaSetu artisan studio',
    offlineFirst: true,
    aiConfigured: gemini.isConfigured(),
    whatsappFallback: true,
    passportRegistry: passports.size,
    openDemands: seedDemands.length
  });
});

router.post('/dual-output', upload.single('audio'), async (req, res) => {
  try {
    const body = req.body || {};
    let transcript = body.transcript || body.voiceText || '';
    let transcription = null;
    if (!transcript && req.file && gemini.isConfigured()) {
      try {
        transcription = await gemini.transcribeAudio(req.file.buffer, req.file.mimetype);
        transcript = transcription.transcript || '';
      } catch (error) {
        transcription = { transcript: '', error: 'Audio transcription was unavailable' };
      }
    }
    const input = {
      transcript,
      artForm: body.artForm || '',
      region: body.region || '',
      materials: body.materials || body.materialsCsv || '',
      artisanName: body.artisanName || '',
      title: body.title || '',
      laborHours: body.laborHours,
      rawMaterials: body.rawMaterials,
      wageBenchmark: body.wageBenchmark,
      audioAttached: Boolean(req.file),
      photoAttached: Boolean(body.photoAttached || body.photoName)
    };
    const fallback = defaultOutputs(input);
    let outputs = fallback;
    if (transcription) outputs.transcription = transcription;
    if (gemini.isConfigured() && input.transcript) {
      try {
        outputs = mergePipeline(fallback, await gemini.generateStudioPipeline(input));
      } catch (error) {
        outputs = { ...fallback, aiError: error.message };
      }
    }
    outputs.passport = {
      id: outputs.provenance.passportId,
      productTitle: outputs.listing.title,
      artisanName: input.artisanName || 'SANSKRITI artisan',
      region: input.region || outputs.craft.region,
      craft: outputs.craft.name,
      story: outputs.heritageStory.story,
      giTag: outputs.provenance.giTag,
      verification: outputs.provenance.verification,
      makingOfVideo: outputs.provenance.makingOfVideo,
      price: outputs.listing.price,
      pricing: outputs.pricing,
      createdAt: outputs.provenance.createdAt
    };
    passports.set(outputs.provenance.passportId, outputs.passport);
    res.status(201).json({ ...outputs, saved: true, savedAt: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not generate the artisan outputs' });
  }
});

router.get('/passports/:id', (req, res) => {
  const passport = passports.get(req.params.id);
  if (!passport) return res.status(404).json({ error: 'Passport not found' });
  res.json(passport);
});

router.get('/demands', (req, res) => {
  const q = text(req.query.q).toLowerCase();
  const craft = text(req.query.craft).toLowerCase();
  const region = text(req.query.region).toLowerCase();
  const items = seedDemands.filter((demand) => {
    if (q && !`${demand.buyer} ${demand.craft} ${demand.region} ${demand.note}`.toLowerCase().includes(q)) return false;
    if (craft && !demand.craft.toLowerCase().includes(craft)) return false;
    if (region && !demand.region.toLowerCase().includes(region)) return false;
    return true;
  });
  res.json({ demands: items, total: items.length });
});

router.post('/demands', (req, res) => {
  res.status(201).json(createDemand(req.body || {}));
});

router.get('/heritage', (req, res) => {
  const status = text(req.query.status);
  const items = status ? seedHeritage.filter((item) => item.status === status) : seedHeritage;
  res.json({ contributions: items, total: items.length });
});

router.post('/heritage', (req, res) => {
  const contribution = createHeritage(req.body || {});
  if (!contribution) return res.status(400).json({ error: 'A story is required' });
  res.status(201).json(contribution);
});

router.put('/heritage/:id', (req, res) => {
  const contribution = seedHeritage.find((item) => item.id === req.params.id);
  if (!contribution) return res.status(404).json({ error: 'Contribution not found' });
  const action = text(req.body.action);
  if (action === 'verify') {
    contribution.status = 'verified';
    contribution.verifiedBy = text(req.body.verifiedBy, 'SANSKRITI moderator');
  } else if (action === 'request-changes') {
    contribution.status = 'changes-requested';
    contribution.feedback = text(req.body.feedback, 'Please add more context.');
  } else {
    return res.status(400).json({ error: 'Use verify or request-changes' });
  }
  res.json(contribution);
});

router.post('/sync', (req, res) => {
  const operations = Array.isArray(req.body?.operations) ? req.body.operations : [];
  const results = [];
  operations.forEach((operation) => {
    const payload = operation?.payload || {};
    try {
      if (operation?.type === 'demand') {
        createDemand(payload);
        results.push({ type: 'demand', status: 'synced' });
      } else if (operation?.type === 'heritage') {
        const contribution = createHeritage(payload);
        if (!contribution) {
          results.push({ type: 'heritage', status: 'skipped', reason: 'missing story' });
          return;
        }
        results.push({ type: 'heritage', status: 'synced', id: contribution.id });
      } else if (operation?.type === 'dual-output') {
        const outputs = defaultOutputs({ transcript: payload.transcript || payload.title, artForm: '', region: '', artisanName: '' });
        outputs.listing.title = text(payload.title, outputs.listing.title);
        outputs.passport = {
          id: outputs.provenance.passportId,
          productTitle: outputs.listing.title,
          artisanName: 'SANSKRITI artisan',
          region: outputs.craft.region,
          craft: outputs.craft.name,
          story: outputs.heritageStory.story,
          giTag: outputs.provenance.giTag,
          verification: outputs.provenance.verification,
          makingOfVideo: outputs.provenance.makingOfVideo,
          price: outputs.listing.price,
          pricing: outputs.pricing,
          createdAt: outputs.provenance.createdAt
        };
        passports.set(outputs.provenance.passportId, outputs.passport);
        results.push({ type: 'dual-output', status: 'synced', id: outputs.provenance.passportId });
      } else {
        results.push({ type: operation?.type || 'unknown', status: 'acknowledged' });
      }
    } catch (error) {
      results.push({ type: operation?.type || 'unknown', status: 'skipped', reason: error.message });
    }
  });
  res.json({ synced: results.filter((item) => item.status === 'synced').length, results });
});

router.post('/photo/sync', (req, res) => {
  res.status(202).json({
    status: navigatorSafeOnline(req),
    queued: true,
    operations: Array.isArray(req.body?.operations) ? req.body.operations.length : 0,
    nextSync: 'when connectivity returns',
    processedOnDevice: true
  });
});

function navigatorSafeOnline(req) {
  return req.get('x-client-online') !== 'false';
}

module.exports = router;
