/**
 * Deterministic visual-brief generator for blog post hero images.
 *
 * The publish-blog cron asks Claude to author a per-post visual brief
 * (`imagePrompt` field in its JSON output). That works for fresh posts
 * because Claude has the full topic context, but legacy posts (anything
 * authored before the image-generation feature shipped 2026-04-27) have
 * no brief — the backfill endpoint synthesises one from category +
 * keyword + title using this module.
 *
 * Subject choice rules (learned the hard way 2026-04-27 when Imagen
 * generated calendar grids with garbled numbers, payslips with fake
 * Latin, and clocks with backward digits):
 *
 *   1. NO subjects with inherent text/numbers — calendars, clocks,
 *      payslips, charts, blueprints, signage, documents, screens.
 *      Imagen will hallucinate garbled glyphs on any of these no
 *      matter how many times the prompt says "no text".
 *   2. Smooth solid surfaces only — pound coins, keys, locks, vault
 *      doors, paper airplanes, hourglasses, lightning bolts, chains,
 *      tools, scales of justice, hands, droplets, sun/moon shapes.
 *   3. Each subject must be readable at thumbnail size — single bold
 *      metaphor, not a busy collage. Two objects max.
 *   4. The metaphor has to land in 0.5 seconds. A user scanning the
 *      blog index shouldn't have to interpret abstract shapes.
 */

interface VisualBriefInput {
  title: string;
  keyword: string;
  category: string | null;
}

const CATEGORY_TO_SUBJECT: Record<string, string> = {
  energy:
    'a glowing mint lightning bolt fused with a polished gold pound coin, splitting apart with amber sparks',
  utilities:
    'a polished gold pound coin breaking out of a coiled mint utility cable, amber glow at the break point',
  fitness:
    'a glowing mint key turning inside an open padlock, with a small dumbbell shape behind it',
  council_tax:
    'a stylised house silhouette balanced precariously on a tilted set of mint scales of justice, amber glow underneath',
  debt:
    'a heavy iron chain link breaking apart in mid-air, a polished gold pound coin escaping through the gap with amber light',
  parking:
    'a glowing amber traffic cone tilted forward with a mint pound coin balanced on its tip',
  insurance:
    'a layered mint shield held aloft by amber light beams, a small gold pound coin embedded in its centre',
  broadband:
    'a stylised mint wifi signal arc dissolving into a flowing trail of gold pound coins, amber gradient',
  mobile:
    'a smooth smartphone silhouette with a mint chain link snapping out of its top edge, amber glow',
  credit:
    'a smooth mint credit card cracked diagonally in mid-air, a gold pound coin escaping through the crack',
  water:
    'a single large mint water droplet with a polished gold pound coin floating inside it',
  nhs:
    'a stylised mint medical cross hovering over an open hand, amber light radiating outward',
  ppi:
    'a heavy gold vault door slightly ajar, a mint pound coin rolling out toward the viewer',
  transport:
    'a glowing mint railway signal lamp against a dark dawn sky with amber light spilling from the lens',
  travel:
    'a stylised paper airplane curving upward through a mint cloud bank toward a glowing amber sun',
  housing:
    'a polished mint key crossed over a wooden front door, amber light glowing from the keyhole',
  consumer:
    'a stylised mint shopping bag tilted forward with a gold pound coin spilling from inside, amber glow',
  banking:
    'a heavy gold vault door swinging open, a single polished mint pound coin floating in the doorway, dramatic side lighting',
  data:
    'a glowing mint padlock dissolving into floating amber pixels, a single key emerging from the cloud',
  tax:
    'a polished gold pound coin breaking through a mint wax seal, amber rays bursting outward',
  finance:
    'a smooth mint piggy bank silhouette cracked diagonally in mid-air, a gold pound coin escaping through the crack with amber glow',
  pension:
    'a polished hourglass with mint pound coins flowing through its narrow neck, amber dawn light behind it',
  trades:
    'a polished mint hammer crossed with a gold wrench in mid-air, amber sparks at the crossing point',
  benefits:
    'a stylised open hand reaching upward with a glowing mint pound coin floating just above the palm, amber rim light',
  tv:
    'a smooth retro TV silhouette with a glowing mint pound coin hovering over its blank dark screen, amber rim light',
  employment:
    'a polished gold pound coin pulled out of a sealed mint envelope by a stylised hand, amber glow at the seal',
  subscriptions:
    'a stack of polished mint subscription cards fanned out diagonally with a single gold pound coin floating above the top card, amber rim light',
  'money-saving':
    'a polished mint piggy bank silhouette with several gold pound coins orbiting around it like planets, amber glow at the centre',
  benefits_v2:
    'a stylised open hand reaching upward with a glowing mint pound coin floating just above the palm, amber rim light',
  default:
    'a polished gold pound coin breaking through a smooth mint barrier, amber light bursting outward, dramatic angle',
};

/**
 * Build a brief that pairs a category-specific subject with a tail
 * referencing the post title — keeps two posts in the same category
 * from rendering identical images.
 */
export function buildVisualBrief({ title, keyword, category }: VisualBriefInput): string {
  const cat = (category || '').toLowerCase().trim();
  const subject = CATEGORY_TO_SUBJECT[cat] || CATEGORY_TO_SUBJECT.default;

  // Topic tail intentionally framed as "evoking the feeling of …" not
  // "labelled with …" so Imagen doesn't try to embed the title as text
  // on the image. Keep it short.
  const focus = title || keyword;
  const topicTail = focus ? `, the composition evokes the feeling of ${focus.toLowerCase()}` : '';

  return `${subject}${topicTail}`;
}
