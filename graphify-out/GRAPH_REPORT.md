# Graph Report - lifeadmin-ai  (2026-04-24)

## Corpus Check
- 588 files · ~2,693,904 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1677 nodes · 2852 edges · 48 communities detected
- Extraction: 81% EXTRACTED · 19% INFERRED · 0% AMBIGUOUS · INFERRED: 555 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]

## God Nodes (most connected - your core abstractions)
1. `GET()` - 386 edges
2. `POST()` - 237 edges
3. `getAdmin()` - 117 edges
4. `update()` - 65 edges
5. `executeToolCall()` - 59 edges
6. `createClient()` - 55 edges
7. `DELETE()` - 37 edges
8. `fmt()` - 35 edges
9. `create()` - 27 edges
10. `PATCH()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `handleBillUpload()` --calls--> `test()`  [INFERRED]
  src/app/dashboard/complaints/page.tsx → test-claude.js
- `loadAlerts()` --calls--> `GET()`  [INFERRED]
  extension/side-panel/App.tsx → src/app/api/outlook/auth/route.ts
- `getSupabase()` --calls--> `createClient()`  [INFERRED]
  agent-server/src/tools/support-tools.ts → src/lib/supabase/server.ts
- `check()` --calls--> `GET()`  [INFERRED]
  test-api.js → src/app/api/outlook/auth/route.ts
- `test()` --calls--> `create()`  [INFERRED]
  test-anthropic.ts → src/components/dispute/EmailDisputeFinder.tsx

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (100): findCancellationMethod(), buildEmail(), sendChurnEmail(), buildContractEndEmail(), sendContractEndAlert(), extractAndSaveEndDates(), buildDealAlertEmail(), findDealOpportunities() (+92 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (86): checkAndAlertCeiling(), getTodayApiCallCount(), sendTelegramAlert(), generateComplaintLetter(), buildBrandedPrompt(), generateSocialImage(), hasMarketingConsent(), sendMetaEvent() (+78 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (26): getCompanyBySlug(), async(), buildAwinUrl(), copyCode(), CountdownTimer(), daysUntil(), formatDate(), formatGBP() (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (83): updateLead(), calculateOpportunityScore(), updateUserOpportunityScore(), update(), hashContent(), verifyRegulatorRule(), verifyStatute(), applyTxSpaceFilter() (+75 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (51): authorizeAdminOrCron(), getAdmin(), notifyAgents(), notifyFounderInstruction(), assessAllSubscriptions(), assessSubscription(), getAdmin(), getMonthlyPrice() (+43 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (37): isCreditProduct(), calculateBorrowPillar(), calculateHealthScore(), calculatePlanPillar(), calculateSavePillar(), calculateSpendPillar(), handlePreviewGenerate(), cleanMerchantName() (+29 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (34): abandonChallenge(), checkChallengeProgress(), completeChallenge(), getAdmin(), getAvailableChallenges(), getUserChallenges(), startChallenge(), getAdmin() (+26 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (40): check(), handleKeyDown(), sendMessage(), cleanEmailBody(), EmailCorrespondenceBody(), firstNLines(), detectEnergyBill(), detectHmrcCorrespondence() (+32 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (41): checkAuthStatus(), loadAlerts(), admin(), EmailConnectionAuthError, ensureFreshToken(), extractGmailBody(), fetchDomainMessages(), fetchGmailThread() (+33 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (34): handleKeyDown(), sendQuestion(), authenticateWithGoogle(), authenticateWithMicrosoft(), generateCodeChallenge(), generateCodeVerifier(), getStoredTokens(), getValidTokens() (+26 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (30): checkOverdueGoals(), getGoalStats(), getSupabase(), getAllowedToolNames(), getToolsForAgent(), handler(), executeTool(), getAllTools() (+22 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (11): signOut(), handleDownload(), handleSignOut(), fetchSavedReports(), handleDeleteAccount(), handleGenerateReport(), handleManageBilling(), handleSaveProfile() (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (23): normaliseSubject(), searchImapCandidates(), decryptPassword(), discoverImapSettings(), encryptPassword(), getEncryptionKey(), getProviderName(), getProviderNote() (+15 more)

### Community 13 - "Community 13"
Cohesion: 0.1
Nodes (17): amountBand(), countActiveSubscriptions(), filterActiveSubscriptions(), disconnectBank(), dismissBill(), dismissFacItem(), fetchData(), fetchExpectedBills() (+9 more)

### Community 14 - "Community 14"
Cohesion: 0.1
Nodes (25): checkClaudeRateLimit(), costPerMToken(), getAdmin(), getLimit(), getTimeKey(), getUserTier(), logClaudeCall(), recordClaudeCall() (+17 more)

### Community 15 - "Community 15"
Cohesion: 0.16
Nodes (24): applyGoldTierReward(), awardPoints(), calculateTier(), checkAndAwardBadges(), checkPointsExpiry(), getAdmin(), getCurrentMonth(), getLoyaltyStatus() (+16 more)

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (21): buildNormalizedIncomeBreakdown(), isExcludedIncomeType(), matchesIncomeTypeFilter(), normalizeIncomeTypeKey(), buildMoneyHubOverrideMaps(), detectFallbackIncomeType(), detectFallbackSpendingCategory(), detectIncomeType() (+13 more)

### Community 17 - "Community 17"
Cohesion: 0.12
Nodes (19): amountsConsistent(), categoriseTransaction(), detectCycle(), detectRecurring(), extractMerchantFromDescription(), normaliseMerchant(), decrypt(), encrypt() (+11 more)

### Community 18 - "Community 18"
Cohesion: 0.15
Nodes (12): acceptAll(), getConsent(), hasConsent(), hasConsentBeenGiven(), rejectAll(), setConsent(), handleAcceptAll(), handleOpen() (+4 more)

### Community 19 - "Community 19"
Cohesion: 0.24
Nodes (15): inQuietHours(), loadUserRouting(), resolveChannels(), sendEmail(), sendNotification(), sendPush(), sendTelegram(), archiveOverflow() (+7 more)

### Community 20 - "Community 20"
Cohesion: 0.27
Nodes (11): addDays(), classifyCadence(), computeConfidence(), detectRecurringUpcoming(), groupTransactions(), mad(), medianOf(), normaliseCounterparty() (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (1): Page()

### Community 22 - "Community 22"
Cohesion: 0.42
Nodes (9): buildOAuthHeader(), generateOAuthSignature(), getCredentials(), getMentions(), likeTweet(), percentEncode(), postTweet(), replyToTweet() (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.22
Nodes (1): postViaLate()

### Community 24 - "Community 24"
Cohesion: 0.25
Nodes (3): authHeader(), getPendingTransactions(), yapilyGet()

### Community 26 - "Community 26"
Cohesion: 0.52
Nodes (6): createSession(), getApiKey(), getSession(), headers(), listSessions(), sendTaskMessage()

### Community 27 - "Community 27"
Cohesion: 0.47
Nodes (3): handleRedeem(), loadChallenges(), loadData()

### Community 29 - "Community 29"
Cohesion: 0.4
Nodes (2): deriveCrumb(), getActiveKey()

### Community 30 - "Community 30"
Cohesion: 0.47
Nodes (3): handleDrop(), handleFile(), handleInputChange()

### Community 31 - "Community 31"
Cohesion: 0.47
Nodes (4): isDealValid(), isPriceAlertValid(), parseComparisonDeals(), priceAlertAnnualImpact()

### Community 32 - "Community 32"
Cohesion: 0.6
Nodes (5): buildActionButtons(), buildAlertLine(), fmt(), queueTelegramAlert(), sendBatchedDigest()

### Community 33 - "Community 33"
Cohesion: 0.7
Nodes (4): configPath(), main(), readConfig(), runSetup()

### Community 34 - "Community 34"
Cohesion: 0.4
Nodes (1): MarkNav()

### Community 35 - "Community 35"
Cohesion: 0.7
Nodes (4): Footer(), Logo(), sendEmail(), sendIntelligentUpdate()

### Community 40 - "Community 40"
Cohesion: 0.6
Nodes (4): buildAssessmentRow(), confidenceBadge(), scoreColor(), sendOverchargeAlert()

### Community 46 - "Community 46"
Cohesion: 0.67
Nodes (2): handleSyncNow(), loadConnection()

### Community 47 - "Community 47"
Cohesion: 0.67
Nodes (2): fetchThreads(), onSearchSubmit()

### Community 49 - "Community 49"
Cohesion: 0.67
Nodes (2): getEnvVar(), validateConfig()

### Community 50 - "Community 50"
Cohesion: 0.67
Nodes (2): buildRenewalEmail(), sendRenewalReminder()

### Community 51 - "Community 51"
Cohesion: 0.67
Nodes (2): buildPriceIncreaseEmail(), sendPriceIncreaseAlert()

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (2): getSupplierByDomain(), isKnownSupplier()

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (2): call(), runTool()

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (2): loadConfig(), requireEnv()

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (2): getAccessToken(), googleAdsQuery()

### Community 56 - "Community 56"
Cohesion: 0.67
Nodes (1): Loading()

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (2): getSpendMeta(), titleCaseLabel()

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (2): handleRecategorise(), loadData()

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (2): getCatMeta(), titleCaseCategory()

## Knowledge Gaps
- **Thin community `Community 21`** (12 nodes): `Page()`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (9 nodes): `checkIPFraud()`, `generateImageFal()`, `generateVideoFal()`, `generateVideoRunway()`, `getPostMetrics()`, `postViaLate()`, `queryPostHog()`, `searchPerplexity()`, `content-apis.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (6 nodes): `deriveCrumb()`, `getActiveKey()`, `Icon()`, `initials()`, `tierLabel()`, `DashboardShell.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (5 nodes): `MarkFoot()`, `MarkNav()`, `page.tsx`, `page.tsx`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (4 nodes): `handleDisconnect()`, `handleSyncNow()`, `loadConnection()`, `GoogleSheetsConnect.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (4 nodes): `fetchThreads()`, `onSearchSubmit()`, `pickThread()`, `EmailDisputeFinder.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (4 nodes): `getEnvVar()`, `isConfigured()`, `validateConfig()`, `config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (4 nodes): `buildRenewalEmail()`, `isScheduledPayment()`, `sendRenewalReminder()`, `renewal-reminders.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (4 nodes): `buildAlertRow()`, `buildPriceIncreaseEmail()`, `sendPriceIncreaseAlert()`, `price-increase-alerts.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (3 nodes): `supplier-registry.ts`, `getSupplierByDomain()`, `isKnownSupplier()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (3 nodes): `server.ts`, `call()`, `runTool()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (3 nodes): `config.ts`, `loadConfig()`, `requireEnv()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (3 nodes): `google-ads-tools.ts`, `getAccessToken()`, `googleAdsQuery()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (3 nodes): `Loading()`, `loading.tsx`, `loading.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (3 nodes): `getSpendMeta()`, `titleCaseLabel()`, `OverviewPanel.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (3 nodes): `handleRecategorise()`, `loadData()`, `CategoryDrillDownModal.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (3 nodes): `getCatMeta()`, `titleCaseCategory()`, `SpendingPanel.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GET()` connect `Community 0` to `Community 1`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 11`, `Community 12`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 19`, `Community 20`, `Community 22`, `Community 23`, `Community 24`, `Community 26`, `Community 32`, `Community 35`, `Community 40`, `Community 50`, `Community 51`?**
  _High betweenness centrality (0.434) - this node is a cross-community bridge._
- **Why does `POST()` connect `Community 1` to `Community 0`, `Community 32`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 10`, `Community 12`, `Community 14`, `Community 15`, `Community 17`, `Community 19`, `Community 22`?**
  _High betweenness centrality (0.185) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Community 4` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 10`, `Community 14`, `Community 15`, `Community 16`, `Community 17`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Are the 139 inferred relationships involving `GET()` (e.g. with `DELETE()` and `check()`) actually correct?**
  _`GET()` has 139 INFERRED edges - model-reasoned connections that need verification._
- **Are the 73 inferred relationships involving `POST()` (e.g. with `createClient()` and `create()`) actually correct?**
  _`POST()` has 73 INFERRED edges - model-reasoned connections that need verification._
- **Are the 64 inferred relationships involving `update()` (e.g. with `run()` and `checkOverdueGoals()`) actually correct?**
  _`update()` has 64 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._