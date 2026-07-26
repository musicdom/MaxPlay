// Избранное
var Favorites = {
    getFavorites: function() {
        return Cache.load(CONFIG.FAVORITES_KEY) || [];
    },
    saveFavorites: function(favorites) {
        Cache.save(CONFIG.FAVORITES_KEY, favorites);
    },
    isFavorite: function(id) {
        return this.getFavorites().indexOf(id) !== -1;
    },
    toggleFavorite: function(id) {
        var favorites = this.getFavorites();
        var index = favorites.indexOf(id);
        var isAdded = false;
        if (index > -1) {
            favorites.splice(index, 1);
        } else {
            favorites.push(id);
            isAdded = true;
        }
        this.saveFavorites(favorites);
        Stats.recordFavorite(id, isAdded);
        return isAdded;
    },
    getFavoriteOffers: function(offers) {
        var favIds = this.getFavorites();
        return offers.filter(function(offer) {
            return favIds.indexOf(offer.id) !== -1;
        });
    },
    getCount: function() {
        return this.getFavorites().length;
    }
};
