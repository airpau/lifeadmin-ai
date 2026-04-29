# Email to Migle — 29 April 2026

**To:** migle.ivanauskaite@yapily.com
**Reply-on-thread:** the existing onboarding thread
**Subject:** `Re: Onboarding — banks, branding, build-review booked, one Hosted Pages question`
**Attach:** `public/yapily/paybacker-banner-centred-1200x400.png` + screenshots/Loom of the consent-extension prompt and the token-deletion screen

---

```
Hi Migle,

Thanks again for the call — onboarding plan and Vitally hub all clear,
and the Hosted Pages tutorial answered most of my questions. Quick
status from our side:

We've started the Hosted Pages migration. The new POST /hosted/consent-
requests + GET /hosted/consent-requests/{id} flow is wired up behind
a feature flag (default off), with abandonment polling between 5 and
15 minutes per the tutorial. The renew-consent and disconnect-consent
bugs we discussed on the call are also fixed — disconnect now calls
DELETE /account-auth-requests/{consentId}, not just our local DB.

Three asks for you, then one open question:

1. Live test banks — please add NatWest (personal) and HSBC (business)
   to our app. Two-bank cap noted; this combo covers retail and
   business in one go and matches the personas we'll demo on the
   build review.

2. Hosted Pages branding — attached:
     • paybacker-banner-centred-1200x400.png (logo)
     • Brand colours: primary navy #0f172a, accent gold #f59e0b,
       white text
     • Loom showing the consent-extension prompt and the token-
       deletion screen [link]

3. Build-review meeting — booked via your Calendly for Wed 13 May.
   Confirmation should be in your inbox; let me know if I need to
   move it. We'll be flag-on in staging by then with the full UAT
   pass already run.

No outstanding questions on our side — pulled the OpenAPI for
/hosted/consent-requests and confirmed featureScope goes inside the
accountRequest field (mirrored back as accountRequestDetails on the
GET). We're now passing the full ACCOUNT_DIRECT_DEBITS /
ACCOUNT_PERIODIC_PAYMENTS / ACCOUNT_SCHEDULED_PAYMENTS scope set so
the upcoming-payments feature works on day one.

Cheers,
Paul
```

---

## What's actually attached / linked

- `public/yapily/paybacker-banner-centred-1200x400.png` — recommended for the Hosted Pages logo upload.
- A short Loom (record before sending — 60 seconds, narrate the two screens she needs):
  1. Consent-extension prompt: from `/dashboard/money-hub` → click "Renew bank consent" on a connection in `expiring_soon` status → show the modal copy + the API call landing.
  2. Token-deletion: from `/dashboard/money-hub` → click "Disconnect bank" → show the confirm modal → submit → show the connection disappearing.

If neither is easy to demo on the live site right now (renew-consent is fixed but needs a connection in `expiring_soon` to trigger), record the dev path instead and call that out in the Loom.

## After Migle replies

- She enables Hosted Pages scope (already promised on the call) + adds the 2 banks + uploads the logo.
- We add `featureScope` to `createHostedConsentRequest` if her answer is "yes pass a field" — probably a small follow-up commit on the same branch.
- We schedule the staging flag-flip for ~Mon 5 May once everything's ready.
