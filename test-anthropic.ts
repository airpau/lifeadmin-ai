import Anthropic from '@anthropic-ai/sdk';

async function test() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'sk-ant-test-key' });
  try {
    console.log("Sending ping request...");
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hello' }],
    // Add a 2 second timeout manually to test network behavior if needed, but SDK will handle it
    }, { timeout: 3000 });
    console.log(res);
  } catch (err: any) {
    console.log("Caught Error Name:", err.name);
    console.log("Caught Error Msg:", err.message);
  }
}
test();
