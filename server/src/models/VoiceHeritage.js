const mongoose = require('mongoose');

const voiceHeritageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, default: '' },
  audioUrl: { type: String, default: '' },
  cloudinaryPublicId: { type: String, default: '' },
  audioName: { type: String, default: '' },
  audioSize: { type: Number, default: 0 },
  duration: { type: Number, default: 0 },
  mime: { type: String, default: 'audio/webm' },
  language: { type: String, default: '' },
  detectedLanguage: { type: String, default: '' },
  region: { type: String, default: '' },
  stateId: { type: String, default: '' },
  stateName: { type: String, default: '' },
  category: { type: String, default: 'oral-history' },
  transcript: { type: String, default: '' },
  translation: { type: String, default: '' },
  storyteller: { type: String, default: '' },
  sourceInfo: { type: String, default: '' },
  status: { type: String, default: 'pending' },
  reviewStatus: { type: String, default: 'submitted' },
  author: { type: String, default: '' },
  authorId: { type: String, default: '' },
  verified: { type: Boolean, default: false },
  verifiedBy: { type: String, default: '' },
  feedback: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  submittedAt: { type: Date }
});

module.exports = mongoose.model('VoiceHeritage', voiceHeritageSchema, 'voiceheritage');