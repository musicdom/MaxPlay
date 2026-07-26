import CONFIG from './config.js';
import Cache from './cache.js';

const Stats = {
    getStats() {
        return Cache.load(CONFIG.STATS_KEY) || {};
    },

    saveStats(stats) {
        Cache.save(CONFIG.STATS_KEY, stats);
    },

    recordView(offerId) {
        const stats = this.getStats();
        if (!stats[offerId]) {
            stats[offerId] = { views: 0, clicks: 0, favorites: 0 };
        }
        stats[offerId].views = (stats[offerId].views || 0) + 1;
        this.saveStats(stats);
    },

    recordClick(offerId) {
        const stats = this.getStats();
        if (!stats[offerId]) {
            stats[offerId] = { views: 0, clicks: 0, favorites: 0 };
        }
        stats[offerId].clicks = (stats[offerId].clicks || 0) + 1;
        this.saveStats(stats);
    },

    recordFavorite(offerId, isAdded) {
        const stats = this.getStats();
        if (!stats[offerId]) {
            stats[offerId] = { views: 0, clicks: 0, favorites: 0 };
        }
        if (isAdded) {
            stats[offerId].favorites = (stats[offerId].favorites || 0) + 1;
        } else {
            stats[offerId].favorites = Math.max(0, (stats[offerId].favorites || 0) - 1);
        }
        this.saveStats(stats);
    },

    getOfferStats(offerId) {
        const stats = this.getStats();
        return stats[offerId] || { views: 0, clicks: 0, favorites: 0 };
    },

    getPopularity(offerId) {
        const stats = this.getOfferStats(offerId);
        return stats.views * 1 + stats.clicks * 3 + stats.favorites * 5;
    }
};

export default Stats;
