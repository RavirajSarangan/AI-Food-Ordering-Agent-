const express = require('express');
const router = express.Router();

// Middleware to verify ElevenLabs webhook secret to protect backend tools
const verifyAgentSecret = (req, res, next) => {
  const secretHeader = req.headers['x-elevenlabs-secret'] || req.headers['authorization'];
  const expectedSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;

  // For development, if secret is not set, allow request
  if (!expectedSecret || expectedSecret === 'dummy_webhook_secret') {
    return next();
  }

  if (secretHeader === expectedSecret || secretHeader === `Bearer ${expectedSecret}`) {
    return next();
  }

  return res.status(401).json({ success: false, error: "Unauthorized. Invalid ElevenLabs secret." });
};

// POST /api/agent/session
// Requests a signed conversation session URL from ElevenLabs for secure mobile client connection
router.post('/agent/session', async (req, res) => {
  try {
    const { userId, userName } = req.body;
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!agentId || agentId === 'dummy_agent_id') {
      return res.status(400).json({
        success: false,
        error: "ELEVENLABS_AGENT_ID is not configured on the server."
      });
    }

    if (!apiKey || apiKey === 'dummy_elevenlabs_key') {
      return res.status(400).json({
        success: false,
        error: "ELEVENLABS_API_KEY is not configured on the server."
      });
    }

    // Call ElevenLabs to request a signed session URL
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        // Pass dynamic variables for the agent prompt context
        body: JSON.stringify({
          dynamic_variables: {
            userId: userId || 'anonymous_user',
            userName: userName || 'Customer'
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: `ElevenLabs API error: ${errorText}`
      });
    }

    const data = await response.json();
    res.json({
      success: true,
      signedUrl: data.signed_url
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/agent/verify-webhook
// Quick check endpoint to test webhook auth settings
router.get('/agent/verify-webhook', verifyAgentSecret, (req, res) => {
  res.json({ success: true, message: "Webhook secret verified successfully." });
});

module.exports = {
  router,
  verifyAgentSecret
};
