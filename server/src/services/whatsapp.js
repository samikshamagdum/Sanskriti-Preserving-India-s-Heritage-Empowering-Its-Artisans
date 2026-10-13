// WhatsApp Companion service.
// Current implementation is a structured MVP that simulates the WhatsApp Business
// API. Swapping THIS module for a real provider (e.g. Meta Cloud API / Twilio) is
// all that is needed to go live — the route layer and prompt data stay identical.

const db = require('../utils/db');

function greeting(who = 'friend') {
  return `Namaste ${who}! 🇮🇳\n\nThis is *SANSKRITI* — your companion for India's living culture.`;
}

async function dailyFact() {
  const traditions = await db.all('traditions');
  const pick = traditions[Math.floor(Math.random() * traditions.length)];
  return pick
    ? `Did you know?\n✨ *${pick.title}* — ${pick.excerpt}\n\nFrom *${pick.stateName}*, ${pick.region} India.`
    : 'Did you know?\n✨ India has 8 classical dance forms and over 60 living folk traditions.';
}

async function todayQuiz() {
  const packs = await db.all('culturepacks');
  let q = null;
  for (const p of packs) {
    const quiz = (p.items || []).find((i) => i.type === 'quiz');
    if (quiz) { q = { ...quiz, pack: p.title }; break; }
  }
  if (!q) return { text: `Today's Quiz 🎯\nWhich classical dance uses ghungroo ankle bells?\n(A) Bharatanatyam\n(B) Kuchipudi\n(C) Kathak\n\nReply with the letter.`, answer: 'C' };
  return { text: `Today's Quiz 🎯\n${q.title}\n\n${q.options.map((o, i) => `(${String.fromCharCode(65 + i)}) ${o}`).join('\n')}`, answer: q.answer };
}

async function nearbyEvents(stateId) {
  const events = await db.all('events');
  const list = stateId ? events.filter((e) => e.stateId === stateId) : events;
  const top = list.slice(0, 3);
  if (!top.length) return 'No upcoming events found nearby right now. Check the SANSKRITI map!';
  return 'Nearby Events 📅\n\n' + top.map((e, i) => `${i + 1}. *${e.title}*\n    ${e.stateName} · ${e.date}`).join('\n\n');
}

// Interactive message buttons (rendered by the WhatsApp-style UI).
function interactiveButtons() {
  return [
    { id: 'explore', title: 'Explore', description: 'Browse India’s traditions' },
    { id: 'quiz', title: 'Today’s Quiz', description: 'Test your cultural knowledge' },
    { id: 'nearby', title: 'Nearby Events', description: 'What to attend near you' },
    { id: 'catalog', title: 'Make a listing', description: 'Turn a voice note into two outputs' },
    { id: 'passport', title: 'Provenance', description: 'Learn about maker passports' }
  ];
}

function studioWelcome() {
  return 'KalaSetu Artisan Studio\n\nSend one voice note or a few lines about a piece you made. I will prepare:\n1. A fair commercial listing\n2. A separate heritage story card\n\nI can also show you the price formula, create a provenance passport, or help you answer a B2B demand brief.';
}

function studioPriceGuide() {
  return 'Transparent pricing guide\n\nRaw materials + fair labor + market margin = suggested price.\n\nFair labor uses a regional hourly benchmark. The market margin is shown separately so the maker and buyer can see where every rupee goes.';
}
//   sendText(to, text)
//   sendInteractive(to, { body, buttons })
//   sendTemplate(to, templateName, params)
async function handleIncoming({ text, user, stateId }) {
  const t = (text || '').toLowerCase();

  if (t.includes('catalog') || t.includes('listing') || t.includes('studio') || t === '4') {
    return { type: 'text', body: studioWelcome() };
  }
  if (t.includes('price') || t.includes('cost') || t.includes('fair')) {
    return { type: 'text', body: studioPriceGuide() };
  }
  if (t.includes('passport') || t.includes('provenance') || t === '5') {
    return { type: 'text', body: 'Digital Provenance Passport\n\nEach passport can carry the maker, place, materials, making record, GI or origin claim, community review and buyer questions. Scan the QR on a listing to open the public record.' };
  }
  if (t.includes('demand') || t.includes('buyer') || t.includes('order')) {
    return { type: 'text', body: 'B2B demand lane\n\nTell me the craft, quantity, region, deadline and budget. I will help you turn the brief into a response that protects your capacity and fair price.' };
  }

  if (user === undefined && text === undefined) {
    return { type: 'text', body: greeting() };
  }

  if (t.includes('quiz') || t === '2' || t === 'quiz') {
    return { type: 'text', body: (await todayQuiz()).text };
  }
  if (t.includes('nearby') || t.includes('event') || t === '3') {
    return { type: 'text', body: await nearbyEvents(stateId) };
  }
  if (t.includes('explore') || t === '1') {
    const traditions = await db.all('traditions');
    const top = traditions.slice(0, 5).map((x) => `• *${x.title}* (${x.stateName})`).join('\n');
    return { type: 'text', body: `Explore with SANSKRITI 🪔\n\nHere's where to start:\n${top}\n\nTry "quiz" or "nearby" next!` };
  }
  if (t.includes('fact') || t.includes('did you know')) {
    return { type: 'text', body: await dailyFact() };
  }

  return {
    type: 'interactive',
    body: greeting() + '\n\nPick a button to begin 👇',
    buttons: interactiveButtons()
  };
}

module.exports = { greeting, dailyFact, todayQuiz, nearbyEvents, interactiveButtons, handleIncoming };