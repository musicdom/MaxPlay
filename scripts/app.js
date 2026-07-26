// Главное приложение
var App = {
    currentScreen: 'promotions',
    activeCategory: 'all',
    activeSort: 'new',
    searchQuery: '',
    mainContent: null,
    bottomNav: null,
    searchBarInstance: null,
    toastTimer: null,

    init: function() {
        this.mainContent = document.getElementById('main-content');
        this.bottomNav = document.getElementById('bottom-nav');
        document.body.style.opacity = '0';
        document.body.style.transition = 'opacity 0.3s ease';
        this.setupGlobalListeners();
        this.renderInitialUI();
        API.startAutoRefresh();
        requestAnimationFrame(function() {
            document.body.style.opacity = '1';
        });
        this.loadData();
    },

    setupGlobalListeners: function() {
        var self = this;
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') {
                API.loadOffers(true).catch(function() {});
            }
        });
        window.addEventListener('resize', function() {
            var vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', vh + 'px');
        });
        var vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', vh + 'px');

        window.addEventListener('online', function() {
            self.showToast('🔄 Интернет восстановлен');
            API.loadOffers(true).then(function() {
                self.renderPromotionsContent();
            }).catch(function() {});
        });
        window.addEventListener('offline', function() {
            self.showToast('📡 Нет подключения к интернету');
        });
    },

    renderInitialUI: function() {
        var self = this;
        this.mainContent.innerHTML = '';
        this.mainContent.className = 'main-content promotions-page';

        var page = document.createElement('div');
        page.className = 'promotions-page-inner';

        var header = document.createElement('div');
        header.className = 'promotions-header';
        var title = document.createElement('div');
        title.className = 'promotions-page-title';
        title.textContent = '🎯 MAX Выгода';
        var sub = document.createElement('div');
        sub.className = 'promotions-page-subtitle';
        sub.textContent = 'Лучшие предложения для вас';
        header.appendChild(title);
        header.appendChild(sub);

        var searchBar = Search.createSearchBar('Поиск по магазинам и скидкам...', function(query) {
            self.searchQuery = query;
            self.renderPromotionsContent();
        });
        this.searchBarInstance = searchBar;

        var categories = API.getCategories();
        var catFilters = Search.createCategoryFilters(categories, this.activeCategory, function(catId) {
            self.activeCategory = catId;
            self.renderPromotionsContent();
        });

        var sortOptions = API.getSortOptions();
        var sortBar = Search.createSortBar(sortOptions, this.activeSort, function(sortId) {
            self.activeSort = sortId;
            self.renderPromotionsContent();
        });

        var contentArea = document.createElement('div');
        contentArea.className = 'promo-content-area';
        contentArea.id = 'promo-content-area';
        Cards.showSkeleton(contentArea);

        page.appendChild(header);
        page.appendChild(searchBar.wrapper);
        page.appendChild(catFilters);
        page.appendChild(sortBar);
        page.appendChild(contentArea);
        this.mainContent.appendChild(page);
        this.renderBottomNav();
    },

    loadData: function() {
        var self = this;
        var contentArea = document.getElementById('promo-content-area');
        API.loadOffers()
            .then(function(offers) {
                if (!navigator.onLine) {
                    if (offers.length > 0) {
                        self.showToast('📡 Оффлайн-режим. Загружены сохранённые данные');
                        self.updateCategoryFilters();
                        self.renderPromotionsContent();
                    } else {
                        Cards.showOffline(contentArea, function() { self.loadData(); });
                    }
                    return;
                }
                if (offers.length === 0) {
                    Cards.showError(contentArea, 'Не удалось загрузить акции.', function() { self.loadData(); });
                    return;
                }
                self.updateCategoryFilters();
                self.renderPromotionsContent();
            })
            .catch(function(error) {
                console.error(error);
                Cards.showError(contentArea, error.message || 'Ошибка загрузки', function() { self.loadData(); });
            });
    },

    updateCategoryFilters: function() {
        var container = this.mainContent.querySelector('.promo-filters-container');
        if (!container) return;
        var categories = API.getCategories();
        var newFilters = Search.createCategoryFilters(categories, this.activeCategory, function(catId) {
            App.activeCategory = catId;
            App.renderPromotionsContent();
        });
        container.parentNode.replaceChild(newFilters, container);
    },

    renderPromotionsContent: function() {
        var contentArea = document.getElementById('promo-content-area');
        if (!contentArea) return;
        var offers = API.getOffers(this.activeCategory, this.activeSort, this.searchQuery);
        if (!navigator.onLine) {
            var cached = Cache.getCachedOffers();
            if (cached && cached.length > 0) {
                var filtered = API.getOffers(this.activeCategory, this.activeSort, this.searchQuery);
                Cards.renderPromoGrid(contentArea, filtered, function() { App.loadData(); });
                return;
            }
            Cards.showOffline(contentArea, function() { App.loadData(); });
            return;
        }
        Cards.renderPromoGrid(contentArea, offers, function() { App.loadData(); });
    },

    renderBottomNav: function() {
        if (!this.bottomNav) return;
        this.bottomNav.innerHTML = '';
        var navItems = [
            { id: 'home', icon: '🏠', label: 'Главная' },
            { id: 'promotions', icon: '🎯', label: 'Акции' },
            { id: 'favorites', icon: '❤️', label: 'Избранное' },
            { id: 'notifications', icon: '🔔', label: 'Уведомления' },
            { id: 'profile', icon: '👤', label: 'Профиль' }
        ];
        var self = this;
        navItems.forEach(function(item) {
            var navItem = document.createElement('button');
            navItem.className = 'nav-item';
            if (item.id === self.currentScreen) navItem.classList.add('active');
            navItem.addEventListener('click', function() { self.handleNavClick(item.id); });
            var icon = document.createElement('span');
            icon.className = 'nav-icon';
            icon.textContent = item.icon;
            var label = document.createElement('span');
            label.className = 'nav-label';
            label.textContent = item.label;
            navItem.appendChild(icon);
            navItem.appendChild(label);
            self.bottomNav.appendChild(navItem);
        });
    },

    handleNavClick: function(screenId) {
        switch (screenId) {
            case 'notifications':
                this.showToast('🔔 Уведомлений пока нет');
                break;
            case 'profile':
                this.showModal('👤 Профиль', 'Раздел профиля находится в разработке.');
                break;
            case 'favorites':
                this.showFavorites();
                break;
            default:
                this.currentScreen = screenId;
                this.renderInitialUI();
                this.loadData();
                break;
        }
    },

    showFavorites: function() {
        this.mainContent.innerHTML = '';
        this.mainContent.className = 'main-content promotions-page';
        var page = document.createElement('div');
        page.className = 'promotions-page-inner';
        var header = document.createElement('div');
        header.className = 'promotions-header';
        var backBtn = document.createElement('button');
        backBtn.className = 'promo-back-btn';
        backBtn.textContent = '← Назад';
        backBtn.addEventListener('click', function() {
            App.currentScreen = 'promotions';
            App.renderInitialUI();
            App.loadData();
        });
        var title = document.createElement('div');
        title.className = 'promotions-page-title';
        title.textContent = '❤️ Избранное';
        header.appendChild(backBtn);
        header.appendChild(title);
        var contentArea = document.createElement('div');
        contentArea.className = 'promo-content-area';
        var allOffers = API.getOffers();
        var favOffers = Favorites.getFavoriteOffers(allOffers);
        Cards.renderPromoGrid(contentArea, favOffers);
        page.appendChild(header);
        page.appendChild(contentArea);
        this.mainContent.appendChild(page);
        this.currentScreen = 'favorites';
        this.renderBottomNav();
    },

    showToast: function(message, duration) {
        duration = duration || 2500;
        var container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        if (this.toastTimer) clearTimeout(this.toastTimer);
        container.innerHTML = '';
        var toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);
        var self = this;
        this.toastTimer = setTimeout(function() {
            toast.classList.add('removing');
            toast.addEventListener('animationend', function() {
                toast.remove();
                if (container.children.length === 0) container.remove();
            }, { once: true });
        }, duration);
    },

    showModal: function(title, text) {
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        var sheet = document.createElement('div');
        sheet.className = 'modal-sheet';
        var modalTitle = document.createElement('div');
        modalTitle.className = 'modal-title';
        modalTitle.textContent = title;
        var modalText = document.createElement('div');
        modalText.className = 'modal-text';
        modalText.textContent = text;
        var closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.textContent = 'Понятно';
        closeBtn.addEventListener('click', function() { overlay.remove(); });
        sheet.appendChild(modalTitle);
        sheet.appendChild(modalText);
        sheet.appendChild(closeBtn);
        overlay.appendChild(sheet);
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) overlay.remove();
        });
        document.body.appendChild(overlay);
    }
};

// Запуск после загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    App.init();
});
