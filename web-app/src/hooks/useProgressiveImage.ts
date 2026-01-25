import { useState, useEffect } from 'react';

interface UseProgressiveImageOptions {
  fallbackUrl?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export const useProgressiveImage = (
  src: string | undefined | null,
  options: UseProgressiveImageOptions = {}
) => {
  const [imageState, setImageState] = useState<{
    src: string | null;
    loading: boolean;
    error: boolean;
  }>({
    src: null,
    loading: false,
    error: false
  });

  useEffect(() => {
    if (!src) {
      setImageState({
        src: options.fallbackUrl || null,
        loading: false,
        error: !options.fallbackUrl
      });
      return;
    }

    setImageState(prev => ({ ...prev, loading: true, error: false }));

    const img = new Image();
    
    img.onload = () => {
      setImageState({
        src: src,
        loading: false,
        error: false
      });
      options.onLoad?.();
    };

    img.onerror = () => {
      setImageState({
        src: options.fallbackUrl || null,
        loading: false,
        error: true
      });
      options.onError?.();
    };

    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src, options.fallbackUrl]);

  return imageState;
};

export default useProgressiveImage;