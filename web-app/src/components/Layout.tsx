import React from 'react';

// Base content section with consistent spacing
interface ContentSectionProps {
  children: React.ReactNode;
  className?: string;
  spacing?: 'tight' | 'normal' | 'loose';
  background?: 'transparent' | 'panel' | 'card';
}

const spacingClasses = {
  tight: 'p-4',
  normal: 'p-6',
  loose: 'p-8',
};

const backgroundClasses = {
  transparent: '',
  panel: 'bg-bg-panel',
  card: 'bg-bg-card',
};

export const ContentSection: React.FC<ContentSectionProps> = ({
  children,
  className = '',
  spacing = 'normal',
  background = 'transparent'
}) => {
  const spacingClass = spacingClasses[spacing];
  const backgroundClass = backgroundClasses[background];
  
  return (
    <section className={`${spacingClass} ${backgroundClass} ${className}`}>
      {children}
    </section>
  );
};

// Two-column layout for content and sidebar
interface TwoColumnLayoutProps {
  main: React.ReactNode;
  sidebar: React.ReactNode;
  className?: string;
  mainClassName?: string;
  sidebarClassName?: string;
  sidebarPosition?: 'left' | 'right';
  sidebarWidth?: 'narrow' | 'normal' | 'wide';
}

const sidebarWidthClasses = {
  narrow: 'w-64',
  normal: 'w-80',
  wide: 'w-96',
};

export const TwoColumnLayout: React.FC<TwoColumnLayoutProps> = ({
  main,
  sidebar,
  className = '',
  mainClassName = '',
  sidebarClassName = '',
  sidebarPosition = 'right',
  sidebarWidth = 'normal'
}) => {
  const sidebarWidthClass = sidebarWidthClasses[sidebarWidth];
  
  return (
    <div className={`flex gap-8 ${className}`}>
      {sidebarPosition === 'left' && (
        <aside className={`flex-shrink-0 ${sidebarWidthClass} ${sidebarClassName}`}>
          {sidebar}
        </aside>
      )}
      
      <main className={`flex-1 min-w-0 ${mainClassName}`}>
        {main}
      </main>
      
      {sidebarPosition === 'right' && (
        <aside className={`flex-shrink-0 ${sidebarWidthClass} ${sidebarClassName}`}>
          {sidebar}
        </aside>
      )}
    </div>
  );
};

// Image and text layout (hero sections)
interface ImageTextLayoutProps {
  image: React.ReactNode;
  content: React.ReactNode;
  className?: string;
  imageClassName?: string;
  contentClassName?: string;
  layout?: 'horizontal' | 'vertical';
  imagePosition?: 'left' | 'right' | 'top' | 'bottom';
  imageSize?: 'small' | 'medium' | 'large';
  alignment?: 'start' | 'center' | 'end';
}

const imageSizeClasses = {
  horizontal: {
    small: 'w-32',
    medium: 'w-48',
    large: 'w-64',
  },
  vertical: {
    small: 'h-32',
    medium: 'h-48',
    large: 'h-64',
  },
};

const alignmentClasses = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
};

export const ImageTextLayout: React.FC<ImageTextLayoutProps> = ({
  image,
  content,
  className = '',
  imageClassName = '',
  contentClassName = '',
  layout = 'horizontal',
  imagePosition = 'left',
  imageSize = 'medium',
  alignment = 'start'
}) => {
  const isHorizontal = layout === 'horizontal';
  const flexDirection = isHorizontal 
    ? (imagePosition === 'left' ? 'flex-row' : 'flex-row-reverse')
    : (imagePosition === 'top' ? 'flex-col' : 'flex-col-reverse');
  
  const imageSizeClass = imageSizeClasses[layout][imageSize];
  const alignmentClass = alignmentClasses[alignment];
  const gap = isHorizontal ? 'gap-6' : 'gap-4';
  
  return (
    <div className={`flex ${flexDirection} ${gap} ${alignmentClass} ${className}`}>
      <div className={`flex-shrink-0 ${imageSizeClass} ${imageClassName}`}>
        {image}
      </div>
      <div className={`flex-1 min-w-0 ${contentClassName}`}>
        {content}
      </div>
    </div>
  );
};

// Hero section for main content
interface HeroSectionProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  image?: React.ReactNode;
  actions?: React.ReactNode;
  metadata?: React.ReactNode;
  className?: string;
  background?: 'transparent' | 'panel' | 'gradient';
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  title,
  subtitle,
  image,
  actions,
  metadata,
  className = '',
  background = 'transparent'
}) => {
  const backgroundClass = background === 'gradient' 
    ? 'bg-gradient-to-b from-bg-panel to-transparent'
    : background === 'panel' 
    ? 'bg-bg-panel'
    : '';
  
  return (
    <section className={`${backgroundClass} ${className}`}>
      <div className="p-8">
        {image && (
          <ImageTextLayout
            image={image}
            content={
              <div className="space-y-4">
                <div>
                  {title}
                  {subtitle && <div className="mt-2">{subtitle}</div>}
                </div>
                {metadata && <div>{metadata}</div>}
                {actions && <div className="pt-2">{actions}</div>}
              </div>
            }
            layout="horizontal"
            imagePosition="left"
            imageSize="large"
            alignment="center"
          />
        )}
        
        {!image && (
          <div className="space-y-4">
            <div>
              {title}
              {subtitle && <div className="mt-2">{subtitle}</div>}
            </div>
            {metadata && <div>{metadata}</div>}
            {actions && <div className="pt-2">{actions}</div>}
          </div>
        )}
      </div>
    </section>
  );
};

// Grid layout for cards/items
interface GridLayoutProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4 | 5 | 6;
  gap?: 'small' | 'medium' | 'large';
  className?: string;
}

const columnClasses = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

const gapClasses = {
  small: 'gap-2',
  medium: 'gap-4',
  large: 'gap-6',
};

export const GridLayout: React.FC<GridLayoutProps> = ({
  children,
  columns = 3,
  gap = 'medium',
  className = ''
}) => {
  const columnClass = columnClasses[columns];
  const gapClass = gapClasses[gap];
  
  return (
    <div className={`grid ${columnClass} ${gapClass} ${className}`}>
      {children}
    </div>
  );
};

// Responsive container with max width
interface ContainerProps {
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large' | 'full';
  className?: string;
}

const containerSizeClasses = {
  small: 'max-w-2xl',
  medium: 'max-w-4xl',
  large: 'max-w-6xl',
  full: 'max-w-full',
};

export const Container: React.FC<ContainerProps> = ({
  children,
  size = 'large',
  className = ''
}) => {
  const sizeClass = containerSizeClasses[size];
  
  return (
    <div className={`mx-auto px-4 ${sizeClass} ${className}`}>
      {children}
    </div>
  );
};