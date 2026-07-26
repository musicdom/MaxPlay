import CONFIG from './config.js';
import Cache from './cache.js';

const API = {
    offers: [],
    categories: [],
    isLoading: false,
    listeners: [],

    async fetchSheetData() {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.GOOGLE_SHEET_ID}/values/${CONFIG.SHEET_NAME}?key=${CONFIG.API_KEY}`;

        let lastError = null;

        for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                return data;
            } catch (error) {
                lastError = error;
                console.warn(`API fetch attempt ${attempt} failed:`, error.message);

                if (attempt < CONFIG.MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
                }
            }
        }

        throw lastError || new Error('Failed to fetch data after all retries');
    },

    parseRow(row, index) {
        const cols = CONFIG.COLUMNS;
        const id = row[cols.ID] ? parseInt(row[cols.ID]) : index + 1;

        return {
            id: id,
            store: row[cols.STORE] || '',
            category: row[cols.CATEGORY] || 'other',
            discount: row[cols.DISCOUNT] || '',
            description: row[cols.DESCRIPTION] || '',
            link: row[cols.LINK] || '#',
            logo: row[cols.LOGO] || '',
            isVip: row[cols.VIP] && row[cols.VIP].toLowerCase() === 'да',
            isActive: row[cols.ACTIVE] ? row[cols.ACTIVE].toLowerCase() === 'да' : true,
            date: row[cols.DATE] || '',
            popularity: 0
        };
    },

    parseData(sheetData) {
        if (!sheetData || !sheetData.values || sheetData.values.length < 2) {
            console.warn('No data in sheet or invalid format');
            return [];
        }

        const rows = sheetData.values.slice(1);
        const offers = rows
            .map((row, index) => this.parseRow(row, index))
            .filter(offer => offer.isActive && offer.store);

        return offers;
    },

    extractCategories(offers) {
        const categorySet = new Set();
        const categories = [{ id: 'all', name: 'Все', emoji: '🔥' }];

        const categoryMeta = {
            'еда': { emoji: '🍕', name: 'Еда' },
            'маркетплейсы': { emoji: '📦', name: 'Маркетплейсы' },
            'банки': { emoji: '💳', name: 'Банки' },
            'связь': { emoji: '📱', name: 'Связь' },
            'игры': { emoji: '🎮', name: 'Игры' },
            'путешествия': { emoji: '✈️', name: 'Путешествия' },
            'магазины': { emoji: '🏪', name: 'Магазины' },
            'авто': { emoji: '🚗', name: 'Авто' }
        };

        offers.forEach(offer => {
            const catLower = offer.category.toLowerCase().trim();
            if (!categorySet.has(catLower) && catLower) {
                categorySet.add(catLower);
                const meta = categoryMeta[catLower] || {
                    emoji: '📌',
                    name: offer.category.charAt(0).toUpperCase() + offer.category.slice(1)
                };
                categories.push({
                    id: catLower,
                    name: meta.name,
                    emoji: meta.emoji
                });
            }
        });

        return categories;
    },

    async loadOffers(forceRefresh = false) {
        if (this.isLoading) {
            return this.offers;
        }

        if (!forceRefresh && !Cache.isExpired()) {
            const cached = Cache.getCachedOffers();
            if (cached && cached.length > 0) {
                this.offers = cached;
                this.categories = this.extractCategories(cached);
                this.notifyListeners('cache');
                return cached;
            }
        }

        this.isLoading = true;
        this.notifyListeners('loading');

        try {
            const sheetData = await this.fetchSheetData();
            const offers = this.parseData(sheetData);

            if (offers.length === 0) {
                const cached = Cache.getCachedOffers();
                if (cached && cached.length > 0) {
                    this.offers = cached;
                    this.categories = this.extractCategories(cached);
                    this.isLoading = false;
                    this.notifyListeners('cache');
                    return cached;
                }
                throw new Error('No offers found');
            }

            this.offers = offers;
            this.categories = this.extractCategories(offers);
            Cache.saveOffers(offers);

            this.isLoading = false;
            this.notifyListeners('success');
            return offers;
        } catch (error) {
            console.error('Failed to load offers:', error.message);

            const cached = Cache.getCachedOffers();
            if (cached && cached.length > 0) {
                this.offers = cached;
                this.categories = this.extractCategories(cached);
                this.isLoading = false;
                this.notifyListeners('cache');
                return cached;
            }

            this.offers = [];
            this.categories = [{ id: 'all', name: 'Все', emoji: '🔥' }];
            this.isLoading = false;
            this.notifyListeners('error');
            return [];
        }
    },

    getOffers(category = 'all', sort = 'new', query = '') {
        let filtered = [...this.offers];

        if (category && category !== 'all') {
            filtered = filtered.filter(o => o.category.toLowerCase() === category.toLowerCase());
        }

        if (query && query.trim() !== '') {
            const q = query.toLowerCase().trim();
            filtered = filtered.filter(o =>
                o.store.toLowerCase().includes(q) ||
                o.description.toLowerCase().includes(q) ||
                o.category.toLowerCase().includes(q) ||
                o.discount.toLowerCase().includes(q)
            );
        }

        switch (sort) {
            case 'popular':
                filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
                break;
            case 'discount':
                filtered.sort((a, b) => {
                    const aVal = parseInt(a.discount) || 0;
                    const bVal = parseInt(b.discount) || 0;
                    return bVal - aVal;
                });
                break;
            case 'ending':
                filtered.sort((a, b) => {
                    if (!a.date) return 1;
                    if (!b.date) return -1;
                    return new Date(a.date.split('.').reverse().join('-')) -
                           new Date(b.date.split('.').reverse().join('-'));
                });
                break;
            case 'new':
            default:
                filtered.sort((a, b) => b.id - a.id);
                break;
        }

        return filtered;
    },

    getCategories() {
        return [...this.categories];
    },

    getVipOffers() {
        return this.offers.filter(o => o.isVip);
    },

    getOfferById(id) {
        return this.offers.find(o => o.id === id) || null;
    },

    searchOffers(query) {
        return this.getOffers('all', 'new', query);
    },

    addListener(callback) {
        this.listeners.push(callback);
    },

    removeListener(callback) {
        this.listeners = this.listeners.filter(l => l !== callback);
    },

    notifyListeners(event) {
        this.listeners.forEach(callback => {
            try {
                callback(event, this.offers, this.categories);
            } catch (e) {
                console.warn('Listener error:', e);
            }
        });
    },

    startAutoRefresh() {
        setInterval(async () => {
            console.log('Auto-refreshing offers...');
            try {
                await this.loadOffers(true);
            } catch (e) {
                console.warn('Auto-refresh failed:', e.message);
            }
        }, CONFIG.AUTO_REFRESH_INTERVAL);
    },

    getSortOptions() {
        return [
            { id: 'new', name: 'Новые' },
            { id: 'popular', name: 'Популярные' },
            { id: 'discount', name: 'Макс. скидка' },
            { id: 'ending', name: 'Скоро закончится' }
        ];
    }
};

export default API;
