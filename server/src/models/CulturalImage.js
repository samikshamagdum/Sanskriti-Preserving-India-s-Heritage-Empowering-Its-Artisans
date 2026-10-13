const mongoose = require('mongoose');

// A verified cultural image with full provenance metadata.
// Every image displayed for a culture must carry: source, creator, license,
// location and verification status. We never show random/unattributed images.
const culturalImageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  imageUrl: { type: String, required: true },
  cultureId: { type: String, default: '' },                    // linked CulturalItem / tradition
  title: { type: String, default: '' },
  caption: { type: String, default: '' },
  description: { type: String, default: '' },
  isIllustrative: { type: Boolean, default: false },
  sourceName: { type: String, default: '' },                   // institution / museum / library
  sourceUrl: { type: String, default: '' },                    // original source page for the image
  creator: { type: String, default: '' },                      // photographer / creator
  photographerOrInstitution: { type: String, default: '' },    // alias of creator
  copyright: { type: String, default: '' },
  license: { type: String, default: 'Unknown' },              // Open Access / Licensed / Restricted
  location: {
    name: { type: String, default: '' },
    state: { type: String, default: '' },
    latitude: { type: Number },
    longitude: { type: Number }
  },
  verificationStatus: {
    type: String,
    enum: ['unverified', 'ai_match', 'needs_review', 'verified'],
    default: 'needs_review'
  },
  verificationLevel: {
    type: String,
    enum: ['VERIFIED_GOVERNMENT', 'VERIFIED_MUSEUM', 'VERIFIED_ACADEMIC', 'VERIFIED_CULTURAL_ORGANIZATION', 'COMMUNITY_SUBMITTED', 'PENDING_VERIFICATION'],
    default: 'PENDING_VERIFICATION'
  },
  lastVerified: { type: String, default: '' },
  matchConfidence: { type: Number, default: 0 },               // AI vision match confidence (0-100)
  matchDetails: { type: mongoose.Schema.Types.Mixed, default: null },
  reviewNotes: { type: String, default: '' },
  uploadedById: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CulturalImage', culturalImageSchema, 'culturalimages');
