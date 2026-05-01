# WhatsApp adapter

Provider-agnostic WhatsApp Business sender. Switch providers via the `WHATSAPP_PROVIDER` env var — the rest of the app never knows which one is in use.

## Usage

```ts
import { sendWhatsAppText, sendWhatsAppTemplate } from '@/lib/whatsapp';

await sendWhatsAppText({ to: '+447700900123', text: 'Hello from Paybacker' });

await sendWhatsAppTemplate({
  to: '+447700900123',
  templateName: 'paybacker_alert_price_increase',
  parameters: ['Adobe', '17.50'],
});
```

## Env vars

### Always
- `WHATSAPP_PROVIDER` — `'twilio'` (default) or `'meta'`

### Twilio (sprint default)
- `TWILIO_ACCOUNT_SID` — from console.twilio.com
- `TWILIO_AUTH_TOKEN` — from console.twilio.com
- `TWILIO_WHATSAPP_FROM` — sandbox is `whatsapp:+14155238886`; production is `whatsapp:+447XXXXXXXXX`
- `TWILIO_WEBHOOK_URL` — full https URL of `/api/whatsapp/webhook` (used for signature verification)
- `TWILIO_TEMPLATE_<NAME>` — optional; ContentSid for an approved Twilio template (e.g. `TWILIO_TEMPLATE_PAYBACKER_ALERT_PRICE_INCREASE`). Omit and the adapter falls back to a plain-text send with positional substitution (sandbox-friendly).

### Meta Cloud API (post-approval)
- `WHATSAPP_API_TOKEN` — permanent system-user access token from Meta Business
- `WHATSAPP_PHONE_NUMBER_ID` — Phone Number ID, NOT the phone number itself
- `WHATSAPP_BUSINESS_ACCOUNT_ID` — WABA ID
- `WHATSAPP_VERIFY_TOKEN` — arbitrary string you set during webhook configuration (echo for the GET handshake)
- `WHATSAPP_APP_SECRET` — Meta app secret for X-Hub-Signature-256 verification

## Switching providers

```bash
# Sprint default (Twilio sandbox)
WHATSAPP_PROVIDER=twilio

# Once Meta is approved
WHATSAPP_PROVIDER=meta
```

No code change needed. Redeploy and the next message routes via the new provider.

## Webhook URL

Configure both providers to POST to:

```
https://lifeadmin-ai.vercel.app/api/whatsapp/webhook
```

For Meta, also set the same URL as the Webhook GET endpoint with your `WHATSAPP_VERIFY_TOKEN`.

## Files

- `index.ts` — provider selector + convenience wrappers
- `types.ts` — shared interface
- `twilio-provider.ts` — Twilio backend
- `meta-provider.ts` — Meta Cloud API backend

The user-bot brain (Claude tool calling, same tools as Telegram) lands in `user-bot.ts` once the Telegram port is reviewed — see `src/lib/telegram/user-bot.ts` for the template.
