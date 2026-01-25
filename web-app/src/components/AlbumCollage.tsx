import React from 'react';
import { AlbumArtwork, type ImageSet } from './ProgressiveImage';

export interface Album {
  id: string;
  title: string;
  artist: string;
  artwork?: string | ImageSet | null;
  year?: number;
}

export type CollageLayout = 'grid-2x2' | 'grid-3x3' | 'mosaic' | 'strip';

interface AlbumCollageProps {
  albums: Album[];
  layout?: CollageLayout;
  className?: string;
  maxAlbums?: number;
  onAlbumClick?: (album: Album) => void;
}

const layoutClasses = {
  'grid-2x2': 'grid-cols-2 grid-rows-2',
  'grid-3x3': 'grid-cols-3 grid-rows-3',
  'mosaic': 'grid-cols-4 grid-rows-4',
  'strip': 'grid-cols-6 grid-rows-1',
};

const getAlbumSizeForLayout = (layout: CollageLayout, index: number): 'small' | 'medium' => {
  switch (layout) {
    case 'grid-2x2':
      return 'medium';
    case 'grid-3x3':
      return 'small';
    case 'mosaic':
      // First album is larger in mosaic
      return index === 0 ? 'medium' : 'small';
    case 'strip':
      return 'small';
    default:
      return 'medium';
  }
};

const getMosaicItemClasses = (index: number): string => {
  // First item spans 2x2 in mosaic layout
  if (index === 0) {
    return 'col-span-2 row-span-2';
  }
  return '';
};

export const AlbumCollage: React.FC<AlbumCollageProps> = ({
  albums,
  layout = 'grid-2x2',
  className = '',
  maxAlbums = layout === 'strip' ? 6 : layout === 'grid-3x3' ? 9 : 4,
  onAlbumClick
}) => {
  const displayAlbums = albums.slice(0, maxAlbums);
  const layoutClass = layoutClasses[layout];

  if (displayAlbums.length === 0) {
    return (
      <div className={`aspect-square bg-bg-card rounded-lg flex items-center justify-center ${className}`}>
        <div className="text-text-muted text-center">
          <div className="text-4xl mb-2">♪</div>
          <div className="text-sm">No albums</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid gap-1 ${layoutClass} ${className}`}>
      {displayAlbums.map((album, index) => {
        const itemClasses = layout === 'mosaic' ? getMosaicItemClasses(index) : '';
        const albumSize = getAlbumSizeForLayout(layout, index);
        
        return (
          <div
            key={album.id}
            className={`${itemClasses} ${onAlbumClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
            onClick={() => onAlbumClick?.(album)}
            title={`${album.title} (${album.year || 'Unknown year'})`}
          >
            <AlbumArtwork
              src={album.artwork}
              album={album.title}
              artist={album.artist}
              size={albumSize}
              className="w-full h-full"
            />
          </div>
        );
      })}
      
      {/* Fill empty slots with placeholders if needed */}
      {Array.from({ length: maxAlbums - displayAlbums.length }).map((_, index) => (
        <div
          key={`placeholder-${index}`}
          className="aspect-square bg-bg-panel rounded opacity-30"
        />
      ))}
    </div>
  );
};

// Specialized collage components
export const ArtistDiscographyCollage: React.FC<{
  albums: Album[];
  className?: string;
  onAlbumClick?: (album: Album) => void;
}> = ({ albums, className, onAlbumClick }) => {
  const sortedAlbums = [...albums].sort((a, b) => (b.year || 0) - (a.year || 0));
  
  return (
    <div className={className}>
      <div className="mb-3">
        <h3 className="text-title font-medium text-text-primary mb-1">Discography</h3>
        <p className="text-caption text-text-secondary">
          {albums.length} album{albums.length !== 1 ? 's' : ''}
        </p>
      </div>
      <AlbumCollage
        albums={sortedAlbums}
        layout="grid-3x3"
        maxAlbums={9}
        onAlbumClick={onAlbumClick}
      />
    </div>
  );
};

export const RelatedAlbumsStrip: React.FC<{
  albums: Album[];
  title?: string;
  className?: string;
  onAlbumClick?: (album: Album) => void;
}> = ({ albums, title = "Related Albums", className, onAlbumClick }) => (
  <div className={className}>
    <div className="mb-3">
      <h3 className="text-title font-medium text-text-primary">{title}</h3>
    </div>
    <AlbumCollage
      albums={albums}
      layout="strip"
      maxAlbums={6}
      onAlbumClick={onAlbumClick}
      className="w-full"
    />
  </div>
);

export default AlbumCollage;