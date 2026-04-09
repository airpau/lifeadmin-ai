import { redirect } from 'next/navigation';

export default function LegalPrivacyRedirect() {
  redirect('/privacy-policy');
}
