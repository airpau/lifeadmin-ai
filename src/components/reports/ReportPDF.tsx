'use client';

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import type { AnnualReportData } from '@/lib/report-generator';

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const navy950 = '#0A1628';
const navy900 = '#0F1D35';
const navy800 = '#162544';
const mint400 = '#34D399';
const white = '#FFFFFF';
const slate300 = '#CBD5E1';
const slate400 = '#94A3B8';
const slate500 = '#64748B';

const styles = StyleSheet.create({
  page: {
    backgroundColor: navy950,
    padding: 40,
    // Extra bottom padding so wrapped content never overlaps the
    // two-line fixed footer (disclaimer + links).
    paddingBottom: 64,
    fontFamily: 'Helvetica',
    color: white,
  },
  header: {
    marginBottom: 30,
  },
  brand: {
    fontSize: 10,
    color: mint400,
    marginBottom: 4,
    letterSpacing: 1,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    color: white,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 10,
    color: slate400,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: navy900,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: navy800,
  },
  statLabel: {
    fontSize: 8,
    color: slate400,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: white,
  },
  section: {
    backgroundColor: navy900,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: navy800,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: white,
    marginBottom: 12,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  barLabel: {
    width: 100,
    fontSize: 9,
    color: slate300,
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: navy800,
    borderRadius: 4,
    marginHorizontal: 8,
  },
  barFill: {
    height: 8,
    backgroundColor: mint400,
    borderRadius: 4,
  },
  barValue: {
    width: 70,
    fontSize: 9,
    color: white,
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: navy800,
  },
  rowLabel: {
    fontSize: 9,
    color: slate300,
  },
  rowValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: white,
  },
  scoreBox: {
    backgroundColor: navy900,
    borderRadius: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: mint400,
    alignItems: 'center',
    marginTop: 8,
  },
  scoreLabel: {
    fontSize: 10,
    color: mint400,
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 32,
    fontFamily: 'Helvetica-Bold',
    color: white,
    marginBottom: 4,
  },
  scoreCaption: {
    fontSize: 8,
    color: slate500,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 80,
    marginBottom: 4,
  },
  trendBar: {
    flex: 1,
    backgroundColor: mint400,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  trendLabels: {
    flexDirection: 'row',
    gap: 4,
  },
  trendLabel: {
    flex: 1,
    fontSize: 6,
    color: slate500,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: navy800,
    paddingTop: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color: slate500,
  },
  footerDisclaimer: {
    fontSize: 7,
    color: slate500,
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 9,
    color: slate300,
    lineHeight: 1.5,
  },
  actionRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  actionNumber: {
    width: 14,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: mint400,
  },
  actionText: {
    flex: 1,
    fontSize: 9,
    color: slate300,
    lineHeight: 1.4,
  },
  grid2: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  gridHalf: {
    flex: 1,
  },
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtGBP(n: number): string {
  return `\u00A3${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONTH_SHORT: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

/* ------------------------------------------------------------------ */
/*  PDF Document                                                       */
/* ------------------------------------------------------------------ */

const PDF_DISCLAIMER =
  'This report is a factual summary of your own accounts and activity. It is general information, not financial advice.';

function PdfFooter() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerDisclaimer}>{PDF_DISCLAIMER}</Text>
      <View style={styles.footerRow}>
        <Text style={styles.footerText}>paybacker.co.uk</Text>
        <Text style={styles.footerText}>Confidential</Text>
      </View>
    </View>
  );
}

function ReportPDFDocument({ data }: { data: AnnualReportData }) {
  const maxCat = data.spendingByCategory[0]?.total || 1;
  const maxMonth = Math.max(...data.monthlyTrends.map((m) => m.spend), 1);
  const windowLabel = data.reportWindow?.label
    || (data.monthlyTrends.length > 0
      ? `${MONTH_SHORT[data.monthlyTrends[0].month.split('-')[1]] || ''} ${data.monthlyTrends[0].month.split('-')[0]} to ${MONTH_SHORT[data.monthlyTrends[data.monthlyTrends.length - 1].month.split('-')[1]] || ''} ${data.monthlyTrends[data.monthlyTrends.length - 1].month.split('-')[0]}`
      : '');
  const recovered = data.disputesDetail;

  return (
    <Document>
      {/* Page 1: Overview + spending */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>PAYBACKER FINANCIAL REPORT</Text>
          <Text style={styles.title}>Your Last 12 Months</Text>
          <Text style={styles.subtitle}>
            {windowLabel ? `${windowLabel} | ` : ''}Member for {data.daysAsMember} days | Generated{' '}
            {new Date(data.generatedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </View>

        {/* Executive summary */}
        {data.executiveSummary ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Executive Summary</Text>
            <Text style={styles.summaryText}>{data.executiveSummary}</Text>
          </View>
        ) : null}

        {/* Key stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Money Recovered</Text>
            <Text style={styles.statValue}>{fmtGBP(data.totalMoneyRecovered)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Subs Cancelled</Text>
            <Text style={styles.statValue}>{data.subscriptionsCancelled}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Complaints Sent</Text>
            <Text style={styles.statValue}>{data.complaintsGenerated}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Annual Savings</Text>
            <Text style={styles.statValue}>{fmtGBP(data.annualSavingsFromCancellations)}</Text>
          </View>
        </View>

        {/* Income vs Outgoings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Income vs Outgoings</Text>
          <View style={styles.barRow}>
            <Text style={styles.barLabel}>Income</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: '100%', backgroundColor: '#22C55E' }]} />
            </View>
            <Text style={styles.barValue}>{fmtGBP(data.totalIncome)}</Text>
          </View>
          <View style={styles.barRow}>
            <Text style={styles.barLabel}>Outgoings</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${data.totalIncome > 0 ? Math.min((data.totalOutgoings / data.totalIncome) * 100, 100) : 0}%`,
                    backgroundColor: '#EF4444',
                  },
                ]}
              />
            </View>
            <Text style={styles.barValue}>{fmtGBP(data.totalOutgoings)}</Text>
          </View>
        </View>

        {/* Spending by category */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Spending by Category</Text>
          {data.spendingByCategory.slice(0, 8).map((cat) => (
            <View key={cat.category} style={styles.barRow}>
              <Text style={styles.barLabel}>{cat.label || cat.category}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[styles.barFill, { width: `${(cat.total / maxCat) * 100}%` }]}
                />
              </View>
              <Text style={styles.barValue}>
                {fmtGBP(cat.total)} ({cat.percentage}%)
              </Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <PdfFooter />
      </Page>

      {/* Page 2: Trends, merchants, achievements */}
      <Page size="A4" style={styles.page}>
        {/* Monthly trends */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Monthly Spending Trends</Text>
          <View style={styles.trendRow}>
            {data.monthlyTrends.map((m) => (
              <View
                key={m.month}
                style={[
                  styles.trendBar,
                  { height: `${(m.spend / maxMonth) * 100}%`, minHeight: m.spend > 0 ? 2 : 0 },
                ]}
              />
            ))}
          </View>
          <View style={styles.trendLabels}>
            {data.monthlyTrends.map((m) => (
              <Text key={m.month} style={styles.trendLabel}>
                {MONTH_SHORT[m.month.split('-')[1]] || ''}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.grid2}>
          {/* Top merchants */}
          <View style={[styles.section, styles.gridHalf, { marginBottom: 0 }]}>
            <Text style={styles.sectionTitle}>Top 5 Merchants</Text>
            {data.topMerchants.map((m, i) => (
              <View key={m.name} style={styles.row}>
                <Text style={styles.rowLabel}>
                  {i + 1}. {m.name}
                </Text>
                <Text style={styles.rowValue}>{fmtGBP(m.total)}</Text>
              </View>
            ))}
          </View>

          {/* Subscriptions */}
          <View style={[styles.section, styles.gridHalf, { marginBottom: 0 }]}>
            <Text style={styles.sectionTitle}>Subscriptions</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Active</Text>
              <Text style={styles.rowValue}>{data.activeSubscriptions}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Cancelled</Text>
              <Text style={styles.rowValue}>{data.subscriptionsCancelled}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Monthly Cost</Text>
              <Text style={styles.rowValue}>{fmtGBP(data.monthlySubscriptionCost)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Saved</Text>
              <Text style={[styles.rowValue, { color: mint400 }]}>{fmtGBP(data.subsMoneySaved)}</Text>
            </View>
          </View>
        </View>

        {/* Next actions */}
        {data.nextActions && data.nextActions.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Next Actions</Text>
            {data.nextActions.map((action, i) => (
              <View key={i} style={styles.actionRow}>
                <Text style={styles.actionNumber}>{i + 1}.</Text>
                <Text style={styles.actionText}>{action}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Disputes & money recovered */}
        {recovered && recovered.totalDisputes > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Disputes &amp; Money Recovered</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Total recovered</Text>
              <Text style={[styles.rowValue, { color: mint400 }]}>{fmtGBP(recovered.totalRecovered)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Won / partial</Text>
              <Text style={styles.rowValue}>{recovered.wins} / {recovered.partialWins}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>In progress</Text>
              <Text style={styles.rowValue}>{recovered.inProgress}</Text>
            </View>
            {recovered.averageResolutionDays !== null ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Average time to resolve</Text>
                <Text style={styles.rowValue}>{recovered.averageResolutionDays} days</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Achievements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Achievements</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Challenges Completed</Text>
            <Text style={styles.rowValue}>{data.challengesCompleted}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Points Earned</Text>
            <Text style={styles.rowValue}>{data.pointsEarned.toLocaleString()}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Loyalty Tier</Text>
            <Text style={[styles.rowValue, { color: mint400 }]}>{data.loyaltyTier}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Deals Explored</Text>
            <Text style={styles.rowValue}>{data.dealClicks}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Profile Completeness</Text>
            <Text style={styles.rowValue}>{data.profileCompleteness}%</Text>
          </View>
        </View>

        {/* Financial Health Score */}
        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>FINANCIAL HEALTH SCORE</Text>
          <Text style={styles.scoreValue}>{data.financialHealth.overall}/100</Text>
          <Text style={styles.scoreCaption}>{data.financialHealth.tier.charAt(0).toUpperCase() + data.financialHealth.tier.slice(1)}: based on spending, savings, borrowing, and planning</Text>
        </View>

        {/* Footer */}
        <PdfFooter />
      </Page>
    </Document>
  );
}

/* ------------------------------------------------------------------ */
/*  Public render + download function                                  */
/* ------------------------------------------------------------------ */

export async function renderReportPdf(data: AnnualReportData): Promise<void> {
  const blob = await pdf(<ReportPDFDocument data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Paybacker-Report-${data.year}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
