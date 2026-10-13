const mongoose = require('mongoose');

// A recognized cultural institution (museum, library, archive, government cultural
// department, university, cultural organization) that provides trusted records.
const institutionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['museum', 'library', 'archive', 'government', 'university', 'cultural-organization', 'art-studio', 'portal'],
    default: 'museum'
  },
  website: { type: String, default: '' },
  location: { type: String, default: '' },
  stateName: { type: String, default: '' },
  description: { type: String, default: '' },
  apiUrl: { type: String, default: '' },                       // official API / open dataset URL
  license: { type: String, default: 'Unknown' },
  country: { type: String, default: 'India' },
  reliabilityLevel: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  verificationStatus: { type: String, default: 'verified' },
  lastChecked: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Institution', institutionSchema, 'institutions');
