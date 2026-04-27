/**
 * Subject-matched gradient + emoji for blog post cards.
 *
 * Replaces the old `i % 5` round-robin pool that picked random
 * visuals — a flight-delay article could end up with a council-tax
 * gavel ⚖, an energy article with a plane ✈. Now each category
 * has its own colourway so the visual matches the post.
 *
 * Categories follow the `blog_posts.category` set used by the
 * publish-blog cron (see TOPIC_POOL in
 * src/app/api/cron/publish-blog/route.ts). New categories can be
 * added here without breaking older posts — anything unknown falls
 * through to DEFAULT.
 */

export interface BlogIcon {
  bg: string;
  emoji: string;
}

const CATEGORY_MAP: Record<string, BlogIcon> = {
  energy:        { bg: 'linear-gradient(135deg, #F59E0B, #D97706)', emoji: '⚡' },
  broadband:     { bg: 'linear-gradient(135deg, #3B82F6, #1D4ED8)', emoji: '📡' },
  mobile:        { bg: 'linear-gradient(135deg, #06B6D4, #0891B2)', emoji: '📱' },
  insurance:     { bg: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', emoji: '🛡' },
  travel:        { bg: 'linear-gradient(135deg, #0EA5E9, #0369A1)', emoji: '✈' },
  transport:     { bg: 'linear-gradient(135deg, #14B8A6, #0F766E)', emoji: '🚆' },
  housing:       { bg: 'linear-gradient(135deg, #84CC16, #4D7C0F)', emoji: '🏠' },
  council_tax:   { bg: 'linear-gradient(135deg, #6366F1, #4338CA)', emoji: '🏛' },
  tax:           { bg: 'linear-gradient(135deg, #6366F1, #4338CA)', emoji: '🏛' },
  water:         { bg: 'linear-gradient(135deg, #0EA5E9, #075985)', emoji: '💧' },
  parking:       { bg: 'linear-gradient(135deg, #F97316, #C2410C)', emoji: '🅿' },
  fitness:       { bg: 'linear-gradient(135deg, #EC4899, #BE185D)', emoji: '🏋' },
  debt:          { bg: 'linear-gradient(135deg, #F43F5E, #BE123C)', emoji: '💷' },
  credit:        { bg: 'linear-gradient(135deg, #F43F5E, #BE123C)', emoji: '💳' },
  banking:       { bg: 'linear-gradient(135deg, #10B981, #047857)', emoji: '🏦' },
  consumer:      { bg: 'linear-gradient(135deg, #34D399, #059669)', emoji: '✉' },
  data:          { bg: 'linear-gradient(135deg, #64748B, #334155)', emoji: '🔒' },
  employment:    { bg: 'linear-gradient(135deg, #A855F7, #6B21A8)', emoji: '⚖' },
  ppi:           { bg: 'linear-gradient(135deg, #F43F5E, #BE123C)', emoji: '💷' },
  nhs:           { bg: 'linear-gradient(135deg, #2563EB, #1E3A8A)', emoji: '🏥' },
  tv:            { bg: 'linear-gradient(135deg, #DC2626, #991B1B)', emoji: '📺' },
};

const DEFAULT: BlogIcon = {
  bg: 'linear-gradient(135deg, #34D399, #059669)',
  emoji: '✉',
};

export function blogIconFor(category: string | null | undefined): BlogIcon {
  if (!category) return DEFAULT;
  const key = category.toLowerCase().replace(/[\s-]/g, '_');
  return CATEGORY_MAP[key] ?? DEFAULT;
}
