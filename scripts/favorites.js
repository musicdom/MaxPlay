import CONFIG from './config.js';
import Cache from './cache.js';
import Stats from './stats.js';

const Favorites = {
    getFavorites() {
        return Cache.load(CONFIG.FAVORITES_KEY) || [];
    },

    saveFavorites(favorites) {
        Cache.save(CONFIG.FAVORITES_KEY, favorites);
    },

    isFavorite(id) {
        return this.getFavorites().includes(id);
    },

    toggleFavorite(id) {
        const favorites = this.getFavorites();
        const index = favorites.indexOf(id);
        let isAdded = false;

        if (index > -1) {
            favorites.splice(index, 1);
            isAdded = false;
        } else {
            favorites.push(id);
            isAdded = true;
        }

        this.saveFavorites(favorites);
        Stats.recordFavorite(id, isAdded);
        return isAdded;
    },

    getFavoriteOffers(offers) {
        const favIds = this.getFavorites();
        return offers.filter(offer => favIds.includes(offer.id));
    },

    getCount() {
        return this.getFavorites().length;
    }
};

export default Favorites;
