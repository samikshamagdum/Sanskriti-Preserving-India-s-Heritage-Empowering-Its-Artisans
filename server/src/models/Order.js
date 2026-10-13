const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  productId: { type: String, required: true },
  productName: { type: String, default: '' },
  artisanId: { type: String, default: '' },
  items: [{
    productId: { type: String, required: true },
    productName: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    artisanId: { type: String, default: '' }
  }],
  buyerId: { type: String, default: '' },
  buyerName: { type: String, default: '' },
  buyerEmail: { type: String, default: '' },

  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  totalPrice: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
  },

  shippingAddress: { type: String, default: '' },
  trackingId: { type: String, default: '' },
  notes: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Order', orderSchema, 'orders');
