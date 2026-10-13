const mongoose = require('mongoose');

const lensRecordSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  imageUrl: { type: String, default: '' },
  cloudinaryPublicId: { type: String, default: '' },
  source: { type: String, default: '' },
  possibleIdentification: { type: String, default: '' },
  matchConfidence: { type: Number, default: 0 },
  authorId: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CultureLens', lensRecordSchema, 'culturelens');