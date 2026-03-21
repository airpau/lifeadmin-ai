# Google OAuth — Verification Checklist

Follow these steps in Google Cloud Console to submit Paybacker for OAuth verification.

## 1. Open OAuth Consent Screen

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Select your Paybacker project
3. Navigate to **APIs & Services → OAuth consent screen**

## 2. Fill in App Information

| Field | Value |
|---|---|
| App name | Paybacker |
| User support email | hello@paybacker.co.uk |
| App homepage URL | https://paybacker.co.uk |
| App privacy policy URL | https://paybacker.co.uk/legal/privacy |
| App terms of service URL | https://paybacker.co.uk/legal/terms |
| Authorised domains | paybacker.co.uk |
| Developer contact email | hello@paybacker.co.uk |

## 3. Add Scopes

Under **Scopes**, add the following:

| Scope | Purpose |
|---|---|
| `openid` | Basic OpenID Connect |
| `https://www.googleapis.com/auth/userinfo.email` | Read user's email address |
| `https://www.googleapis.com/auth/userinfo.profile` | Read basic profile info |
| `https://www.googleapis.com/auth/gmail.readonly` | Scan inbox for bills and subscriptions |

> **Note**: `gmail.readonly` is a sensitive scope and triggers manual verification.

## 4. Add Authorised Redirect URI

In **APIs & Services → Credentials → OAuth 2.0 Client IDs**, ensure the following redirect URI is set:

```
https://paybacker.co.uk/api/auth/callback/google
```

Also add for local development:
```
http://localhost:3000/api/auth/callback/google
```

## 5. Submit for Verification

1. Click **Publish App** to move from Testing to Production mode
2. Google will prompt you to submit for verification (required for `gmail.readonly`)
3. Complete the verification form:
   - Describe how and why you use Gmail data
   - Explain that data is used only for scanning for bills, subscriptions, and refund opportunities on behalf of the authenticated user
   - Data is not stored beyond what's needed to surface opportunities in the dashboard
4. **Attach a demo video** showing the full Gmail scan flow:
   - User clicks "Connect Gmail"
   - OAuth consent screen is shown with scopes
   - User approves
   - Dashboard shows discovered bills/subscriptions from inbox
   - Video must be unlisted on YouTube or a direct download link

## 6. Verification Tips

- Google typically takes **4–6 weeks** for sensitive scope verification
- Ensure your privacy policy explicitly mentions Gmail data usage
- Keep test users active while awaiting verification (up to 100 test users allowed)
- You can add `aireypaul@googlemail.com` and beta testers as test users in the meantime

## 7. Current OAuth Config in Code

- Auth initiation: `src/app/api/auth/google/route.ts`
- Callback handler: `src/app/api/auth/callback/google/route.ts`
- Gmail helpers: `src/lib/gmail.ts`

Redirect URI used in code: `https://paybacker.co.uk/api/auth/callback/google`
