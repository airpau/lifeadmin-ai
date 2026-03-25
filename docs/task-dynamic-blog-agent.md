# Task: Dynamic Blog Publishing via AI Agent

## Status: SCHEDULED FOR NEXT SESSION

## Problem
Current blog publishing uses a static pool of 12 topics that rotate. This will get repetitive and miss timely opportunities (new regulations, seasonal trends, viral consumer stories).

## Solution
Give Casey (CCO) the research tool (Perplexity) and a blog publishing tool so she can:

1. Research trending UK consumer topics via Perplexity every Mon/Wed/Fri
2. Identify the most topical angle (new energy price cap announcement, airline cancellation news, broadband price rise season, etc.)
3. Cross-reference with existing blog_posts table to avoid duplicates
4. Write a fresh, research-backed blog post with current data and news hooks
5. Publish directly to the blog_posts table
6. Include relevant affiliate deal links from our 56 deals
7. Email the founder a notification with the published post

## Implementation Steps

1. Add 'research' to Casey's toolGroups in registry.ts
2. Add a 'publish_blog_post' tool to the content-tools.ts that inserts into blog_posts table
3. Update Casey's system prompt to include blog publishing instructions:
   - Research trending UK consumer topics via web_research tool
   - Write 800-1200 word posts with UK law references
   - Include practical advice, slightly humorous tone
   - Target a specific SEO keyword
   - Include affiliate deal links where relevant
   - Check existing posts to avoid duplicate topics
4. Create an agent_task assigned to Casey that runs Mon/Wed/Fri
5. Remove the static cron at /api/cron/publish-blog once Casey is handling it

## Dependencies
- Casey needs: research tool (Perplexity), content tool (already has), publish_blog_post tool (new)
- Perplexity API key already configured on Railway

## Estimated Build Time
1-2 hours

## Priority
HIGH - blog content is a key SEO driver and the static pool will exhaust within 4 weeks
