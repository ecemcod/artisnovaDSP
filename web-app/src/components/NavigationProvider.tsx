import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { musicRouter, type NavigationState, type NavigationEntry } from '../utils/MusicInfoRouter';

interface NavigationContextType {
  state: NavigationState;
  navigate: (view: string, id?: string, data?: any, title?: string) => void;
  goBack: () => boolean;
  goForward: () => boolean;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getBreadcrumbs: () => NavigationEntry[];
  createDeepLink: (view: string, id?: string, params?: Record<string, string>) => string;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

interface NavigationProviderProps {
  children: ReactNode;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ children }) => {
  const [state, setState] = useState<NavigationState>(musicRouter.getState());

  useEffect(() => {
    // Subscribe to navigation state changes
    const unsubscribe = musicRouter.subscribe((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  // Navigation event handling
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Handle keyboard shortcuts
      if (event.altKey) {
        switch (event.key) {
          case 'ArrowLeft':
            event.preventDefault();
            musicRouter.goBack();
            break;
          case 'ArrowRight':
            event.preventDefault();
            musicRouter.goForward();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const contextValue: NavigationContextType = {
    state,
    navigate: musicRouter.navigate.bind(musicRouter),
    goBack: musicRouter.goBack.bind(musicRouter),
    goForward: musicRouter.goForward.bind(musicRouter),
    canGoBack: musicRouter.canGoBack.bind(musicRouter),
    canGoForward: musicRouter.canGoForward.bind(musicRouter),
    getBreadcrumbs: musicRouter.getBreadcrumbs.bind(musicRouter),
    createDeepLink: musicRouter.createDeepLink.bind(musicRouter)
  };

  return (
    <NavigationContext.Provider value={contextValue}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = (): NavigationContextType => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};

// Hook for navigation state only
export const useNavigationState = (): NavigationState => {
  const { state } = useNavigation();
  return state;
};

// Hook for specific navigation actions
export const useNavigationActions = () => {
  const { navigate, goBack, goForward, canGoBack, canGoForward } = useNavigation();
  return { navigate, goBack, goForward, canGoBack, canGoForward };
};