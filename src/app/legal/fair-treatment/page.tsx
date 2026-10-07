import type { Metadata } from "next";
import Link from "next/link";
import { PostShell, SIGNUP_HREF } from "../../blog/_shared";
import "../../blog/styles.css";

export const metadata: Metadata = {
  title: "Treating customers fairly | Paybacker LTD",
  description:
    "Paybacker's commitment to treating customers fairly, in line with the FCA's Consumer Duty: clear prices, plain English, easy cancellation, real support and extra help for anyone in vulnerable circumstances.",
  alternates: { canonical: "https://paybacker.co.uk/legal/fair-treatment" },
  openGraph: {
    title: "Treating customers fairly | Paybacker LTD",
    description:
      "Clear prices, plain English, easy cancellation and extra help when you need it.",
    url: "https://paybacker.co.uk/legal/fair-treatment",
    siteName: "Paybacker",
    type: "website",
    locale: "en_GB",
  },
  twitter: {
    card: "summary",
    title: "Treating customers fairly | Paybacker LTD",
    description: "Clear prices, plain English, easy cancellation and extra help when you need it.",
  },
};

const TOC = [
  { id: "commitment", label: "1. Our commitment" },
  { id: "products", label: "2. Products built for you" },
  { id: "price-value", label: "3. Fair prices" },
  { id: "understanding", label: "4. Plain English" },
  { id: "support", label: "5. Help when you need it" },
  { id: "vulnerable", label: "6. Extra help in difficult times" },
  { id: "monitoring", label: "7. How we check we are getting it right" },
];

export default function LegalFairTreatmentPage() {
  return (
    <PostShell
      section="legal"
      category="Legal"
      title="Treating customers fairly"
      dek="We built Paybacker to help households get a fair deal. These are the promises we make about how we treat you."
      dateLabel="Last updated 7 October 2026"
      toc={TOC}
      aside={{
        eyebrow: "Something not right?",
        title: "Tell us",
        description:
          "Email hello@paybacker.co.uk or ask for a person in the app chat. We read every message.",
        ctaLabel: "Start free",
        ctaHref: SIGNUP_HREF,
      }}
    >
      <h2 id="commitment">1. Our commitment</h2>
      <p>
        We act in good faith, avoid causing harm we could see coming, and help
        you get what you came to us for. This follows the Financial Conduct
        Authority&apos;s Consumer Duty and its principles for treating
        customers fairly, and we hold every part of Paybacker to it, not only
        the parts that involve your bank.
      </p>

      <h2 id="products">2. Products built for you</h2>
      <ul>
        <li>
          Every feature is designed for UK households who want to understand
          and cut their bills.
        </li>
        <li>
          We test features with real users before launch, and we watch
          complaints and outcomes for any sign that a feature is not working
          for the people using it.
        </li>
      </ul>

      <h2 id="price-value">3. Fair prices</h2>
      <ul>
        <li>
          Clear plans shown before you sign up: a free plan and two paid plans,
          priced in pounds. See our <Link href="/pricing">pricing</Link>.
        </li>
        <li>No hidden fees, and no charge for connecting a bank.</li>
        <li>You can cancel at any time from your account.</li>
        <li>
          We never renew or upgrade a paid plan without you knowing, and we
          never surprise you with a charge.
        </li>
      </ul>

      <h2 id="understanding">4. Plain English</h2>
      <ul>
        <li>
          Before you connect a bank we explain what we will see, why, for how
          long, and that access is read only.
        </li>
        <li>
          Your bank consent lasts 90 days and you can withdraw it at any time.
        </li>
        <li>
          Letters written with our AI cite the law they rely on, from official
          sources, and you read and approve every letter before it is sent.
        </li>
      </ul>

      <h2 id="support">5. Help when you need it</h2>
      <ul>
        <li>
          Help through the in-app assistant and by email, with a route to a
          person at any time.
        </li>
        <li>
          Cancelling, disconnecting a bank, downloading your data or deleting
          your account is as easy as signing up.
        </li>
        <li>
          If you are unhappy with us, our{" "}
          <Link href="/legal/complaints-procedure">complaints procedure</Link>{" "}
          explains what to do.
        </li>
      </ul>

      <h2 id="vulnerable">6. Extra help in difficult times</h2>
      <p>
        Money worries, ill health, bereavement and other life events can make
        everything harder. If you tell us you need extra help, we can offer
        different ways to contact us and more time, and we will point you to
        free, independent debt advice such as{" "}
        <a href="https://www.moneyhelper.org.uk" rel="noopener noreferrer" target="_blank">MoneyHelper</a>{" "}
        and{" "}
        <a href="https://www.stepchange.org" rel="noopener noreferrer" target="_blank">StepChange</a>.
        Anything you tell us about your circumstances is only used to help
        you, and is handled as sensitive information.
      </p>

      <h2 id="monitoring">7. How we check we are getting it right</h2>
      <p>
        Every month the director reviews complaints, cancellations, support
        conversations and how features are working for customers, looking for
        any sign of unfair outcomes, and acts on what he finds. This policy is
        reviewed every year using that evidence.
      </p>
    </PostShell>
  );
}
