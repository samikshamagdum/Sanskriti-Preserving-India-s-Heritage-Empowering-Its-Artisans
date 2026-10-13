const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    url: String,
    type: { type: String, enum: ['image', 'audio', 'video'], default: 'image' },
    publicId: String,
    sizeBytes: Number,
    mime: String
  },
  { _id: false }
);

// Community Cultural Place.
// Users suggest heritage places, events, art locations, artisan workshops,
// local festivals and historical places that may not yet be on any map.
// Follows the same verification workflow as contributions.
const communityPlaceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, default: 'heritage' },
  placeType: {
    type: String,
    enum: ['heritage-place', 'cultural-event', 'art-location', 'artisan-workshop', 'local-festival', 'historical-place'],
    default: 'heritage-place'
  },
  stateId: { type: String, default: '' },
  stateName: { type: String, default: '' },
  district: { type: String, default: '' },
  location: { type: String, default: '' },
  lat: { type: Number },
  lng: { type: Number },
  description: { type: String, default: '' },
  sourceInfo: { type: String, default: '' },
  media: { type: [mediaSchema], default: [] },
  images: { type: [String], default: [] },
  contributorId: { type: String, default: '' },
  contributorName: { type: String, default: '' },
  verificationStatus: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'needs_changes', 'verified', 'rejected', 'published'],
    default: 'submitted'
  },
  status: { type: String, default: 'submitted' },
  reviewerNotes: { type: String, default: '' },
  feedback: { type: String, default: '' },
  aiMeta: { type: mongoose.Schema.Types.Mixed, default: null },
  tags: { type: [String], default: [] },
  isEvent: { type: Boolean, default: false },
  eventDate: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CommunityPlace', communityPlaceSchema, 'communityplaces');