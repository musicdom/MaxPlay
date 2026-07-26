// API для работы с Google Sheets
var API = {
    offers: [],
    categories: [],
    isLoading: false,
    listeners: [],

    fetchSheetData: function() {
        var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + CONFIG.GOOGLE_SHEET_ID +
                  '/values/' + CONFIG.SHEET_NAME + '?key=' + CONFIG.API_KEY;
        var self = this;
        var attempt = 0;
        return new Promise(function(resolve, reject) {
            function tryFetch() {
                fetch(url)
                    .then(function(response) {
                        if (!response.ok) throw new Error('HTTP ' + response.status);
                        return response.json();
                    })
                    .then(function(data) { resolve(data); })
                    .catch(function(error) {
                        attempt++;
                        if (attempt < CONFIG.MAX_RETRIES) {
                            setTimeout(tryFetch, CONFIG.RETRY_DELAY);
                        } else {
                            reject(error);
                        }
                    });
            }
            tryFetch();
        });
    },

    parseRow: function(row, index) {
        var cols = CONFIG.COLUMNS;
        return {
            id: row[cols.ID] ? parseInt(row[cols.ID]) : index + 1,
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

    parseData: function(sheetData) {
        if (!sheetData || !sheetData.values || sheetData.values.length < 2) return [];
        var rows = sheetData.values.slice(1);
        var self = this;
        return rows
            .map(function(row, i) { return self.parseRow(row, i); })
            .filter(function(offer) { return offer.isActive && offer.store; });
    },

    extractCategories: function(offers) {
        var categorySet = {};
        var categories = [{ id: 'all', name: 'Все', emoji: '🔥' }];
        var meta = {
            'еда': { emoji: '🍕', name: 'Еда' },
            'маркетплейсы': { emoji: '📦', name: 'Маркетплейсы' },
            'банки': { emoji: '💳', name: 'Банки' },
            'связь': { emoji: '📱', name: 'Связь' },
            'игры': { emoji: '🎮', name: 'Игры' },
            'путешествия': { emoji: '✈️', name: 'Путешествия' },
            'магазины': { emoji: '🏪', name: 'Магазины' },
            'авто': { emoji: '🚗', name: 'Авто' }
        };
        offers.forEach(function(offer) {
            var cat = offer.category.toLowerCase().trim();
            if (!categorySet[cat] && cat) {
                categorySet[cat] = true;
                var info = meta[cat] || { emoji: '📌', name: offer.category.charAt(0).toUpperCase() + offer.category.slice(1) };
                categories.push({ id: cat, name: info.name, emoji: info.emoji });
            }
        });
        return categories;
    },

    loadOffers: function(forceRefresh) {
        var self = this;
        if (this.isLoading) return Promise.resolve(this.offers);
        if (!forceRefresh && !Cache.isExpired()) {
            var cached = Cache.getCachedOffers();
            if (cached && cached.length > 0) {
                this.offers = cached;
                this.categories = this.extractCategories(cached);
                this.notifyListeners('cache');
                return Promise.resolve(cached);
            }
        }
        this.isLoading = true;
        this.notifyListeners('loading');
        return this.fetchSheetData()
            .then(function(sheetData) {
                var offers = self.parseData(sheetData);
                if (offers.length === 0) {
                    var cached = Cache.getCachedOffers();
                    if (cached && cached.length > 0) {
                        self.offers = cached;
                        self.categories = self.extractCategories(cached);
                        self.isLoading = false;
                        self.notifyListeners('cache');
                        return cached;
                    }
                    throw new Error('No offers found');
                }
                self.offers = offers;
                self.categories = self.extractCategories(offers);
                Cache.saveOffers(offers);
                self.isLoading = false;
                self.notifyListeners('success');
                return offers;
            })
            .catch(function(error) {
                console.error('Failed to load offers:', error.message);
                var cached = Cache.getCachedOffers();
                if (cached && cached.length > 0) {
                    self.offers = cached;
                    self.categories = self.extractCategories(cached);
                    self.isLoading = false;
                    self.notifyListeners('cache');
                    return cached;
                }
                self.offers = [];
                self.categories = [{ id: 'all', name: 'Все', emoji: '🔥' }];
                self.isLoading = false;
                self.notifyListeners('error');
                return [];
            });
    },

    getOffers: function(category, sort, query) {
        var filtered = this.offers.slice();
        if (category && category !== 'all') {
            filtered = filtered.filter(function(o) {
                return o.category.toLowerCase() === category.toLowerCase();
            });
        }
        if (query && query.trim() !== '') {
            var q = query.toLowerCase().trim();
            filtered = filtered.filter(function(o) {
                return o.store.toLowerCase().indexOf(q) !== -1 ||
                       o.description.toLowerCase().indexOf(q) !== -1 ||
                       o.category.toLowerCase().indexOf(q) !== -1 ||
                       o.discount.toLowerCase().indexOf(q) !== -1;
            });
        }
        switch (sort) {
            case 'popular':
                filtered.sort(function(a, b) { return (b.popularity || 0) - (a.popularity || 0); });
                break;
            case 'discount':
                filtered.sort(function(a, b) {
                    var aVal = parseInt(a.discount) || 0;
                    var bVal = parseInt(b.discount) || 0;
                    return bVal - aVal;
                });
                break;
            case 'ending':
                filtered.sort(function(a, b) {
                    if (!a.date) return 1;
                    if (!b.date) return -1;
                    return new Date(a.date.split('.').reverse().join('-')) -
                           new Date(b.date.split('.').reverse().join('-'));
                });
                break;
            case 'new':
            default:
                filtered.sort(function(a, b) { return b.id - a.id; });
                break;
        }
        return filtered;
    },

    getCategories: function() {
        return this.categories.slice();
    },

    getVipOffers: function() {
        return this.offers.filter(function(o) { return o.isVip; });
    },

    getOfferById: function(id) {
        return this.offers.find(function(o) { return o.id === id; }) || null;
    },

    searchOffers: function(query) {
        return this.getOffers('all', 'new', query);
    },

    addListener: function(callback) {
        this.listeners.push(callback);
    },

    removeListener: function(callback) {
        this.listeners = this.listeners.filter(function(l) { return l !== callback; });
    },

    notifyListeners: function(event) {
        this.listeners.forEach(function(cb) {
            try { cb(event, API.offers, API.categories); } catch (e) { console.warn(e); }
        });
    },

    startAutoRefresh: function() {
        var self = this;
        setInterval(function() {
            self.loadOffers(true).catch(function(e) {
                console.warn('Auto-refresh failed:', e.message);
            });
        }, CONFIG.AUTO_REFRESH_INTERVAL);
    },

    getSortOptions: function() {
        return [
            { id: 'new', name: 'Новые' },
            { id: 'popular', name: 'Популярные' },
            { id: 'discount', name: 'Макс. скидка' },
            { id: 'ending', name: 'Скоро закончится' }
        ];
    }
};
