const express = require('express');
const { authRequired } = require('./middleware');
const db = require('../utils/db');
const router = express.Router();

// Per-user daily limit for AI identify/describe
const LIMITS = new Map();

function dailyLimit(req, res, next) {
  const key = req.user ? u: : ip:;
  const today = new Date().toISOString().slice(0, 10);
  const k = ${key}:;
  const count = (LIMITS.get(k) || 0) + 1;
  if (count > 20) {
    return res.status(429).json({ error: 'Daily AI limit reached' });
  }
  LIMITS.set(k, count);
  next();
}

module.exports = { dailyLimit };