const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  icon: { type: String, default: '🏅' },
  description: { type: String, default: '' },
  criteria: { type: String, default: '' }
});

module.exports = mongoose.model('Badge', badgeSchema, 'badges');