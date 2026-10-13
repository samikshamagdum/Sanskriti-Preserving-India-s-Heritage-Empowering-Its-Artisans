const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  targetId: { type: String, default: '' },
  targetType: { type: String, default: '' },
  reason: { type: String, default: '' },
  reporter: { type: String, default: '' },
  reportedBy: { type: String, default: '' },
  status: { type: String, default: 'open' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', reportSchema, 'reports');