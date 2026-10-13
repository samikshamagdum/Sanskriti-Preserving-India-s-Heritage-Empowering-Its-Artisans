const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true, trim: true },
  category: { type: String, default: 'festival' },
  stateId: { type: String, default: '' },
  stateName: { type: String, default: '' },
  region: { type: String, default: '' },
  date: { type: String, required: true },
  location: { type: String, default: '' },
  city: { type: String, default: '' },
  lat: { type: Number },
  lng: { type: Number },
  description: { type: String, default: '' },
  image: { type: String, default: '' },
  demoProfile: { type: Boolean, default: true } 
});

module.exports = mongoose.model('Event', eventSchema, 'events');