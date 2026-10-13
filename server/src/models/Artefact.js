const mongoose = require('mongoose');

const artefactSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, default: 'art-craft' },
  stateId: { type: String, default: '' },
  region: { type: String, default: '' },
  image: { type: String, default: '' },
  description: { type: String, default: '' }
});

module.exports = mongoose.model('Artefact', artefactSchema, 'artefacts');