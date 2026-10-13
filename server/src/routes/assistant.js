// SANSKRITI — Research Assistant (`POST /api/ai/assistant`).
//
// A DETERMINISTIC, source-grounded question-answering engine. It answers only
// from verified entries in the SANSKRITI cultural corpus — it never generates
// facts, statistics or citations. When the corpus cannot support an answer it
// says so explicitly instead of guessing.
const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { toLevel, isVerifiedLevel, levelLabel } = require('../constants/verification');
const { authRequired } = require('../utils/middleware');
const { dailyLimit } = require('../utils/aiQuota');

const DISCLAIMER =
  'Answers are grounded only in verified SANSKRITI records. SANSKRITI never presents a guess as fact; entries without verifiable support are marked accordingly.';

// ---- minimal i18n for the assistant chrome (boilerplate only, never facts) ----
const T = {
  en: {
    notEnough: 'I cannot answer this accurately from the verified SANSKRITI corpus yet, so I will not guess. Ask about a specific culture, a region, a craft, or heritage-at-risk — or help us document this using the Contribute flow.',
    sources: 'Sources consulted',
    related: 'Related cultures',
    whyHere: 'Why here?',
    compareTitle: 'Comparison',
    compared: 'Both are {cat} traditions.',
    notFound: (q) => `No verified record matches “${q}” in the corpus yet.`
  },
  hi: {
    notEnough: 'मैं अभी तक सत्यापित SANSKRITI संग्रह से इसका सटीक उत्तर नहीं दे सकता, इसलिए मैं अनुमान नहीं लगाऊँगा। किसी विशिष्ट संस्कृति, क्षेत्र, शिल्प या जोखिमग्रस्त विरासत के बारे में पूछें — या Contribute माध्यम से इसे दस्तावेज़ित करने में सहायता करें।',
    sources: 'उपयोग किए गए स्रोत',
    related: 'संबंधित संस्कृतियाँ',
    whyHere: 'यहाँ क्यों?',
    compareTitle: 'तुलना',
    compared: 'दोनों {cat} परंपराएँ हैं।',
    notFound: (q) => `संग्रह में “${q}” से मेल खाता कोई सत्यापित रिकॉर्ड अभी नहीं है।`
  },
  mr: {
    notEnough: 'सत्यापित SANSKRITI संग्रहातून मी अद्याप याचे अचूक उत्तर देऊ शकत नाही, म्हणून मी अंदाज लावणार नाही. एखाद्या विशिष्ट संस्कृतीबद्दल, प्रदेशाबद्दल, हस्तकलेबद्दल किंवा धोक्यात असलेल्या वारशाबद्दल विचारा — किंवा Contribute द्वारे हे दस्तऐवजीत करण्यास मदत करा.',
    sources: 'वापरलेले स्रोत',
    related: 'संबंधित संस्कृती',
    whyHere: 'इथे का?',
    compareTitle: 'तुलना',
    compared: 'दोन्ही {cat} परंपरा आहेत.',
    notFound: (q) => `संग्रहात “${q}” शी जुळणारा सत्यापित रेकॉर्ड अद्याप नाही.`
  }
};

const RISK_LABEL = {
  THRIVING: 'Thriving',
  VULNERABLE: 'Vulnerable',
  DECLINING: 'Declining',
  CRITICAL: 'Critical',
  INSUFFICIENT_DATA: 'Insufficient data'
};

const RISK_ORDER = { CRITICAL: 0, DECLINING: 1, VULNERABLE: 2, THRIVING: 3, INSUFFICIENT_DATA: 4 };

const CATEGORY_KEYWORDS = {
  dance: ['dance', 'dances', 'classical', 'dancing', 'नृत्य', 'नर्तन'],
  music: ['music', 'singing', 'song', 'songs', 'vocal', 'raga', 'संगीत', 'गीत', 'गायन'],
  textiles: ['textile', 'textiles', 'weave', 'weaving', 'weavers', 'silk', 'fabric', 'saree', 'sari', 'embroidery', 'साड़ी', 'बुनाई', 'वस्त्र', 'कपड़ा'],
  'art-craft': ['painting', 'paintings', 'craft', 'crafts', 'handicraft', 'artwork', 'paint', 'miniature', 'चित्रकला', 'चित्र', 'हस्तकला', 'शिल्प'],
  festival: ['festival', 'festivals', 'celebra', 'fair', 'utsav', 'त्योहार', 'उत्सव', 'पर्व'],
  food: ['food', 'cuisine', 'dish', 'dishes', 'eat', 'biryani', 'cook', 'भोजन', 'व्यंजन', 'खाना'],
  language: ['language', 'languages', 'speak', 'script', 'literary', 'literature', 'भाषा', 'साहित्य'],
  community: ['community', 'folk', 'tribe', 'tribal', 'nomadic', 'लोक', 'आदिवासी'],
  spiritual: ['temple', 'pilgrimage', 'sacred', 'holy', 'ritual', 'aarti', 'worship', 'मंदिर', 'पूजा', 'तीर्थ'],
  heritage: ['monument', 'heritage', 'architecture', 'fort', 'cave', 'world heritage', 'स्मारक', 'विरासत', 'गुफा', 'किला']
};

const RISK_INTENT_WORDS = ['risk', 'endangered', 'preserve', 'preservation', 'save', 'surviving', 'disappearing', 'disappear', 'declining', 'critical', 'vulnerable', 'guard', 'protect', 'dying', 'जोखिम', 'संकट', 'खतरे', 'खतरा', 'कमजोर', 'लुप्त', 'बचाएं', 'बचाना', 'रक्षा'];

const STATE_ALIASES = {
  'andhra pradesh': 'Andhra Pradesh', 'arunachal pradesh': 'Arunachal Pradesh', assam: 'Assam',
  bihar: 'Bihar', 'chhattisgarh': 'Chhattisgarh', goa: 'Goa', gujarat: 'Gujarat', haryana: 'Haryana',
  'himachal pradesh': 'Himachal Pradesh', 'jammu': 'Jammu and Kashmir', kashmir: 'Jammu and Kashmir',
  jharkhand: 'Jharkhand', karnataka: 'Karnataka', kerala: 'Kerala', 'andhra': 'Andhra Pradesh',
  'west bengal': 'West Bengal', bengal: 'West Bengal', 'tamil nadu': 'Tamil Nadu', tamilnadu: 'Tamil Nadu',
  'uttar pradesh': 'Uttar Pradesh', up: 'Uttar Pradesh', rajasthan: 'Rajasthan', 'madhya pradesh': 'Madhya Pradesh',
  maharashtra: 'Maharashtra', odisha: 'Odisha', orissa: 'Odisha', punjab: 'Punjab', sikkim: 'Sikkim',
  telangana: 'Telangana', nagaland: 'Nagaland', manipur: 'Manipur', mizoram: 'Mizoram', meghalaya: 'Meghalaya',
  tripura: 'Tripura', 'uttarakhand': 'Uttarakhand', delhi: 'Delhi', goa: 'Goa'
};

// Devanagari spellings for the same states, checked with combining marks removed.
const LOCAL_STATES = {
  'बिहार': 'Bihar', 'बंगाल': 'West Bengal', 'कर्नाटक': 'Karnataka', 'केरल': 'Kerala', 'राजस्थान': 'Rajasthan',
  'तमिलनाडु': 'Tamil Nadu', 'महाराष्ट्र': 'Maharashtra', 'गुजरात': 'Gujarat', 'उत्तरप्रदेश': 'Uttar Pradesh',
  'पंजाब': 'Punjab', 'असम': 'Assam', 'ओडिशा': 'Odisha', 'मध्यप्रदेश': 'Madhya Pradesh', 'कश्मीर': 'Jammu and Kashmir',
  'झारखंड': 'Jharkhand', 'हिमाचल': 'Himachal Pradesh', 'उत्तराखंड': 'Uttarakhand', 'मणिपुर': 'Manipur', 'नागालैंड': 'Nagaland'
};

// ---- retrieval helpers -------------------------------------------------------

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

const STOPWORDS = new Set(['the', 'of', 'and', 'is', 'in', 'at', 'for', 'to', 'what', 'which', 'how', 'why', 'a', 'an', 'are', 'was', 'were', 'with', 'from', 'list', 'show', 'tell', 'me', 'about', 'some', 'all', 'does', 'do', 'its', 'it', 'as', 'or', 'by', 'on', 'be', 'been', 'not', 'no', 'their', 'they', 'this', 'that', 'than', 'can', 'will', 'when', 'where', 'know', 'more', 'history']);

// Native-script search keywords for well-known cultures, so queries typed in
// Hindi/Devanagari (and other indic scripts) still reach the correct record.
// These are search terms only — asserted facts still come from the records.
const LOCAL_ALIASES = {
  kathak: ['कथक', 'कथक नृत्य'], kathakali: ['कथकली'], bharatanatyam: ['भरतनाट्यम्', 'भरतनाट्यम'], mohiniyattam: ['मोहिनीअट्टम', 'मोहिनीयाट्टम'], odissi: ['ओडिसी', 'ओड़िसी'], kuchipudi: ['कुचिपूड़ी'], manipuri: ['मणिपुरी'], sattriya: ['सत्रिया'], kalaripayattu: ['कलरिप्पयट्टू'],
  pashmina: ['पश्मीना', 'पश्मिना'], patola: ['पटोला'], bandhani: ['बंधेज', 'बांधनी'], phulkari: ['फुलकारी'], chikankari: ['चिकनकारी'], kanjeevaram: ['कांचीपुरम साड़ी', 'कांचीवरम'], banarasi: ['बनारसी साड़ी'], sambalpuri: ['संबलपुरी'], pochampally: ['पोचमपल्ली'], pochampalli: ['पोचम्पल्ली'],
  madhubani: ['मधुबनी'], warli: ['वारली'], pattachitra: ['पट्टचित्र'], gond: ['गोंड'], kalamkari: ['कलमकारी'], pichwai: ['पिछवाई'], tanjore: ['तंजावुर'], miniature: ['लघु चित्र'],
  garba: ['गरबा'], bhangra: ['भांगड़ा', 'भाङ्गड़ा'], lavani: ['लावणी'], kalbelia: ['कालबेलिया'], theyyam: ['तेय्यम'], yakshagana: ['यक्षगान'], baul: ['बाउल'], dhrupad: ['ध्रुपद'], carnatic: ['कर्नाटक संगीत'], hindustani: ['हिन्दुस्तानी शास्त्रीय'], baisakhi: ['बैसाखी'], onam: ['ओणम'], roshogolla: ['रसगुल्ला'], wazwan: ['वज़वान'],
  ajanta: ['अजंता'], ellora: ['एलोरा'], khajuraho: ['खजुराहो'], konark: ['कोणार्क'], sanchi: ['साँची'], 'bodh-gaya': ['बोधगया'], brihadeeswarar: ['बृहदीश्वर'], meenakshi: ['मीनाक्षी'], tajmahal: ['ताजमहल'], goldentemple: ['स्वर्ण मंदिर', 'अमृतसर हरमंदिर'], raniki: ['रानी की वाव'], hampi: ['हम्पी'], gangaaarti: ['गंगा आरती'], 'durga-puja': ['दुर्गा पूजा']
};

const DEVA = (s) => String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

function itemTokens(it) {
  const t = new Set();
  const toks = (s) => (DEVA(s).match(/[\p{L}\p{N}]+/gu) || []);
  (it.title || it.cultureName || '').split(',').forEach((n) => toks(n).forEach((w) => { if (w.length > 2 && !STOPWORDS.has(w)) t.add(w); }));
  (it.alternateNames || []).forEach((n) => toks(n).forEach((w) => { if (w.length > 2 && !STOPWORDS.has(w)) t.add(w); }));
  if (it.nativeName) toks(it.nativeName).forEach((w) => { if (w.length > 2 && !STOPWORDS.has(w)) t.add(w); });
  (LOCAL_ALIASES[it.slug || String(it.id || '').replace(/^ci-/, '')] || []).forEach((n) => toks(n).forEach((w) => { if (w.length > 2) t.add(w); }));
  return [...t];
}

function matchItems(items, qtok) {
  const qarr = [...qtok];
  return items
    .map((it) => {
      const toks = itemTokens(it);
      let score = 0;
      let minPos = Infinity;
      toks.forEach((tk) => {
        const p = qarr.indexOf(tk);
        if (p >= 0) { score += 2; if (p < minPos) minPos = p; }
      });
      const catTok = String(it.category || '').split(/\W+/).filter((w) => qtok.has(w));
      const stateInQ = qtok.has(String(it.stateName || '').toLowerCase());
      if (catTok.length) score += 1;
      if (stateInQ) score += 1;
      if (String(it.cityOrVillage || '').toLowerCase().split(/\W+/).some((w) => qtok.has(w))) score += 2;
      return { it, score, minPos };
    })
    .filter((r) => r.score > 1)
    .sort((a, b) => (b.score - a.score) || (a.minPos - b.minPos));
}

function findState(q) {
  const lower = q.toLowerCase();
  const keys = Object.keys(STATE_ALIASES).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = new RegExp(`\\b${k.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (re.test(lower)) return STATE_ALIASES[k];
  }
  const flat = DEVA(q);
  for (const [deva, eng] of Object.entries(LOCAL_STATES)) {
    if (lower.includes(deva) || flat.includes(DEVA(deva))) return eng;
  }
  return null;
}

function findRegion(q, items) {
  const lower = ' ' + q.toLowerCase() + ' ';
  const cand = new Set(items.flatMap((i) => [...(i.traditionalRegions || []), ...(i.culturalCentres || [])]).map((x) => String(x).toLowerCase()));
  for (const reg of cand) {
    if (reg.length > 2 && lower.includes(' ' + reg + ' ')) return reg;
  }
  return null;
}

// ---- answer template builders ------------------------------------------------

function profileAnswer(it, catLabel) { return [
  { type: 'text', text: it.description || it.history || '' },
  { type: 'list', heading: 'Recorded profile', items: [
    `Category: ${catLabel}`,
    it.nativeName ? `Native name: ${it.nativeName}` : null,
    it.community ? `Community: ${it.community}` : null,
    it.culturalSignificance ? `Significance: ${it.culturalSignificance}` : null,
    it.historicalPeriod ? `Historical depth: ${it.historicalPeriod}` : null,
    `Origin: ${[it.cityOrVillage, it.district, it.stateName].filter(Boolean).join(', ')}` + (it.traditionalRegions && it.traditionalRegions.length ? ` (${(it.traditionalRegions || []).join(', ')})` : ''),
    it.languages && it.languages.length ? `Languages: ${it.languages.join(', ')}` : null,
    `Heritage status: ${RISK_LABEL[((it.riskAssessment || {}).status)] || 'Insufficient data'}`
  ].filter(Boolean)}
]; }

function regionList(items) { return { type: 'list', heading: 'Cultures recorded in this region', items: items.map((r) => `${cap(r.it.name || r.it.title)} — ${[r.it.cityOrVillage, r.it.stateName].filter(Boolean).join(', ')} · ${r.it.category}`) }; }

function riskAnswer(itemList) {
  const order = [...itemList].sort((a, b) => (RISK_ORDER[((a.riskAssessment || {}).status)] ?? 9) - (RISK_ORDER[((b.riskAssessment || {}).status)] ?? 9));
  return {
    sections: [
      { type: 'list', heading: 'Heritage-at-risk from the verified corpus', items: order.slice(0, 14).map((it) => {
        const r = it.riskAssessment || {};
        const label = RISK_LABEL[r.status] || 'Insufficient data';
        const reason = (r.reasons || [])[0];
        return `${cap(it.name)} — ${label}${reason ? ` — ${reason}` : ''}`;
      }) }
    ],
    evidence: { grounded: !!itemList.length }
  };
}

// ---- main resolver -----------------------------------------------------------

async function answer(query, lang) {
  const t = T[lang] || T.en;
  const items = (await db.all('culturalitems'))
    .filter((i) => isVerifiedLevel(toLevel(i.verificationLevel)))
    .filter((i) => i.verificationStatus === 'verified');
  const q = (query || '').trim();
  const lower = q.toLowerCase();
  const qtok = new Set((DEVA(lower).match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 2 && !STOPWORDS.has(w)));

  const anc = { query: q, lang, matched: [], sources: [], related: [], sections: [], insufficient: false, disclaimer: DISCLAIMER };

  if (!q) {
    anc.insufficient = true;
    anc.sections = [{ type: 'text', text: t.notEnough }];
    anc.evidence = { grounded: false, pattern: 'empty' };
    return anc;
  }

  const ranked = matchItems(items, qtok);
  const named = ranked.filter((r) => r.score >= 2);

  const state = findState(lower);
  const region = findRegion(lower, items);

  const isRisk = RISK_INTENT_WORDS.some((w) => lower.includes(w));
  const vsPattern = /vs|versus|compare|difference|vs\./i.test(lower);
  const askWhy = /\bwhy(\s|')/.test(lower) || /\bassociation\b/.test(lower) || /why-here|why here/.test(lower);
  const askVisit = /\bmuseums?\b|\bwhere (to )?(see|visit)\b|\bcollections\b|\bsee it\b/.test(lower);
  const listingWord = /\b(list|which|show|name|major|famous|top|best|लिस्ट|सूची|बताओ|बताइए|कौन|गिनाओ)\b/.test(lower);
  const stateish = state || region;

  let catKeyword = null;
  for (const [c, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    if (kws.some((k) => lower.includes(k))) { catKeyword = c; break; }
  }

  // 1) Compare
  if (named.length >= 2 && vsPattern) {
    const [a, b] = named.slice(0, 2);
    const row = (x) => ({
      [x.it.name]: [
        `Category: ${x.it.category}`,
        `Origin: ${[x.it.cityOrVillage, x.it.stateName].filter(Boolean).join(', ') || 'Not recorded'}`,
        `Community: ${x.it.community || 'Not recorded'}`,
        `Languages: ${(x.it.languages || []).join(', ') || 'Not recorded'}`,
        `Historical depth: ${x.it.historicalPeriod || 'Not recorded'}`,
        `Heritage status: ${RISK_LABEL[((x.it.riskAssessment || {}).status)] || 'Insufficient data'}`
      ]
    });
    const shared = [
      a.it.category === b.it.category ? t.compared.replace('{cat}', a.it.category) : null,
      a.it.stateName === b.it.stateName ? `Both are rooted in ${a.it.stateName}.` : null
    ].filter(Boolean);
    anc.intent = 'compare';
    anc.title = `${a.it.name} vs ${b.it.name}`;
    anc.sections = [
      { type: 'list', heading: a.it.name, items: row(a)[a.it.name] },
      { type: 'list', heading: b.it.name, items: row(b)[b.it.name] },
      shared.length ? { type: 'list', heading: t.related, items: shared } : null
    ].filter(Boolean);
    anc.matched = [a.it, b.it];
    anc.evidence = { grounded: true, pattern: 'compare', matchedItems: [a.it.id, b.it.id] };
  }
  // 2) Heritage-at-risk
  else if (isRisk) {
    const isAtRisk = (i) => ['VULNERABLE', 'DECLINING', 'CRITICAL'].includes(((i.riskAssessment || {}).status));
    const atRiskAll = items.filter(isAtRisk);
    let narrowed = atRiskAll;
    if (stateish) narrowed = atRiskAll.filter((i) => String(i.stateName).toLowerCase() === String(stateish).toLowerCase() || (i.traditionalRegions || []).some((rr) => rr.toLowerCase() === String(stateish).toLowerCase()));
    else if (catKeyword) narrowed = atRiskAll.filter((i) => i.category === catKeyword);
    else if (named.length) narrowed = atRiskAll.filter((i) => named.some((n) => n.it.id === i.id));
    anc.intent = 'risk';
    anc.title = 'Heritage-at-risk';
    if (!narrowed.length && atRiskAll.length) {
      anc.sections = [{ type: 'text', text: `No verified at-risk record found for that specific group; showing the wider at-risk list instead.` }, ...riskAnswer(atRiskAll).sections];
      anc.matched = atRiskAll;
      anc.evidence = { grounded: true, pattern: 'risk', widened: true };
    } else if (narrowed.length) {
      const out = riskAnswer(narrowed);
      anc.sections = out.sections;
      anc.matched = narrowed;
      anc.evidence = { grounded: true, pattern: 'risk' };
    } else {
      anc.insufficient = true;
      anc.sections = [{ type: 'text', text: t.notEnough }];
      anc.evidence = { grounded: false, pattern: 'risk' };
    }
  }
  // 3) Listing: region × category (or category alone) — "list the dances of Kerala"
  else if ((listingWord || (stateish && catKeyword)) && !(named.length && !listingWord && !(stateish && catKeyword))) {
    let hits = items;
    if (stateish) hits = hits.filter((i) => String(i.stateName).toLowerCase() === String(stateish).toLowerCase() || (i.traditionalRegions || []).some((x) => x.toLowerCase() === String(stateish).toLowerCase()) || (i.culturalCentres || []).some((x) => x.toLowerCase() === String(stateish).toLowerCase()));
    if (catKeyword) hits = hits.filter((i) => i.category === catKeyword);
    anc.intent = 'listing';
    anc.title = `${cap(catKeyword || '')}${stateish ? ` · ${cap(String(stateish))}` : ''}`;
    anc.sections = hits.length ? [regionList(hits.map((x) => ({ it: x, score: 1 })))] : [{ type: 'text', text: t.notFound(q) }];
    anc.matched = hits;
    anc.evidence = { grounded: !!hits.length, pattern: 'listing', category: catKeyword, region: stateish ? String(stateish) : null };
    if (!hits.length) anc.insufficient = true;
  }
  // 4) "Why here?" from origin evidence
  else if (askWhy && stateish) {
    const hits = items.filter((i) => String(i.stateName).toLowerCase() === String(stateish).toLowerCase() || (i.traditionalRegions || []).some((r) => r.toLowerCase() === String(stateish).toLowerCase()) || (i.culturalCentres || []).some((c) => c.toLowerCase() === String(stateish).toLowerCase()));
    anc.intent = 'whyhere';
    anc.title = `${t.whyHere} ${cap(String(stateish))}`;
    anc.sections = hits.length
      ? [
          { type: 'list', heading: t.whyHere, items: hits.slice(0, 10).map((i) => `${cap(i.name)} — documented origin ${i.cityOrVillage ? `at ${i.cityOrVillage}` : `in ${i.stateName}`}${(i.traditionalRegions || []).length ? ` (${i.traditionalRegions.join(', ')})` : ''}`) },
          { type: 'text', text: 'Origin claims above are taken only from verified records and their cited sources; where sources conflict, SANSKRITI shows both.' }
        ]
      : [{ type: 'text', text: t.notEnough }];
    anc.matched = hits;
    anc.evidence = { grounded: !!hits.length, pattern: 'whyhere', region: String(stateish) };
    if (!hits.length) anc.insufficient = true;
  }
  // 4) Specific record profile
  else if (named.length) {
    const [top] = named;
    anc.intent = 'profile';
    anc.title = cap(top.it.name);
    anc.sections = profileAnswer(top.it, top.it.category);
    anc.matched = [top.it];
    const rel = matchItems(items, qtok).filter((r) => r.it.id !== top.it.id && (r.it.category === top.it.category || r.it.stateName === top.it.stateName)).slice(0, 6).map((r) => r.it);
    anc.related = rel;
    anc.sources = dedupeSources(top.it.sources || []);
    anc.evidence = { grounded: true, pattern: 'profile', matchedItems: [top.it.id] };
  }
  // 5) / 6) Region listing (state given, no category keyword)
  else if (stateish && !catKeyword) {
    const hits = matchItems(items, qtok).filter((r) => String(r.it.stateName).toLowerCase() === String(stateish).toLowerCase() || (r.it.traditionalRegions || []).some((x) => x.toLowerCase() === String(stateish).toLowerCase()));
    anc.intent = 'region';
    anc.title = `Cultures of ${cap(String(stateish))}`;
    anc.sections = hits.length ? [regionList(hits)] : [{ type: 'text', text: t.notFound(q) }];
    anc.matched = hits.map((r) => r.it);
    anc.evidence = { grounded: !!hits.length, pattern: 'region', region: String(stateish) };
    if (!hits.length) anc.insufficient = true;
  }
  else {
    let cat = null;
    for (const [c, kws] of Object.entries(CATEGORY_KEYWORDS)) {
      if (kws.some((k) => lower.includes(k))) { cat = c; break; }
    }
    if (cat) {
      const hits = items.filter((i) => i.category === cat);
      anc.intent = 'category';
      anc.title = `${cap(cat)} heritage`;
      anc.sections = hits.length ? [regionList(hits.map((x) => ({ it: x, score: 1 })))] : [{ type: 'text', text: t.notFound(q) }];
      anc.matched = hits;
      anc.evidence = { grounded: !!hits.length, pattern: 'category' };
      if (!hits.length) anc.insufficient = true;
    } else {
      anc.intent = 'insufficient';
      anc.sections = [{ type: 'text', text: t.notEnough }];
      anc.evidence = { grounded: false, pattern: 'insufficient' };
      anc.insufficient = true;
    }
  }

  // Visit intent enrichment (museums / venues), whenever the query asks.
  if (askVisit && anc.matched.length) {
    const places = await db.all('places');
    const rows = places.filter((p) => p.traditions && p.traditions.some((x) => anc.matched.some((m) => m.id === x)));
    if (rows.length) {
      anc.sections.push({ type: 'list', heading: 'Where to experience it (recorded venues)', items: rows.slice(0, 6).map((p) => `${p.name} — ${[p.city, p.stateName].filter(Boolean).join(', ')}${p.image ? ' · venue documented' : ''}`) });
    }
  }

  const srcItems = anc.matched.filter(Boolean);
  if (srcItems.length) {
    const all = srcItems.flatMap((i) => (i.sources || []).map((s) => ({ name: s.name, url: s.url, type: s.type, level: s.type, levelLabel: levelLabel(s.verificationLevel) })));
    anc.sources = dedupeSources(all);
    anc.sourcesNote = `Answered from ${srcItems.length} verified record(s); ${anc.sources.length} source reference(s) attached.`;
  }
  return anc;
}

function dedupeSources(sources) {
  const seen = new Set();
  const out = [];
  (sources || []).slice(0, 12).forEach((s) => {
    const url = s.url || s.website || '';
    const key = url || s.name;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: s.name, url: url || '', type: s.type || '', level: '', levelLabel: levelLabel(toLevel(s.verificationLevel)) });
  });
  return out.slice(0, 6);
}

router.post('/assistant', authRequired, dailyLimit, async (req, res) => {
  try {
    const { query, lang } = req.body || {};
    if (!query || !String(query).trim()) {
      return res.status(400).json({ ok: false, error: 'query is required', insufficient: true, disclaimer: DISCLAIMER });
    }
    const safeLang = ['en', 'hi', 'mr'].includes(lang) ? lang : 'en';
    const result = await answer(String(query).slice(0, 400), safeLang);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'Assistant unavailable' });
  }
});

module.exports = router;