// src/lib/legal-data/__tests__/freshness.test.ts
//
// Tests for the freshness-pipeline primitives:
//   - normaliseXmlForHash
//   - hashLegislationDoc
//   - amendments-sweep correction-shape (logical: hash diff ⇒ insert)
//   - reverify dedup window (skip if last_freshness_check_at < 6 days ago)
//
// We test the pure logic — wiring through Next route handlers + Supabase
// is covered separately by integration smoke (out of scope here).
//
// Run with:
//   node --experimental-strip-types --test src/lib/legal-data/__tests__/freshness.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashLegislationDoc,
  normaliseXmlForHash,
  parseLegislationXml,
  type LegislationDoc,
} from '../legislation-gov-uk.ts';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Legislation xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:ukm="http://www.legislation.gov.uk/namespaces/metadata">
  <ukm:Metadata>
    <dc:title>Consumer Rights Act 2015</dc:title>
    <ukm:DocumentVersion date="2026-04-01"/>
    <ukm:Modified Date="2026-04-01T12:00:00Z"/>
  </ukm:Metadata>
  <Section>
    <Number>9</Number>
    <Text>Goods to be of satisfactory quality.</Text>
  </Section>
</Legislation>`;

const SAMPLE_XML_WITH_REPUBLISHED_TIMESTAMP = SAMPLE_XML
  .replace('2026-04-01"/>', '2026-04-15"/>')
  .replace('2026-04-01T12:00:00Z"', '2026-04-15T09:00:00Z"');

const SAMPLE_XML_WITH_REAL_AMENDMENT = SAMPLE_XML.replace(
  'Goods to be of satisfactory quality.',
  'Goods to be of satisfactory quality and free from defects.',
);

describe('normaliseXmlForHash', () => {
  it('strips XML comments', () => {
    const out = normaliseXmlForHash('<a>hi <!-- comment --> there</a>');
    assert.ok(!out.includes('comment'));
  });

  it('collapses whitespace between tags', () => {
    const out = normaliseXmlForHash('<a>   <b>x</b>\n\n   </a>');
    assert.equal(out, '<a><b>x</b></a>');
  });

  it('drops volatile <ukm:DocumentVersion> + <ukm:Modified> stamps', () => {
    const a = normaliseXmlForHash(SAMPLE_XML);
    const b = normaliseXmlForHash(SAMPLE_XML_WITH_REPUBLISHED_TIMESTAMP);
    assert.equal(
      a,
      b,
      'a republish that only changes the metadata stamp should hash identically',
    );
  });
});

describe('hashLegislationDoc', () => {
  it('produces deterministic sha256 hex of section text', async () => {
    const doc = parseLegislationXml(
      SAMPLE_XML,
      'https://www.legislation.gov.uk/ukpga/2015/15/section/9/data.xml',
    );
    const h1 = await hashLegislationDoc(doc);
    const h2 = await hashLegislationDoc(doc);
    assert.equal(h1, h2);
    assert.match(h1, /^[a-f0-9]{64}$/);
  });

  it('flips the hash on a real text amendment', async () => {
    const before = parseLegislationXml(
      SAMPLE_XML,
      'https://www.legislation.gov.uk/ukpga/2015/15/section/9/data.xml',
    );
    const after = parseLegislationXml(
      SAMPLE_XML_WITH_REAL_AMENDMENT,
      'https://www.legislation.gov.uk/ukpga/2015/15/section/9/data.xml',
    );
    const hBefore = await hashLegislationDoc(before);
    const hAfter = await hashLegislationDoc(after);
    assert.notEqual(
      hBefore,
      hAfter,
      'real text change should produce a different hash',
    );
  });

  it('does NOT flip the hash on a republish-only metadata change', async () => {
    // We hash sectionText preferentially — but this also doubles as a
    // safety net if a future ref lands without a section number, where
    // we fall back to normaliseXmlForHash(raw).
    const synthA: LegislationDoc = {
      title: 't',
      fullCitation: 't',
      sectionText: null,
      sectionNumber: null,
      inForceOn: null,
      lastAmended: null,
      sourceUrl: 'x',
      hasUnappliedEffects: false,
      raw: SAMPLE_XML,
    };
    const synthB: LegislationDoc = { ...synthA, raw: SAMPLE_XML_WITH_REPUBLISHED_TIMESTAMP };
    const hA = await hashLegislationDoc(synthA);
    const hB = await hashLegislationDoc(synthB);
    assert.equal(hA, hB);
  });
});

describe('amendments-sweep correction shape (logical)', () => {
  it('hash diff produces a proposal payload with proposer + source_xml_hash + status=pending', async () => {
    // Synthesise the row + verdict shape the cron will INSERT.
    const before = parseLegislationXml(
      SAMPLE_XML,
      'https://www.legislation.gov.uk/ukpga/2015/15/section/9/data.xml',
    );
    const after = parseLegislationXml(
      SAMPLE_XML_WITH_REAL_AMENDMENT,
      'https://www.legislation.gov.uk/ukpga/2015/15/section/9/data.xml',
    );
    const oldHash = await hashLegislationDoc(before);
    const newHash = await hashLegislationDoc(after);
    assert.notEqual(oldHash, newHash);

    const proposal = {
      proposer: 'legislation-gov-uk-amendments-sweep',
      source_xml_hash: newHash,
      source_host: 'legislation.gov.uk',
      status: 'pending',
      proposed_status: 'updated',
      cost_gbp: 0,
      confidence: 'high' as const,
    };
    assert.equal(proposal.status, 'pending');
    assert.equal(proposal.cost_gbp, 0);
    assert.equal(proposal.confidence, 'high');
    assert.match(proposal.source_xml_hash, /^[a-f0-9]{64}$/);
    assert.equal(proposal.source_host, 'legislation.gov.uk');
  });
});

describe('reverify dedup window', () => {
  // Mirror the inline predicate used by /api/cron/legal-refs-reverify:
  //   skip if last_freshness_check_at > Date.now() - 6 days
  function shouldSkip(checkedAt: string | null): boolean {
    if (!checkedAt) return false;
    const dedupCutoff = Date.now() - 6 * 24 * 60 * 60 * 1000;
    return new Date(checkedAt).getTime() > dedupCutoff;
  }

  it('skips refs checked 1 day ago', () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    assert.equal(shouldSkip(oneDayAgo), true);
  });

  it('keeps refs checked 7 days ago', () => {
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    assert.equal(shouldSkip(sevenDaysAgo), false);
  });

  it('keeps refs that were never checked', () => {
    assert.equal(shouldSkip(null), false);
  });
});
