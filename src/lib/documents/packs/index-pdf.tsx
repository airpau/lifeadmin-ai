/**
 * The index PDF at the front of every pack, drawn with
 * @react-pdf/renderer on the server (the package is in Next's default
 * server external list, so it is not bundled).
 *
 * Sections: cover, checklist (found and missing), summary sections from
 * the pack definition, a timeline where the pack has one, the list of
 * files in the ZIP (number, date, type, supplier, amount, file name) and,
 * for dispute evidence, the text of each letter and reply as exhibits.
 *
 * The built-in Helvetica font only covers Latin-1 (WinAnsi), so every
 * string goes through pdfText() first: curly quotes and dashes become
 * plain ones and anything else outside the set becomes "?". The pound
 * sign is inside the set.
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { ChecklistResult, SummarySection, TimelineEntry } from '@/lib/documents/packs/types';

export interface IndexFileRow {
  seq: string;
  date: string;
  type: string;
  supplier: string;
  amount: string;
  fileName: string;
  note?: string | null;
}

export interface IndexExhibit {
  ref: string;
  heading: string;
  dated: string;
  body: string;
}

export interface PackIndexModel {
  title: string;
  packName: string;
  audience: string;
  description: string;
  generatedOn: string;
  checklist: ChecklistResult[];
  summary: SummarySection[];
  timeline: TimelineEntry[];
  files: IndexFileRow[];
  exhibits: IndexExhibit[];
  notes: string[];
  footnote: string | null;
}

// WinAnsi extras above U+00FF that Helvetica can draw.
const WIN_ANSI_EXTRA = new Set(['\u20ac', '\u2022', '\u2122', '\u0152', '\u0153', '\u0160', '\u0161', '\u0178', '\u017d', '\u017e', '\u0192']);

/** Text Helvetica can draw. */
export function pdfText(v: string | null | undefined): string {
  if (!v) return '';
  const s = v
    .replace(/[\u2018\u2019\u201a\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    out += code <= 0xff || WIN_ANSI_EXTRA.has(ch) ? ch : '?';
  }
  return out;
}

const ink = '#0B1220';
const soft = '#374151';
const muted = '#6B7280';
const brand = '#059669';
const danger = '#B91C1C';
const line = '#E5E7EB';
const wash = '#F9FAFB';

const s = StyleSheet.create({
  page: { padding: 40, paddingBottom: 56, fontFamily: 'Helvetica', fontSize: 9.5, color: soft },
  brand: { fontSize: 10, color: brand, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: ink, marginBottom: 6 },
  sub: { fontSize: 11, color: soft, marginBottom: 4 },
  meta: { fontSize: 9, color: muted, marginBottom: 2 },
  h2: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: ink, marginTop: 18, marginBottom: 8 },
  para: { fontSize: 9.5, lineHeight: 1.45, marginBottom: 4 },
  box: { backgroundColor: wash, borderLeftWidth: 3, borderLeftColor: brand, padding: 10, marginTop: 14 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: line, paddingVertical: 4 },
  head: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: ink, paddingBottom: 3, marginBottom: 2 },
  th: { fontFamily: 'Helvetica-Bold', color: ink, fontSize: 8.5 },
  td: { fontSize: 8.5 },
  found: { color: brand, fontFamily: 'Helvetica-Bold' },
  missing: { color: danger, fontFamily: 'Helvetica-Bold' },
  optional: { color: muted, fontFamily: 'Helvetica-Bold' },
  exhibitBody: { fontSize: 8.5, lineHeight: 1.4, color: soft },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 7.5, color: muted, flexDirection: 'row', justifyContent: 'space-between' },
});

function Footer({ title }: { title: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{pdfText(title)}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function Table({ columns, rows, widths, alignRight = [] }: { columns: string[]; rows: string[][]; widths: number[]; alignRight?: number[] }) {
  return (
    <View>
      <View style={s.head}>
        {columns.map((c, i) => (
          <Text key={i} style={[s.th, { width: `${widths[i]}%`, textAlign: alignRight.includes(i) ? 'right' : 'left', paddingRight: alignRight.includes(i) ? 10 : 4 }]}>
            {pdfText(c)}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={s.row} wrap={false}>
          {r.map((cell, i) => (
            <Text key={i} style={[s.td, { width: `${widths[i]}%`, textAlign: alignRight.includes(i) ? 'right' : 'left', paddingRight: alignRight.includes(i) ? 10 : 4 }]}>
              {pdfText(cell)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function evenWidths(n: number): number[] {
  if (n === 4) return [40, 16, 22, 22];
  return Array.from({ length: n }, () => Math.floor(100 / n));
}

function IndexDocument({ m }: { m: PackIndexModel }) {
  const required = m.checklist.filter((c) => c.required);
  const missingRequired = required.filter((c) => !c.found).length;
  return (
    <Document title={pdfText(m.title)} author="Paybacker" creator="Paybacker" producer="Paybacker">
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>Paybacker</Text>
        <Text style={s.title}>{pdfText(m.title)}</Text>
        <Text style={s.sub}>{pdfText(m.packName)}</Text>
        <Text style={s.meta}>{pdfText(m.description)}</Text>
        <Text style={s.meta}>{pdfText(m.audience)}</Text>
        <Text style={s.meta}>Prepared on {pdfText(m.generatedOn)}. {m.files.length} file{m.files.length === 1 ? '' : 's'} in this pack.</Text>

        <View style={s.box}>
          <Text style={s.para}>
            {missingRequired === 0
              ? 'Everything on the checklist that is usually asked for is included.'
              : `${missingRequired} item${missingRequired === 1 ? ' that is' : 's that are'} usually asked for ${missingRequired === 1 ? 'is' : 'are'} missing. See the checklist below.`}
          </Text>
          <Text style={s.para}>Contents: checklist, {m.summary.length ? 'summary, ' : ''}{m.timeline.length ? 'timeline, ' : ''}list of files{m.exhibits.length ? ', letters and replies' : ''}.</Text>
        </View>

        <Text style={s.h2}>Checklist</Text>
        {m.checklist.map((c) => (
          <View key={c.key} style={s.row} wrap={false}>
            <Text style={[{ width: '16%' }, c.found ? s.found : c.required ? s.missing : s.optional]}>
              {c.found ? 'Included' : c.required ? 'Missing' : 'Not found'}
            </Text>
            <View style={{ width: '84%' }}>
              <Text style={s.td}>
                {pdfText(c.label)}
                {c.count > 0 ? ` (${c.count})` : ''}
                {c.required ? '' : ' (optional)'}
              </Text>
              {c.detail ? <Text style={[s.td, { color: muted }]}>{pdfText(c.detail)}</Text> : null}
              {!c.found ? <Text style={[s.td, { color: muted }]}>{pdfText(c.hint)}</Text> : null}
            </View>
          </View>
        ))}
        {m.notes.map((n, i) => (
          <Text key={i} style={[s.para, { color: muted, marginTop: 6 }]}>
            {pdfText(n)}
          </Text>
        ))}

        {m.summary.map((sec, i) => (
          <View key={i} wrap>
            <Text style={s.h2}>{pdfText(sec.title)}</Text>
            {sec.table ? <Table columns={sec.table.columns} rows={sec.table.rows} widths={evenWidths(sec.table.columns.length)} alignRight={sec.table.alignRight} /> : null}
            {(sec.lines ?? []).map((l, j) => (
              <Text key={j} style={[s.para, sec.table ? { marginTop: 6 } : {}]}>
                {pdfText(l)}
              </Text>
            ))}
          </View>
        ))}

        {m.timeline.length > 0 ? (
          <View>
            <Text style={s.h2}>Timeline</Text>
            <Table
              columns={['Date', 'What', 'Details', 'See']}
              widths={[14, 30, 42, 14]}
              rows={m.timeline.map((t) => [t.date ?? 'undated', t.title, (t.detail ?? '').slice(0, 220), t.ref ?? ''])}
            />
          </View>
        ) : null}

        <Text style={s.h2}>Files in this pack</Text>
        <Table
          columns={['No.', 'Date', 'Type', 'Supplier', 'Amount', 'File name']}
          widths={[6, 12, 12, 18, 12, 40]}
          alignRight={[4]}
          rows={m.files.map((f) => [f.seq, f.date, f.type, f.supplier, f.amount, f.note ? `${f.fileName} (${f.note})` : f.fileName])}
        />

        {m.footnote ? <Text style={[s.para, { color: muted, marginTop: 14 }]}>{pdfText(m.footnote)}</Text> : null}
        <Footer title={m.title} />
      </Page>

      {m.exhibits.length > 0 ? (
        <Page size="A4" style={s.page}>
          <Text style={s.h2}>Letters and replies</Text>
          <Text style={[s.para, { color: muted }]}>The text of each letter, reply and note on the dispute, oldest first.</Text>
          {m.exhibits.map((e) => (
            <View key={e.ref} style={{ marginTop: 10 }}>
              <Text style={[s.td, { fontFamily: 'Helvetica-Bold', color: ink }]}>
                {pdfText(`${e.ref}: ${e.heading}`)}
              </Text>
              <Text style={[s.td, { color: muted, marginBottom: 3 }]}>{pdfText(e.dated)}</Text>
              <Text style={s.exhibitBody}>{pdfText(e.body)}</Text>
            </View>
          ))}
          <Footer title={m.title} />
        </Page>
      ) : null}
    </Document>
  );
}

export async function renderPackIndexPdf(model: PackIndexModel): Promise<Buffer> {
  return renderToBuffer(<IndexDocument m={model} />);
}
