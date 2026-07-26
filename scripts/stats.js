// Глобальная статистика
var Stats = {
    getStats: function() {
        return Cache.load(CONFIG.STATS_KEY) || {};
    },
    saveStats: function(stats) {
        Cache.save(CONFIG.STATS_KEY, stats);
    },
    recordView: function(offerId) {
        var stats = this.getStats();
        if (!stats[offerId]) stats[offerId] = { views: 0, clicks: 0, favorites: 0 };
        stats[offerId].views = (stats[offerId].views || 0) + 1;
        this.saveStats(stats);
    },
    recordClick: function(offerId) {
        var stats = this.getStats();
        if (!stats[offerId]) stats[offerId] = { views: 0, clicks: 0, favorites: 0 };
        stats[offerId].clicks = (stats[offerId].clicks || 0) + 1;
        this.saveStats(stats);
    },
    recordFavorite: function(offerId, isAdded) {
        var stats = this.getStats();
        if (!stats[offerId]) stats[offerId] = { views: 0, clicks: 0, favorites: 0 };
        if (isAdded) {
            stats[offerId].favorites = (stats[offerId].favorites || 0) + 1;
        } else {
            stats[offerId].favorites = Math.max(0, (stats[offerId].favorites || 0) - 1);
        }
        this.saveStats(stats);
    },
    getOfferStats: function(offerId) {
        var stats = this.getStats();
        return stats[offerId] || { views: 0, clicks: 0, favorites: 0 };
    },
    getPopularity: function(offerId) {
        var s = this.getOfferStats(offerId);
        return s.views + s.clicks * 3 + s.favorites * 5;
    }
};
