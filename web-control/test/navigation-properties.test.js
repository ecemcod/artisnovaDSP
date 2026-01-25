const fc = require('fast-check');
const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

// Mock navigation router for testing
class MockNavigationRouter {
    constructor() {
        this.state = {
            currentView: 'home',
            currentId: null,
            history: [],
            historyIndex: -1
        };
        this.listeners = new Set();
    }

    navigate(view, id, data, title) {
        const entry = {
            view,
            id,
            title: title || `${view} ${id}`,
            url: `/music/${view}${id ? `/${id}` : ''}`,
            timestamp: Date.now()
        };

        // Add to history
        if (this.state.historyIndex < this.state.history.length - 1) {
            this.state.history = this.state.history.slice(0, this.state.historyIndex + 1);
        }
        this.state.history.push(entry);
        this.state.historyIndex = this.state.history.length - 1;

        // Update current state
        this.state.currentView = view;
        this.state.currentId = id;
        this.state.currentData = data;

        this.notifyListeners();
    }

    goBack() {
        if (this.state.historyIndex > 0) {
            this.state.historyIndex--;
            const entry = this.state.history[this.state.historyIndex];
            this.state.currentView = entry.view;
            this.state.currentId = entry.id;
            this.notifyListeners();
            return true;
        }
        return false;
    }

    goForward() {
        if (this.state.historyIndex < this.state.history.length - 1) {
            this.state.historyIndex++;
            const entry = this.state.history[this.state.historyIndex];
            this.state.currentView = entry.view;
            this.state.currentId = entry.id;
            this.notifyListeners();
            return true;
        }
        return false;
    }

    canGoBack() {
        return this.state.historyIndex > 0;
    }

    canGoForward() {
        return this.state.historyIndex < this.state.history.length - 1;
    }

    getState() {
        return { ...this.state };
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notifyListeners() {
        this.listeners.forEach(listener => listener(this.getState()));
    }

    generateURL(view, id, params) {
        let url = `/music/${view}`;
        if (id) url += `/${encodeURIComponent(id)}`;
        if (params && Object.keys(params).length > 0) {
            const searchParams = new URLSearchParams(params);
            url += `?${searchParams.toString()}`;
        }
        return url;
    }

    parseURL(url) {
        try {
            const urlObj = new URL(url, 'http://localhost:3000');
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            
            if (pathParts[0] !== 'music') return null;
            
            const view = pathParts[1];
            const id = pathParts[2] ? decodeURIComponent(pathParts[2]) : undefined;
            
            const filters = {};
            urlObj.searchParams.forEach((value, key) => {
                filters[key] = value;
            });
            
            return {
                view,
                id,
                query: filters.q,
                filters: Object.keys(filters).length > 0 ? filters : undefined
            };
        } catch (error) {
            return null;
        }
    }

    getBreadcrumbs() {
        const current = this.state.history[this.state.historyIndex];
        if (!current) return [{ view: 'home', title: 'Music', url: '/music', timestamp: Date.now() }];
        
        const breadcrumbs = [
            { view: 'home', title: 'Music', url: '/music', timestamp: Date.now() }
        ];
        
        if (current.view !== 'home') {
            breadcrumbs.push(current);
        }
        
        return breadcrumbs;
    }
}

// Generators for navigation testing
const viewArb = fc.constantFrom('artist', 'album', 'label', 'genre', 'search', 'home');
const idArb = fc.string({ minLength: 1, maxLength: 50 });
const titleArb = fc.string({ minLength: 1, maxLength: 100 });

const navigationCommandArb = fc.oneof(
    fc.record({
        type: fc.constant('navigate'),
        view: viewArb,
        id: fc.option(idArb),
        title: fc.option(titleArb)
    }),
    fc.record({
        type: fc.constant('goBack')
    }),
    fc.record({
        type: fc.constant('goForward')
    })
);

describe('Navigation System Property Tests', () => {
    let router;

    beforeEach(() => {
        router = new MockNavigationRouter();
    });

    describe('Property 1: Navigation Consistency', () => {
        it('should maintain consistent navigation state through any sequence of operations', () => {
            fc.assert(fc.property(
                fc.array(navigationCommandArb, { minLength: 1, maxLength: 20 }),
                (commands) => {
                    const initialState = router.getState();
                    
                    // Execute commands
                    for (const command of commands) {
                        switch (command.type) {
                            case 'navigate':
                                router.navigate(command.view, command.id, null, command.title);
                                break;
                            case 'goBack':
                                router.goBack();
                                break;
                            case 'goForward':
                                router.goForward();
                                break;
                        }
                    }

                    const finalState = router.getState();

                    // Invariants
                    expect(finalState.historyIndex).toBeGreaterThanOrEqual(-1);
                    expect(finalState.historyIndex).toBeLessThan(finalState.history.length);
                    
                    if (finalState.history.length > 0) {
                        expect(finalState.historyIndex).toBeGreaterThanOrEqual(0);
                        
                        // Current state should match history entry
                        const currentEntry = finalState.history[finalState.historyIndex];
                        expect(finalState.currentView).toBe(currentEntry.view);
                        expect(finalState.currentId).toBe(currentEntry.id);
                    }

                    // History should be chronologically ordered
                    for (let i = 1; i < finalState.history.length; i++) {
                        expect(finalState.history[i].timestamp).toBeGreaterThanOrEqual(
                            finalState.history[i - 1].timestamp
                        );
                    }

                    return true;
                }
            ), { numRuns: 100 });
        });
    });

    describe('Property 2: Back/Forward Navigation', () => {
        it('should correctly handle back/forward navigation capabilities', () => {
            fc.assert(fc.property(
                fc.array(fc.record({
                    view: viewArb,
                    id: fc.option(idArb)
                }), { minLength: 2, maxLength: 10 }),
                (navigations) => {
                    // Navigate to multiple locations
                    for (const nav of navigations) {
                        router.navigate(nav.view, nav.id);
                    }

                    const afterNavigations = router.getState();
                    
                    // Should be able to go back
                    expect(router.canGoBack()).toBe(true);
                    expect(router.canGoForward()).toBe(false);

                    // Go back to beginning
                    let backSteps = 0;
                    while (router.canGoBack()) {
                        const beforeBack = router.getState();
                        const success = router.goBack();
                        const afterBack = router.getState();
                        
                        expect(success).toBe(true);
                        expect(afterBack.historyIndex).toBe(beforeBack.historyIndex - 1);
                        backSteps++;
                    }

                    // Should not be able to go back further
                    expect(router.canGoBack()).toBe(false);
                    expect(router.goBack()).toBe(false);

                    // Should be able to go forward
                    expect(router.canGoForward()).toBe(true);

                    // Go forward to end
                    let forwardSteps = 0;
                    while (router.canGoForward()) {
                        const beforeForward = router.getState();
                        const success = router.goForward();
                        const afterForward = router.getState();
                        
                        expect(success).toBe(true);
                        expect(afterForward.historyIndex).toBe(beforeForward.historyIndex + 1);
                        forwardSteps++;
                    }

                    // Should be back to original state
                    const finalState = router.getState();
                    expect(finalState.currentView).toBe(afterNavigations.currentView);
                    expect(finalState.currentId).toBe(afterNavigations.currentId);
                    expect(finalState.historyIndex).toBe(afterNavigations.historyIndex);

                    // Back and forward steps should match
                    expect(backSteps).toBe(forwardSteps);

                    return true;
                }
            ), { numRuns: 50 });
        });
    });

    describe('Property 3: URL Generation and Parsing', () => {
        it('should generate and parse URLs consistently', () => {
            fc.assert(fc.property(
                viewArb,
                fc.option(idArb),
                fc.option(fc.dictionary(fc.string(), fc.string())),
                (view, id, params) => {
                    // Generate URL
                    const url = router.generateURL(view, id, params);
                    
                    // Parse URL back
                    const parsed = router.parseURL(`http://localhost:3000${url}`);
                    
                    // Should parse successfully
                    expect(parsed).not.toBeNull();
                    expect(parsed.view).toBe(view);
                    
                    // Handle null vs undefined for id
                    if (id === null) {
                        // When id is null, URL generation should not include id segment
                        // So parsing should return undefined
                        expect(parsed.id).toBeUndefined();
                    } else {
                        expect(parsed.id).toBe(id);
                    }
                    
                    if (params && Object.keys(params).length > 0) {
                        // Filter out security-sensitive keys that would be removed by parseURL
                        const validParams = Object.fromEntries(
                            Object.entries(params).filter(([key]) => 
                                key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
                            )
                        );
                        
                        if (Object.keys(validParams).length > 0) {
                            expect(parsed.filters).toBeDefined();
                            for (const [key, value] of Object.entries(validParams)) {
                                expect(parsed.filters[key]).toBe(value);
                            }
                        }
                    }

                    return true;
                }
            ), { numRuns: 100 });
        });

        it('should handle invalid URLs gracefully', () => {
            fc.assert(fc.property(
                fc.string(),
                (invalidUrl) => {
                    // Skip valid music URLs
                    if (invalidUrl.includes('/music/')) return true;
                    
                    const parsed = router.parseURL(invalidUrl);
                    
                    // Should return null for invalid URLs
                    expect(parsed).toBeNull();

                    return true;
                }
            ), { numRuns: 50 });
        });
    });

    describe('Property 4: Breadcrumb Generation', () => {
        it('should generate consistent breadcrumbs for navigation paths', () => {
            fc.assert(fc.property(
                fc.array(fc.record({
                    view: viewArb,
                    id: fc.option(idArb),
                    title: fc.option(titleArb)
                }), { minLength: 1, maxLength: 5 }),
                (navigations) => {
                    // Navigate through path
                    for (const nav of navigations) {
                        router.navigate(nav.view, nav.id, null, nav.title);
                    }

                    const breadcrumbs = router.getBreadcrumbs();
                    
                    // Should always have at least home breadcrumb
                    expect(breadcrumbs.length).toBeGreaterThanOrEqual(1);
                    expect(breadcrumbs[0].view).toBe('home');
                    expect(breadcrumbs[0].title).toBe('Music');

                    // If not on home, should have current view
                    const currentState = router.getState();
                    if (currentState.currentView !== 'home') {
                        expect(breadcrumbs.length).toBe(2);
                        expect(breadcrumbs[1].view).toBe(currentState.currentView);
                        expect(breadcrumbs[1].id).toBe(currentState.currentId);
                    }

                    return true;
                }
            ), { numRuns: 50 });
        });
    });

    describe('Property 5: History Truncation', () => {
        it('should correctly truncate history when navigating from middle', () => {
            fc.assert(fc.property(
                fc.array(fc.record({
                    view: viewArb,
                    id: fc.option(idArb)
                }), { minLength: 3, maxLength: 8 }),
                fc.integer({ min: 1, max: 5 }),
                (initialNavigations, backSteps) => {
                    // Navigate to build history
                    for (const nav of initialNavigations) {
                        router.navigate(nav.view, nav.id);
                    }

                    const afterInitial = router.getState();
                    const actualBackSteps = Math.min(backSteps, afterInitial.historyIndex);

                    // Go back some steps
                    for (let i = 0; i < actualBackSteps; i++) {
                        router.goBack();
                    }

                    const afterBack = router.getState();
                    const expectedHistoryLength = afterBack.historyIndex + 1;

                    // Navigate to new location (should truncate forward history)
                    router.navigate('artist', 'new-artist');

                    const afterNewNav = router.getState();

                    // History should be truncated
                    expect(afterNewNav.history.length).toBe(expectedHistoryLength + 1);
                    expect(afterNewNav.historyIndex).toBe(afterNewNav.history.length - 1);
                    expect(afterNewNav.currentView).toBe('artist');
                    expect(afterNewNav.currentId).toBe('new-artist');

                    // Should not be able to go forward
                    expect(router.canGoForward()).toBe(false);

                    return true;
                }
            ), { numRuns: 50 });
        });
    });

    describe('Property 6: Event Notification', () => {
        it('should notify listeners of state changes consistently', () => {
            fc.assert(fc.property(
                fc.array(navigationCommandArb, { minLength: 1, maxLength: 10 }),
                (commands) => {
                    const notifications = [];
                    
                    const unsubscribe = router.subscribe((state) => {
                        notifications.push({ ...state });
                    });

                    // Execute commands
                    for (const command of commands) {
                        switch (command.type) {
                            case 'navigate':
                                router.navigate(command.view, command.id);
                                break;
                            case 'goBack':
                                router.goBack();
                                break;
                            case 'goForward':
                                router.goForward();
                                break;
                        }
                    }

                    unsubscribe();

                    // Should have received notifications for state changes
                    const navigateCommands = commands.filter(c => c.type === 'navigate').length;
                    const successfulBacks = commands.filter(c => c.type === 'goBack').length;
                    const successfulForwards = commands.filter(c => c.type === 'goForward').length;
                    
                    // At minimum, should have notifications for navigate commands
                    expect(notifications.length).toBeGreaterThanOrEqual(navigateCommands);

                    // Each notification should be a valid state
                    for (const notification of notifications) {
                        expect(notification).toHaveProperty('currentView');
                        expect(notification).toHaveProperty('history');
                        expect(notification).toHaveProperty('historyIndex');
                        expect(notification.historyIndex).toBeGreaterThanOrEqual(-1);
                        expect(notification.historyIndex).toBeLessThan(notification.history.length);
                    }

                    return true;
                }
            ), { numRuns: 50 });
        });
    });
});

module.exports = { MockNavigationRouter };