const mongoose = require('mongoose');

// Accurate cultural location. A culture has multiple locations of different types —
// origin, traditional region, cultural centre, current practice area, museum, artist, event.
// Every location keeps its source and accuracy level; we never expose a private
// artist's exact home without permission.
const locationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  cultureId: { type: String, default: '' },                    // linked CulturalItem / tradition / artist
  locationType: {
    type: String,
    enum: ['origin', 'traditional-region', 'cultural-centre', 'current-practice-area', 'museum', 'artist', 'event', 'heritage-site', 'art-studio', 'cultural-institution'],
    default: 'origin'
  },
  state: { type: String, default: '' },
  stateId: { type: String, default: '' },
  district: { type: String, default: '' },
  cityOrVillage: { type: String, default: '' },
  latitude: { type: Number },
  longitude: { type: Number },
  accuracy: {
    type: String,
    enum: ['EXACT', 'SITE', 'CITY', 'DISTRICT_LEVEL', 'REGION_LEVEL', 'exact', 'site', 'city', 'district', 'regional', 'region', 'village'],
    default: 'REGION_LEVEL'
  },
  source: { type: String, default: '' },
  sourceUrl: { type: String, default: '' },
  locationSource: { type: String, default: '' },              // named source of the coordinate
  locationSourceUrl: { type: String, default: '' },
  verificationLevel: {
    type: String,
    enum: ['VERIFIED_GOVERNMENT', 'VERIFIED_MUSEUM', 'VERIFIED_ACADEMIC', 'VERIFIED_CULTURAL_ORGANIZATION', 'COMMUNITY_SUBMITTED', 'PENDING_VERIFICATION'],
    default: 'PENDING_VERIFICATION'
  },
  lastVerified: { type: String, default: '' },
  private: { type: Boolean, default: false },                  // true => hide exact coords
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Location', locationSchema, 'locations');
