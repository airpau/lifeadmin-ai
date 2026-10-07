import type { Metadata } from "next";
import Link from "next/link";
import { PostShell, SIGNUP_HREF } from "../../blog/_shared";
import "../../blog/styles.css";

export const metadata: Metadata = {
  title: "Complaints procedure | Paybacker LTD",
  description:
    "How to complain to Paybacker, what happens next, how long it takes, and where to go if you are not happy with our answer, including the Financial Ombudsman Service for bank connection complaints.",
  alternates: { canonical: "https://paybacker.co.uk/legal/complaints-procedure" },
  openGraph: {
    title: "Complaints procedure | Paybacker LTD",
    description:
      "How to complain to Paybacker, what happens next and how long it takes.",
    url: "https://paybacker.co.uk/legal/complaints-procedure",
    siteName: "Paybacker",
    type: "website",
    locale: "en_GB",
  },
  twitter: {
    card: "summary",
    title: "Complaints procedure | Paybacker LTD",
    description: "How to complain to Paybacker, what happens next and how long it takes.",
  },
};

const TOC = [
  { id: "commitment", label: "1. Our commitment" },
  { id: "how-to-complain", label: "2. How to complain" },
  { id: "what-happens-next", label: "3. What happens next" },
  { id: "bank-connections", label: "4. Complaints about bank connections" },
  { id: "personal-data", label: "5. Complaints about personal data" },
  { id: "learning", label: "6. How we learn from complaints" },
];

export default function LegalComplaintsProcedurePage() {
  return (
    <PostShell
      section="legal"
      category="Legal"
      title="Complaints procedure"
      dek="If something has gone wrong with Paybacker, we want to know. This is how to tell us, what we will do and how long it takes."
      dateLabel="Last updated 7 October 2026"
      toc={TOC}
      aside={{
        eyebrow: "Need to complain?",
        title: "Email hello@paybacker.co.uk",
        description:
          "Put “Complaint” in the subject line. We acknowledge every complaint within 2 working days.",
        ctaLabel: "Start free",
        ctaHref: SIGNUP_HREF,
      }}
    >
      <h2 id="commitment">1. Our commitment</h2>
      <p>
        Paybacker exists to help people get a fair deal from the companies they
        pay, so we hold ourselves to the same standard. If something goes wrong
        we will listen, put it right where we can, and learn from it. Making a
        complaint is free and will never affect how we treat you.
      </p>

      <h2 id="how-to-complain">2. How to complain</h2>
      <ul>
        <li>
          <strong>Email:</strong>{" "}
          <a href="mailto:hello@paybacker.co.uk?subject=Complaint">hello@paybacker.co.uk</a>{" "}
          with &ldquo;Complaint&rdquo; in the subject line.
        </li>
        <li>
          <strong>In the app:</strong> open the support chat and ask for a
          person.
        </li>
        <li>
          <strong>By post:</strong> Paybacker LTD, 71-75 Shelton Street, Covent
          Garden, London, WC2H 9JQ.
        </li>
      </ul>
      <p>
        Please tell us your name, the email address on your account, what went
        wrong and what you would like us to do about it. If you need the process
        adapted, for example because of a disability or because you are going
        through a difficult time, just tell us and we will help.
      </p>

      <h2 id="what-happens-next">3. What happens next</h2>
      <ol>
        <li>
          <strong>Acknowledgement within 2 working days</strong>, with the name
          of the person looking into it.
        </li>
        <li>
          <strong>Investigation.</strong> We look at your account, our records
          and any correspondence, and we may ask you for more information.
        </li>
        <li>
          <strong>Final response within 15 working days</strong>, explaining
          what we found, what we will do and why. If we need longer, we will
          tell you why and when to expect our answer.
        </li>
      </ol>

      <h2 id="bank-connections">4. Complaints about bank connections</h2>
      <p>
        Paybacker connects to your bank through Yapily Connect Ltd, which is
        authorised and regulated by the Financial Conduct Authority. Access is
        read only, and you can disconnect at any time.
      </p>
      <p>
        If your complaint is about a bank connection or the account information
        we show you, we will send our final response within 15 business days.
        In exceptional circumstances we will send a holding reply explaining
        the delay, followed by a final response within 35 business days.
      </p>
      <p>
        If you are not happy with our final response, or you have not had it in
        time, you can refer your complaint to the Financial Ombudsman Service,
        free of charge, at{" "}
        <a href="https://www.financial-ombudsman.org.uk" rel="noopener noreferrer" target="_blank">
          financial-ombudsman.org.uk
        </a>{" "}
        or on 0800 023 4567.
      </p>

      <h2 id="personal-data">5. Complaints about personal data</h2>
      <p>
        If your complaint is about how we use your personal data and you are not
        happy with our answer, you can complain to the Information
        Commissioner&apos;s Office at{" "}
        <a href="https://ico.org.uk" rel="noopener noreferrer" target="_blank">ico.org.uk</a>.
        Our{" "}
        <Link href="/privacy-policy">privacy policy</Link> explains what data we hold
        and why.
      </p>

      <h2 id="learning">6. How we learn from complaints</h2>
      <p>
        Every complaint is logged with the date it arrived, the issue, the
        outcome and how long it took. The director reviews the log every month,
        looks for patterns and fixes the underlying cause, not just the single
        case. Complaint records are kept for at least six years.
      </p>
    </PostShell>
  );
}
