const express = require('express');
const db = require('../utils/db');
const router = express.Router();

const DEMO_PRODUCTS = [
  { id:'prod-madhubani-01',name:'Radha-Krishna Madhubani Panel',artForm:'Madhubani Painting',category:'art-craft',artisan:{id:'art-01',name:'Sita Devi',village:'Jitwarpur',state:'Bihar',stateId:'bh'},price:4500,materials:['Handmade paper','Natural dyes','Bamboo pen'],technique:'Bharni (filled) style with natural pigments',dimensions:'60 × 45 cm',giTag:true,giTagName:'Madhubani Paintings (GI)',description:'A vibrant Madhubani painting depicting Radha and Krishna in the Bharni style.',culturalStory:'Madhubani painting grew from the walls and floors of the Mithila region, where pattern, memory and daily ritual meet.',tags:['madhubani','mithila','folk-art'],rating:4.8,reviews:24,stock:5,featured:true,demandScore:87,trendDirection:'up',pricingBreakdown:{materials:800,labor:2200,culturalPremium:1000,logistics:500}},
  { id:'prod-banarasi-01',name:'Banarasi Silk Saree — Jangla Pattern',artForm:'Banarasi Silk Weaving',category:'textiles',artisan:{id:'art-02',name:'Mohammad Irfan',village:'Varanasi',state:'Uttar Pradesh',stateId:'up'},price:18500,materials:['Pure silk','Real zari','Natural dyes'],technique:'Handloom jacquard weaving with real zari brocade',dimensions:'6.5 yards',giTag:true,giTagName:'Banaras Brocades and Sarees (GI)',description:'An exquisite Banarasi silk saree woven with real gold zari thread.',culturalStory:'Banarasi weaving carries a living archive of patterns passed through Varanasi handloom families.',tags:['banarasi','silk','saree','zari'],rating:4.9,reviews:42,stock:3,featured:true,demandScore:95,trendDirection:'up',pricingBreakdown:{materials:7500,labor:6000,culturalPremium:3500,logistics:1500}},
  { id:'prod-pashmina-01',name:'Pure Pashmina Shawl — Sozni Embroidery',artForm:'Pashmina Weaving',category:'textiles',artisan:{id:'art-05',name:'Abdul Rashid Dar',village:'Srinagar',state:'Jammu & Kashmir',stateId:'jk'},price:32000,materials:['Pure Changthangi goat pashmina','Natural dyes','Silk thread'],technique:'Handspun pashmina with Sozni (needle) embroidery',dimensions:'200 × 75 cm',giTag:true,giTagName:'Kashmir Pashmina (GI)',description:'A luxurious pure pashmina shawl with intricate Sozni embroidery.',culturalStory:'Kashmir Pashmina connects highland fibre, patient needlework and a tradition recognized across generations.',tags:['pashmina','kashmir','shawl'],rating:5,reviews:56,stock:2,featured:true,demandScore:93,trendDirection:'up',pricingBreakdown:{materials:12000,labor:14000,culturalPremium:4000,logistics:2000}},
  { id:'prod-bidri-01',name:'Bidriware Silver Inlay Box',artForm:'Bidriware',category:'art-craft',artisan:{id:'art-08',name:'Shah Abdul Khader',village:'Bidar',state:'Karnataka',stateId:'ka'},price:6200,materials:['Zinc-copper alloy','Pure silver wire'],technique:'Silver inlay on oxidised zinc alloy',dimensions:'15 × 10 × 8 cm',giTag:true,giTagName:'Bidriware (GI)',description:'An exquisite Bidriware box with pure silver inlay.',culturalStory:'Bidriware carries the blackening techniques and metal knowledge of Bidar into every new object.',tags:['bidriware','silver-inlay','bidar'],rating:4.9,reviews:19,stock:3,featured:true,demandScore:78,trendDirection:'stable',pricingBreakdown:{materials:2200,labor:2500,culturalPremium:1000,logistics:500}},
  { id:'prod-tanjore-01',name:'Tanjore Painting — Goddess Saraswati',artForm:'Tanjore Painting',category:'art-craft',artisan:{id:'art-11',name:'S. Kumaresan',village:'Thanjavur',state:'Tamil Nadu',stateId:'tn'},price:12000,materials:['Wooden plank','22-carat gold foil','Semi-precious stones'],technique:'Classical Tanjore painting with gold foil and stone relief',dimensions:'45 × 35 cm',giTag:true,giTagName:'Thanjavur Paintings (GI)',description:'A resplendent Tanjore painting with real gold foil relief.',culturalStory:'Tanjore painting brings temple iconography, mineral colour and patient relief work into a portable record.',tags:['tanjore','gold-foil','classical'],rating:4.9,reviews:17,stock:2,featured:true,demandScore:88,trendDirection:'up',pricingBreakdown:{materials:4500,labor:4000,culturalPremium:2500,logistics:1000}}
];

const DEMO_ORDERS = [];

const text = (value, fallback = '') => {
  const result = String(value == null ? '' : value).trim();
  return result || fallback;
};

const number = (value, fallback = 0) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};

const list = (value) => {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  return text(value).split(',').map((item) => item.trim()).filter(Boolean);
};

const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const productFromInput = (input = {}) => {
  const source = input || {};
  const artisan = source.artisan || {};
  const pricing = source.pricingBreakdown || source.pricing || {};
  const materials = Math.max(0, number(pricing.materials ?? pricing.rawMaterials));
  const labor = Math.max(0, number(pricing.labor ?? pricing.fairLabor));
  const culturalPremium = Math.max(0, number(pricing.culturalPremium ?? pricing.marketMargin));
  const logistics = Math.max(0, number(pricing.logistics));
  const calculatedPrice = materials + labor + culturalPremium + logistics;
  return {
    id: text(source.id, makeId('prod')),
    name: text(source.name, 'Untitled handmade piece'),
    artForm: text(source.artForm, 'Indian Handicraft'),
    category: text(source.category, 'art-craft'),
    artisan: {
      id: text(artisan.id || source.artisanId, 'artisan-community'),
      name: text(artisan.name || source.artisanName, 'SANSKRITI artisan'),
      village: text(artisan.village || source.artisanVillage, 'India'),
      state: text(artisan.state || source.artisanState, 'India'),
      stateId: text(artisan.stateId || source.artisanStateId, ''),
      image: text(artisan.image, '')
    },
    price: Math.max(0, number(source.price, calculatedPrice)),
    currency: text(source.currency, 'INR'),
    materials: list(source.materials),
    technique: text(source.technique),
    dimensions: text(source.dimensions),
    weight: text(source.weight),
    giTag: Boolean(source.giTag),
    giTagName: text(source.giTagName),
    description: text(source.description),
    culturalStory: text(source.culturalStory),
    tags: list(source.tags),
    rating: Math.min(5, Math.max(0, number(source.rating))),
    reviews: Math.max(0, number(source.reviews)),
    stock: Math.max(0, number(source.stock, 1)),
    featured: Boolean(source.featured),
    images: list(source.images),
    passportId: text(source.passportId, text(source.id, makeId('passport'))),
    pricingBreakdown: { materials, labor, culturalPremium, logistics },
    demandScore: Math.min(100, Math.max(0, number(source.demandScore, 50))),
    trendDirection: ['up', 'down', 'stable'].includes(source.trendDirection) ? source.trendDirection : 'stable',
    aiCatalogData: source.aiCatalogData || null,
    aiPriceSuggestion: Math.max(0, number(source.aiPriceSuggestion)),
    aiConfidence: Math.max(0, number(source.aiConfidence)),
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
};

const productForStorage = (product) => {
  const { artisan, ...rest } = product;
  return {
    ...rest,
    artisanId: artisan.id,
    artisanName: artisan.name,
    artisanVillage: artisan.village,
    artisanState: artisan.state,
    artisanStateId: artisan.stateId
  };
};

const productFromStorage = (product) => productFromInput({
  ...product,
  artisan: product.artisan || {
    id: product.artisanId,
    name: product.artisanName,
    village: product.artisanVillage,
    state: product.artisanState,
    stateId: product.artisanStateId
  }
});

async function readProducts() {
  if (!db.isMongo()) return DEMO_PRODUCTS;
  try {
    const stored = await db.find('products', {});
    if (!stored.length) {
      await db.insertMany('products', DEMO_PRODUCTS.map(productForStorage));
      return DEMO_PRODUCTS;
    }
    return stored.map(productFromStorage);
  } catch (error) {
    console.warn('[marketplace] Product store unavailable; using the in-memory catalog.');
    return DEMO_PRODUCTS;
  }
}

async function writeProduct(product) {
  if (db.isMongo()) {
    try {
      return await db.insert('products', productForStorage(product));
    } catch (error) {
      console.warn('[marketplace] Product write unavailable; saving the listing in memory.');
    }
  }
  DEMO_PRODUCTS.push(product);
  return product;
}

async function replaceProduct(id, patch) {
  if (db.isMongo()) {
    try {
      const existing = await db.findOne('products', { id });
      if (existing) {
        const current = productFromStorage(existing);
        const next = productFromInput({ ...current, ...patch, id: current.id, artisan: { ...current.artisan, ...(patch.artisan || {}) } });
        return productFromStorage(await db.update('products', { id }, productForStorage(next)));
      }
    } catch (error) {
      console.warn('[marketplace] Product update unavailable; using the in-memory catalog.');
    }
  }
  const index = DEMO_PRODUCTS.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const current = DEMO_PRODUCTS[index];
  const next = productFromInput({ ...current, ...patch, id: current.id, artisan: { ...current.artisan, ...(patch.artisan || {}) } });
  DEMO_PRODUCTS[index] = next;
  return next;
}

function filterProducts(products, query) {
  const q = text(query.q).toLowerCase();
  const category = text(query.category);
  const artForm = text(query.artForm);
  const state = text(query.state);
  const minPrice = query.minPrice === undefined ? null : number(query.minPrice);
  const maxPrice = query.maxPrice === undefined ? null : number(query.maxPrice);
  return products.filter((product) => {
    if (category && product.category !== category) return false;
    if (artForm && product.artForm !== artForm) return false;
    if (state && product.artisan.stateId !== state) return false;
    if (query.giTag === 'true' && !product.giTag) return false;
    if (minPrice !== null && product.price < minPrice) return false;
    if (maxPrice !== null && product.price > maxPrice) return false;
    if (q) {
      const haystack = `${product.name} ${product.artForm} ${product.description} ${product.culturalStory} ${product.artisan.name} ${product.artisan.state} ${product.tags.join(' ')}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function sortProducts(products, sort) {
  const items = [...products];
  if (sort === 'price-low') return items.sort((a, b) => a.price - b.price);
  if (sort === 'price-high') return items.sort((a, b) => b.price - a.price);
  if (sort === 'rating') return items.sort((a, b) => b.rating - a.rating);
  if (sort === 'demand') return items.sort((a, b) => b.demandScore - a.demandScore);
  if (sort === 'newest') return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return items.sort((a, b) => Number(b.featured) - Number(a.featured) || b.demandScore - a.demandScore);
}

router.get('/products', async (req, res, next) => {
  try {
    const products = filterProducts(await readProducts(), req.query);
    const sorted = sortProducts(products, text(req.query.sort, 'featured'));
    const page = Math.max(1, number(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, number(req.query.limit, 20)));
    const start = (page - 1) * limit;
    res.json({ products: sorted.slice(start, start + limit), total: sorted.length, page, pages: Math.ceil(sorted.length / limit) || 1 });
  } catch (error) {
    next(error);
  }
});

router.get('/products/:id', async (req, res, next) => {
  try {
    const product = (await readProducts()).find((item) => item.id === req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    next(error);
  }
});

router.get('/trending', async (req, res, next) => {
  try {
    res.json(sortProducts(await readProducts(), 'demand').slice(0, 6));
  } catch (error) {
    next(error);
  }
});

router.get('/artisan/:id/products', async (req, res, next) => {
  try {
    res.json((await readProducts()).filter((product) => product.artisan.id === req.params.id));
  } catch (error) {
    next(error);
  }
});

router.get('/analytics', async (req, res, next) => {
  try {
    const products = await readProducts();
    const revenue = products.reduce((sum, product) => sum + product.price * Math.max(1, product.reviews), 0);
    const rating = products.length ? products.reduce((sum, product) => sum + product.rating, 0) / products.length : 0;
    const topArtForms = [...new Set(products.map((product) => product.artForm))].map((name) => ({ name, count: products.filter((product) => product.artForm === name).length })).sort((a, b) => b.count - a.count);
    res.json({ totalProducts: products.length, totalRevenue: revenue, avgRating: rating.toFixed(1), totalOrders: products.reduce((sum, product) => sum + product.reviews, 0), topArtForms });
  } catch (error) {
    next(error);
  }
});

router.post('/products', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!text(body.name)) return res.status(400).json({ error: 'Product name is required' });
    const product = productFromInput({ ...body, id: makeId('prod') });
    const saved = await writeProduct(product);
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});

router.put('/products/:id', async (req, res, next) => {
  try {
    const product = await replaceProduct(req.params.id, req.body || {});
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    next(error);
  }
});

async function readOrders() {
  if (!db.isMongo()) return DEMO_ORDERS;
  try {
    return await db.find('orders', {});
  } catch (error) {
    console.warn('[marketplace] Order store unavailable; using the in-memory order queue.');
    return DEMO_ORDERS;
  }
}

async function writeOrder(order) {
  if (db.isMongo()) {
    try {
      return await db.insert('orders', order);
    } catch (error) {
      console.warn('[marketplace] Order write unavailable; saving the order in memory.');
    }
  }
  DEMO_ORDERS.push(order);
  return order;
}

router.get('/orders/:id', async (req, res, next) => {
  try {
    const order = (await readOrders()).find((item) => item.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    next(error);
  }
});

router.post('/orders', async (req, res, next) => {
  try {
    const body = req.body || {};
    const requestedItems = Array.isArray(body.items) && body.items.length
      ? body.items
      : body.productId ? [{ productId: body.productId, quantity: body.quantity || 1 }] : [];
    if (!requestedItems.length) return res.status(400).json({ error: 'At least one product is required' });
    const products = await readProducts();
    const items = [];
    for (const requested of requestedItems) {
      const product = products.find((item) => item.id === text(requested.productId));
      const quantity = Math.max(1, Math.floor(number(requested.quantity, 1)));
      if (!product) return res.status(404).json({ error: `Product not found: ${text(requested.productId)}` });
      if (product.stock < quantity) return res.status(409).json({ error: `${product.name} has only ${product.stock} left` });
      items.push({ productId: product.id, productName: product.name, quantity, unitPrice: product.price, artisanId: product.artisan.id });
    }
    const merged = [];
    for (const item of items) {
      const existing = merged.find((entry) => entry.productId === item.productId);
      if (existing) existing.quantity += item.quantity;
      else merged.push(item);
    }
    const totalPrice = merged.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const first = merged[0];
    const order = {
      id: makeId('order'),
      productId: first.productId,
      productName: merged.map((item) => item.productName).join(', '),
      artisanId: first.artisanId,
      items: merged,
      buyerName: text(body.buyerName, 'Guest buyer'),
      buyerEmail: text(body.buyerEmail),
      quantity: merged.reduce((sum, item) => sum + item.quantity, 0),
      unitPrice: first.unitPrice,
      totalPrice,
      currency: 'INR',
      status: 'pending',
      shippingAddress: text(body.shippingAddress),
      notes: text(body.notes),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await writeOrder(order);
    for (const item of merged) await replaceProduct(item.productId, { stock: Math.max(0, products.find((product) => product.id === item.productId).stock - item.quantity) });
    res.status(201).json({ order });
  } catch (error) {
    next(error);
  }
});

router.patch('/orders/:id/status', async (req, res, next) => {
  try {
    const allowed = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    const status = text(req.body?.status);
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid order status' });
    let order = null;
    if (db.isMongo()) {
      try {
        const existing = await db.findOne('orders', { id: req.params.id });
        if (existing) order = await db.update('orders', { id: req.params.id }, { status, updatedAt: new Date().toISOString() });
      } catch (error) {
        console.warn('[marketplace] Order status store unavailable; using the in-memory order queue.');
      }
    }
    if (!order) {
      const index = DEMO_ORDERS.findIndex((item) => item.id === req.params.id);
      if (index >= 0) {
        DEMO_ORDERS[index] = { ...DEMO_ORDERS[index], status, updatedAt: new Date().toISOString() };
        order = DEMO_ORDERS[index];
      }
    }
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
