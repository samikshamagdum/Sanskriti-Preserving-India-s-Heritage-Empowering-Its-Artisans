const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters long');
}

const SECRET = process.env.JWT_SECRET;

function sign(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role || 'user' }, SECRET, { expiresIn: '7d' });
}

function verify(token) {
  return jwt.verify(token, SECRET);
}

function hash(pw) {
  return bcrypt.hashSync(pw, 10);
}

function compare(pw, hashStr) {
  return bcrypt.compareSync(pw, hashStr);
}

module.exports = { sign, verify, hash, compare, SECRET };