/**
 * Content-Disposition values that never throw.
 *
 * HTTP header values must be Latin-1 (ByteString). A filename with a
 * curly apostrophe, an en dash or an emoji made `new Response()` throw.
 * RFC 6266: send an ASCII `filename` fallback plus `filename*` with the
 * UTF-8 name percent-encoded (RFC 8187).
 */

/** ASCII-only version of a filename: accents dropped, everything else replaced. */
export function asciiFilename(name: string, fallback = 'download'): string {
  const ascii = (name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '')
    .replace(/[\u2013\u2014]/g, ' ')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return ascii && !/^[._ ]+$/.test(ascii) ? ascii.slice(0, 150) : fallback;
}

/** RFC 8187 percent-encoding for filename*. */
export function encodeRfc8187(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function contentDisposition(filename: string, type: 'attachment' | 'inline' = 'attachment'): string {
  return `${type}; filename="${asciiFilename(filename)}"; filename*=UTF-8''${encodeRfc8187(filename)}`;
}
