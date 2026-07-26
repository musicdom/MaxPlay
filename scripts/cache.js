// Глобальный объект для работы с кешем
var Cache = {
    save: function(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.warn('Cache save failed:', e.message);
            return false;
        }
    },
    load: function(key) {
        try {
            var item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        } catch (e) {
            console.warn('Cache load failed:', e.message);
            return null;
        }
    },
    remove: function(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            return false;
        }
    },
    isExpired: function() {
        var timestamp = this.load(CONFIG.CACHE_TIMESTAMP_KEY);
        if (!timestamp) return true;
        return (Date.now() - timestamp) > CONFIG.CACHE_DURATION;
    },
    updateTimestamp: function() {
        this.save(CONFIG.CACHE_TIMESTAMP_KEY, Date.now());
    },
    getCachedOffers: function() {
        if (this.isExpired()) return null;
        return this.load(CONFIG.CACHE_KEY);
    },
    saveOffers: function(offers) {
        this.save(CONFIG.CACHE_KEY, offers);
        this.updateTimestamp();
    },
    clearAll: function() {
        this.remove(CONFIG.CACHE_KEY);
        this.remove(CONFIG.CACHE_TIMESTAMP_KEY);
        this.remove(CONFIG.FAVORITES_KEY);
        this.remove(CONFIG.STATS_KEY);
    }
};        if (!timestamp) return true;
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
