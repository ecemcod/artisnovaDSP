/**
 * Unified storage utility that uses both LocalStorage and Cookies.
 * This ensures persistence even if one mechanism is cleared by the browser (common on iOS).
 */

export class AppStorage {
    /**
     * Get item from storage. Checks LocalStorage first, then Cookies.
     */
    static getItem(key: string, defaultValue: string | null = null): string | null {
        // 1. Try LocalStorage
        const localValue = localStorage.getItem(key);
        if (localValue !== null) return localValue;

        // 2. Try Cookies
        const cookieValue = this.getCookie(key);
        if (cookieValue !== null) {
            // Restore to LocalStorage if found in Cookies but not LocalStorage
            localStorage.setItem(key, cookieValue);
            return cookieValue;
        }

        return defaultValue;
    }

    /**
     * Set item in both LocalStorage and Cookies.
     */
    static setItem(key: string, value: string): void {
        localStorage.setItem(key, value);
        this.setCookie(key, value, 365); // 1 year expiration
    }

    /**
     * Remove item from both.
     */
    static removeItem(key: string): void {
        localStorage.removeItem(key);
        this.setCookie(key, '', -1); // Expire immediately
    }

    // Helper: Set a cookie
    private static setCookie(name: string, value: string, days: number) {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
    }

    // Helper: Get a cookie
    private static getCookie(name: string): string | null {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }
}
