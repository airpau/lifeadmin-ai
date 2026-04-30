// Legacy docs route — this URL has been renamed to /docs/paybacker-assistant.
// We keep this file as a permanent server-side redirect so old links, search
// results, blog posts and any cached references don't 404.
import { redirect } from "next/navigation";

export default function LegacyDocsRedirect() {
  redirect("/docs/paybacker-assistant");
}
