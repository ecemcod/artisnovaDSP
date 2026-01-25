import React, { useState, useRef, useEffect } from 'react';
import { User, Disc, Music } from 'lucide-react';
import { useProgressiveImage } from '../hooks/useProgressiveImage';

export interface ImageSet {
  thumbnail?: string;
  small?: string;
  medium?: string;
  large?: string;
  original?: string;
}

interface ProgressiveImageProps {
  src?: string | ImageSet | null;
  alt: string;
  className?: string;
  fallbackType?: 'artist' | 'album' | 'generic';
  size?: 'small' | 'medium' | 'large' | 'hero';
  aspectRatio?: 'square' | '16:9' | '4:3' | 'auto';
  onLoad?: () => void;
  onError?: () => void;
  showSkeleton?: boolean;
  priority?: boolean;
}

const sizeClasses = {
  small: 'w-16 h-16',
  medium: 'w-32 h-32',
  large: 'w-48 h-48',
  hero: 'w-full h-96',
};

const aspectRatioClasses = {
  square: 'aspect-square',
  '16:9': 'aspect-video',
  '4:3': 'aspect-[4/3]',
  auto: '',
};

export const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  src,
  alt,
  className = '',
  fallbackType = 'generic',
  size = 'medium',
  aspectRatio = 'square',
  onLoad,
  onError,
  showSkeleton = true,
  priority = false
}) => {
  const [isIntersecting, setIsIntersecting] = useState(priority);
  const imgRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '50px' }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [priority]);

  // Extract the best image URL from ImageSet or string
  const getImageUrl = (imageSource: string | ImageSet | null | undefined): string | null => {
    if (!imageSource) return null;
    if (typeof imageSource === 'string') return imageSource;
    
    // For ImageSet, choose appropriate size
    const sizeMap = {
      small: imageSource.small || imageSource.thumbnail || imageSource.medium,
      medium: imageSource.medium || imageSource.small || imageSource.large,
      large: imageSource.large || imageSource.medium || imageSource.original,
      hero: imageSource.original || imageSource.large || imageSource.medium,
    };
    
    return sizeMap[size] || imageSource.medium || imageSource.small || imageSource.thumbnail || null;
  };

  const imageUrl = getImageUrl(src);
  const { src: imageSrc, loading, error } = useProgressiveImage(
    isIntersecting ? imageUrl : null,
    { onLoad, onError }
  );

  const getFallbackIcon = () => {
    const iconClass = "w-1/3 h-1/3 text-text-muted opacity-40";
    switch (fallbackType) {
      case 'artist':
        return <User className={iconClass} />;
      case 'album':
        return <Disc className={iconClass} />;
      default:
        return <Music className={iconClass} />;
    }
  };

  const containerClasses = `
    ${sizeClasses[size]} 
    ${aspectRatioClasses[aspectRatio]}
    ${className}
    relative overflow-hidden rounded-lg bg-bg-card
  `.trim();

  // Skeleton loading state
  if ((loading || !isIntersecting) && showSkeleton) {
    return (
      <div ref={imgRef} className={containerClasses}>
        <div className="absolute inset-0 bg-gradient-to-br from-bg-panel to-bg-card animate-pulse">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-1/4 h-1/4 bg-text-muted opacity-20 rounded-full animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  // Error or no image fallback
  if (error || !imageSrc) {
    return (
      <div ref={imgRef} className={containerClasses}>
        <div className="absolute inset-0 bg-gradient-to-br from-bg-panel to-bg-card flex items-center justify-center">
          {getFallbackIcon()}
        </div>
      </div>
    );
  }

  // Successful image load
  return (
    <div ref={imgRef} className={containerClasses}>
      <img
        src={imageSrc}
        alt={alt}
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
        loading={priority ? "eager" : "lazy"}
        decoding="async"
      />
    </div>
  );
};

// Specialized image components for common use cases
export const ArtistImage: React.FC<{
  src?: string | ImageSet | null;
  name: string;
  size?: 'small' | 'medium' | 'large' | 'hero';
  className?: string;
}> = ({ src, name, size = 'medium', className }) => (
  <ProgressiveImage
    src={src}
    alt={`${name} artist photo`}
    fallbackType="artist"
    size={size}
    aspectRatio="square"
    className={className}
  />
);

export const AlbumArtwork: React.FC<{
  src?: string | ImageSet | null;
  album: string;
  artist: string;
  size?: 'small' | 'medium' | 'large' | 'hero';
  className?: string;
}> = ({ src, album, artist, size = 'medium', className }) => (
  <ProgressiveImage
    src={src}
    alt={`${album} by ${artist} album cover`}
    fallbackType="album"
    size={size}
    aspectRatio="square"
    className={className}
  />
);

export default ProgressiveImage;