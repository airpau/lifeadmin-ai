// Stripe Dashboard sends webhooks to /api/webhooks/stripe
// Re-export the handler from the canonical location
export { POST } from '@/app/api/stripe/webhook/route';
export const runtime = 'nodejs';
