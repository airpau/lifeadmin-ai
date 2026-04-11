require('dotenv').config({path: '.env.local'});
const Anthropic = require('@anthropic-ai/sdk');
async function test() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  console.log("Starting Claude ping...");
  const t0 = Date.now();
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', // Testing this exact model string!
      max_tokens: 100,
      messages: [{ role: 'user', content: 'test ping. reply ONLY with "pong"' }]
    });
    console.log("Response:", JSON.stringify(res, null, 2));
    console.log("Time:", Date.now() - t0, "ms");
  } catch(e) {
    console.error("Error:", e.message);
  }
}
test();
