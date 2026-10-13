const mongoose = require('mongoose');

const placeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  stateId: { type: String, default: '' },
  stateName: { type: String, default: '' },
  region: { type: String, default: '' },
  district: { type: String, default: '' },
  city: { type: String, default: '' },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  category: { type: String, default: 'heritage' },
  description: { type: String, default: '' },
  traditions: { type: [String], default: [] },
  type: { type: String, default: 'heritage' },
  image: { type: String, default: '' },
  demoProfile: { type: Boolean, default: false }
});

module.exports = mongoose.model('Place', placeSchema, 'places');