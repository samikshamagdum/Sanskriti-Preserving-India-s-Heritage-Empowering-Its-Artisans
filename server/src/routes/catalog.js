const express = require('express');
const router = express.Router();

// ---------------------------------------------------------------------------
// AI Smart Cataloging API — heuristic-based analysis for product images/text.
// Uses Gemini when available, falls back to a keyword-based engine.
// ---------------------------------------------------------------------------

const GEMINI_KEY = process.env.GEMINI_API_KEY;

const ART_FORM_KB = [
  { keys: ['madhubani', 'mithila', 'bharni', 'kachni', 'godna', 'bihar'], artForm: 'Madhubani Painting', region: 'Bihar', materials: ['Handmade paper', 'Natural dyes', 'Bamboo pen'], technique: 'Traditional Mithila painting with natural pigments' },
  { keys: ['warli', 'tribal', 'geometric', 'maharashtra', 'thane'], artForm: 'Warli Painting', region: 'Maharashtra', materials: ['Canvas', 'Rice paste', 'Earth pigments'], technique: 'Geometric tribal painting' },
  { keys: ['banarasi', 'banaras', 'varanasi', 'zari', 'brocade', 'silk', 'saree'], artForm: 'Banarasi Silk Weaving', region: 'Uttar Pradesh', materials: ['Pure silk', 'Real zari', 'Natural dyes'], technique: 'Handloom jacquard weaving' },
  { keys: ['pashmina', 'kashmir', 'sozni', 'shawl', 'changthangi'], artForm: 'Pashmina Weaving', region: 'Jammu & Kashmir', materials: ['Changthangi goat wool', 'Silk thread'], technique: 'Handspun pashmina with needle embroidery' },
  { keys: ['blue pottery', 'jaipur', 'quartz', 'cobalt'], artForm: 'Blue Pottery', region: 'Rajasthan', materials: ['Quartz stone powder', 'Glass', 'Multani mitti'], technique: 'Clay-free pottery with cobalt oxide glaze' },
  { keys: ['dhokra', 'lost wax', 'brass', 'cire perdue'], artForm: 'Dhokra Metal Casting', region: 'West Bengal / Chhattisgarh', materials: ['Brass', 'Beeswax', 'Clay'], technique: 'Lost-wax (cire perdue) casting' },
  { keys: ['pattachitra', 'odisha', 'scroll', 'raghurajpur', 'jagannath'], artForm: 'Pattachitra Painting', region: 'Odisha', materials: ['Treated cloth', 'Natural stone colours'], technique: 'Classical scroll painting' },
  { keys: ['bidri', 'bidar', 'silver inlay', 'zinc'], artForm: 'Bidriware', region: 'Karnataka', materials: ['Zinc-copper alloy', 'Silver wire'], technique: 'Silver inlay on oxidised metal' },
  { keys: ['kalamkari', 'srikalahasti', 'machilipatnam', 'pen work'], artForm: 'Kalamkari', region: 'Andhra Pradesh', materials: ['Cotton fabric', 'Vegetable dyes'], technique: 'Hand-drawn pen work with natural dyes' },
  { keys: ['chikankari', 'chikan', 'lucknow', 'shadow work'], artForm: 'Chikankari Embroidery', region: 'Uttar Pradesh', materials: ['Cotton fabric', 'White thread'], technique: 'Hand-embroidered shadow work' },
  { keys: ['tanjore', 'thanjavur', 'gold foil', 'relief'], artForm: 'Tanjore Painting', region: 'Tamil Nadu', materials: ['Wooden plank', 'Gold foil', 'Semi-precious stones'], technique: 'Gold foil relief painting' },
  { keys: ['phulkari', 'punjab', 'bagh', 'darn stitch'], artForm: 'Phulkari Embroidery', region: 'Punjab', materials: ['Khaddar cloth', 'Pat silk thread'], technique: 'Darn stitch from reverse side' },
  { keys: ['kantha', 'bengal', 'nakshi', 'running stitch'], artForm: 'Kantha Embroidery', region: 'West Bengal', materials: ['Cotton', 'Thread'], technique: 'Running stitch narrative embroidery' },
  { keys: ['gond', 'pardhan', 'dot dash', 'madhya pradesh'], artForm: 'Gond Painting', region: 'Madhya Pradesh', materials: ['Canvas', 'Acrylic/natural paints'], technique: 'Dot-and-dash pattern painting' },
  { keys: ['block print', 'bagru', 'hand block', 'stamp'], artForm: 'Block Printing', region: 'Rajasthan', materials: ['Cotton', 'Natural dyes', 'Teak wood blocks'], technique: 'Hand-block printing with carved wood blocks' },
  { keys: ['bronze', 'chola', 'nataraja', 'panchaloha', 'swamimalai'], artForm: 'Chola Bronze Sculpture', region: 'Tamil Nadu', materials: ['Panchaloha alloy', 'Beeswax'], technique: 'Lost-wax bronze casting' },
  { keys: ['meenakari', 'kundan', 'enamel', 'jaipur jewellery'], artForm: 'Meenakari Enamelling', region: 'Rajasthan', materials: ['Silver/Gold', 'Enamel colours'], technique: 'Enamel inlay on metal' },
  { keys: ['pochampally', 'ikat', 'telangana', 'resist dye'], artForm: 'Pochampally Ikat', region: 'Telangana', materials: ['Silk', 'Cotton'], technique: 'Double ikat resist-dye weaving' },
  { keys: ['terracotta', 'bankura', 'clay', 'horse'], artForm: 'Bankura Terracotta', region: 'West Bengal', materials: ['Red clay'], technique: 'Hand-sculpted kiln-fired terracotta' },
  { keys: ['sandalwood', 'mysore', 'carving', 'fragrant'], artForm: 'Sandalwood Carving', region: 'Karnataka', materials: ['Indian Sandalwood'], technique: 'Fine wood carving' },
];

function analyzeText(query) {
  const q = query.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  for (const entry of ART_FORM_KB) {
    const score = entry.keys.reduce((s, k) => s + (q.includes(k) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; bestMatch = entry; }
  }

  if (!bestMatch || bestScore === 0) {
    return {
      artForm: 'Unknown Art Form',
      region: 'Unknown',
      materials: [],
      technique: 'Manual identification required',
      confidence: 15,
      suggestedTags: [],
      giEligible: false,
    };
  }

  const confidence = Math.min(95, 45 + bestScore * 12);
  return {
    artForm: bestMatch.artForm,
    region: bestMatch.region,
    materials: bestMatch.materials,
    technique: bestMatch.technique,
    confidence,
    suggestedTags: bestMatch.keys.filter(k => q.includes(k)),
    giEligible: confidence > 70,
  };
}

function suggestPrice(artForm, materials, complexity) {
  const basePrices = {
    'Madhubani Painting': 3000, 'Warli Painting': 2500, 'Banarasi Silk Weaving': 15000,
    'Pashmina Weaving': 25000, 'Blue Pottery': 2000, 'Dhokra Metal Casting': 3000,
    'Pattachitra Painting': 4000, 'Bidriware': 5000, 'Kalamkari': 5500,
    'Chikankari Embroidery': 4000, 'Tanjore Painting': 8000, 'Phulkari Embroidery': 2500,
    'Kantha Embroidery': 3500, 'Gond Painting': 5000, 'Block Printing': 2000,
    'Chola Bronze Sculpture': 18000, 'Meenakari Enamelling': 12000,
    'Pochampally Ikat': 7000, 'Bankura Terracotta': 1800, 'Sandalwood Carving': 6000,
  };

  const base = basePrices[artForm] || 3000;
  const complexityMultiplier = { simple: 0.7, medium: 1.0, complex: 1.5, masterpiece: 2.5 };
  const mult = complexityMultiplier[complexity] || 1.0;
  const materialBonus = (materials || []).length * 200;

  const suggested = Math.round((base * mult + materialBonus) / 100) * 100;
  return {
    suggestedPrice: suggested,
    breakdown: {
      basePrice: base,
      complexityMultiplier: mult,
      materialBonus,
      finalPrice: suggested,
    },
    marketComparison: {
      low: Math.round(suggested * 0.6),
      average: suggested,
      high: Math.round(suggested * 1.6),
    },
    confidence: artForm !== 'Unknown Art Form' ? 78 : 30,
  };
}

function generateStory(artForm, region, materials, artisanName) {
  const stories = {
    'Madhubani Painting': `This ${artForm} continues the ancient Mithila tradition of ${region}, where women have painted walls and floors for millennia. ${artisanName ? artisanName + ' carries' : 'The artisan carries'} forward a heritage that gained global recognition in the 1960s, transforming sacred wall art into celebrated canvas masterpieces.`,
    'Banarasi Silk Weaving': `Woven in the sacred city of Varanasi, this Banarasi creation represents centuries of Indo-Persian weaving mastery. ${artisanName ? artisanName + "'s craft" : 'This craft'} dates to the Mughal courts, where brocade weaving reached its zenith.`,
    'Warli Painting': `From the Sahyadri hills of ${region}, this Warli artwork captures the essence of tribal life through geometric forms. ${artisanName || 'The artisan'} follows a tradition older than recorded history, using rice paste on ochre earth.`,
    'Pashmina Weaving': `From the highlands of Kashmir, this Pashmina is spun from the underfleece of Changthangi goats living at 14,000 feet. ${artisanName || 'The artisan'} transforms the world's softest fibre into a masterwork through months of patient needlework.`,
  };

  return {
    story: stories[artForm] || `This ${artForm || 'traditional craft'} from ${region || 'India'} represents a living cultural heritage. Crafted using ${(materials || []).join(', ') || 'traditional materials'}, each piece embodies generations of artistic knowledge and cultural memory. ${artisanName ? artisanName + ' is among' : 'The artisan is among'} the guardians keeping this tradition alive.`,
    heritage: { artForm, region, era: 'Traditional', significance: 'Cultural heritage craft' },
  };
}

// ---------- Endpoints ----------

// Analyze a product description/image
router.post('/analyze', async (req, res) => {
  const { query, image_b64 } = req.body;
  const text = query || '';

  if (GEMINI_KEY && text.length > 10) {
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(GEMINI_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `You are an expert on Indian handicrafts and cultural heritage. Analyze this product description and return JSON with keys: artForm, region, materials (array), technique, confidence (0-100), suggestedTags (array), giEligible (boolean), category. Description: ${text}\nReturn only valid JSON.`;
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      try {
        const parsed = JSON.parse(responseText.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
        return res.json({ analysis: parsed, source: 'gemini' });
      } catch { return res.json({ analysis: analyzeText(text), source: 'gemini-parse-fallback' }); }
    } catch (e) {
      return res.json({ analysis: analyzeText(text), source: 'gemini-error-fallback', error: e.message });
    }
  }

  res.json({ analysis: analyzeText(text), source: 'heuristic' });
});

// Get price suggestion
router.post('/price', (req, res) => {
  const { artForm, materials, complexity } = req.body;
  res.json(suggestPrice(artForm, materials, complexity || 'medium'));
});

// Generate cultural story
router.post('/story', (req, res) => {
  const { artForm, region, materials, artisanName } = req.body;
  res.json(generateStory(artForm, region, materials, artisanName));
});

// Art form categories with AI metadata
router.get('/categories', (req, res) => {
  const cats = ART_FORM_KB.map(e => ({
    artForm: e.artForm,
    region: e.region,
    keywords: e.keys,
    materials: e.materials,
    technique: e.technique,
  }));
  res.json(cats);
});

module.exports = router;
