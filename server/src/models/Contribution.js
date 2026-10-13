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

const contributionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true, trim: true },
  type: { type: String, default: 'story' },
  contentType: { type: String, default: 'heritage' },
  category: { type: String, default: 'history' },
  stateId: { type: String, required: true },
  stateName: { type: String, default: '' },
  region: { type: String, default: 'Unknown' },
  district: { type: String, default: '' },
  city: { type: String, default: '' },
  village: { type: String, default: '' },
  content: { type: String, default: '' },
  culturalSignificance: { type: String, default: '' },
  sourceOfInfo: { type: String, default: '' },
  storyteller: { type: String, default: '' },
  language: { type: String, default: '' },
  transcript: { type: String, default: '' },
  translation: { type: String, default: '' },
  media: { type: [mediaSchema], default: [] },
  tags: { type: [String], default: [] },
  lat: { type: Number },
  lng: { type: Number },
  status: { type: String, default: 'submitted' },
  reviewStatus: { type: String, default: 'submitted' },
  verificationStatus: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'needs_changes', 'verified', 'rejected', 'published'],
    default: 'submitted'
  },
  author: { type: String, default: '' },
  authorId: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  traditionRef: { type: String, default: null },
  feedback: { type: String, default: '' },
  rejectReason: { type: String, default: '' },
  reviewerNotes: { type: String, default: '' },
  aiMeta: { type: mongoose.Schema.Types.Mixed, default: null },
  verified: { type: Boolean, default: false },
  verifiedBy: { type: String, default: '' },
  publishedAt: { type: Date }
});

module.exports = mongoose.model('Contribution', contributionSchema, 'contributions');