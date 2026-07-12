const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { SYSTEM_PROMPT } = require('./system-prompt');

admin.initializeApp();

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

exports.checkIdea = onCall({ secrets: [anthropicApiKey], region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'יש להתחבר כדי להשתמש בתכונה הזו');
  }

  const messages = request.data && request.data.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpsError('invalid-argument', 'חסרות הודעות בשיחה');
  }

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey.value(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });
  } catch (err) {
    console.error('Network error calling Anthropic API:', err);
    throw new HttpsError('unavailable', 'לא ניתן להתחבר כרגע לשירות ה-AI, נסי שוב בעוד רגע');
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error('Anthropic API error:', response.status, errText);
    throw new HttpsError('internal', 'שגיאה בפנייה ל-AI, נסי שוב');
  }

  const data = await response.json();
  const reply = (data.content && data.content[0] && data.content[0].text) || '';
  return { reply };
});
