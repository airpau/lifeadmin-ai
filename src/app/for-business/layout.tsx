import BusinessChatWidget from '@/components/BusinessChatWidget';

/**
 * /for-business segment layout.
 *
 * Mounts BusinessChatWidget for the entire B2B surface (/for-business and
 * all subroutes: /docs, /coverage, /thanks). The consumer ChatWidget
 * self-hides on any path starting /for-business so they never appear
 * together — different audience, different voice, different prompt.
 */
export default function ForBusinessLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BusinessChatWidget />
    </>
  );
}
