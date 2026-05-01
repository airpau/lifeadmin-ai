// src/lib/legal-data/__tests__/legislation-gov-uk.test.ts
//
// Tests for the legislation.gov.uk fetcher. Mirrors the style of
// src/lib/legal-refs-authority.test.ts so the project keeps a single
// test-runner story (node:test, no jest/vitest dep).
//
// Run with:
//   node --experimental-strip-types --test src/lib/legal-data/__tests__/legislation-gov-uk.test.ts

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  fetchStatuteByUri,
  isLegislationGovUkUrl,
  parseAtomFeed,
  parseLegislationXml,
  toXmlUri,
} from '../legislation-gov-uk.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = join(__dirname, 'fixtures', 'cra-2015-s9.xml');
const FIXTURE_XML = readFileSync(FIXTURE_PATH, 'utf8');

describe('toXmlUri', () => {
  it('appends /data.xml to a section URL', () => {
    assert.equal(
      toXmlUri('https://www.legislation.gov.uk/ukpga/2015/15/section/9'),
      'https://www.legislation.gov.uk/ukpga/2015/15/section/9/data.xml',
    );
  });
  it('is idempotent when /data.xml is already there', () => {
    assert.equal(
      toXmlUri('https://www.legislation.gov.uk/ukpga/2015/15/section/9/data.xml'),
      'https://www.legislation.gov.uk/ukpga/2015/15/section/9/data.xml',
    );
  });
  it('strips /data.feed before appending /data.xml', () => {
    assert.equal(
      toXmlUri('https://www.legislation.gov.uk/ukpga/2015/15/data.feed'),
      'https://www.legislation.gov.uk/ukpga/2015/15/data.xml',
    );
  });
  it('accepts Akoma-Ntoso bare paths', () => {
    assert.equal(
      toXmlUri('/ukpga/2015/15/section/9'),
      'https://www.legislation.gov.uk/ukpga/2015/15/section/9/data.xml',
    );
  });
  it('rejects non-legislation hosts', () => {
    assert.equal(toXmlUri('https://www.example.com/ukpga/2015/15'), null);
    assert.equal(toXmlUri('https://gov.uk/some/page'), null);
  });
});

describe('isLegislationGovUkUrl', () => {
  it('matches both www and apex hosts', () => {
    assert.equal(isLegislationGovUkUrl('https://www.legislation.gov.uk/ukpga/2015/15'), true);
    assert.equal(isLegislationGovUkUrl('https://legislation.gov.uk/ukpga/2015/15'), true);
  });
  it('rejects other hosts', () => {
    assert.equal(isLegislationGovUkUrl('https://gov.uk/foo'), false);
    assert.equal(isLegislationGovUkUrl('https://evil.legislation.gov.uk.fake.com/x'), false);
    assert.equal(isLegislationGovUkUrl(null), false);
    assert.equal(isLegislationGovUkUrl(''), false);
  });
});

describe('parseLegislationXml — Consumer Rights Act 2015 s.9 fixture', () => {
  const sourceUrl = 'https://www.legislation.gov.uk/ukpga/2015/15/section/9/data.xml';
  const doc = parseLegislationXml(FIXTURE_XML, sourceUrl);

  it('extracts the document title from <dc:title>', () => {
    assert.equal(doc.title, 'Consumer Rights Act 2015');
  });

  it('derives the section number from the source URL', () => {
    assert.equal(doc.sectionNumber, '9');
  });

  it('builds a full citation with the section number', () => {
    assert.equal(doc.fullCitation, 'Consumer Rights Act 2015, section 9');
  });

  it('extracts the section text body', () => {
    assert.ok(doc.sectionText, 'sectionText should be populated');
    assert.match(
      doc.sectionText!,
      /quality of the goods is satisfactory/i,
      'section body should include the canonical s.9(1) language',
    );
    assert.match(
      doc.sectionText!,
      /reasonable person/i,
      'section body should include s.9(2) language',
    );
  });

  it('flags pending unapplied effects', () => {
    assert.equal(doc.hasUnappliedEffects, true);
  });

  it('captures last-amended date from <ukm:Modified>', () => {
    assert.equal(doc.lastAmended, '2024-04-06');
  });

  it('preserves the canonical sourceUrl', () => {
    assert.equal(doc.sourceUrl, sourceUrl);
  });

  it('keeps the raw XML for downstream hashing', () => {
    assert.equal(doc.raw, FIXTURE_XML);
  });
});

describe('parseAtomFeed', () => {
  it('returns [] for empty feed input', () => {
    assert.deepEqual(parseAtomFeed('<feed></feed>'), []);
  });
  it('extracts entries with title and link', () => {
    const xml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom" xmlns:ukm="http://www.legislation.gov.uk/namespaces/metadata">
        <entry>
          <title>Consumer Rights Act 2015</title>
          <link href="https://www.legislation.gov.uk/ukpga/2015/15"/>
          <published>2015-03-26T00:00:00Z</published>
          <ukm:Year Value="2015"/>
          <ukm:Number Value="15"/>
          <ukm:DocumentMainType Value="UnitedKingdomPublicGeneralAct"/>
        </entry>
      </feed>`;
    const out = parseAtomFeed(xml);
    assert.equal(out.length, 1);
    assert.equal(out[0].title, 'Consumer Rights Act 2015');
    assert.equal(out[0].url, 'https://www.legislation.gov.uk/ukpga/2015/15');
    assert.equal(out[0].year, 2015);
    assert.equal(out[0].number, 15);
  });
});

describe('fetchStatuteByUri — mocked fetch', () => {
  const realFetch = globalThis.fetch;
  before(() => {
    globalThis.fetch = (async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url ?? '';
      if (url.endsWith('/data.xml')) {
        return new Response(FIXTURE_XML, {
          status: 200,
          headers: { 'content-type': 'application/xml' },
        });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;
  });
  after(() => {
    globalThis.fetch = realFetch;
  });

  it('returns a parsed LegislationDoc for a legislation.gov.uk URL', async () => {
    const doc = await fetchStatuteByUri(
      'https://www.legislation.gov.uk/ukpga/2015/15/section/9',
    );
    assert.ok(doc, 'expected a LegislationDoc');
    assert.equal(doc!.title, 'Consumer Rights Act 2015');
    assert.equal(doc!.sectionNumber, '9');
    assert.match(doc!.sectionText ?? '', /satisfactory/i);
  });

  it('returns null for non-authority hosts', async () => {
    const doc = await fetchStatuteByUri('https://example.com/ukpga/2015/15/section/9');
    assert.equal(doc, null);
  });

  it('uses the supplied cache to dedupe repeat fetches', async () => {
    let calls = 0;
    const counting: typeof fetch = (async (...args: Parameters<typeof fetch>) => {
      calls += 1;
      return realFetch
        ? new Response(FIXTURE_XML, { status: 200 })
        : new Response(FIXTURE_XML, { status: 200 });
    }) as typeof fetch;
    globalThis.fetch = counting;
    const cache = new Map();
    const a = await fetchStatuteByUri(
      'https://www.legislation.gov.uk/ukpga/2015/15/section/9',
      { cache },
    );
    const b = await fetchStatuteByUri(
      'https://www.legislation.gov.uk/ukpga/2015/15/section/9',
      { cache },
    );
    assert.ok(a && b);
    assert.equal(calls, 1, 'second call should hit cache');
  });
});

// Network-touching integration test. Skipped by default — flip the
// describe.skip to describe to run against the live legislation.gov.uk
// service when iterating locally.
describe.skip('fetchStatuteByUri — live network (Consumer Rights Act 2015 s.9)', () => {
  it('hits the real legislation.gov.uk endpoint', async () => {
    const doc = await fetchStatuteByUri(
      'https://www.legislation.gov.uk/ukpga/2015/15/section/9',
      { timeoutMs: 15_000 },
    );
    assert.ok(doc, 'expected a real fetch to return a doc');
    assert.match(doc!.title, /Consumer Rights Act 2015/i);
    assert.equal(doc!.sectionNumber, '9');
    assert.ok(doc!.sectionText && doc!.sectionText.length > 0);
  });
});
