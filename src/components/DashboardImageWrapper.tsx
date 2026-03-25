'use client';

import { LazyImage, DEFAULT_BLUR_DATA_URL } from './LazyImage';

interface DashboardImageWrapperProps {
  src: string;
  alt: string;
  className?: string;
  aspectRatio?: 'square' | 'video' | 'wide' | 'tall';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  rounded?: boolean;
  priority?: boolean;
}

const aspectRatioClasses = {
  square: 'aspect-square',
  video: 'aspect-video',
  wide: 'aspect-[16/9]',
  tall: 'aspect-[3/4]'
};

const sizeClasses = {
  sm: 'w-16 h-16',
  md: 'w-24 h-24', 
  lg: 'w-32 h-32',
  xl: 'w-48 h-48'
};

/**
 * Wrapper component for dashboard images with consistent styling and lazy loading
 */
export function DashboardImageWrapper({
  src,
  alt,
  className = '',
  aspectRatio = 'square',
  size,
  rounded = true,
  priority = false
}: DashboardImageWrapperProps) {
  const containerClasses = `
    relative
    ${size ? sizeClasses[size] : aspectRatioClasses[aspectRatio]}
    ${rounded ? 'rounded-lg' : ''}
    ${className}
  `.trim();

  return (
    <LazyImage
      src={src}
      alt={alt}
      fill
      sizes={size ? undefined : "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"}
      className={containerClasses}
      placeholder="blur"
      blurDataURL={DEFAULT_BLUR_DATA_URL}
      priority={priority}
    />
  );
}

/**
 * Avatar component for user profile images
 */
export function DashboardAvatar({
  src,
  alt,
  size = 'md',
  className = ''
}: {
  src: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <DashboardImageWrapper
      src={src}
      alt={alt}
      size={size}
      className={`rounded-full ${className}`}
      rounded={false} // We handle rounding manually for avatars
      priority={true} // Avatars are usually above fold
    />
  );
}

/**
 * Company logo component with consistent styling
 */
export function CompanyLogo({
  src,
  alt,
  className = ''
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <DashboardImageWrapper
      src={src}
      alt={alt}
      size="md"
      className={`bg-white p-2 ${className}`}
      rounded={true}
    />
  );
}

/**
 * Deal/offer image component
 */
export function DealImage({
  src,
  alt,
  className = ''
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <DashboardImageWrapper
      src={src}
      alt={alt}
      aspectRatio="video"
      className={className}
      rounded={true}
    />
  );
}