'use client';
// src/app/dashboard/money-hub/UpcomingWidget.tsx
//
// Money Hub home slot for the forward view. Kept as its own file so the
// section ordering in money-hub/page.tsx doesn't move — the widget still
// sits between the Spending/Budgets grid and Expected Bills.
//
// The old implementation showed a net figure plus four rows and never
// answered "what am I left with". The real view lives in
// UpcomingForwardView: landing → leaving → left, over 7/14/30 days.

import UpcomingForwardView from './UpcomingForwardView';

export default function UpcomingWidget() {
  return <UpcomingForwardView variant="widget" initialWindow={30} />;
}
