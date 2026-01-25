export interface NavigationState {
  currentView: 'artist' | 'album' | 'label' | 'genre' | 'search' | 'home';
  currentId?: string;
  currentData?: any;
  history: NavigationEntry[];
  historyIndex: number;
}

export interface NavigationEntry {
  view: string;
  id?: string;
  title: string;
  url: string;
  timestamp: number;
}

export interface RouteParams {
  view: string;
  id?: string;
  query?: string;
  filters?: Record<string, string>;
}

export class MusicInfoRouter {
  private state: NavigationState;
  private listeners: Set<(state: NavigationState) => void> = new Set();
  private maxHistorySize = 50;

  constructor() {
    this.state = {
      currentView: 'home',
      history: [],
      historyIndex: -1
    };
    
    // Initialize from URL if available
    this.initializeFromURL();
    
    // Listen to browser navigation
    window.addEventListener('popstate', this.handlePopState.bind(this));
  }

  // Navigation state management
  navigate(view: string, id?: string, data?: any, title?: string): void {
    const url = this.generateURL(view, id);
    const entry: NavigationEntry = {
      view,
      id,
      title: title || this.generateTitle(view, id, data),
      url,
      timestamp: Date.now()
    };

    // Add to history
    this.addToHistory(entry);
    
    // Update current state
    this.state.currentView = view as any;
    this.state.currentId = id;
    this.state.currentData = data;
    
    // Update browser URL
    window.history.pushState({ view, id, data }, entry.title, url);
    
    // Notify listeners
    this.notifyListeners();
  }

  // Navigation history tracking
  private addToHistory(entry: NavigationEntry): void {
    // Remove any entries after current index (when navigating from middle of history)
    if (this.state.historyIndex < this.state.history.length - 1) {
      this.state.history = this.state.history.slice(0, this.state.historyIndex + 1);
    }
    
    // Add new entry
    this.state.history.push(entry);
    this.state.historyIndex = this.state.history.length - 1;
    
    // Limit history size
    if (this.state.history.length > this.maxHistorySize) {
      this.state.history = this.state.history.slice(-this.maxHistorySize);
      this.state.historyIndex = this.state.history.length - 1;
    }
  }

  // Back/forward functionality
  canGoBack(): boolean {
    return this.state.historyIndex > 0;
  }

  canGoForward(): boolean {
    return this.state.historyIndex < this.state.history.length - 1;
  }

  goBack(): boolean {
    if (!this.canGoBack()) return false;
    
    this.state.historyIndex--;
    const entry = this.state.history[this.state.historyIndex];
    
    this.state.currentView = entry.view as any;
    this.state.currentId = entry.id;
    
    window.history.back();
    this.notifyListeners();
    return true;
  }

  goForward(): boolean {
    if (!this.canGoForward()) return false;
    
    this.state.historyIndex++;
    const entry = this.state.history[this.state.historyIndex];
    
    this.state.currentView = entry.view as any;
    this.state.currentId = entry.id;
    
    window.history.forward();
    this.notifyListeners();
    return true;
  }

  // URL generation and parsing
  generateURL(view: string, id?: string, params?: Record<string, string>): string {
    let url = `/music/${view}`;
    
    if (id) {
      url += `/${encodeURIComponent(id)}`;
    }
    
    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }
    
    return url;
  }

  parseURL(url: string): RouteParams | null {
    try {
      const urlObj = new URL(url, window.location.origin);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      if (pathParts[0] !== 'music') return null;
      
      const view = pathParts[1];
      const id = pathParts[2] && pathParts[2] !== '.' ? decodeURIComponent(pathParts[2]) : undefined;
      
      const filters: Record<string, string> = {};
      urlObj.searchParams.forEach((value, key) => {
        // Skip __proto__ and other prototype pollution attempts
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          return;
        }
        filters[key] = value;
      });
      
      // Only include filters if there are actual filter parameters (not just query)
      const query = filters.q;
      
      // Remove query from filters since it's handled separately
      if (query) {
        delete filters.q;
      }
      
      return {
        view,
        id: id || undefined,
        query,
        filters: Object.keys(filters).length > 0 ? filters : undefined
      };
    } catch (error) {
      console.error('MusicInfoRouter: Error parsing URL:', error);
      return null;
    }
  }

  private generateTitle(view: string, id?: string, data?: any): string {
    switch (view) {
      case 'artist':
        return data?.name || id || 'Artist';
      case 'album':
        return data?.title || data?.name || id || 'Album';
      case 'label':
        return data?.name || id || 'Label';
      case 'genre':
        return data?.name || id || 'Genre';
      case 'search':
        return `Search: ${id || ''}`;
      default:
        return 'Music Info';
    }
  }

  private initializeFromURL(): void {
    const params = this.parseURL(window.location.href);
    if (params) {
      this.state.currentView = params.view as any;
      this.state.currentId = params.id;
    }
  }

  private handlePopState(event: PopStateEvent): void {
    if (event.state) {
      this.state.currentView = event.state.view;
      this.state.currentId = event.state.id;
      this.state.currentData = event.state.data;
      this.notifyListeners();
    }
  }

  // State access
  getState(): NavigationState {
    return { ...this.state };
  }

  getCurrentView(): string {
    return this.state.currentView;
  }

  getCurrentId(): string | undefined {
    return this.state.currentId;
  }

  getCurrentData(): any {
    return this.state.currentData;
  }

  getHistory(): NavigationEntry[] {
    return [...this.state.history];
  }

  // Event handling
  subscribe(listener: (state: NavigationState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.getState()));
  }

  // Utility methods
  getBreadcrumbs(): NavigationEntry[] {
    const current = this.state.history[this.state.historyIndex];
    if (!current) return [];
    
    // Build breadcrumb trail based on current navigation
    const breadcrumbs: NavigationEntry[] = [
      { view: 'home', title: 'Music', url: '/music', timestamp: Date.now() }
    ];
    
    if (current.view !== 'home') {
      breadcrumbs.push(current);
    }
    
    return breadcrumbs;
  }

  // Deep linking support
  createDeepLink(view: string, id?: string, params?: Record<string, string>): string {
    return window.location.origin + this.generateURL(view, id, params);
  }

  navigateToDeepLink(url: string): boolean {
    const params = this.parseURL(url);
    if (!params) return false;
    
    this.navigate(params.view, params.id);
    return true;
  }
}

// Singleton instance
export const musicRouter = new MusicInfoRouter();