'use client';

import dynamic from 'next/dynamic';

const PostHogTracker = dynamic(
  () => import('@/components/PostHogTracker'),
  { ssr: false }
);

export default function PostHogTrackerLoader() {
  return <PostHogTracker />;
}
