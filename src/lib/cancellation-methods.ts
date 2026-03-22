/**
 * Cancellation methods database for UK providers.
 * Maps provider names to known cancellation methods.
 */

export interface CancellationInfo {
  provider: string;
  email?: string;
  phone?: string;
  url?: string;
  method: string; // primary cancellation method description
  tips?: string;
}

const CANCELLATION_DB: CancellationInfo[] = [
  // Streaming
  { provider: 'netflix', email: undefined, url: 'https://www.netflix.com/cancelplan', method: 'Cancel online via account settings', tips: 'Go to Account > Cancel Membership. You keep access until the end of your billing period.' },
  { provider: 'disney', email: undefined, url: 'https://www.disneyplus.com/account', method: 'Cancel online via account settings', tips: 'Account > Subscription > Cancel Subscription. If billed via Apple/Google, cancel through their app store.' },
  { provider: 'amazon prime', email: undefined, url: 'https://www.amazon.co.uk/gp/primecentral', method: 'Cancel online via Prime settings', tips: 'Go to Prime membership > End membership. You can get a refund if you haven\'t used Prime benefits.' },
  { provider: 'spotify', email: undefined, url: 'https://www.spotify.com/account/subscription/', method: 'Cancel online via account page', tips: 'Account > Subscription > Cancel Premium. Must be done on the website, not the app.' },
  { provider: 'apple', email: undefined, url: 'https://support.apple.com/en-gb/HT202039', method: 'Cancel via iPhone Settings or Apple ID', tips: 'Settings > [Your Name] > Subscriptions > select the subscription > Cancel.' },
  { provider: 'youtube', email: undefined, url: 'https://www.youtube.com/paid_memberships', method: 'Cancel online via YouTube settings', tips: 'Go to Paid memberships > Manage > Deactivate.' },
  { provider: 'now tv', email: undefined, url: 'https://account.nowtv.com/passes', method: 'Cancel online via account', tips: 'Account > Passes > Cancel pass. You keep access until the end of the paid period.' },
  { provider: 'plex', email: 'support@plex.tv', url: 'https://www.plex.tv/claim/', method: 'Cancel online or email support', tips: 'Account > Plex Pass > Cancel subscription.' },
  { provider: 'patreon', email: undefined, url: 'https://www.patreon.com/settings', method: 'Cancel online via membership settings', tips: 'Go to the creator\'s page > Manage > Edit or Cancel. You must cancel each creator individually.' },
  { provider: 'dazn', email: 'help@dazn.com', url: 'https://www.dazn.com/account', method: 'Cancel online or email support' },

  // Broadband & Telecoms
  { provider: 'sky', email: undefined, phone: '0333 7591 018', url: 'https://www.sky.com/shop/cancel/', method: 'Phone or online cancellation', tips: 'Sky requires 31 days notice. Call or use the online cancellation tool. Ask for a MAC code if switching broadband.' },
  { provider: 'virgin media', email: undefined, phone: '0345 454 1111', method: 'Phone only — no online cancellation', tips: 'Call to cancel. They will likely offer a retention deal. Ask for a final bill and return the router.' },
  { provider: 'bt', email: undefined, phone: '0800 800 150', url: 'https://www.bt.com/help/account/cancel', method: 'Phone or online', tips: 'BT requires 30 days notice. You can cancel via the app or by calling.' },
  { provider: 'vodafone', email: undefined, phone: '191 from Vodafone / 03333 040 191', method: 'Phone or app', tips: 'Call 191 or use the app. If out of contract, you can switch without cancelling first (auto-switch).' },
  { provider: 'communityfibre', email: 'support@communityfibre.co.uk', phone: '0800 082 0770', method: 'Email or phone', tips: '30 days notice required. Email or call to cancel.' },
  { provider: 'plusnet', email: undefined, phone: '0800 432 0200', method: 'Phone only', tips: 'Call to cancel. 30 days notice required.' },
  { provider: 'talktalk', email: undefined, phone: '0345 172 0088', method: 'Phone only', tips: 'Call to cancel. Check your contract end date first.' },

  // Mobile
  { provider: 'ee', email: undefined, phone: '150 from EE / 07953 966 250', method: 'Phone or text PAC to 65075', tips: 'Text PAC to 65075 to get your PAC code if switching. 30 days notice for cancellation.' },
  { provider: 'three', email: undefined, phone: '333 from Three / 0333 338 1001', method: 'Phone or text PAC to 65075', tips: 'Text PAC to 65075 for your PAC code. Or STAC to 75075 if keeping your number.' },
  { provider: 'o2', email: undefined, phone: '202 from O2 / 0344 809 0202', method: 'Phone or text PAC to 65075' },
  { provider: 'giffgaff', email: undefined, url: 'https://www.giffgaff.com/profile/details', method: 'Online — deactivate SIM in account settings', tips: 'No contract, no notice period. Just stop topping up or deactivate in account settings.' },
  { provider: 'lebara', email: 'support@lebara.co.uk', url: 'https://www.lebara.co.uk/my-lebara', method: 'Online account or email', tips: 'Cancel auto-renewal in My Lebara > Manage plan.' },

  // Utilities
  { provider: 'british gas', email: 'contactus@britishgas.co.uk', phone: '0333 202 9802', method: 'Phone, email, or switch via new supplier', tips: 'Easiest to switch via a comparison site — the new supplier handles the cancellation. Submit a final meter reading.' },
  { provider: 'eon', email: undefined, phone: '0345 052 0000', method: 'Phone or switch via new supplier', tips: 'Switch via comparison site or call to cancel. Provide a final meter reading.' },
  { provider: 'octopus energy', email: 'hello@octopus.energy', phone: '0808 164 1088', method: 'Email or phone', tips: 'Email is usually fastest. They respond within a few hours.' },
  { provider: 'ovo', email: 'hello@ovoenergy.com', phone: '0330 303 5063', method: 'Email or phone' },
  { provider: 'thames water', email: undefined, phone: '0800 316 9800', url: 'https://www.thameswater.co.uk/contact-us', method: 'Phone or online form', tips: 'You cannot switch water supplier. Contact to close account when moving home.' },

  // Insurance
  { provider: 'manypets', email: 'hello@manypets.com', phone: '0345 340 2498', method: 'Email or phone', tips: 'Cancel within 14 days for a full refund. After that, you may receive a pro-rata refund.' },
  { provider: 'admiral', email: undefined, phone: '0333 220 2000', method: 'Phone only', tips: 'Call to cancel. Ask about any cancellation fees.' },
  { provider: 'direct line', email: undefined, phone: '0345 246 8704', method: 'Phone only' },
  { provider: 'aviva', email: undefined, phone: '0800 051 5260', method: 'Phone only', tips: 'Call to cancel. 14-day cooling-off period applies for new policies.' },

  // Fitness
  { provider: 'puregym', email: undefined, url: 'https://www.puregym.com/login/', method: 'Online via account settings', tips: 'Log in > Manage Membership > Cancel. Must give notice before your next billing date.' },
  { provider: 'the gym', email: 'membersupport@thegymgroup.com', method: 'Email only', tips: 'Email to cancel. Must give 30 days notice.' },
  { provider: 'david lloyd', email: undefined, phone: 'Call your home club', method: 'In person or phone your club', tips: 'Requires written notice — visit your club or call. Check your contract minimum term.' },

  // Software
  { provider: 'experian', email: undefined, phone: '0344 481 0800', url: 'https://www.experian.co.uk/consumer/login/', method: 'Online or phone', tips: 'Log in > Account settings > Cancel subscription. Or call.' },
  { provider: 'adobe', email: undefined, url: 'https://account.adobe.com/plans', method: 'Online via account', tips: 'Account > Plans > Cancel plan. Early termination fee may apply if annual plan paid monthly.' },
  { provider: 'microsoft', email: undefined, url: 'https://account.microsoft.com/services', method: 'Online via Microsoft account', tips: 'Sign in > Services & subscriptions > Cancel.' },
  { provider: 'anthropic', email: 'support@anthropic.com', url: 'https://console.anthropic.com/settings/billing', method: 'Online or email', tips: 'Go to Console > Settings > Billing > Cancel plan.' },

  // Finance
  { provider: 'klarna', email: 'customer@klarna.co.uk', url: 'https://app.klarna.com/', method: 'App or email', tips: 'Open Klarna app > select the purchase > Cancel. For subscriptions, contact the merchant directly.' },

  // Food
  { provider: 'deliveroo', email: 'support@deliveroo.co.uk', url: 'https://deliveroo.co.uk/account', method: 'Online via account settings', tips: 'Account > Deliveroo Plus > Cancel. You keep access until the end of the billing period.' },
  { provider: 'just eat', email: undefined, url: 'https://www.just-eat.co.uk/account/details', method: 'Online via account settings' },
  { provider: 'hello fresh', email: 'hello@hellofresh.co.uk', phone: '0203 519 5882', method: 'Online, email, or phone', tips: 'Log in > Account settings > Cancel plan. Must cancel before the weekly deadline.' },
  { provider: 'gousto', email: 'hello@gousto.co.uk', url: 'https://www.gousto.co.uk/account', method: 'Online or email' },

  // Transport
  { provider: 'trainline', email: 'support@thetrainline.com', url: 'https://www.thetrainline.com/my-account', method: 'Online or email', tips: 'Account > Manage subscriptions. For refunds on unused tickets, request via the app.' },

  // Other
  { provider: 'whoop', email: 'support@whoop.com', url: 'https://app.whoop.com/membership', method: 'Online or email', tips: 'Membership > Cancel. Annual commitments may have early termination fees.' },
];

/**
 * Find cancellation info for a provider. Matches by normalised name.
 */
export function findCancellationMethod(providerName: string): CancellationInfo | null {
  const search = providerName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

  for (const entry of CANCELLATION_DB) {
    if (search.includes(entry.provider) || entry.provider.includes(search.split(' ')[0]?.toLowerCase())) {
      return entry;
    }
  }

  return null;
}
