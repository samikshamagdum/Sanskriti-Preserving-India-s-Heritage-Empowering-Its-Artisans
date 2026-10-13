const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema(
  { id: String, name: String, icon: String },
  { _id: false }
);

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  stateId: { type: String, default: 'dl' },
  interests: { type: [String], default: [] },
  savedTraditions: { type: [String], default: [] },
  savedArtists: { type: [String], default: [] },
  followedStates: { type: [String], default: [] },
  savedEvents: { type: [String], default: [] },
  xp: { type: Number, default: 0 },
  badges: { type: [badgeSchema], default: [] },
  streak: { type: Number, default: 0 },
  contributions: { type: [String], default: [] },
  lastActive: { type: String },
  createdAt: { type: Date, default: Date.now }
});

userSchema.set('toJSON', {
  transform: (_, ret) => { delete ret.password; return ret; }
});

module.exports = mongoose.model('User', userSchema, 'users');