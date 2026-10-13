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

// Embedded source metadata for a cultural record.
// Per-source shape: sourceName(name), organization, sourceUrl, sourceType,
// accessDate, verificationLevel. Every claim carries a verifiable trail.
const itemSourceSchema = new mongoose.Schema(
  {
    name: String,                       // institution / publication (sourceName)
    organization: String,               // owning body, e.g. Ministry of Culture
    type: String,                       // institutional / archive / cultural-organization / community / ...
    sourceType: String,                 // API-friendly alias of `type`
    originalUrl: String,                // sourceUrl
    attribution: String,
    license: String,
    accessDate: String,
    verificationLevel: String,          // canonical VERIFIED_* / COMMUNITY_* / PENDING_VERIFICATION
    lastChecked: String
  },
  { _id: false }
);

// Embedded image metadata for a cultural record.
const itemImageSchema = new mongoose.Schema(
  {
    url: String,
    title: String,
    description: String,
    caption: String,
    sourceName: String,                 // museum / library / institution
    sourceUrl: String,
    photographerOrInstitution: String,  // alias of creator
    creator: String,
    copyright: String,
    license: String,
    location: String,
    isIllustrative: { type: Boolean, default: false },
    verificationStatus: { type: String, enum: ['unverified', 'ai_match', 'needs_review', 'verified'], default: 'needs_review' },
    verificationLevel: String,          // canonical tier for the image record
    matchConfidence: Number
  },
  { _id: false }
);

// A typed, sourced cultural location attached directly to the item.
// accuracy is canonical: EXACT / SITE / CITY / DISTRICT_LEVEL / REGION_LEVEL.
// DISTRICT_LEVEL and REGION_LEVEL are explicit approximations — displayed as such.
const itemLocationSchema = new mongoose.Schema(
  {
    name: String,
    locationType: String,               // origin / traditional-region / cultural-centre / current-practice-area / museum / artist / event
    state: String,
    stateId: String,
    district: String,
    cityOrVillage: String,
    latitude: Number,
    longitude: Number,
    accuracy: {
      type: String,
      enum: ['EXACT', 'SITE', 'CITY', 'DISTRICT_LEVEL', 'REGION_LEVEL', 'exact', 'site', 'city', 'district', 'regional', 'region', 'village'],
      default: 'REGION_LEVEL'
    },
    source: String,                     // sourceName
    sourceUrl: String,                  // locationSourceUrl
    locationSource: String,             // named source of the coordinate
    locationSourceUrl: String,
    verificationLevel: String,
    lastVerified: String,
    private: { type: Boolean, default: false }
  },
  { _id: false }
);

// Verified Cultural Knowledge Layer.
// Stores cultural information from trusted and legally reusable sources
// (institutional / government / museum / open datasets) plus, once approved,
// published & verified community content. Every item keeps a full provenance trail:
// WHERE the information, image and location came from and their verification status.
const culturalItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  slug: { type: String, trim: true },
  title: { type: String, required: true, trim: true },
  cultureName: { type: String, trim: true },                 // stable display name
  nativeName: { type: String, default: '' },
  name: { type: String, trim: true },
  alternateNames: { type: [String], default: [] },
  category: { type: String, default: 'tradition' },
  subCategory: { type: String, default: '' },
  description: { type: String, default: '' },
  history: { type: String, default: '' },
  historicalPeriod: { type: String, default: '' },
  community: { type: String, default: '' },
  culturalSignificance: { type: String, default: '' },
  stateId: { type: String, default: '' },
  stateName: { type: String, default: '' },
  district: { type: String, default: '' },
  cityOrVillage: { type: String, default: '' },
  location: { type: String, default: '' },
  lat: { type: Number },
  lng: { type: Number },

  originLocations: { type: [itemLocationSchema], default: [] },
  traditionalRegions: { type: [String], default: [] },
  culturalCentres: { type: [String], default: [] },

  images: { type: [String], default: [] },
  media: { type: [mediaSchema], default: [] },
  imageMetadata: { type: [itemImageSchema], default: [] },

  sources: { type: [itemSourceSchema], default: [] },
  sourceName: { type: String, default: '' },
  sourceUrl: { type: String, default: '' },
  sourceType: {
    type: String,
    enum: ['institutional', 'government', 'museum', 'openDataset', 'archive', 'cultural-organization', 'community', 'AI'],
    default: 'institutional'
  },

  languages: { type: [String], default: [] },
  relatedArtists: { type: [String], default: [] },
  relatedPlaces: { type: [String], default: [] },
  relatedEvents: { type: [String], default: [] },
  relatedTraditions: { type: [String], default: [] },

  contributorId: { type: String, default: '' },
  verificationStatus: {
    type: String,
    enum: ['draft', 'pending_review', 'submitted', 'under_review', 'needs_changes', 'verified', 'rejected', 'published'],
    default: 'pending_review'
  },
  verificationLevel: {
    type: String,
    enum: ['VERIFIED_GOVERNMENT', 'VERIFIED_MUSEUM', 'VERIFIED_ACADEMIC', 'VERIFIED_CULTURAL_ORGANIZATION', 'COMMUNITY_SUBMITTED', 'PENDING_VERIFICATION'],
    default: 'PENDING_VERIFICATION'
  },
  lastVerified: { type: String, default: '' },
  evidenceLabel: { type: String, default: '' },   // institutional / archive / cultural-organization / community / ai-assisted
  reviewerNotes: { type: String, default: '' },
  tags: { type: [String], default: [] },
  aiMeta: { type: mongoose.Schema.Types.Mixed, default: null },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CulturalItem', culturalItemSchema, 'culturalitems');
