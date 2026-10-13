const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../utils/db');
const gemini = require('../utils/gemini');
const cloudinary = require('../utils/cloudinary');
const { authRequired } = require('../utils/middleware');
const { dailyLimit } = require('../utils/aiQuota');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: cloudinary.MAX_IMAGE } });

const DISCLAIMER =
  'AI-generated identification. Cultural information should be verified against trusted sources.';

const regionOf = (stateId, states) => {
  const s = states.find((x) => x.id === stateId);
  return s ? s.region : 'Unknown';
};

// Heuristic fallback engine (works with zero external keys).
async function heuristicAnalyze(query) {
  const traditions = await db.all('traditions');
  const q = (query || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  traditions.forEach((t) => {
    const hay = [t.title, t.category, t.stateName, t.excerpt, t.origin, t.history, ...(t.keywords || [])].join(' ').toLowerCase();
    let score = 0;
    q.split(/\W+/).forEach((tok) => {
      if (tok.length < 2) return;
      if (hay.includes(tok)) score += 2;
    });
    if (score > bestScore) { bestScore = score; best = t; }
  });
  if (!best) return buildResult('mock', 'Unidentified cultural object', {}, null, q, []);
  const aiLike = {
    possibleIdentification: best.title,
    artForm: best.category,
    region: `${best.stateName}, ${regionOf(best.stateId, await db.all('states'))}`,
    period: best.period,
    history: best.history,
    culturalSignificance: best.significance,
    visualDetails: 'No visual details available (keyword analysis).',
    relatedTraditions: [],
    confidence: Math.min(96, 60 + bestScore * 5)
  };
  const states = await db.all('states');
  return buildResult('mock', aiLike.possibleIdentification, aiLike, best, q, [], null, states);
}

function buildResult(source, identification, aiLike, matchedTradition, rawQuery, keywordsDetected, imageUrl, states) {
  return {
    source,
    possibleIdentification: identification || 'Unidentified cultural object',
    artForm: aiLike.artForm || 'Unknown',
    likelyRegion: aiLike.region || 'Unknown',
    estimatedTimePeriod: aiLike.period || 'Unknown',
    visualDetails: aiLike.visualDetails || '',
    history: aiLike.history || 'No history available for this object.',
    culturalSignificance: aiLike.culturalSignificance || 'No significance data available.',
    matchConfidence: Math.round(aiLike.confidence ?? 40),
    matchedTradition: matchedTradition ? { id: matchedTradition.id, title: matchedTradition.title } : null,
    relatedTraditions: (aiLike.relatedTraditions || []).slice(0, 3).map((name, i) => ({
      id: null, title: typeof name === 'string' ? name : (name.title || name.id || 'Related tradition')
    })),
    keywordsDetected: keywordsDetected || [],
    imageUrl: imageUrl || '',
    matchedDbCount: matchedTradition ? 1 : 0,
    disclaimer: DISCLAIMER
  };
}

// Match an AI result against the cultural database for related traditions.
async function dbEnrich(aiLike) {
  const traditions = await db.all('traditions');
  const aiText = [aiLike.possibleIdentification, aiLike.artForm, aiLike.region, ...(aiLike.relatedTraditions || [])].join(' ').toLowerCase();
  let best = null;
  let bestScore = 0;
  traditions.forEach((t) => {
    const hay = [t.title, t.category, t.stateName, t.excerpt, t.origin, t.history, ...(t.keywords || [])].join(' ').toLowerCase();
    let score = 0;
    aiText.split(/\W+/).filter((w) => w.length > 3).forEach((w) => {
      if (hay.includes(w)) score += 3;
    });
    const aiRegion = (aiLike.region || '').toLowerCase();
    if (aiRegion && t.stateName && (aiRegion.includes(t.stateName.toLowerCase()) || t.stateName.toLowerCase().includes(aiRegion))) {
      score += 4;
    }
    if (aiLike.visualDetails && t.title && aiLike.visualDetails.toLowerCase().includes(t.title.toLowerCase())) score += 3;
    if (score > bestScore) { bestScore = score; best = t; }
  });
  let related = [];
  if (best) {
    related = traditions
      .filter((x) => (x.category === best.category || x.stateId === best.stateId || x.title === best.title) && x.id !== best.id)
      .slice(0, 3)
      .map((x) => ({ id: x.id, title: x.title, category: x.category }));
  } else {
    related = traditions.slice(0, 3).map((x) => ({ id: x.id, title: x.title, category: x.category }));
  }
  return { matched: best, related };
}

// POST /api/ai/identify — multipart image upload OR { query } JSON.
router.post('/identify', authRequired, dailyLimit, upload.single('image'), async (req, res) => {
  const query = (req.body?.query || '').toString();
  const imageFile = req.file;
  const useGemini = req.body?.useGemini === 'true' || req.body?.useGemini === true;

  let imageUrl = '';
  let cloudinaryPublicId = '';

  // 1. If an image was uploaded, validate + store to Cloudinary.
  if (imageFile) {
    try {
      cloudinary.validateImage(imageFile.mimetype, imageFile.size);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    try {
      const up = await cloudinary.uploadBuffer(imageFile.buffer, { folder: 'sanskriti/lens', resource_type: 'image' });
      imageUrl = up.url;
      cloudinaryPublicId = up.publicId;
    } catch (e) {
      // Cloudinary optional — analysis still works without it.
      console.log('[lens] Cloudinary unavailable: ' + e.message);
    }
  }

  let result;
  const states = await db.all('states');

  try {
    if (imageFile && gemini.isConfigured() && useGemini) {
      // 2. Real AI: Gemini Vision analysis of the uploaded image.
      const ai = await gemini.analyzeImage(imageFile.buffer, imageFile.mimetype);
      const { matched, related } = await dbEnrich(ai);
      result = buildResult('gemini-vision', ai.possibleIdentification, ai, matched, query, [], imageUrl, states);
      result.relatedTraditions = related;
      result.matchedTradition = matched ? { id: matched.id, title: matched.title } : null;
      if (ai.confidence != null) result.matchConfidence = Math.round(Number(ai.confidence) || 40);
      if (ai.relatedTraditions && !related.length) {
        result.relatedTraditions = ai.relatedTraditions.slice(0, 3).map((t) => ({ id: null, title: t }));
      }
    } else if (query.trim() && gemini.isConfigured() && useGemini) {
      // Text-based Gemini analysis.
      const ai = await gemini.analyzeText(query);
      const { matched, related } = await dbEnrich(ai);
      result = buildResult('gemini-text', ai.possibleIdentification, ai, matched, query, [], imageUrl, states);
      result.relatedTraditions = related;
      result.matchedTradition = matched ? { id: matched.id, title: matched.title } : null;
    } else {
      // 3. Fallback heuristic keyed on the uploaded image description / query.
      const heuristicQuery = imageFile && !query ? (req.body?.imageHint || 'traditional Indian cultural object') : query;
      const fallback = await heuristicAnalyze(imageFile ? (query || heuristicQuery) : heuristicQuery);
      result = fallback;
      if (imageUrl) result.imageUrl = imageUrl;
    }
  } catch (e) {
    console.log('[lens] AI failed, using heuristic: ' + e.message);
    const fallback = await heuristicAnalyze(query || 'traditional Indian cultural object');
    result = fallback;
    result.imageUrl = imageUrl;
    result.aiError = e.message;
  }

  // Persist a lightweight analysis record (URL + metadata) into MongoDB/DB.
  try {
    await db.insert('culturelens', {
      id: db.uid('l'),
      imageUrl,
      cloudinaryPublicId,
      source: result.source,
      possibleIdentification: result.possibleIdentification,
      matchConfidence: result.matchConfidence,
      authorId: req.user ? req.user.id : 'guest'
    });
  } catch (e) { /* non-fatal */ }

  res.json(result);
});

// POST /api/ai/describe — keep the legacy text summary endpoint working.
router.post('/describe', authRequired, dailyLimit, upload.single('image'), async (req, res) => {
  const query = (req.body?.query || '').toString();
  if (req.file && gemini.isConfigured() && (req.body?.useGemini === 'true')) {
    try {
      const ai = await gemini.analyzeImage(req.file.buffer, req.file.mimetype);
      return res.json({ source: 'gemini-vision', summary: ai.history || ai.culturalSignificance || '', traditions: [], visualDetails: ai.visualDetails });
    } catch (e) { /* fall through */ }
  }
  const r = await heuristicAnalyze(query || (req.body?.imageHint || ''));
  res.json({ source: r.source, summary: r.history, traditions: r.matchedTradition ? [r.matchedTradition.id] : [] });
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', gemini: gemini.isConfigured(), cloudinary: cloudinary.isConfigured(), db: db.mode() });
});

module.exports = router;