const mongoose = require('mongoose');

// A trusted cultural information source.
// Preserves WHERE the information came from so users always know the provenance.
const sourceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },          // e.g. Maharashtra State Museum
  organization: { type: String, default: '' },                 // owning body
  website: { type: String, default: '' },
  type: {
    type: String,
    enum: ['institutional', 'archive', 'cultural-organization', 'government', 'museum', 'library', 'academic', 'openDataset', 'community', 'AI'],
    default: 'institutional'
  },
  country: { type: String, default: 'India' },
  reliabilityLevel: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  originalUrl: { type: String, default: '' },                  // link back to original source
  attribution: { type: String, default: '' },                  // required attribution
  license: { type: String, default: 'Unknown' },              // e.g. Open Access / CC BY-SA / Restricted
  licenseUrl: { type: String, default: '' },
  description: { type: String, default: '' },
  institutionId: { type: String, default: '' },                // linked Institution
  accessDate: { type: String, default: '' },
  verificationStatus: { type: String, default: 'verified' },
  verificationLevel: {
    type: String,
    enum: ['VERIFIED_GOVERNMENT', 'VERIFIED_MUSEUM', 'VERIFIED_ACADEMIC', 'VERIFIED_CULTURAL_ORGANIZATION', 'COMMUNITY_SUBMITTED', 'PENDING_VERIFICATION'],
    default: 'PENDING_VERIFICATION'
  },
  lastChecked: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Source', sourceSchema, 'sources');
