/**
 * Pre-written social media post templates — zero API cost.
 * Rotates through pillars and templates daily.
 */

export interface SocialTemplate {
  content: string;
  hashtags: string;
  image_prompt: string;
}

const MONEY_TIP: SocialTemplate[] = [
  {
    content: "Did you know your energy supplier must refund credit on your account within 10 working days if you ask? The average UK household in credit is owed around £150. Check your balance and request it today. Try it free at paybacker.co.uk",
    hashtags: "#EnergyBills #MoneySaving #UKConsumerRights #Refund #PayBacker",
    image_prompt: "Dark navy background, gold lightning bolt icon, text overlay: energy bill refund concept, clean fintech aesthetic",
  },
  {
    content: "Under Ofcom rules, if your broadband speed is consistently below what was advertised, you can exit your contract penalty free. Most providers hope you never find out. Try it free at paybacker.co.uk",
    hashtags: "#Broadband #ConsumerRights #Ofcom #MoneySaving #PayBacker",
    image_prompt: "Dark navy background, gold wifi signal icon, broadband speed concept, modern fintech design",
  },
  {
    content: "The average UK adult pays for 3 subscriptions they have completely forgotten about. That is around £47 a month quietly leaving your account. Try it free at paybacker.co.uk to find yours.",
    hashtags: "#Subscriptions #MoneySaving #UKFinance #CancelSubscriptions #PayBacker",
    image_prompt: "Dark navy background, gold magnifying glass over subscription icons, clean fintech style",
  },
  {
    content: "Mid contract price rises above the rate agreed at sign up are challengeable under Ofcom rules. You may be able to exit penalty free or claim a refund. Try it free at paybacker.co.uk",
    hashtags: "#Telecoms #ConsumerRights #Ofcom #MoneySaving #PayBacker",
    image_prompt: "Dark navy background, gold mobile phone with price arrow, contract escape concept, fintech aesthetic",
  },
  {
    content: "If a parcel delivery company loses or damages your item, the retailer is liable under the Consumer Rights Act 2015, not the courier. Always claim from the retailer first. Try it free at paybacker.co.uk",
    hashtags: "#ConsumerRights #Delivery #CRA2015 #Refund #PayBacker",
    image_prompt: "Dark navy background, gold parcel box icon, delivery rights concept, clean modern design",
  },
  {
    content: "Council tax bands were set in 1991. If your property has been extended, converted or changed since then, your band may be wrong. You could be owed years of overpayments. Try it free at paybacker.co.uk",
    hashtags: "#CouncilTax #MoneySaving #UKProperty #Refund #PayBacker",
    image_prompt: "Dark navy background, gold house icon with downward arrow, council tax refund concept, fintech style",
  },
  {
    content: "Flight delayed over 3 hours? Under UK261 you are entitled to between £220 and £520 compensation per passenger. Airlines count on you not claiming. Try it free at paybacker.co.uk",
    hashtags: "#FlightDelay #Compensation #UK261 #TravelRights #PayBacker",
    image_prompt: "Dark navy background, gold aeroplane icon, flight delay compensation concept, clean design",
  },
  {
    content: "Insurance renewal quotes are almost always higher than new customer prices. By law insurers can no longer charge existing customers more than new ones for home and car insurance. If yours did, complain. Try it free at paybacker.co.uk",
    hashtags: "#Insurance #ConsumerRights #FCA #MoneySaving #PayBacker",
    image_prompt: "Dark navy background, gold shield icon, insurance loyalty penalty concept, fintech aesthetic",
  },
  {
    content: "Bank charges for going into an unauthorised overdraft can be challenged if they are excessive under the Unfair Contract Terms Act 1977. Many people have successfully reclaimed hundreds of pounds. Try it free at paybacker.co.uk",
    hashtags: "#BankCharges #MoneyBack #ConsumerRights #UKFinance #PayBacker",
    image_prompt: "Dark navy background, gold bank building icon, overdraft charges concept, modern design",
  },
  {
    content: "Gym contracts cancelled during illness or injury may be refundable under consumer protection law. Check your contract terms and challenge any refusal. Try it free at paybacker.co.uk",
    hashtags: "#GymMembership #ConsumerRights #Refund #MoneySaving #PayBacker",
    image_prompt: "Dark navy background, gold dumbbell icon, gym contract rights concept, fintech style",
  },
];

const COMPLAINT_WIN: SocialTemplate[] = [
  {
    content: "Sarah from Manchester was paying £62 a month for broadband that consistently delivered half the advertised speed. After a formal complaint citing Ofcom speed guarantee rules, Virgin Media refunded £340 and let her exit penalty free. Try it free at paybacker.co.uk",
    hashtags: "#ComplaintWin #Broadband #Ofcom #MoneyBack #PayBacker",
    image_prompt: "Dark navy background, gold checkmark with pound sign, broadband refund success, fintech aesthetic",
  },
  {
    content: "James noticed his bank had charged him £35 per overdraft occurrence 8 times in one month. He challenged the charges as disproportionate under FCA rules. The bank refunded £287 within a week. Try it free at paybacker.co.uk",
    hashtags: "#BankCharges #ComplaintWin #FCA #MoneyBack #PayBacker",
    image_prompt: "Dark navy background, gold coin stack icon, bank charge reclaim success, modern design",
  },
  {
    content: "Emma wanted to cancel her Sky contract after a mid term price increase. Sky initially refused. After a formal complaint referencing Ofcom mid contract price rise rules, she exited penalty free and saved £480 over the remaining term. Try it free at paybacker.co.uk",
    hashtags: "#Sky #ComplaintWin #Ofcom #ConsumerRights #PayBacker",
    image_prompt: "Dark navy background, gold broken chain icon, contract escape success, fintech style",
  },
  {
    content: "Mark had been overpaying his energy direct debit by £30 a month for 6 months. His supplier was sitting on £180 of credit. One formal email requesting the refund under Ofgem rules and the full amount was back in his account within 5 days. Try it free at paybacker.co.uk",
    hashtags: "#EnergyBills #Ofgem #ComplaintWin #Refund #PayBacker",
    image_prompt: "Dark navy background, gold lightning bolt with refund arrow, energy refund success, clean design",
  },
  {
    content: "Rachel was charged £95 for a gym membership she cancelled 3 months ago. The gym claimed they never received her cancellation. After sending a formal complaint with proof of her original email, they refunded the full amount plus £25 goodwill. Try it free at paybacker.co.uk",
    hashtags: "#GymMembership #ComplaintWin #Refund #ConsumerRights #PayBacker",
    image_prompt: "Dark navy background, gold dumbbell with checkmark, gym refund success, fintech aesthetic",
  },
  {
    content: "Tom's flight from Heathrow was delayed 4 hours. The airline said weather was to blame, but records showed clear skies. He filed a UK261 compensation claim and received £440 per person for his family of three — £1,320 total. Try it free at paybacker.co.uk",
    hashtags: "#FlightDelay #UK261 #Compensation #ComplaintWin #PayBacker",
    image_prompt: "Dark navy background, gold aeroplane with pound sign, flight compensation success, modern design",
  },
  {
    content: "Lisa's car insurance auto renewed at £200 more than the previous year despite no claims. She complained to her insurer citing the FCA pricing practices rules. They matched the original price and added a £50 goodwill credit. Try it free at paybacker.co.uk",
    hashtags: "#CarInsurance #FCA #ComplaintWin #MoneySaving #PayBacker",
    image_prompt: "Dark navy background, gold car icon with refund symbol, insurance win, fintech style",
  },
  {
    content: "David received a parking charge notice for £100 at a private car park. He appealed on the grounds that signage was inadequate and the charge was disproportionate. The charge was cancelled in full after one letter. Try it free at paybacker.co.uk",
    hashtags: "#ParkingCharge #Appeal #ConsumerRights #ComplaintWin #PayBacker",
    image_prompt: "Dark navy background, gold parking sign with cross, parking charge appeal success, clean design",
  },
  {
    content: "Sophie's letting agent tried to deduct £350 from her deposit for normal wear and tear. She challenged the deduction through the Tenancy Deposit Scheme citing photographic evidence. The full deposit was returned within 10 days. Try it free at paybacker.co.uk",
    hashtags: "#Renting #Deposit #TenantRights #ComplaintWin #PayBacker",
    image_prompt: "Dark navy background, gold key icon with checkmark, deposit reclaim success, fintech aesthetic",
  },
  {
    content: "Chris was charged £87 in roaming fees despite having an inclusive EU data plan. His mobile provider initially refused to refund. After a formal complaint citing their own terms, the full amount was refunded plus a month of free service. Try it free at paybacker.co.uk",
    hashtags: "#MobileRoaming #Refund #ComplaintWin #ConsumerRights #PayBacker",
    image_prompt: "Dark navy background, gold mobile phone with globe, roaming refund success, modern design",
  },
];

const PRODUCT_FEATURE: SocialTemplate[] = [
  {
    content: "Paybacker writes your complaint letter in 30 seconds.\n\nEnergy overcharge. Broadband price rise. Flight delay. Parking ticket. It does not matter — the AI generates a professional formal letter citing the exact UK law that applies to your case.\n\nConsumer Rights Act 2015. Ofcom rules. Ofgem. UK261. Word for word.\n\nCompanies respond faster when they know you know the law.\n\nSign up free at paybacker.co.uk",
    hashtags: "#ConsumerRights #AIDisputes #UKLaw #MoneySaving #FinTech #PayBacker #ComplaintLetter",
    image_prompt: "Dark navy background, mint green glowing document with scales of justice, abstract AI legal letter concept, clean modern fintech design",
  },
  {
    content: "A solicitor charges £150 to £300 to write a formal complaint letter.\n\nPaybacker does it for free in 30 seconds.\n\nSame result: a professional letter citing Consumer Rights Act 2015, Ofcom speed guarantees, Ofgem billing rules, or whichever regulation applies. Ready to send.\n\nYour rights. No bill.\n\nTry it free at paybacker.co.uk",
    hashtags: "#ConsumerRights #FreeAI #UKLaw #Complaints #FinTech #MoneySaving #PayBacker",
    image_prompt: "Dark navy background, mint green glowing scales balanced against a bill, solicitor vs AI concept, abstract fintech design",
  },
  {
    content: "Paybacker Assist scanned one user's account and found:\n\n- £340 sitting in energy credit (supplier was holding it)\n- A £47 per month subscription they had forgotten about\n- A broadband price rise that Ofcom rules let them exit penalty-free\n\nTotal recovered: £1,100+\n\nConnect your bank. Paybacker Assist does the rest.\n\nSign up free at paybacker.co.uk",
    hashtags: "#PaybackerAssist #BankScan #SubscriptionTracker #ConsumerRights #MoneySaving #FinTech #PayBacker",
    image_prompt: "Dark navy background, mint green magnifying glass scanning bank statement, abstract money recovery concept, clean fintech aesthetic",
  },
  {
    content: "Ask Paybacker Assist anything about your finances.\n\n'Have my energy bills gone up this year?'\n'Am I paying for any subscriptions I don't use?'\n'Can I exit my broadband contract early?'\n\nIt reads your actual bank transactions and gives you a real answer. Then it writes the letter if you need one.\n\nTry it free at paybacker.co.uk",
    hashtags: "#PaybackerAssist #AI #ConsumerRights #FinTech #MoneySaving #OpenBanking #PayBacker",
    image_prompt: "Dark navy background, mint green chat bubble with financial graph, abstract AI conversation about money, modern fintech design",
  },
  {
    content: "Flight delayed over 3 hours?\n\nUnder UK261 you are entitled to between £220 and £520 per passenger. Airlines count on you not knowing this, or not bothering to claim.\n\nPaybacker writes the compensation claim letter in 30 seconds, citing UK261 with the exact wording airlines cannot argue with.\n\nYou can claim for flights delayed in the last 6 years.\n\nSign up free at paybacker.co.uk",
    hashtags: "#FlightDelay #UK261 #Compensation #ConsumerRights #AI #FinTech #PayBacker",
    image_prompt: "Dark navy background, mint green aeroplane with compensation claim concept, abstract flight delay rights, modern fintech style",
  },
  {
    content: "The average UK household overpays on bills by over £1,000 a year without realising it.\n\nEnergy credits not refunded. Broadband speeds below the guaranteed minimum. Mid-contract price rises you can legally challenge. Subscriptions you forgot you were paying for.\n\nPaybacker Assist finds every one of them and tells you exactly what to do.\n\nSign up free at paybacker.co.uk",
    hashtags: "#MoneySaving #PaybackerAssist #ConsumerRights #UKFinance #BillCheck #FinTech #PayBacker",
    image_prompt: "Dark navy background, mint green coins being discovered from behind bills, abstract overpayment recovery concept, clean fintech design",
  },
  {
    content: "Every subscription company is hoping you will not cancel.\n\nPaybacker generates a cancellation email in 30 seconds, citing your legal right under the Consumer Contracts Regulations 2013. No awkward phone calls. No retentions team pressure. Just a formal email they have to act on.\n\nTry it free at paybacker.co.uk",
    hashtags: "#CancelSubscriptions #ConsumerRights #AI #MoneySaving #FinTech #PayBacker #CancelCulture",
    image_prompt: "Dark navy background, mint green email icon breaking a subscription chain, abstract cancellation concept, modern fintech aesthetic",
  },
  {
    content: "Paybacker Assist detected a broadband price rise one user had not noticed.\n\nTheir provider increased the monthly cost by £7.50 mid-contract. Under Ofcom rules, a mid-contract price rise above what was agreed at sign-up gives you the right to exit without penalty.\n\nPaybacker wrote the exit letter. The user left with no cancellation fee and switched to a cheaper deal the same day.\n\nSign up free at paybacker.co.uk",
    hashtags: "#Broadband #Ofcom #ConsumerRights #PaybackerAssist #MoneySaving #FinTech #PayBacker",
    image_prompt: "Dark navy background, mint green contract being cut free, abstract broadband exit rights concept, clean fintech design",
  },
  {
    content: "Your energy supplier could be sitting on your money right now.\n\nUnder Ofgem rules, if your account is in credit they must refund it within 10 working days of you asking. The average credit balance is around £150.\n\nPaybacker writes the refund request letter for you, citing Ofgem's exact rules.\n\nThat is £150 back in your account this week.\n\nTry it free at paybacker.co.uk",
    hashtags: "#EnergyBills #Ofgem #Refund #ConsumerRights #AI #MoneySaving #PayBacker",
    image_prompt: "Dark navy background, mint green energy bolt with refund arrow, abstract energy credit recovery, modern fintech style",
  },
  {
    content: "How Paybacker works:\n\n1. Connect your bank account (read-only, FCA regulated, takes 60 seconds)\n2. Paybacker Assist scans for overcharges, forgotten subscriptions, and bills you can dispute\n3. Pick an opportunity. Get a 30-second AI letter citing the exact UK law\n4. Send it. Get your money back\n\nFree to start. No credit card needed.\n\nSign up free at paybacker.co.uk",
    hashtags: "#HowItWorks #PaybackerAssist #ConsumerRights #AI #FinTech #MoneySaving #PayBacker",
    image_prompt: "Dark navy background, four mint green numbered steps flowing downward, abstract simple process concept, clean modern fintech design",
  },
];

const CONSUMER_RIGHTS: SocialTemplate[] = [
  {
    content: "Under the Consumer Rights Act 2015, if goods you bought are faulty within 30 days you are entitled to a full refund. No repair, no replacement, just your money back. After 30 days the retailer gets one chance to fix it. Try it free at paybacker.co.uk",
    hashtags: "#ConsumerRights #CRA2015 #FaultyGoods #Refund #PayBacker",
    image_prompt: "Dark navy background, gold 30-day calendar icon, faulty goods refund right concept, fintech style",
  },
  {
    content: "Section 75 of the Consumer Credit Act makes your credit card provider jointly liable for purchases between £100 and £30,000 if things go wrong. Even if the company goes bust. This is one of the most powerful consumer protections in the UK. Try it free at paybacker.co.uk",
    hashtags: "#Section75 #CreditCard #ConsumerRights #UKLaw #PayBacker",
    image_prompt: "Dark navy background, gold credit card with shield, Section 75 protection concept, modern design",
  },
  {
    content: "If you bought something online you have 14 days to return it for any reason under the Consumer Contracts Regulations 2013. No reason needed. The retailer must refund you within 14 days of receiving the item back. Try it free at paybacker.co.uk",
    hashtags: "#OnlineShopping #Returns #ConsumerRights #DistanceSelling #PayBacker",
    image_prompt: "Dark navy background, gold shopping cart with return arrow, 14-day return right concept, fintech aesthetic",
  },
  {
    content: "If a company fails to respond to your formal complaint within 8 weeks, you can escalate directly to the relevant ombudsman for free. The ombudsman decision is binding on the company, not on you. Try it free at paybacker.co.uk",
    hashtags: "#Ombudsman #ConsumerRights #Complaints #UKLaw #PayBacker",
    image_prompt: "Dark navy background, gold gavel icon, ombudsman escalation concept, clean fintech design",
  },
  {
    content: "Ofgem rules require energy suppliers to provide accurate bills based on actual meter readings, not estimates. If your bill is based on an estimate that seems too high, you have the right to challenge it and demand recalculation. Try it free at paybacker.co.uk",
    hashtags: "#Ofgem #EnergyBills #ConsumerRights #MoneySaving #PayBacker",
    image_prompt: "Dark navy background, gold energy meter icon, estimated bill challenge concept, modern design",
  },
  {
    content: "Under Ofcom rules, telecoms providers must give you clear, honest information about your contract terms, including the total cost and any mid contract price changes. If they failed to do this, you may be able to exit penalty free. Try it free at paybacker.co.uk",
    hashtags: "#Ofcom #Telecoms #ConsumerRights #ContractRights #PayBacker",
    image_prompt: "Dark navy background, gold mobile phone with contract, Ofcom transparency rules concept, fintech style",
  },
  {
    content: "Chargeback is a right you have through Visa and Mastercard to reverse a transaction if goods were not delivered, were defective, or the company misrepresented the product. Works on debit cards too, not just credit cards. Try it free at paybacker.co.uk",
    hashtags: "#Chargeback #ConsumerRights #DebitCard #Refund #PayBacker",
    image_prompt: "Dark navy background, gold card with reverse arrow, chargeback right concept, clean design",
  },
  {
    content: "If a tradesperson does work that is not of satisfactory quality, under the Consumer Rights Act 2015 you are entitled to a repeat performance at no extra cost, or a price reduction if that is not possible. Try it free at paybacker.co.uk",
    hashtags: "#ConsumerRights #CRA2015 #Tradesperson #ServiceRights #PayBacker",
    image_prompt: "Dark navy background, gold wrench with quality checkmark, service rights concept, fintech aesthetic",
  },
  {
    content: "The FCA requires that firms treat customers fairly. If you feel a financial services company has treated you unfairly, you can complain directly to them and escalate to the Financial Ombudsman Service if unsatisfied. Try it free at paybacker.co.uk",
    hashtags: "#FCA #FinancialOmbudsman #ConsumerRights #TreatCustomersFairly #PayBacker",
    image_prompt: "Dark navy background, gold scales of justice, FCA fair treatment concept, modern design",
  },
  {
    content: "If a delivery is left with a neighbour or in a location you did not agree to and it goes missing, the retailer is responsible, not the courier. Under the Consumer Rights Act, goods remain the seller's responsibility until they are in your possession. Try it free at paybacker.co.uk",
    hashtags: "#DeliveryRights #ConsumerRights #CRA2015 #OnlineShopping #PayBacker",
    image_prompt: "Dark navy background, gold parcel with location pin, delivery liability concept, fintech style",
  },
];

export const TEMPLATES: Record<string, SocialTemplate[]> = {
  money_tip: MONEY_TIP,
  complaint_win: COMPLAINT_WIN,
  product_feature: PRODUCT_FEATURE,
  consumer_rights: CONSUMER_RIGHTS,
};

const DEFAULT_IMAGE_PROMPTS: Record<string, string> = {
  money_tip: "Dark navy background, mint green glowing pound coin icon, money saving concept, clean fintech aesthetic",
  complaint_win: "Dark navy background, mint green glowing checkmark with pound sign, complaint success concept, fintech style",
  product_feature: "Dark navy background, mint green glowing document with scales of justice, AI disputes concept, modern fintech design",
  consumer_rights: "Dark navy background, mint green glowing scales of justice, UK consumer rights concept, clean design",
};

/**
 * Pick a template based on pillar and day-of-year rotation.
 * Cycles through all templates before repeating.
 */
export function pickTemplate(pillar: string, platformOffset: number = 0): SocialTemplate {
  const templates = TEMPLATES[pillar];
  if (!templates || templates.length === 0) {
    return {
      content: "Paybacker helps UK consumers get their money back. Try it free at paybacker.co.uk",
      hashtags: "#PayBacker #MoneySaving #ConsumerRights",
      image_prompt: DEFAULT_IMAGE_PROMPTS[pillar] || DEFAULT_IMAGE_PROMPTS.money_tip,
    };
  }

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const index = (dayOfYear + platformOffset) % templates.length;
  return templates[index];
}
