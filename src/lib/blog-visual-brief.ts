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
 * The mapping is intentionally concrete: every category resolves to a
 * specific symbolic subject that Imagen can render cleanly. We avoid
 * abstract phrases like "a sense of fairness" because Imagen interprets
 * those as generic geometric blobs. We also avoid common-noun subjects
 * Imagen routinely renders with hallucinated text on them — so e.g. for
 * "council tax" we say "a magnifying glass over a stylised property
 * valuation document" rather than "a council tax bill", because the
 * latter triggers Imagen to write fake numbers all over it.
 */

interface VisualBriefInput {
  title: string;
  keyword: string;
  category: string | null;
}

const CATEGORY_TO_SUBJECT: Record<string, string> = {
  energy:
    'a stylised lightning bolt and pound coin balanced over a shielded utility meter, mint and amber light flowing between them',
  utilities:
    'a stylised pound coin breaking out of a flowing utility cable, with mint sparks',
  fitness:
    'a sealed contract being unlocked by a stylised mint key over a dumbbell silhouette',
  council_tax:
    'a magnifying glass hovering over an abstract residential property valuation chart, mint highlights on the chart',
  debt:
    'a stylised broken chain link with a glowing pound coin emerging from the gap',
  parking:
    'a stylised parking permit ticket being torn diagonally with a mint glow on the tear edge',
  insurance:
    'an abstract shield made of layered overlapping documents with a mint pound-coin core',
  broadband:
    'a stylised wifi signal turning into a flowing pound coin trail, mint and amber gradient',
  mobile:
    'a stylised smartphone outline with a broken contract scroll spilling out, mint accent',
  credit:
    'a stylised credit card cracked diagonally with a mint pound coin escaping the crack',
  water:
    'a stylised water droplet with a pound symbol embedded inside, against a navy backdrop',
  nhs:
    'a stylised medical cross overlapping with a complaint scroll, calm clinical lighting',
  ppi:
    'an abstract bank vault door slightly ajar with a mint pound coin rolling out',
  transport:
    'a stylised railway track curving into a clock face, amber dawn light at the horizon',
  travel:
    'an abstract glowing flight path arcing across a stylised calendar grid with one date highlighted in amber',
  housing:
    'a stylised house silhouette with a key and a legal scroll crossed in front, mint accent',
  consumer:
    'a stylised shopping bag with a tilted scales-of-justice icon emerging from it, amber and mint',
  banking:
    'a stylised bank vault door opening with a mint pound coin floating out, dramatic side lighting',
  data:
    'an abstract digital lock dissolving into mint pixels with an amber key emerging',
  tax:
    'a stylised HMRC envelope with a mint pound coin escaping the seal, amber accent',
  finance:
    'an abstract upward-trending line graph piercing a stylised contract document, mint glow',
  pension:
    'a stylised hourglass with mint pound coins flowing through it, amber dawn light behind',
  trades:
    'a stylised hammer and wrench crossed over a folded blueprint scroll, mint highlights',
  benefits:
    'a stylised hand reaching toward a glowing mint document with an amber pound coin, side lighting',
  tv:
    'a stylised vintage TV outline with a mint pound coin spinning on its screen, amber backdrop',
  employment:
    'a stylised payslip document with a mint pound coin snapping a chain link beside it',
  default:
    'a stylised pound coin breaking through layered legal documents, mint and amber glow, dramatic angle',
};

/**
 * Pull a category from the post and resolve it to a concrete subject.
 * Falls back to a generic pound-coin-and-documents image if the
 * category is missing or unknown.
 */
export function buildVisualBrief({ title, keyword, category }: VisualBriefInput): string {
  const cat = (category || '').toLowerCase().trim();
  const subject = CATEGORY_TO_SUBJECT[cat] || CATEGORY_TO_SUBJECT.default;

  // Add a short topic-specific tail so two posts in the same category
  // don't end up with literally identical images (e.g. two energy posts
  // both rendering the same lightning + pound composition).
  const topicTail = title ? `, hinting at "${title}"` : keyword ? `, hinting at "${keyword}"` : '';

  return `${subject}${topicTail}`;
}
