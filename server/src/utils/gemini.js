// Gemini utilities: image analysis (Culture Lens) and audio transcription (Voice Heritage).
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

function isConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

function model() {
  if (!genAI) throw new Error('GEMINI_API_KEY is not configured');
  return genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
}

function cleanJson(text) {
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw e;
  }
}

const LENS_PROMPT = (
  'You are SANSKRITI, an AI cultural historian of India. Analyze the image of a cultural ' +
  'object/artefact/practice and reply ONLY with valid JSON containing exactly these keys:\n' +
  '{"possibleIdentification": "<short name, e.g. Paithani Saree>", "artForm": "<e.g. Handloom Weaving>", ' +
  '"region": "<state / cultural region e.g. Maharashtra>", "period": "<best guess, e.g. Medieval>", ' +
  '"history": "<2-3 sentences>", "culturalSignificance": "<2-3 sentences>", "visualDetails": "<what you observe>", ' +
  '"relatedTraditions": ["<name>", "<name>", "<name>"], "confidence": <0-100 integer>}\n' +
  'If you cannot identify it, set possibleIdentification to "Unidentified cultural object" and confidence below 30. ' +
  'Never invent a firm identification; prefer a cautious guess.'
);

const TRANSCRIBE_PROMPT = (
  'You are SANSKRITI\'s Voice Heritage service. Transcribe the spoken audio faithfully in its original language. ' +
  'Reply ONLY with valid JSON: {"transcript": "<verbatim transcription>", "detectedLanguage": "<ISO or name of language, e.g. Hindi>", ' +
  '"summary": "<1-2 sentence summary in English>", "suggestedCategory": "<e.g. oral-history, folk-song, festival, story, recipe, lullaby>"}\n' +
  'If the audio is unclear or empty, set transcript to an empty string and detectedLanguage to "Unknown".'
);

async function analyzeImage(imageBuffer, mimeType) {
  const m = model();
  const resp = await m.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { text: LENS_PROMPT },
        { inlineData: { mimeType, data: imageBuffer.toString('base64') } }
      ]
    }]
  });
  const text = resp.response.text();
  return cleanJson(text);
}

async function analyzeText(query) {
  const m = model();
  const resp = await m.generateContent({
    contents: [{ role: 'user', parts: [{ text: LENS_PROMPT + '\n(No image provided. Base your analysis on this description: ' + query + ')' }] }]
  });
  return cleanJson(resp.response.text());
}

async function transcribeAudio(audioBuffer, mimeType) {
  const m = model();
  const resp = await m.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { text: TRANSCRIBE_PROMPT },
        { inlineData: { mimeType, data: audioBuffer.toString('base64') } }
      ]
    }]
  });
  return cleanJson(resp.response.text());
}

const CLASSIFY_PROMPT = (
  'You are SANSKRITI\'s cultural classification assistant. A community member submitted a heritage record. ' +
  'Reply ONLY with valid JSON with exactly these keys: ' +
  '{"category": "<best id from [art-craft, music, dance, festival, food, literature, folk, language, heritage, history, tradition]>", ' +
  '"language": "<most likely language name, or empty>", "tags": ["<3-6 concise tags>"], ' +
  '"summary": "<1-2 sentence English summary>", "relatedTraditions": ["<1-3 likely Indian tradition names>"]}\n' +
  'Important: never claim the content is verified. This is a suggestion for human reviewers only.'
);

// AI-assisted classification of a community submission. Returns suggestions only.
async function classifyCultural(title, description) {
  const m = model();
  const resp = await m.generateContent({
    contents: [{
      role: 'user',
      parts: [{
        text: CLASSIFY_PROMPT +
          '\nTitle: ' + (title || '').slice(0, 300) +
          '\nDescription: ' + (description || '').slice(0, 1500)
      }]
    }]
  });
  return cleanJson(resp.response.text());
}

async function translateText(text, targetLanguage = 'English') {
  const m = model();
  const prompt =
    'Translate the following heritage text into ' + targetLanguage +
    '. Preserve the oral, folk tone. Reply ONLY with the translated text, no commentary:\n\n' + text;
  const resp = await m.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
  return (resp.response.text() || '').trim();
}

async function generateStudioPipeline(input) {
  const m = model();
  const context = JSON.stringify({
    transcript: String(input.transcript || '').slice(0, 4000),
    craft: String(input.artForm || '').slice(0, 120),
    region: String(input.region || '').slice(0, 120),
    materials: Array.isArray(input.materials) ? input.materials.slice(0, 12) : [],
    artisanName: String(input.artisanName || '').slice(0, 120)
  });
  const prompt = 'You are SANSKRITI\'s artisan growth assistant for Indian crafts. Return only valid JSON with this exact shape: ' +
    '{"listing":{"title":"","seoDescription":"","keywords":[]},"heritageStory":{"headline":"","story":"","storyPrompt":"","makingSteps":[],"tags":[]},' +
    '"pricing":{"rawMaterials":0,"fairLabor":0,"marketMargin":0,"wageBenchmark":0,"laborHours":0,"rationale":""}}' +
    'Create a respectful commercial listing and a separate heritage story from the same voice note. Do not claim GI certification unless the input explicitly states it. ' +
    'Keep the price components transparent and return a plausible Indian regional wage benchmark. Input: ' + context;
  const resp = await m.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
  return cleanJson(resp.response.text());
}

module.exports = {
  isConfigured,
  analyzeImage,
  analyzeText,
  transcribeAudio,
  classifyCultural,
  generateStudioPipeline
};