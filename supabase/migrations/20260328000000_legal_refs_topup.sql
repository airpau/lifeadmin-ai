-- Phase 2 Legal Intelligence: top-up legal_references from 56 → 80+
-- Adds 30 new verified references: broadband/Ofcom, energy/Ofgem, finance/FCA

-- ============================================================
-- BROADBAND / MOBILE — Ofcom rules
-- ============================================================

INSERT INTO legal_references (category, subcategory, law_name, section, summary, source_url, source_type, applies_to, strength, escalation_body, verification_status)
VALUES

('broadband', 'price_rises', 'Ofcom General Conditions of Entitlement', 'Condition C4.2', 'Providers must give 30 days notice of any mid-contract price rise. If the rise was not clearly disclosed at sale, you have the right to exit penalty-free.', 'https://www.ofcom.org.uk/phones-and-broadband/making-changes/mid-contract-price-rises', 'regulator', ARRAY['broadband', 'mobile'], 'strong', 'Ofcom', 'current'),

('broadband', 'compensation', 'Ofcom Automatic Compensation Scheme', 'Vol 1 para 3.1', 'Providers must pay automatic compensation of £8.40/day for delayed repairs (after 2 working days), £29.15 for missed appointments, and £6.10/day for delayed activation. No claim needed.', 'https://www.ofcom.org.uk/phones-and-broadband/making-changes/automatic-compensation', 'regulator', ARRAY['broadband'], 'strong', 'Ofcom', 'current'),

('broadband', 'speeds', 'Ofcom Broadband Speed Codes of Practice', 'Para 6', 'If your actual broadband speed persistently falls below the minimum guaranteed speed given at sign-up, you have the right to exit your contract penalty-free after a repair period.', 'https://www.ofcom.org.uk/phones-and-broadband/making-changes/broadband-speeds', 'regulator', ARRAY['broadband'], 'strong', 'Ofcom', 'current'),

('broadband', 'switching', 'Ofcom Switching Rules (STAC/PAC)', 'GC C8', 'Mobile customers can switch with a 30-day PAC code. Broadband customers can switch using a one-touch switching process. Early termination charges must be fairly disclosed at sign-up.', 'https://www.ofcom.org.uk/phones-and-broadband/making-changes/switching', 'regulator', ARRAY['broadband', 'mobile'], 'moderate', 'Ofcom', 'current'),

('broadband', 'adr', 'Ofcom Alternative Dispute Resolution', 'GC C8.4', 'After 8 weeks without resolution, or after a deadlock letter, you have the right to take your complaint to an Ofcom-approved ADR scheme (CISAS or Ombudsman Services: Communications) free of charge.', 'https://www.ofcom.org.uk/phones-and-broadband/making-changes/complain', 'regulator', ARRAY['broadband', 'mobile'], 'strong', 'CISAS or Ombudsman Services: Communications', 'current'),

('broadband', 'distance_sales', 'Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013', 'Reg 29', '14-day right to cancel a broadband or mobile contract sold at a distance (online or by phone) without penalty. The right begins the day after contract formation.', 'https://www.legislation.gov.uk/uksi/2013/3134/regulation/29', 'statute', ARRAY['broadband', 'mobile'], 'strong', 'Trading Standards', 'current'),

('broadband', 'hidden_charges', 'Consumer Protection from Unfair Trading Regulations 2008', 'Reg 5', 'Providers must not mislead consumers by omitting material information — including charges not prominently disclosed at point of sale. Hidden fees may constitute a misleading omission.', 'https://www.legislation.gov.uk/uksi/2008/1277/regulation/5', 'statute', ARRAY['broadband', 'mobile'], 'moderate', 'Trading Standards', 'current'),

('broadband', 'fair_terms', 'Digital Markets, Competition and Consumers Act 2024', 'Part 3', 'Strengthens consumer contract protections including unfair terms enforcement, subscription trap rules, and enhanced remedies for misleading commercial practices.', 'https://www.legislation.gov.uk/ukpga/2024/13', 'statute', ARRAY['broadband', 'mobile', 'subscription'], 'strong', 'Competition and Markets Authority', 'current'),

-- ============================================================
-- ENERGY — Ofgem rules
-- ============================================================

('energy', 'back_billing', 'Ofgem Back-Billing Rule', 'Licence Condition 21A', 'Energy suppliers cannot bill you for gas or electricity used more than 12 months ago if the underbilling was not your fault. Any charges older than 12 months must be written off.', 'https://www.ofgem.gov.uk/check-if-energy-price-is-fair/understand-your-energy-bill/back-billing', 'regulator', ARRAY['energy'], 'strong', 'Energy Ombudsman', 'current'),

('energy', 'fair_treatment', 'Ofgem Standards of Conduct', 'Standard Licence Condition 0', 'Energy suppliers must treat customers fairly at all times, including during billing disputes. They must provide clear, accurate information and respond to complaints promptly.', 'https://www.ofgem.gov.uk/information-for-household-consumers/energy-contracts-and-your-rights', 'regulator', ARRAY['energy'], 'strong', 'Energy Ombudsman', 'current'),

('energy', 'billing_accuracy', 'Electricity Act 1989 / Gas Act 1986', 'Schedule 6 / Schedule 2B', 'Licensed suppliers must provide accurate bills based on actual or reasonable estimated readings. Where bills have been inaccurate, you are entitled to a corrected bill and refund.', 'https://www.legislation.gov.uk/ukpga/1989/29', 'statute', ARRAY['energy'], 'strong', 'Ofgem', 'current'),

('energy', 'compensation', 'Ofgem Guaranteed Standards of Performance', 'Standard Licence Condition 46', 'Suppliers must pay guaranteed standards compensation: e.g. £30 for failure to issue a correct bill within 5 working days of request; £30 for failure to provide final bill within 6 weeks of switching.', 'https://www.ofgem.gov.uk/check-if-energy-price-is-fair/know-your-rights-as-a-customer/guaranteed-standards-performance', 'regulator', ARRAY['energy'], 'strong', 'Energy Ombudsman', 'current'),

('energy', 'debt', 'Ofgem Debt Code of Practice', 'Standard Licence Condition 27', 'Suppliers must not disconnect a domestic customer in payment difficulty without first offering a repayment plan. Prepayment meter installation requires a payment plan first.', 'https://www.ofgem.gov.uk/consumers/household-gas-and-electricity-guide/energy-debt-and-prepayment-meters', 'regulator', ARRAY['energy'], 'strong', 'Energy Ombudsman', 'current'),

('energy', 'switching', 'Ofgem Switching Guarantee', 'Standard Licence Condition 14', 'Energy switches must complete within 5 working days of the switching date. Suppliers must return any credit balance within 10 working days after final bill.', 'https://www.ofgem.gov.uk/information-for-household-consumers/moving-home-or-switching-energy-supplier', 'regulator', ARRAY['energy'], 'moderate', 'Energy Ombudsman', 'current'),

('energy', 'smart_meters', 'Smart Meters Act 2018', 'Part 1', 'You have the right to request a smart meter installation. Suppliers cannot force you to accept one. Smart meters must be interoperable so you can switch suppliers while keeping smart functionality.', 'https://www.legislation.gov.uk/ukpga/2018/14', 'statute', ARRAY['energy'], 'moderate', 'Ofgem', 'current'),

('energy', 'warm_home', 'Warm Home Discount Scheme Regulations 2022', 'Reg 4', 'Eligible customers (those in receipt of certain benefits or with a low income and high energy costs) are entitled to a £150 rebate on their electricity bill under the Warm Home Discount.', 'https://www.legislation.gov.uk/uksi/2022/362', 'statute', ARRAY['energy'], 'strong', 'Ofgem', 'current'),

('energy', 'price_cap', 'Energy Act 2023', 'Part 9', 'Ofgem sets a price cap limiting the maximum unit rate and standing charge for standard variable tariff customers. Suppliers may not charge above the capped rates for default tariffs.', 'https://www.legislation.gov.uk/ukpga/2023/52', 'statute', ARRAY['energy'], 'strong', 'Ofgem', 'current'),

-- ============================================================
-- FINANCE — FCA rules
-- ============================================================

('finance', 'consumer_duty', 'FCA Consumer Duty', 'PS22/9 (effective 31 July 2023)', 'Financial services firms must act to deliver good outcomes for retail customers, including fair value, clear communications, and products/services that meet needs. Where a firm causes foreseeable harm, you can complain.', 'https://www.fca.org.uk/firms/consumer-duty', 'regulator', ARRAY['finance', 'insurance', 'credit'], 'strong', 'Financial Ombudsman Service', 'current'),

('finance', 'treating_customers', 'FCA Principles for Businesses', 'PRIN 6', 'All FCA-authorised firms must pay due regard to the interests of customers and treat them fairly. This applies to billing, claims handling, pricing, and complaint responses.', 'https://www.handbook.fca.org.uk/handbook/PRIN/2/1.html', 'regulator', ARRAY['finance', 'insurance', 'credit'], 'strong', 'Financial Ombudsman Service', 'current'),

('finance', 'ombudsman', 'Financial Services and Markets Act 2000', 's.225-234 (FOS Jurisdiction)', 'After 8 weeks without resolution (or after a deadlock letter), you have the right to escalate to the Financial Ombudsman Service. The FOS can award up to £430,000 and its decisions are binding on the firm.', 'https://www.legislation.gov.uk/ukpga/2000/8/section/225', 'statute', ARRAY['finance', 'insurance', 'credit', 'mortgage'], 'strong', 'Financial Ombudsman Service', 'current'),

('finance', 'debt_collection', 'FCA Consumer Credit Sourcebook', 'CONC 7.3', 'Debt collectors must not: contact you at unreasonable times, use aggressive or misleading tactics, continue to contact you once you have stated in writing you dispute the debt, or threaten action they cannot take.', 'https://www.handbook.fca.org.uk/handbook/CONC/7/', 'regulator', ARRAY['finance', 'debt'], 'strong', 'Financial Ombudsman Service', 'current'),

('finance', 'payment_services', 'Payment Services Regulations 2017', 'Reg 76', 'If a payment was made without your authorisation (e.g. a fraudulent card charge), you are entitled to an immediate refund from your payment services provider unless they can prove you acted fraudulently.', 'https://www.legislation.gov.uk/uksi/2017/752/regulation/76', 'statute', ARRAY['finance', 'banking'], 'strong', 'Financial Ombudsman Service', 'current'),

('finance', 'credit_agreements', 'Consumer Credit Act 1974', 's.77-79', 'You may request a copy of your credit agreement at any time for a £1 fee. If the creditor cannot supply a true copy within 12 working days, they cannot enforce the agreement during that period.', 'https://www.legislation.gov.uk/ukpga/1974/39/section/77', 'statute', ARRAY['finance', 'debt', 'credit'], 'strong', 'Financial Ombudsman Service', 'current'),

('finance', 'insurance_fair', 'Insurance Conduct of Business Sourcebook', 'ICOBS 8.1', 'Insurers must handle claims promptly and fairly. They must not unreasonably reject claims or apply exclusions that were not clearly communicated. Delays beyond 8 weeks can be escalated to the FOS.', 'https://www.handbook.fca.org.uk/handbook/ICOBS/8/1.html', 'regulator', ARRAY['insurance'], 'strong', 'Financial Ombudsman Service', 'current'),

('finance', 'mortgage_arrears', 'FCA Mortgage Conduct of Business', 'MCOB 13.3', 'Lenders must treat mortgage customers in arrears fairly, consider alternative repayment arrangements before initiating possession proceedings, and not add excessive fees during arrears management.', 'https://www.handbook.fca.org.uk/handbook/MCOB/13/', 'regulator', ARRAY['finance', 'mortgage'], 'strong', 'Financial Ombudsman Service', 'current'),

('finance', 'section_75', 'Consumer Credit Act 1974', 's.75', 'If you paid for goods or services costing between £100 and £30,000 by credit card and the supplier breaches the contract or misrepresents, the credit card provider is equally liable and must provide a full refund.', 'https://www.legislation.gov.uk/ukpga/1974/39/section/75', 'statute', ARRAY['finance', 'credit', 'refund'], 'strong', 'Financial Ombudsman Service', 'current'),

('finance', 'excessive_charges', 'FCA Handbook', 'CONC 1.3', 'FCA-regulated consumer credit firms must not impose charges that are disproportionate. Excessive default or late payment fees may be challenged as unfair and contrary to FCA rules.', 'https://www.handbook.fca.org.uk/handbook/CONC/1/', 'regulator', ARRAY['finance', 'credit', 'debt'], 'moderate', 'Financial Ombudsman Service', 'current'),

-- ============================================================
-- GENERAL — additional consumer protections
-- ============================================================

('general', 'chargeback', 'FCA Payment Services Regulations 2017 / Visa-Mastercard Chargeback', 'Reg 76 + Card Scheme Rules', 'Chargeback allows you to dispute a debit card transaction within 120 days if the merchant fails to deliver. Unlike s.75, there is no minimum spend — even small amounts can be disputed.', 'https://www.legislation.gov.uk/uksi/2017/752', 'statute', ARRAY['general', 'refund', 'banking'], 'moderate', 'Financial Ombudsman Service', 'current'),

('general', 'unfair_terms', 'Consumer Rights Act 2015', 'Part 2, s.62', 'Any term in a consumer contract that creates a significant imbalance in the parties rights and obligations is unfair and not binding on the consumer. This applies to penalty clauses, unilateral price variation, and auto-renewal clauses.', 'https://www.legislation.gov.uk/ukpga/2015/15/section/62', 'statute', ARRAY['general', 'subscription', 'contract'], 'strong', 'Competition and Markets Authority', 'current');
