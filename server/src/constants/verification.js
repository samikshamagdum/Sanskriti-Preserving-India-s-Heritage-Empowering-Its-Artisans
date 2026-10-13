// SANSKRITI — canonical trust & accuracy definitions for the cultural knowledge layer.
//
// Every cultural record carries TWO signals:
//   1. verificationStatus  — WORKFLOW (draft -> pending_review -> verified | rejected)
//   2. verificationLevel   — TRUST TIER  (who vouched for this record)
// The two are independent: a record can be workflow-verified but only
// "community submitted" tier; it can also be PENDING_VERIFICATION tier while
// still under review. Public read paths only surface records whose level is a
// VERIFIED_* tier — unverified data is never presented as verified.

const VERIFICATION_LEVELS = [
  'VERIFIED_GOVERNMENT',
  'VERIFIED_MUSEUM',
  'VERIFIED_ACADEMIC',
  'VERIFIED_CULTURAL_ORGANIZATION',
  'COMMUNITY_SUBMITTED',
  'PENDING_VERIFICATION'
];

const LEVEL_META = {
  VERIFIED_GOVERNMENT: { label: 'Verified Government Source', tier: 'verified', badge: '🟢' },
  VERIFIED_MUSEUM: { label: 'Verified Museum', tier: 'verified', badge: '🟢' },
  VERIFIED_ACADEMIC: { label: 'Verified Academic Institution', tier: 'verified', badge: '🟢' },
  VERIFIED_CULTURAL_ORGANIZATION: { label: 'Verified Cultural Organization', tier: 'verified', badge: '🟢' },
  COMMUNITY_SUBMITTED: { label: 'Community Contribution', tier: 'community', badge: '👥' },
  PENDING_VERIFICATION: { label: 'Verification Pending', tier: 'pending', badge: '🟡' }
};

const VERIFIED_TIERS = new Set(['VERIFIED_GOVERNMENT', 'VERIFIED_MUSEUM', 'VERIFIED_ACADEMIC', 'VERIFIED_CULTURAL_ORGANIZATION']);

function isVerifiedLevel(level) {
  return VERIFIED_TIERS.has(String(level || ''));
}

// Workflow states (DRAFT -> PENDING_REVIEW -> VERIFIED | REJECTED).
const WORKFLOW_STATUSES = [
  'draft', 'pending_review', 'submitted', 'under_review', 'needs_changes',
  'verified', 'rejected', 'published'
];

// Tolerant lookup — accepts exact enum, the display label, the short client id
// (govt/museum/academic/organization/community/pending) or legacy values.
const LEVEL_LOOKUP = {
  VERIFIED_GOVERNMENT: 'VERIFIED_GOVERNMENT',
  'verified government': 'VERIFIED_GOVERNMENT',
  'verified government source': 'VERIFIED_GOVERNMENT',
  'govt': 'VERIFIED_GOVERNMENT',
  'government': 'VERIFIED_GOVERNMENT',
  VERIFIED_MUSEUM: 'VERIFIED_MUSEUM',
  'verified museum': 'VERIFIED_MUSEUM',
  'museum': 'VERIFIED_MUSEUM',
  VERIFIED_ACADEMIC: 'VERIFIED_ACADEMIC',
  'verified academic': 'VERIFIED_ACADEMIC',
  'verified academic institution': 'VERIFIED_ACADEMIC',
  'academic': 'VERIFIED_ACADEMIC',
  'academic institution': 'VERIFIED_ACADEMIC',
  'archive': 'VERIFIED_ACADEMIC',
  VERIFIED_CULTURAL_ORGANIZATION: 'VERIFIED_CULTURAL_ORGANIZATION',
  'verified cultural organization': 'VERIFIED_CULTURAL_ORGANIZATION',
  'cultural organization': 'VERIFIED_CULTURAL_ORGANIZATION',
  'institution': 'VERIFIED_CULTURAL_ORGANIZATION',
  'institutional': 'VERIFIED_CULTURAL_ORGANIZATION',
  'organization': 'VERIFIED_CULTURAL_ORGANIZATION',
  'open dataset': 'VERIFIED_CULTURAL_ORGANIZATION',
  'openDataset': 'VERIFIED_CULTURAL_ORGANIZATION',
  'community': 'COMMUNITY_SUBMITTED',
  'community submitted': 'COMMUNITY_SUBMITTED',
  'community contribution': 'COMMUNITY_SUBMITTED',
  'pending': 'PENDING_VERIFICATION',
  'pending verification': 'PENDING_VERIFICATION',
  'verification pending': 'PENDING_VERIFICATION',
  'unverified': 'PENDING_VERIFICATION',
  'AI': 'COMMUNITY_SUBMITTED',
  'ai': 'COMMUNITY_SUBMITTED'
};

function toLevel(value) {
  if (!value) return 'PENDING_VERIFICATION';
  const key = String(value).trim().toLowerCase();
  const upper = key.toUpperCase();
  if (VERIFICATION_LEVELS.includes(upper)) return upper;
  return LEVEL_LOOKUP[key] || LEVEL_LOOKUP[key.replace(/[^a-z ]/g, '')] || 'PENDING_VERIFICATION';
}

function levelLabel(level) {
  const meta = LEVEL_META[toLevel(level)];
  return meta ? meta.label : LEVEL_META.PENDING_VERIFICATION.label;
}

// -------- Location accuracy --------
// Canonical trust-preserving values. We never claim precision beyond what a
// record actually has: EXACT/SITE coordinates are verified; DISTRICT_LEVEL and
// REGION_LEVEL are explicit approximations and are labelled as such on the map.
const ACCURACY_VALUES = ['EXACT', 'SITE', 'CITY', 'DISTRICT_LEVEL', 'REGION_LEVEL'];

const ACCURACY_ALIASES = {
  exact: 'EXACT', site: 'SITE', city: 'CITY', village: 'SITE',
  district: 'DISTRICT_LEVEL', regional: 'REGION_LEVEL', region: 'REGION_LEVEL',
  state: 'REGION_LEVEL', country: 'REGION_LEVEL'
};

function toAccuracy(value) {
  if (!value) return 'REGION_LEVEL';
  const key = String(value).trim().toLowerCase();
  if (ACCURACY_ALIASES[key]) return ACCURACY_ALIASES[key];
  if (ACCURACY_VALUES.includes(key.toUpperCase())) return key.toUpperCase();
  return 'REGION_LEVEL';
}

const ACCURACY_LABELS = {
  EXACT: 'Exact site', SITE: 'Site level', CITY: 'City level',
  DISTRICT_LEVEL: 'District-level approximation', REGION_LEVEL: 'Regional approximation'
};

function accuracyLabel(accuracy) {
  return ACCURACY_LABELS[toAccuracy(accuracy)] || ACCURACY_LABELS.REGION_LEVEL;
}

// -------- Sources --------
function sourceTypeFromLabel(label) {
  const v = String(label || '').toLowerCase();
  if (v.includes('museum')) return 'museum';
  if (v.includes('academic') || v.includes('school') || v.includes('institute') || v.includes('university')) return 'academic';
  if (v.includes('cultural')) return 'cultural-organization';
  if (v.includes('government') || v.includes('govt') || v.includes('asi') || v.includes('unesco')) return 'government';
  if (v.includes('archive') || v.includes('reference') || v.includes('document')) return 'archive';
  if (v.includes('comm')) return 'community';
  return 'institutional';
}

// Evidence label used by the legacy provenance card.
function evidenceFromLevel(level) {
  switch (toLevel(level)) {
    case 'VERIFIED_GOVERNMENT': return 'government';
    case 'VERIFIED_MUSEUM': return 'museum';
    case 'VERIFIED_ACADEMIC': return 'academic';
    case 'VERIFIED_CULTURAL_ORGANIZATION': return 'cultural-organization';
    case 'COMMUNITY_SUBMITTED': return 'community';
    default: return 'archive';
  }
}

module.exports = {
  VERIFICATION_LEVELS,
  LEVEL_META,
  VERIFIED_TIERS,
  isVerifiedLevel,
  WORKFLOW_STATUSES,
  toLevel,
  levelLabel,
  ACCURACY_VALUES,
  ACCURACY_LABELS,
  toAccuracy,
  accuracyLabel,
  sourceTypeFromLabel,
  evidenceFromLevel
};