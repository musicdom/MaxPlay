const Favorites = (() => {
    function getFavorites() {
        const saved = localStorage.getItem("maxvygoda_promo_favorites");
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                return [];
            }
        }
        return [];
    }

    function addFavorite(id) {
        const favorites = getFavorites();
        if (!favorites.includes(id)) {
            favorites.push(id);
            localStorage.setItem("maxvygoda_promo_favorites", JSON.stringify(favorites));
            return true;
        }
        return false;
    }

    function removeFavorite(id) {
        let favorites = getFavorites();
        const index = favorites.indexOf(id);
        if (index > -1) {
            favorites.splice(index, 1);
            localStorage.setItem("maxvygoda_promo_favorites", JSON.stringify(favorites));
            return true;
        }
        return false;
    }

    function isFavorite(id) {
        return getFavorites().includes(id);
    }

    function toggleFavorite(id) {
        if (isFavorite(id)) {
            return removeFavorite(id) ? "removed" : "error";
        } else {
            return addFavorite(id) ? "added" : "error";
        }
    }

    function getFavoritePromotions() {
        const allPromotions = Data.getPromotions("all", "new", "");
        const favIds = getFavorites();
        return allPromotions.filter(p => favIds.includes(p.id));
    }

    function getFavoritesCount() {
        return getFavorites().length;
    }

    return {
        getFavorites,
        addFavorite,
        removeFavorite,
        isFavorite,
        toggleFavorite,
        getFavoritePromotions,
        getFavoritesCount
    };
})();
