const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true, trim: true },
  category: { type: String, default: 'history' },
  stateId: { type: String, default: '' },
  stateName: { type: String, default: '' },
  region: { type: String, default: '' },
  content: { type: String, default: '' },
  traditionId: { type: String, default: null },
  image: { type: String, default: '' },
  demoProfile: { type: Boolean, default: true }
});

module.exports = mongoose.model('Story', storySchema, 'stories');