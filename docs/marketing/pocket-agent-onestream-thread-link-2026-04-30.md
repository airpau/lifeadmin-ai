# Pocket Agent — Email-thread linking, end-to-end (30 April 2026)

A real founder-on-Paybacker walkthrough showing the WhatsApp Pocket
Agent linking an existing email thread to an open dispute, then
extracting concrete legal arguments and money figures from the
attached correspondence.

The agent (a) found 5 candidate threads across two connected inboxes,
(b) ranked them with a clear most-likely match, (c) linked the chosen
thread to the dispute on confirmation, (d) read the full 13-message
thread, (e) summarised the offer / counter-offer / legal grounds, and
(f) named the concrete next-step deadline (FCA 8-week clock) — all
inside WhatsApp.

This is one of the cleanest illustrations of why the Pocket Agent +
email-watchdog pairing is a Pro-tier feature: the customer never
opens the dashboard or the email client. They run the entire
correspondence audit from chat.

## Conversation

> **User**
> For my open onestream dispute can you link the latest OneStream
> email in my info@airproperty.co.uk inbox as the latest email in
> the thread as this shows my latest response to their offer of
> compensation

> **Pocket Agent**
> Here are the matching threads I found. Since you want the one
> from your info@airproperty.co.uk inbox, the best match looks like:
>
> **Option 2** — Onestream Technical Support from
> tickets@onestream.co.uk (28 Apr, 13 messages) in
> **info@airproperty.co.uk** ✅
>
> There's also Option 5 (Engineer Appointment Confirmed) from
> info@airproperty.co.uk but that's just 1 message.
>
> Which would you like me to link? Reply with the number (1–5) 😊

> **User**
> What are all the options?

> **Pocket Agent**
> Here are all 5 options:
>
> 1. Complaints Onestream — complaints@onestream.co.uk · 28 Apr · 10 msgs (in aireypaul@googlemail.com)
> 2. Onestream Technical Support — tickets@onestream.co.uk · 28 Apr · 13 msgs (in info@airproperty.co.uk) ✅ your preferred inbox
> 3. Onestream - Technical Support — tickets@onestream.co.uk · 8 Apr · 19 msgs (in aireypaul@googlemail.com)
> 4. Total loss of service — customerservices@onestream.co.uk · 26 Mar · 1 msg (in aireypaul@googlemail.com)
> 5. Engineer Appointment Confirmed — noreply@onestream.co.uk · 23 Apr · 1 msg (in info@airproperty.co.uk)
>
> Since you want your latest response to their offer from
> info@airproperty.co.uk, option **2** looks the best match (13 messages,
> most recent). Which would you like to link? 😊

> **User**
> Yes I believe it's option 2

> **Pocket Agent**
> ✅ **Linked!** The thread "Onestream Technical Support" from your
> info@airproperty.co.uk inbox is now attached to your OneStream
> dispute.
>
> The 13-message thread will appear in the dispute timeline within
> 30 minutes as the watchdog syncs it.

> **User**
> Can you confirm what my last response was in that thread and
> what their response was that I replied to?

> **Pocket Agent**
> Got it — I've read through the full thread. Here's a summary of
> the last exchange:
>
> 📨 **OneStream's latest offer (28/04/2026 — from their complaints team):**
>
> They confirmed service was restored and offered:
> - 🏠 Flat 1 — 35 days down → £68.31 (1.5 months credit)
> - 🏠 Flat 2 — 17 days down → £38.65 (1 month credit)
> - 💰 Total: £106.96 as account credit
>
> ✍️ **Your last response (28/04/2026 — your 16th formal letter):**
>
> You **rejected the £106.96 offer in full**, arguing:
> - The compensation is a **legal right under Consumer Rights Act
>   2015 (ss.54–56)**, not a goodwill gesture
> - You demanded pro-rata credits, wasted journey costs (2 wasted
>   days attending the property), and consequential losses
> - You cited OneStream's failure to participate in **Ofcom's
>   Automatic Compensation Scheme** as a factor
>
> So the dispute is currently sitting with **OneStream awaiting
> their response** to your rejection letter. The FCA 8-week clock
> started 26/03/2026 — that takes you to **~20 May 2026**, so
> you're very close to being able to go straight to the
> **Ombudsman Services: Communications** if they don't respond
> satisfactorily.
>
> Want me to draft a follow-up or prepare the ombudsman referral? 📋

## Notable moments worth highlighting

- **Cross-inbox candidate ranking** — agent surfaces threads from
  both connected inboxes, defers to the user's stated preference,
  and explicitly flags the option in the preferred inbox.
- **Confirmation gate before mutating state** — link only happens
  after the user picks. No silent attachment.
- **Watchdog handoff** — agent doesn't claim instant sync; tells the
  user the watchdog will populate the dispute timeline within 30
  minutes.
- **Concrete legal grounding** — once linked, agent cites CRA 2015
  ss.54–56 and Ofcom Automatic Compensation Scheme by name.
- **Deadline awareness** — agent computes the 20 May 2026 FCA 8-week
  cutoff and offers the next concrete escalation route (Ombudsman
  Services: Communications).

## What it taught us — Pocket Agent quoting bug

The follow-up turn ("can you confirm the full amount I requested in
my email?") exposed a real bug. The agent's first answer calculated
pro-rata from OneStream's offer figures (~£74.87) instead of
extracting the user's actual demand from the linked letter. Only on
user push-back ("closer to £500") did it re-read the correspondence
properly and surface the Ofcom-day-rate argument totalling ~£500+.

That bug is being patched in a follow-up PR — the rule going
forward is: when the user asks "what did I write" / "what did I
demand", the engine MUST quote/extract from the linked email body,
not infer from other context. See the corresponding fix PR for
detail.

## Use cases this snippet supports

- LinkedIn post #6 ("Four ways UK fintechs are using /v1/disputes")
  — the same pattern works behind their CX agent UI.
- LinkedIn post #5 ("Five things UK households are entitled to but
  don't claim") — Ofcom Automatic Compensation Scheme is a high-
  intent example.
- Sales decks for the WhatsApp Pocket Agent Pro tier — concrete proof
  the chat surface alone takes a household from "I have an open
  dispute" to "I have a referral plan with a deadline".

> Founder note (Paul, 30 April 2026): the email-thread linking is
> exactly the kind of feature most users wouldn't think to ask for
> but find indispensable once they have it. Save this for the next
> Pro-tier launch deck.
