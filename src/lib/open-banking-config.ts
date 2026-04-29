export const OPEN_BANKING_PROVIDER = process.env.OPEN_BANKING_PROVIDER || 'truelayer';
export const isTrueLayer = OPEN_BANKING_PROVIDER === 'truelayer';
export const isYapily = OPEN_BANKING_PROVIDER === 'yapily';
