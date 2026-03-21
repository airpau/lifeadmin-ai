# TASK: Open Banking Integration (TrueLayer)

Build the full TrueLayer Open Banking integration for Paybacker. This is the last hard launch blocker.

## Overview
Allow users to connect their UK bank account via TrueLayer OAuth. Sync 12 months of transactions. Auto-detect subscriptions/recurring payments from bank data. Merge with email-detected subscriptions in the Subscription Tracker.

---

## 1. Supabase Migrations

Create supabase/migrations/20260321130000_open_banking.sql:

```sql
-- Bank connections table
CREATE TABLE IF NOT EXISTS bank_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL,
  provider_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  account_ids TEXT[], -- array of connected account IDs
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bank connections" ON bank_connections
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Bank transactions table
CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  connection_id UUID REFERENCES bank_connections(id) ON DELETE CASCADE NOT NULL,
  transaction_id TEXT NOT NULL, -- TrueLayer transaction ID
  account_id TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL, -- positive = credit, negative = debit
  currency TEXT DEFAULT 'GBP',
  description TEXT,
  merchant_name TEXT,
  category TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_group TEXT, -- merchant name normalised for grouping
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, transaction_id)
);

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own transactions" ON bank_transactions
  USING (auth.uid() = user_id);

-- Index for recurring detection queries
CREATE INDEX idx_bank_transactions_user_merchant ON bank_transactions(user_id, merchant_name);
CREATE INDEX idx_bank_transactions_user_timestamp ON bank_transactions(user_id, timestamp DESC);
```

---

## 2. TrueLayer OAuth Flow

### Environment variables needed (add to .env.local.example):
```
TRUELAYER_CLIENT_ID=
TRUELAYER_CLIENT_SECRET=
TRUELAYER_REDIRECT_URI=https://paybacker.co.uk/api/auth/callback/truelayer
# For sandbox testing:
# TRUELAYER_AUTH_URL=https://auth.truelayer-sandbox.com
# TRUELAYER_API_URL=https://api.truelayer-sandbox.com
# For production:
TRUELAYER_AUTH_URL=https://auth.truelayer.com
TRUELAYER_API_URL=https://api.truelayer.com
```

### src/app/api/auth/truelayer/route.ts
GET endpoint that redirects user to TrueLayer consent screen:
```
${TRUELAYER_AUTH_URL}/?response_type=code
  &client_id=${TRUELAYER_CLIENT_ID}
  &scope=info accounts balance cards transactions offline_access
  &redirect_uri=${TRUELAYER_REDIRECT_URI}
  &providers=uk-ob-all uk-oauth-all
  &state=${userId} (base64 encoded user ID for CSRF)
```

### src/app/api/auth/callback/truelayer/route.ts
GET endpoint handling the OAuth callback:
1. Verify state param matches user session
2. Exchange code for tokens (POST to ${TRUELAYER_AUTH_URL}/connect/token)
3. Fetch accounts list (GET ${TRUELAYER_API_URL}/data/v1/accounts)
4. Store connection in bank_connections table (encrypt tokens using SUPABASE_SERVICE_ROLE_KEY as salt — or just store as-is for MVP)
5. Trigger initial transaction sync (call the sync function)
6. Redirect to /dashboard/subscriptions?connected=true

---

## 3. Transaction Sync

### src/app/api/bank/sync/route.ts
POST endpoint to sync transactions for a user:
1. Authenticate user via Supabase
2. Fetch their active bank_connections
3. For each connection, for each account:
   - GET ${TRUELAYER_API_URL}/data/v1/accounts/{account_id}/transactions?from={12_months_ago}&to={today}
   - If token expired, attempt refresh (POST to ${TRUELAYER_AUTH_URL}/connect/token with grant_type=refresh_token)
   - Upsert transactions into bank_transactions table (ignore duplicates via UNIQUE constraint)
4. Run recurring detection (see section 4)
5. Update last_synced_at on the connection
6. Return { synced: N, recurring_detected: M }

### src/lib/truelayer.ts
Helper library:
- `getAccessToken(connection)` — returns valid token, refreshes if expired
- `fetchTransactions(accessToken, accountId, fromDate)` — calls TrueLayer API
- `fetchAccounts(accessToken)` — lists accounts for a connection
- `refreshToken(connection)` — exchanges refresh token for new access token, updates DB

---

## 4. Recurring Payment Detection

### src/lib/detect-recurring.ts
After syncing transactions, run this analysis:

Algorithm:
1. Group transactions by normalised merchant name (lowercase, strip Ltd/Limited/PLC etc.)
2. For each merchant group with 2+ transactions:
   - Check if amounts are consistent (within 10% variance)
   - Check if intervals are regular (weekly/monthly/quarterly — within 5 day tolerance)
   - If both true → mark as recurring (is_recurring = true, recurring_group = normalised name)
3. For each detected recurring merchant, check if already in user's subscriptions table
   - If not present → create a new subscription record with source='bank'
   - If present with source='email' → update with bank confirmation

Export function: `detectRecurring(userId: string, supabase: SupabaseClient): Promise<number>`
Returns count of new recurring payments detected.

---

## 5. Dashboard: Bank Connection UI

### src/app/dashboard/subscriptions/page.tsx — update

Add a "Connect Bank" section at the top of the subscriptions page (above the existing subscription list):

- If no bank connection: show a card with:
  - "🏦 Connect your bank for automatic detection"
  - "We use TrueLayer (FCA regulated) to securely read your transactions. We never store your credentials."
  - "Connect Bank Account" button → GET /api/auth/truelayer
  - Logos of supported banks (Barclays, HSBC, Lloyds, NatWest, Santander, Monzo, Starling — text list is fine)

- If connected: show a green badge "Bank connected — last synced [time]" with a "Sync Now" button (POST /api/bank/sync) and "Disconnect" link

- If ?connected=true in URL: show a success toast "Bank connected! We've synced your last 12 months of transactions."

### src/app/api/bank/disconnect/route.ts
POST endpoint:
- Authenticate user
- Update bank_connections status to 'revoked' for user's connections
- Return { ok: true }

---

## 6. Updated Subscription Tracker

In the subscriptions page list, add a "source" badge on each subscription:
- Bank-detected: show 🏦 badge
- Email-detected: show 📧 badge  
- Manual: show ✏️ badge
- Both bank + email: show both badges

The subscriptions data already comes from the subscriptions table — bank-detected ones will be in there after sync with source='bank', so the list automatically shows them.

---

## NOTES
- TypeScript throughout, follow existing patterns
- For MVP, store TrueLayer tokens as plaintext (note in code: "TODO: encrypt tokens in production")
- Use 'use client' only where needed (Sync Now button, Connect Bank button need interactivity)
- Error handling: if TrueLayer API fails, log error but don't crash — return partial results
- The TRUELAYER_REDIRECT_URI for local dev should be http://localhost:3000/api/auth/callback/truelayer — add a note in the code
- Do NOT use any TrueLayer npm package — call their REST API directly with fetch()
- Add all new env vars to .env.local.example (don't touch .env.local itself)

When completely finished, run: openclaw system event --text "Done: Paybacker TrueLayer Open Banking integration built" --mode now
