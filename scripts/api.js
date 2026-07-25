const API = (() => {
    const offers = [
        {
            id: 1,
            title: 'Пятёрочка',
            discount: '-30%',
            discountValue: 30,
            category: 'shops',
            logoType: 'shop',
            logoEmoji: '🏪',
            description: 'Скидка 30% на все товары по карте лояльности',
            isFavorite: false
        },
        {
            id: 2,
            title: 'Яндекс.Еда',
            discount: '-25%',
            discountValue: 25,
            category: 'food',
            logoType: 'food',
            logoEmoji: '🍕',
            description: 'Скидка 25% на первый заказ через MAX',
            isFavorite: false
        },
        {
            id: 3,
            title: 'Aviasales',
            discount: '-15%',
            discountValue: 15,
            category: 'travel',
            logoType: 'travel',
            logoEmoji: '✈️',
            description: 'Скидка 15% на авиабилеты по промокоду MAX',
            isFavorite: false
        },
        {
            id: 4,
            title: 'Steam',
            discount: '-20%',
            discountValue: 20,
            category: 'games',
            logoType: 'games',
            logoEmoji: '🎮',
            description: 'Скидка 20% на пополнение кошелька Steam',
            isFavorite: false
        },
        {
            id: 5,
            title: 'МТС',
            discount: '-40%',
            discountValue: 40,
            category: 'telecom',
            logoType: 'telecom',
            logoEmoji: '📱',
            description: 'Кешбэк 40% на связь при оплате через MAX',
            isFavorite: false
        },
        {
            id: 6,
            title: 'Т-Банк',
            discount: '-10%',
            discountValue: 10,
            category: 'bank',
            logoType: 'bank',
            logoEmoji: '💳',
            description: 'Повышенный кешбэк 10% в выбранных категориях',
            isFavorite: false
        },
        {
            id: 7,
            title: 'Яндекс.Заправки',
            discount: '-5%',
            discountValue: 5,
            category: 'auto',
            logoType: 'auto',
            logoEmoji: '🚗',
            description: 'Скидка 5% на топливо на всех заправках партнёров',
            isFavorite: false
        },
        {
            id: 8,
            title: 'Ozon',
            discount: '-35%',
            discountValue: 35,
            category: 'market',
            logoType: 'market',
            logoEmoji: '📦',
            description: 'Скидка 35% на первый заказ от 3000₽',
            isFavorite: false
        },
        {
            id: 9,
            title: 'Магнит',
            discount: '-20%',
            discountValue: 20,
            category: 'shops',
            logoType: 'shop',
            logoEmoji: '🏪',
            description: 'Скидка 20% на собственную торговую марку',
            isFavorite: false
        },
        {
            id: 10,
            title: 'Delivery Club',
            discount: '-30%',
            discountValue: 30,
            category: 'food',
            logoType: 'food',
            logoEmoji: '🍕',
            description: 'Скидка 30% на доставку из ресторанов',
            isFavorite: false
        },
        {
            id: 11,
            title: 'Tutu.ru',
            discount: '-18%',
            discountValue: 18,
            category: 'travel',
            logoType: 'travel',
            logoEmoji: '✈️',
            description: 'Скидка 18% на ж/д билеты по России',
            isFavorite: false
        },
        {
            id: 12,
            title: 'Wildberries',
            discount: '-25%',
            discountValue: 25,
            category: 'market',
            logoType: 'market',
            logoEmoji: '📦',
            description: 'Скидка 25% на товары для дома',
            isFavorite: false
        }
    ];

    const categories = [
        { id: 'all', name: 'Все', emoji: '🔥' },
        { id: 'shops', name: 'Магазины', emoji: '🏪' },
        { id: 'food', name: 'Еда', emoji: '🍕' },
        { id: 'travel', name: 'Путешествия', emoji: '✈️' },
        { id: 'games', name: 'Игры', emoji: '🎮' },
        { id: 'telecom', name: 'Связь', emoji: '📱' },
        { id: 'bank', name: 'Банки', emoji: '💳' },
        { id: 'auto', name: 'Авто', emoji: '🚗' },
        { id: 'market', name: 'Маркетплейсы', emoji: '📦' }
    ];

    let favorites = [];

    function init() {
        const saved = localStorage.getItem('maxvygoda_favorites');
        if (saved) {
            try {
                favorites = JSON.parse(saved);
            } catch (e) {
                favorites = [];
            }
        }
        syncFavorites();
    }

    function saveFavorites() {
        localStorage.setItem('maxvygoda_favorites', JSON.stringify(favorites));
    }

    function syncFavorites() {
        offers.forEach(offer => {
            offer.isFavorite = favorites.includes(offer.id);
        });
    }

    function getOffers(category = 'all', searchQuery = '') {
        let filtered = [...offers];

        if (category && category !== 'all') {
            filtered = filtered.filter(offer => offer.category === category);
        }

        if (searchQuery && searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase().trim();
            filtered = filtered.filter(offer =>
                offer.title.toLowerCase().includes(query) ||
                offer.category.toLowerCase().includes(query) ||
                offer.description.toLowerCase().includes(query)
            );
        }

        return filtered;
    }

    function getCategories() {
        return [...categories];
    }

    function toggleFavorite(offerId) {
        const index = favorites.indexOf(offerId);
        if (index > -1) {
            favorites.splice(index, 1);
        } else {
            favorites.push(offerId);
        }
        saveFavorites();
        syncFavorites();
        return !(index > -1);
    }

    function getFavoriteOffers() {
        syncFavorites();
        return offers.filter(offer => offer.isFavorite);
    }

    function getOfferById(id) {
        return offers.find(offer => offer.id === id) || null;
    }

    init();

    return {
        getOffers,
        getCategories,
        toggleFavorite,
        getFavoriteOffers,
        getOfferById,
        init
    };
})();
