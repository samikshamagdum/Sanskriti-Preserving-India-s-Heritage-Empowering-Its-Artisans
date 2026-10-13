const mongoose = require('mongoose');

const artistSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  art: { type: String, default: '' },
  category: { type: String, default: 'art-craft' },
  stateId: { type: String, default: '' },
  stateName: { type: String, default: '' },
  region: { type: String, default: '' },
  image: { type: String, default: '' },
  biography: { type: String, default: '' },
  gallery: { type: [String], default: [] },
  story: { type: String, default: '' },
  verified: { type: Boolean, default: false },
  demoProfile: { type: Boolean, default: true },
  workshops: { type: [String], default: [] },
  city: { type: String, default: '' },
  lat: { type: Number },
  lng: { type: Number }
});

module.exports = mongoose.model('Artist', artistSchema, 'artists');