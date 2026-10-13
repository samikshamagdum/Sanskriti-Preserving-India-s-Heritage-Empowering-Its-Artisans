const mongoose = require('mongoose');

const traditionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true, trim: true },
  category: { type: String, default: 'tradition' },
  stateId: { type: String, default: '' },
  stateName: { type: String, default: '' },
  region: { type: String, default: '' },
  language: { type: String, default: '' },
  period: { type: String, default: 'Ancient' },
  images: { type: [String], default: [] },
  excerpt: { type: String, default: '' },
  history: { type: String, default: '' },
  origin: { type: String, default: '' },
  significance: { type: String, default: '' },
  keywords: { type: [String], default: [] },
  artefacts: { type: [String], default: [] },
  demoProfile: { type: Boolean, default: false },
  views: { type: Number, default: 0 }
});

module.exports = mongoose.model('Tradition', traditionSchema, 'traditions');