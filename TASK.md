# TASK: Stripe New Account — Awareness + Verification Tasks

## Context: New Stripe Account Configured (21 Mar 2026)

A new Stripe account has been set up. The following was configured externally and you should be aware:

**New Stripe credentials (already in Vercel + .env.local):**
- STRIPE_SECRET_KEY: sk_test_51TDPl18FbRNalJNU... (test mode)
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: pk_test_51TDPl18FbRNalJNU...
- STRIPE_WEBHOOK_SECRET: [REDACTED-WEBHOOK]

**New price IDs (already updated in src/lib/stripe.ts and webhook route):**
- essential_monthly: price_1TDPoH8FbRNalJNU4KeEPNs7 (£9.99/mo)
- essential_yearly:  price_1TDPoI8FbRNalJNUSVBFOpyA (£99/yr)
- pro_monthly:       price_1TDPoI8FbRNalJNUDAepvxYt (£19.99/mo)
- pro_yearly:        price_1TDPoI8FbRNalJNUEVzsBMvB (£199/yr)

**Products:**
- Essential: prod_UBnPRWPbxBHAvC
- Pro: prod_UBnPkSdmvGoAWR

**Webhook:** configured at https://paybacker.co.uk/api/stripe/webhook
**Customer Portal:** configured and active (bpc_1TDPpA8FbRNalJNUSgOqnriD)

## YOUR TASKS

### TASK 1: End-to-end Stripe checkout verification

Test the complete checkout flow to confirm it works with the new account:

1. Check that src/app/pricing/page.tsx is passing the correct price IDs from PRICE_IDS in src/lib/stripe.ts to the checkout API
2. Check that src/app/api/stripe/checkout/route.ts is creating sessions correctly
3. Add a simple checkout test by verifying the API creates a valid session (you can do this by reading the code and confirming the flow, no need to actually call Stripe)
4. Check the webhook handler covers all these events:
   - checkout.session.completed ✅
   - customer.subscription.updated ✅  
   - customer.subscription.deleted ✅
   - customer.subscription.paused ✅
   - invoice.payment_failed ✅
   - invoice.payment_succeeded ✅
   If any are missing, add them.

### TASK 2: Stripe checkout — add 7-day free trial properly

The trial was added previously but verify it's correctly implemented in src/app/api/stripe/checkout/route.ts:

The checkout session should include:
```typescript
subscription_data: {
  trial_period_days: 7,
},
```

And on the pricing page, update the CTA buttons to say "Start free trial" instead of just "Get started" or "Subscribe".

### TASK 3: Update pricing page to reflect trial

In src/app/pricing/page.tsx:
- Add "7-day free trial" badge on Essential and Pro plans
- Update CTA button text to "Start 7-day free trial"
- Add small print under each paid plan: "No card required during trial. Cancel anytime."
- Make sure the free plan CTA says "Get started free" (no trial language)

### TASK 4: Verify NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is used correctly

Search the codebase for where the publishable key is used (likely in a Stripe.js loadStripe() call). Make sure it references process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY and not a hardcoded old key.

## NOTES
- Run `npm run build` when done to confirm no errors
- Commit all changes with message: "feat: Stripe new account wired, trial messaging, pricing page updated"

When completely finished, run: openclaw system event --text "Done: Stripe new account verified, trial messaging, pricing page updated" --mode now
