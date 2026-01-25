import React, { createContext, useContext, useState, type ReactNode } from 'react';

interface SimpleNavigationState {
  currentView: 'home' | 'artist' | 'album' | 'search';
  currentId?: string;
  currentData?: any;
  currentTitle?: string;
}

interface SimpleNavigationContextType {
  state: SimpleNavigationState;
  navigate: (view: string, id?: string, data?: any, title?: string) => void;
  goHome: () => void;
}

const SimpleNavigationContext = createContext<SimpleNavigationContextType | null>(null);

interface SimpleNavigationProviderProps {
  children: ReactNode;
}

export const SimpleNavigationProvider: React.FC<SimpleNavigationProviderProps> = ({ children }) => {
  const [state, setState] = useState<SimpleNavigationState>({
    currentView: 'home'
  });

  const navigate = (view: string, id?: string, data?: any, title?: string) => {
    console.log('SimpleNavigationProvider: Navigate called', { view, id, title });
    setState({
      currentView: view as any,
      currentId: id,
      currentData: data,
      currentTitle: title
    });
  };

  const goHome = () => {
    console.log('SimpleNavigationProvider: Going home');
    setState({
      currentView: 'home'
    });
  };

  const contextValue: SimpleNavigationContextType = {
    state,
    navigate,
    goHome
  };

  return (
    <SimpleNavigationContext.Provider value={contextValue}>
      {children}
    </SimpleNavigationContext.Provider>
  );
};

export const useSimpleNavigation = (): SimpleNavigationContextType => {
  const context = useContext(SimpleNavigationContext);
  if (!context) {
    throw new Error('useSimpleNavigation must be used within a SimpleNavigationProvider');
  }
  return context;
};