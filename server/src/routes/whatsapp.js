const express = require('express');
const router = express.Router();
const wa = require('../services/whatsapp');
const { authRequired } = require('../utils/middleware');

// Webhook verification: GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=...
// In production the VERIFY_TOKEN must be an env var shared with the provider.
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  if (mode === 'subscribe' && token === (process.env.WHATSAPP_VERIFY_TOKEN || 'sanskriti-demo')) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

// Incoming webhook (currently echo / demo handler; provider payload format arrives later).
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const text = body.text || body.message || '';
    const stateId = body.stateId || '';
    const reply = await wa.handleIncoming({ text, stateId });
    return res.json({ ...reply, receivedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: 'Webhook processing failed', detail: e.message });
  }
});

// Demo conversation starter for the frontend MVP (no real WhatsApp required).
router.get('/demo', (req, res) => {
  res.json({
    contact: 'Sanskriti',
    greeting: wa.greeting(),
    fact: wa.dailyFact ? '(loaded lazily on the client)' : '',
    buttons: wa.interactiveButtons()
  });
});

// Simulated conversation for the visual MVP.
router.post('/demo/chat', async (req, res) => {
  const { text, stateId } = req.body || {};
  // Return both the assistant reply and a "typing" first message for realism.
  const reply = await wa.handleIncoming({ text, stateId });
  res.json({ reply, messageId: Date.now().toString(36) });
});

module.exports = router;