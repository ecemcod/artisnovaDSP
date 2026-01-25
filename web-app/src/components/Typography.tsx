import React from 'react';

export type TypographyVariant = 
  | 'display-large'
  | 'display'
  | 'headline-large'
  | 'headline'
  | 'title-large'
  | 'title'
  | 'body-large'
  | 'body'
  | 'caption-large'
  | 'caption'
  | 'artist-name'
  | 'album-title'
  | 'track-title'
  | 'metadata'
  | 'biography';

export type TypographyElement = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'div';

interface TypographyProps {
  variant: TypographyVariant;
  element?: TypographyElement;
  className?: string;
  children: React.ReactNode;
  color?: 'primary' | 'secondary' | 'muted' | 'accent';
  weight?: 'light' | 'normal' | 'medium' | 'semibold' | 'bold';
  truncate?: boolean;
  align?: 'left' | 'center' | 'right';
}

const variantToElementMap: Record<TypographyVariant, TypographyElement> = {
  'display-large': 'h1',
  'display': 'h1',
  'headline-large': 'h2',
  'headline': 'h2',
  'title-large': 'h3',
  'title': 'h3',
  'body-large': 'p',
  'body': 'p',
  'caption-large': 'span',
  'caption': 'span',
  'artist-name': 'h1',
  'album-title': 'h2',
  'track-title': 'h3',
  'metadata': 'span',
  'biography': 'p',
};

const colorClasses = {
  primary: 'text-text-primary',
  secondary: 'text-text-secondary',
  muted: 'text-text-muted',
  accent: 'text-accent-primary',
};

const weightClasses = {
  light: 'font-light',
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

const alignClasses = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

export const Typography: React.FC<TypographyProps> = ({
  variant,
  element,
  className = '',
  children,
  color = 'primary',
  weight,
  truncate = false,
  align = 'left',
}) => {
  const Component = element || variantToElementMap[variant];
  const variantClass = `text-${variant}`;
  const colorClass = colorClasses[color];
  const weightClass = weight ? weightClasses[weight] : '';
  const alignClass = alignClasses[align];
  const truncateClass = truncate ? 'truncate' : '';
  
  return (
    <Component className={`${variantClass} ${colorClass} ${weightClass} ${alignClass} ${truncateClass} ${className}`}>
      {children}
    </Component>
  );
};

// Specialized components for common use cases
export const ArtistName: React.FC<{ 
  children: React.ReactNode; 
  className?: string;
  truncate?: boolean;
}> = ({ children, className, truncate }) => (
  <Typography variant="artist-name" element="h1" className={className} truncate={truncate}>
    {children}
  </Typography>
);

export const AlbumTitle: React.FC<{ 
  children: React.ReactNode; 
  className?: string;
  truncate?: boolean;
}> = ({ children, className, truncate }) => (
  <Typography variant="album-title" element="h2" className={className} truncate={truncate}>
    {children}
  </Typography>
);

export const TrackTitle: React.FC<{ 
  children: React.ReactNode; 
  className?: string;
  truncate?: boolean;
}> = ({ children, className, truncate }) => (
  <Typography variant="track-title" element="h3" className={className} truncate={truncate}>
    {children}
  </Typography>
);

export const Metadata: React.FC<{ 
  children: React.ReactNode; 
  className?: string;
  label?: string;
}> = ({ children, className, label }) => (
  <div className={`space-y-1 ${className}`}>
    {label && (
      <Typography variant="caption" element="span" color="muted" className="block">
        {label}
      </Typography>
    )}
    <Typography variant="metadata" element="span" color="secondary">
      {children}
    </Typography>
  </div>
);

export const Biography: React.FC<{ 
  children: React.ReactNode; 
  className?: string;
}> = ({ children, className }) => (
  <Typography variant="biography" element="div" className={className}>
    {children}
  </Typography>
);

// Utility component for formatted text with proper paragraph breaks
export const FormattedText: React.FC<{ 
  text: string; 
  className?: string;
  variant?: TypographyVariant;
  maxLines?: number;
  showReadMore?: boolean;
}> = ({ text, className = '', variant = 'body-large', maxLines, showReadMore = false }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  if (!text) return null;
  
  const paragraphs = text.split('\n\n').filter(p => p.trim());
  const shouldTruncate = maxLines && !isExpanded;
  const displayParagraphs = shouldTruncate ? paragraphs.slice(0, maxLines) : paragraphs;
  const hasMore = paragraphs.length > (maxLines || 0);
  
  return (
    <div className={className}>
      {displayParagraphs.map((paragraph, index) => (
        <Typography key={index} variant={variant} element="p" className="mb-4 last:mb-0">
          {paragraph.trim()}
        </Typography>
      ))}
      
      {showReadMore && hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-accent-primary hover:text-accent-primary/80 text-sm font-medium mt-2 transition-colors"
        >
          {isExpanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
};

// Metadata list component for structured information
export const MetadataList: React.FC<{
  items: Array<{ label: string; value: React.ReactNode; key?: string }>;
  className?: string;
  layout?: 'vertical' | 'horizontal';
}> = ({ items, className = '', layout = 'vertical' }) => {
  const containerClass = layout === 'horizontal' 
    ? 'flex flex-wrap gap-x-6 gap-y-2' 
    : 'space-y-3';
  
  return (
    <dl className={`${containerClass} ${className}`}>
      {items.map((item, index) => (
        <div key={item.key || index} className={layout === 'horizontal' ? '' : 'flex flex-col'}>
          <dt className="text-caption text-text-muted mb-1">
            {item.label}
          </dt>
          <dd className="text-metadata text-text-secondary">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
};

// Tag component for genres, labels, etc.
export const Tag: React.FC<{
  children: React.ReactNode;
  variant?: 'default' | 'accent' | 'muted';
  size?: 'small' | 'medium';
  clickable?: boolean;
  onClick?: () => void;
  className?: string;
}> = ({ 
  children, 
  variant = 'default', 
  size = 'medium', 
  clickable = false, 
  onClick, 
  className = '' 
}) => {
  const baseClasses = 'inline-flex items-center rounded-full font-medium transition-colors';
  
  const variantClasses = {
    default: 'bg-bg-card text-text-secondary border border-border-subtle',
    accent: 'bg-accent-primary/10 text-accent-primary border border-accent-primary/20',
    muted: 'bg-bg-panel text-text-muted',
  };
  
  const sizeClasses = {
    small: 'px-2 py-1 text-xs',
    medium: 'px-3 py-1.5 text-sm',
  };
  
  const interactiveClasses = clickable 
    ? 'cursor-pointer hover:opacity-80 active:scale-95' 
    : '';
  
  const Component = clickable ? 'button' : 'span';
  
  return (
    <Component
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${interactiveClasses} ${className}`}
      onClick={onClick}
    >
      {children}
    </Component>
  );
};