const mongoose = require('mongoose');

const packItemSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['story', 'image', 'audio', 'quiz', 'video'], required: true },
    title: String,
    content: String,
    url: String,
    answer: String,
    options: { type: [String], default: [] }
  },
  { _id: false }
);

const culturePackSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true, trim: true },
  stateId: { type: String, default: '' },
  stateName: { type: String, default: '' },
  region: { type: String, default: '' },
  cover: { type: String, default: '' },
  sizeMB: { type: Number, default: 4.2 },
  description: { type: String, default: '' },
  items: { type: [packItemSchema], default: [] },
  downloads: { type: Number, default: 0 },
  demoProfile: { type: Boolean, default: true }
});

module.exports = mongoose.model('CulturePack', culturePackSchema, 'culturepacks');