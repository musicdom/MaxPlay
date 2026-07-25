const Data = (() => {
    const promotionsData = [
        {
            id: 1,
            store: "Магнит",
            logo: "images/magnit.png",
            discount: "20%",
            text: "На продукты",
            date: "30.07.2026",
            category: "food",
            link: "https://magnit.ru",
            popularity: 95,
            isNew: true
        },
        {
            id: 2,
            store: "Яндекс Маркет",
            logo: "images/ym.png",
            discount: "1000 ₽",
            text: "Новым пользователям",
            date: "15.08.2026",
            category: "marketplace",
            link: "https://market.yandex.ru",
            popularity: 88,
            isNew: true
        },
        {
            id: 3,
            store: "Пятёрочка",
            logo: "images/pyaterochka.png",
            discount: "30%",
            text: "На всё по карте",
            date: "05.08.2026",
            category: "food",
            link: "https://5ka.ru",
            popularity: 92,
            isNew: false
        },
        {
            id: 4,
            store: "Т-Банк",
            logo: "images/tbank.png",
            discount: "5000 ₽",
            text: "Кешбэк за оформление",
            date: "31.08.2026",
            category: "bank",
            link: "https://tbank.ru",
            popularity: 78,
            isNew: false
        },
        {
            id: 5,
            store: "МТС",
            logo: "images/mts.png",
            discount: "40%",
            text: "На связь и интернет",
            date: "20.08.2026",
            category: "telecom",
            link: "https://mts.ru",
            popularity: 85,
            isNew: true
        },
        {
            id: 6,
            store: "Ozon",
            logo: "images/ozon.png",
            discount: "2000 ₽",
            text: "При первом заказе",
            date: "10.09.2026",
            category: "marketplace",
            link: "https://ozon.ru",
            popularity: 90,
            isNew: false
        },
        {
            id: 7,
            store: "ВкусВилл",
            logo: "images/vkusvill.png",
            discount: "15%",
            text: "На готовую еду",
            date: "25.07.2026",
            category: "food",
            link: "https://vkusvill.ru",
            popularity: 82,
            isNew: false
        },
        {
            id: 8,
            store: "Wildberries",
            logo: "images/wb.png",
            discount: "25%",
            text: "На товары для дома",
            date: "01.09.2026",
            category: "marketplace",
            link: "https://wildberries.ru",
            popularity: 93,
            isNew: false
        },
        {
            id: 9,
            store: "Альфа-Банк",
            logo: "images/alfa.png",
            discount: "10%",
            text: "Кешбэк на всё",
            date: "31.12.2026",
            category: "bank",
            link: "https://alfabank.ru",
            popularity: 76,
            isNew: true
        },
        {
            id: 10,
            store: "Билайн",
            logo: "images/beeline.png",
            discount: "50%",
            text: "На тарифы для семьи",
            date: "15.08.2026",
            category: "telecom",
            link: "https://beeline.ru",
            popularity: 81,
            isNew: false
        },
        {
            id: 11,
            store: "Лента",
            logo: "images/lenta.png",
            discount: "300 ₽",
            text: "При покупке от 2000₽",
            date: "07.08.2026",
            category: "food",
            link: "https://lenta.com",
            popularity: 87,
            isNew: false
        },
        {
            id: 12,
            store: "Steam",
            logo: "images/steam.png",
            discount: "35%",
            text: "На пополнение кошелька",
            date: "30.09.2026",
            category: "games",
            link: "https://store.steampowered.com",
            popularity: 94,
            isNew: true
        }
    ];

    const categoryFilters = [
        { id: "all", name: "Все", emoji: "🔥" },
        { id: "food", name: "Еда", emoji: "🍕" },
        { id: "marketplace", name: "Маркетплейсы", emoji: "📦" },
        { id: "bank", name: "Банки", emoji: "💳" },
        { id: "telecom", name: "Связь", emoji: "📱" },
        { id: "games", name: "Игры", emoji: "🎮" }
    ];

    const sortOptions = [
        { id: "new", name: "Новые" },
        { id: "popular", name: "Популярные" },
        { id: "discount", name: "Макс. скидка" }
    ];

    let favorites = [];
    let activeCategory = "all";
    let activeSort = "new";
    let searchQuery = "";

    function init() {
        const saved = localStorage.getItem("maxvygoda_promo_favorites");
        if (saved) {
            try {
                favorites = JSON.parse(saved);
            } catch (e) {
                favorites = [];
            }
        }
    }

    function saveFavorites() {
        localStorage.setItem("maxvygoda_promo_favorites", JSON.stringify(favorites));
    }

    function toggleFavorite(id) {
        const index = favorites.indexOf(id);
        if (index > -1) {
            favorites.splice(index, 1);
            saveFavorites();
            return false;
        } else {
            favorites.push(id);
            saveFavorites();
            return true;
        }
    }

    function isFavorite(id) {
        return favorites.includes(id);
    }

    function getPromotions(category = "all", sort = "new", query = "") {
        let filtered = [...promotionsData];

        if (category && category !== "all") {
            filtered = filtered.filter(p => p.category === category);
        }

        if (query && query.trim() !== "") {
            const q = query.toLowerCase().trim();
            filtered = filtered.filter(p =>
                p.store.toLowerCase().includes(q) ||
                p.text.toLowerCase().includes(q) ||
                p.discount.toLowerCase().includes(q) ||
                p.category.toLowerCase().includes(q)
            );
        }

        switch (sort) {
            case "popular":
                filtered.sort((a, b) => b.popularity - a.popularity);
                break;
            case "discount":
                filtered.sort((a, b) => {
                    const aVal = parseInt(a.discount) || 0;
                    const bVal = parseInt(b.discount) || 0;
                    return bVal - aVal;
                });
                break;
            case "new":
            default:
                filtered.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
                break;
        }

        return filtered;
    }

    function getCategoryFilters() {
        return [...categoryFilters];
    }

    function getSortOptions() {
        return [...sortOptions];
    }

    function setActiveCategory(cat) {
        activeCategory = cat;
    }

    function setActiveSort(sort) {
        activeSort = sort;
    }

    function setSearchQuery(query) {
        searchQuery = query;
    }

    function getActiveCategory() {
        return activeCategory;
    }

    function getActiveSort() {
        return activeSort;
    }

    function getSearchQuery() {
        return searchQuery;
    }

    init();

    return {
        getPromotions,
        getCategoryFilters,
        getSortOptions,
        toggleFavorite,
        isFavorite,
        setActiveCategory,
        setActiveSort,
        setSearchQuery,
        getActiveCategory,
        getActiveSort,
        getSearchQuery,
        init
    };
})();
