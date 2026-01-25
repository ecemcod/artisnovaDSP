import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useNavigation } from './NavigationProvider';

export const NavigationControls: React.FC = () => {
  const { canGoBack, canGoForward, goBack, goForward } = useNavigation();

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey) {
        if (event.key === 'ArrowLeft' && canGoBack()) {
          event.preventDefault();
          goBack();
        } else if (event.key === 'ArrowRight' && canGoForward()) {
          event.preventDefault();
          goForward();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canGoBack, canGoForward, goBack, goForward]);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={goBack}
        disabled={!canGoBack()}
        className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Go back (Alt + ←)"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>
      
      <button
        onClick={goForward}
        disabled={!canGoForward()}
        className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Go forward (Alt + →)"
      >
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
};