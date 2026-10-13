const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { hash, compare, sign } = require('../utils/auth');
const { authRequired } = require('../utils/middleware');

const seedUser = () => ({
  savedTraditions: [], savedArtists: [], followedStates: [], savedEvents: [],
  interests: [], xp: 0, badges: [], streak: 0, contributions: [], voiceHeritage: 0
});

router.post('/register', async (req, res) => {
  let { name, email, password, stateId, interests } = req.body;
  name = (name || '').toString().trim();
  email = (email || '').toString().trim().toLowerCase();
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const existing = await db.findOne('users', { email });
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const user = {
    id: db.uid('u'),
    name, email, password: hash(password),
    role: 'user',
    stateId: stateId || 'dl',
    interests: Array.isArray(interests) ? interests : [],
    ...seedUser(),
    createdAt: new Date().toISOString()
  };
  await db.insert('users', user);
  const token = sign(user);
  res.status(201).json({ token, user: { ...user, password: undefined } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await db.findOne('users', { email: (email || '').toString().trim().toLowerCase() });
  if (!user || !compare(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = sign(user);
  res.json({ token, user: { ...user, password: undefined } });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ ...req.user, password: undefined });
});

router.put('/me', authRequired, async (req, res) => {
  let { name, email } = req.body;
  const allowed = ['name', 'email', 'stateId', 'interests'];
  const update = {};
  if (name !== undefined) update.name = (name || '').toString().trim();
  if (email !== undefined) update.email = (email || '').toString().trim().toLowerCase();
  allowed.forEach((k) => { if (k !== 'name' && k !== 'email' && req.body[k] !== undefined) update[k] = req.body[k]; });
  const updated = await db.update('users', { id: req.user.id }, update);
  res.json({ ...updated, password: undefined });
});

// Save / follow actions
router.post('/me/save', authRequired, async (req, res) => {
  const { type, id } = req.body;
  const keyMap = { tradition: 'savedTraditions', artist: 'savedArtists', event: 'savedEvents', state: 'followedStates' };
  const key = keyMap[type];
  if (!key) return res.status(400).json({ error: 'Invalid type' });
  const user = await db.findOne('users', { id: req.user.id });
  const list = user[key] || [];
  let next;
  if (list.includes(id)) {
    next = list.filter((x) => x !== id);
  } else {
    next = [...list, id];
  }
  await db.update('users', { id: user.id }, { [key]: next });
  res.json({ [key]: next, saved: list.includes(id) ? false : true });
});

// Award XP and return passport state
router.post('/me/xp', authRequired, async (req, res) => {
  const { points, reason } = req.body;
  const user = await db.findOne('users', { id: req.user.id });
  if (!points) return res.status(400).json({ error: 'points required' });
  const today = new Date().toDateString();
  const last = user.lastActive;
  let streak = user.streak || 0;
  if (last !== today) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    streak = last === yesterday ? streak + 1 : 1;
  }
  const newXp = (user.xp || 0) + points;
  let badges = [...(user.badges || [])];
  evaluateBadges({ ...user, xp: newXp, streak }).forEach((b) => {
    if (!badges.find((x) => x.id === b.id)) badges.push(b);
  });
  await db.update('users', { id: user.id }, { xp: newXp, streak, lastActive: today, badges });
  const updated = await db.findOne('users', { id: user.id });
  res.json({ xp: updated.xp, streak: updated.streak, badges: updated.badges, reason });
});

function evaluateBadges(user) {
  const badges = [];
  if ((user.xp || 0) >= 100) badges.push({ id: 'b-explorer', name: 'Explorer', icon: '🧭' });
  if ((user.xp || 0) >= 300) badges.push({ id: 'b-knowledge', name: 'Knowledge Seeker', icon: '📚' });
  if ((user.xp || 0) >= 600) badges.push({ id: 'b-guardian', name: 'Heritage Guardian', icon: '🏛️' });
  if ((user.savedTraditions || []).length >= 3) badges.push({ id: 'b-curator', name: 'Curator', icon: '🖼️' });
  if ((user.contributions || []).length >= 1) badges.push({ id: 'b-contributor', name: 'Contributor', icon: '✍️' });
  if ((user.followedStates || []).length >= 3) badges.push({ id: 'b-wanderer', name: 'Wanderer', icon: '🗺️' });
  if ((user.streak || 0) >= 3) badges.push({ id: 'b-streak', name: 'On a Roll', icon: '🔥' });
  if ((user.voiceHeritage || 0) >= 1) badges.push({ id: 'b-storyteller', name: 'Storyteller', icon: '🎙️' });
  return badges;
}

router.get('/me/passport', authRequired, async (req, res) => {
  const user = await db.findOne('users', { id: req.user.id });
  const [states, traditions, contributions] = await Promise.all([
    db.find('states', { id: { $in: user.followedStates || [] } }),
    db.find('traditions', { id: { $in: user.savedTraditions || [] } }),
    db.all('contributions')
  ]);
  const statesExplored = states;
  const traditionsDiscovered = traditions;
  const contributionsCount = (user.contributions || []).length;
  res.json({
    xp: user.xp || 0,
    streak: user.streak || 0,
    badges: user.badges || [],
    statesExplored,
    traditionsDiscovered,
    contributionsCount,
    allBadges: evaluateBadges(user)
  });
});

router.get('/leaderboard', async (req, res) => {
  let users = await db.all('users');
  users = users.map((u) => ({ id: u.id, name: u.name, xp: u.xp || 0 }))
    .sort((a, b) => b.xp - a.xp).slice(0, 10);
  res.json(users);
});

module.exports = router;