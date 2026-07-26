import CONFIG from './config.js';
import API from './api.js';
import Cache from './cache.js';
import Cards from './cards.js';
import Search from './search.js';
import Favorites from './favorites.js';
import Stats from './stats.js';

const App = {
    currentScreen: 'promotions',
    activeCategory: 'all',
    activeSort: 'new',
    searchQuery: '',
    mainContent: null,
    bottomNav: null,
    searchBarInstance: null,
    toastTimer: null,

    async init() {
        this.mainContent = document.getElementById('main-content');
        this.bottomNav = document.getElementById('bottom-nav');

        document.body.style.opacity = '0';
        document.body.style.transition = 'opacity 0.3s ease';

        this.setupGlobalListeners();
        this.renderInitialUI();
        API.startAutoRefresh();

        requestAnimationFrame(() => {
            document.body.style.opacity = '1';
        });

        await this.loadData();
    },

    setupGlobalListeners() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                API.loadOffers(true).catch(() => {});
            }
        });

        window.addEventListener('resize', () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        });

        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);

        window.addEventListener('online', () => {
            this.showToast('🔄 Интернет восстановлен');
            API.loadOffers(true).then(() => {
                this.renderPromotionsContent();
            }).catch(() => {});
        });

        window.addEventListener('offline', () => {
            this.showToast('📡 Нет подключения к интернету');
        });
    },

    renderInitialUI() {
        this.mainContent.innerHTML = '';
        this.mainContent.className = 'main-content promotions-page';

        const pageContainer = document.createElement('div');
        pageContainer.className = 'promotions-page-inner';

        const headerSection = document.createElement('div');
        headerSection.className = 'promotions-header';

        const pageTitle = document.createElement('div');
        pageTitle.className = 'promotions-page-title';
        pageTitle.textContent = '🎯 MAX Выгода';

        const subtitle = document.createElement('div');
        subtitle.className = 'promotions-page-subtitle';
        subtitle.textContent = 'Лучшие предложения для вас';

        headerSection.appendChild(pageTitle);
        headerSection.appendChild(subtitle);

        const searchBar = Search.createSearchBar('Поиск по магазинам и скидкам...', (query) => {
            this.searchQuery = query;
            this.renderPromotionsContent();
        });
        this.searchBarInstance = searchBar;

        const categories = API.getCategories();
        const categoryFilters = Search.createCategoryFilters(categories, this.activeCategory, (catId) => {
            this.activeCategory = catId;
            this.renderPromotionsContent();
        });

        const sortOptions = API.getSortOptions();
        const sortBar = Search.createSortBar(sortOptions, this.activeSort, (sortId) => {
            this.activeSort = sortId;
            this.renderPromotionsContent();
        });

        const contentArea = document.createElement('div');
        contentArea.className = 'promo-content-area';
        contentArea.id = 'promo-content-area';

        Cards.showSkeleton(contentArea);

        pageContainer.appendChild(headerSection);
        pageContainer.appendChild(searchBar.wrapper);
        pageContainer.appendChild(categoryFilters);
        pageContainer.appendChild(sortBar);
        pageContainer.appendChild(contentArea);

        this.mainContent.appendChild(pageContainer);
        this.renderBottomNav();
    },

    async loadData() {
        const contentArea = document.getElementById('promo-content-area');

        try {
            const offers = await API.loadOffers();

            if (!navigator.onLine) {
                if (offers.length > 0) {
                    this.showToast('📡 Оффлайн-режим. Загружены сохранённые данные');
                    this.updateCategoryFilters();
                    this.renderPromotionsContent();
                } else {
                    Cards.showOffline(contentArea, () => this.loadData());
                }
                return;
            }

            if (offers.length === 0) {
                Cards.showError(contentArea, 'Не удалось загрузить акции. Проверьте подключение.', () => this.loadData());
                return;
            }

            this.updateCategoryFilters();
            this.renderPromotionsContent();
        } catch (error) {
            console.error('Load error:', error);
            Cards.showError(contentArea, error.message || 'Неизвестная ошибка', () => this.loadData());
        }
    },

    updateCategoryFilters() {
        const filtersContainer = this.mainContent.querySelector('.promo-filters-container');
        if (!filtersContainer) return;

        const categories = API.getCategories();
        const newFilters = Search.createCategoryFilters(categories, this.activeCategory, (catId) => {
            this.activeCategory = catId;
            this.renderPromotionsContent();
        });

        filtersContainer.parentNode.replaceChild(newFilters, filtersContainer);
    },

    renderPromotionsContent() {
        const contentArea = document.getElementById('promo-content-area');
        if (!contentArea) return;

        const offers = API.getOffers(this.activeCategory, this.activeSort, this.searchQuery);

        if (!navigator.onLine) {
            const cached = Cache.getCachedOffers();
            if (cached && cached.length > 0) {
                const filtered = API.getOffers(this.activeCategory, this.activeSort, this.searchQuery);
                Cards.renderPromoGrid(contentArea, filtered, () => this.loadData());
                return;
            }
            Cards.showOffline(contentArea, () => this.loadData());
            return;
        }

        Cards.renderPromoGrid(contentArea, offers, () => this.loadData());
    },

    renderBottomNav() {
        if (!this.bottomNav) return;
        this.bottomNav.innerHTML = '';

        const navItems = [
            { id: 'home', icon: '🏠', label: 'Главная' },
            { id: 'promotions', icon: '🎯', label: 'Акции' },
            { id: 'favorites', icon: '❤️', label: 'Избранное' },
            { id: 'notifications', icon: '🔔', label: 'Уведомления' },
            { id: 'profile', icon: '👤', label: 'Профиль' }
        ];

        navItems.forEach(item => {
            const navItem = document.createElement('button');
            navItem.className = 'nav-item';
            if (item.id === this.currentScreen) {
                navItem.classList.add('active');
            }

            navItem.addEventListener('click', () => {
                this.handleNavClick(item.id);
            });

            const icon = document.createElement('span');
            icon.className = 'nav-icon';
            icon.textContent = item.icon;

            const label = document.createElement('span');
            label.className = 'nav-label';
            label.textContent = item.label;

            navItem.appendChild(icon);
            navItem.appendChild(label);
            this.bottomNav.appendChild(navItem);
        });
    },

    handleNavClick(screenId) {
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

    showFavorites() {
        this.mainContent.innerHTML = '';
        this.mainContent.className = 'main-content promotions-page';

        const pageContainer = document.createElement('div');
        pageContainer.className = 'promotions-page-inner';

        const headerSection = document.createElement('div');
        headerSection.className = 'promotions-header';

        const backButton = document.createElement('button');
        backButton.className = 'promo-back-btn';
        backButton.textContent = '← Назад';
        backButton.addEventListener('click', () => {
            this.currentScreen = 'promotions';
            this.renderInitialUI();
            this.loadData();
        });

        const pageTitle = document.createElement('div');
        pageTitle.className = 'promotions-page-title';
        pageTitle.textContent = '❤️ Избранное';

        headerSection.appendChild(backButton);
        headerSection.appendChild(pageTitle);

        const contentArea = document.createElement('div');
        contentArea.className = 'promo-content-area';

        const allOffers = API.getOffers();
        const favOffers = Favorites.getFavoriteOffers(allOffers);
        Cards.renderPromoGrid(contentArea, favOffers);

        pageContainer.appendChild(headerSection);
        pageContainer.appendChild(contentArea);
        this.mainContent.appendChild(pageContainer);

        this.currentScreen = 'favorites';
        this.renderBottomNav();
    },

    showToast(message, duration = 2500) {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        if (this.toastTimer) clearTimeout(this.toastTimer);
        container.innerHTML = '';

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);

        this.toastTimer = setTimeout(() => {
            toast.classList.add('removing');
            toast.addEventListener('animationend', () => {
                toast.remove();
                if (container.children.length === 0) {
                    container.remove();
                }
            }, { once: true });
        }, duration);
    },

    showModal(title, text) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const sheet = document.createElement('div');
        sheet.className = 'modal-sheet';

        const modalTitle = document.createElement('div');
        modalTitle.className = 'modal-title';
        modalTitle.textContent = title;

        const modalText = document.createElement('div');
        modalText.className = 'modal-text';
        modalText.textContent = text;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.textContent = 'Понятно';
        closeBtn.addEventListener('click', () => overlay.remove());

        sheet.appendChild(modalTitle);
        sheet.appendChild(modalText);
        sheet.appendChild(closeBtn);
        overlay.appendChild(sheet);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        document.body.appendChild(overlay);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
