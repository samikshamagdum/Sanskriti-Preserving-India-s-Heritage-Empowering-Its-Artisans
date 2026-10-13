// SANSKRITI — Cultural Authenticity Engine.
//
// Produces a transparent EVIDENCE SCORE for a cultural record from the signals
// actually present in its provenance: source tiers cited (government / museum /
// academic / cultural organization / community), coordinate accuracy, verified
// image coverage and re-verification recency. It NEVER claims historical truth —
// it indicates how much verifiable evidence a record carries.
const { toLevel, toAccuracy, isVerifiedLevel, accuracyLabel } = require('../constants/verification');

const WEIGHTS = {
  government: 12,
  museum: 11,
  academic: 11,
  'cultural-organization': 11,
  location: 20,
  image: 20,
  recency: 15,
  community: 1,
  conflicts: -5,
  noSources: -12
};

function computeAuthenticity(item, { sources = [], images = [], locations = [] } = {}) {
  const checks = [];
  const srcLevels = sources.map((s) => toLevel(s && s.verificationLevel)).filter(Boolean);
  const tierHas = (lv) => srcLevels.includes(lv);

  if (tierHas('VERIFIED_GOVERNMENT')) checks.push({ key: 'government', label: 'Government institution cited', ok: true });
  if (tierHas('VERIFIED_MUSEUM')) checks.push({ key: 'museum', label: 'Museum collection cited', ok: true });
  if (tierHas('VERIFIED_ACADEMIC')) checks.push({ key: 'academic', label: 'Academic / archival source cited', ok: true });
  if (tierHas('VERIFIED_CULTURAL_ORGANIZATION')) checks.push({ key: 'cultural-organization', label: 'Cultural organization cited', ok: true });
  if (tierHas('COMMUNITY_SUBMITTED')) checks.push({ key: 'community', label: 'Community contribution recorded', ok: true, informational: true });
  if (!srcLevels.length) checks.push({ key: 'noSources', label: 'No verifiable source recorded', ok: false });

  const primary = locations.find((l) => l && l.locationType === 'origin') || locations[0] || {};
  const accuracy = toAccuracy((primary && primary.accuracy) || item.accuracy);
  const exactish = ['EXACT', 'SITE', 'CITY'].includes(accuracy);
  checks.push({ key: 'location', label: `Location verified — ${accuracyLabel(accuracy)}`, ok: exactish });

  const verifiedImgs = images.filter((i) => isVerifiedLevel(toLevel(i && i.verificationLevel))).length;
  if (images.length && verifiedImgs > 0) checks.push({ key: 'image', label: `${verifiedImgs} image(s) verified with attribution`, ok: true });
  else if (images.length) checks.push({ key: 'image', label: 'Image verification pending', ok: false });
  else checks.push({ key: 'image', label: 'No images documented', ok: false });

  if (item.lastVerified) checks.push({ key: 'recency', label: `Re-verified ${item.lastVerified}`, ok: true });
  else checks.push({ key: 'recency', label: 'Not re-verified recently', ok: false });

  const conflicts = ((item.disputes || item.conflictingSources) || []).length;
  if (conflicts) checks.push({ key: 'conflicts', label: `${conflicts} documented source conflict(s) shown transparently`, ok: false });

  let score = 0;
  for (const c of checks) {
    const w = Math.abs(WEIGHTS[c.key] || 0);
    if (c.ok && !c.informational) score += w;
    if (!c.ok && (c.key === 'conflicts' || c.key === 'noSources')) score -= w;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const verdict = score >= 85 ? 'Verified'
    : score >= 60 ? 'Partially Verified'
    : score >= 40 ? 'Community Submitted'
    : 'Verification Pending';

  return { score, verdict, checks };
}

module.exports = { computeAuthenticity };