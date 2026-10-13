const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema(
  {
    placeId: String,
    name: String,
    type: String,
    description: String
  },
  { _id: false }
);

const daySchema = new mongoose.Schema(
  {
    title: String,
    theme: String,
    stops: { type: [stopSchema], default: [] }
  },
  { _id: false }
);

const locationSchema = new mongoose.Schema(
  {
    id: String,
    name: String,
    lat: Number,
    lng: Number,
    type: String,
    day: Number
  },
  { _id: false }
);

const cultureTrailSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true, trim: true },
  subtitle: { type: String, default: '' },
  category: { type: String, default: 'trail' },
  stateId: { type: String, default: '' },
  stateName: { type: String, default: '' },
  region: { type: String, default: '' },
  duration: { type: String, default: '3 Days' },
  image: { type: String, default: '' },
  description: { type: String, default: '' },
  days: { type: [daySchema], default: [] },
  traditions: { type: [String], default: [] },
  artists: { type: [String], default: [] },
  events: { type: [String], default: [] },
  locations: { type: [locationSchema], default: [] },
  includes: { type: [String], default: [] },
  demoProfile: { type: Boolean, default: true }
});

module.exports = mongoose.model('CultureTrail', cultureTrailSchema, 'culturetrails');