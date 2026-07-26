const CONFIG = {
    GOOGLE_SHEET_ID: '1BxiMVs0XRA5nFMjKvBdBZjgmUUqptlbs74OgvE2upms',
    SHEET_NAME: 'Акции',
    API_KEY: 'AIzaSyD-пример-ключ-для-демо',
    CACHE_KEY: 'maxvygoda_offers_cache',
    CACHE_TIMESTAMP_KEY: 'maxvygoda_cache_timestamp',
    FAVORITES_KEY: 'maxvygoda_favorites',
    STATS_KEY: 'maxvygoda_stats',
    CACHE_DURATION: 5 * 60 * 1000,
    AUTO_REFRESH_INTERVAL: 5 * 60 * 1000,
    SKELETON_DURATION: 1000,
    DEBOUNCE_DELAY: 250,
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000,
    COLUMNS: {
        ID: 0,
        STORE: 1,
        CATEGORY: 2,
        DISCOUNT: 3,
        DESCRIPTION: 4,
        LINK: 5,
        LOGO: 6,
        VIP: 7,
        ACTIVE: 8,
        DATE: 9
    }
};

export default CONFIG;
