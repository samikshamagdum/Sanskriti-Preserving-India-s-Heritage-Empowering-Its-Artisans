const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  artForm: { type: String, default: '' },
  category: { type: String, default: 'art-craft' },
  artisanId: { type: String, default: '' },
  artisanName: { type: String, default: '' },
  artisanVillage: { type: String, default: '' },
  artisanState: { type: String, default: '' },
  artisanStateId: { type: String, default: '' },

  price: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  materials: { type: [String], default: [] },
  technique: { type: String, default: '' },
  dimensions: { type: String, default: '' },
  weight: { type: String, default: '' },

  giTag: { type: Boolean, default: false },
  giTagName: { type: String, default: '' },

  description: { type: String, default: '' },
  culturalStory: { type: String, default: '' },
  tags: { type: [String], default: [] },

  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviews: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },

  images: { type: [String], default: [] },
  passportId: { type: String, default: '' },

  pricingBreakdown: {
    materials: { type: Number, default: 0 },
    labor: { type: Number, default: 0 },
    culturalPremium: { type: Number, default: 0 },
    logistics: { type: Number, default: 0 },
  },
  demandScore: { type: Number, default: 50 },
  trendDirection: { type: String, enum: ['up', 'down', 'stable'], default: 'stable' },

  // AI metadata
  aiCatalogData: { type: mongoose.Schema.Types.Mixed, default: null },
  aiPriceSuggestion: { type: Number, default: 0 },
  aiConfidence: { type: Number, default: 0 },

  views: { type: Number, default: 0 },
  sales: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Product', productSchema, 'products');
