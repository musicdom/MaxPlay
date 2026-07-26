import CONFIG from './config.js';

const Cache = {
    save(key, data) {
        try {
            const serialized = JSON.stringify(data);
            localStorage.setItem(key, serialized);
            return true;
        } catch (e) {
            console.warn('Cache save failed:', e.message);
            return false;
        }
    },

    load(key) {
        try {
            const serialized = localStorage.getItem(key);
            if (!serialized) return null;
            return JSON.parse(serialized);
        } catch (e) {
            console.warn('Cache load failed:', e.message);
            return null;
        }
    },

    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            return false;
        }
    },

    isExpired() {
        const timestamp = this.load(CONFIG.CACHE_TIMESTAMP_KEY);
        if (!timestamp) return true;
        const now = Date.now();
        return (now - timestamp) > CONFIG.CACHE_DURATION;
    },

    updateTimestamp() {
        this.save(CONFIG.CACHE_TIMESTAMP_KEY, Date.now());
    },

    getCachedOffers() {
        if (this.isExpired()) return null;
        return this.load(CONFIG.CACHE_KEY);
    },

    saveOffers(offers) {
        this.save(CONFIG.CACHE_KEY, offers);
        this.updateTimestamp();
    },

    clearAll() {
        this.remove(CONFIG.CACHE_KEY);
        this.remove(CONFIG.CACHE_TIMESTAMP_KEY);
        this.remove(CONFIG.FAVORITES_KEY);
        this.remove(CONFIG.STATS_KEY);
    }
};

export default Cache;
