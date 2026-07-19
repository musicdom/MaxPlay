// MAX Mini App - Основной JavaScript
// Версия: 2.0 с интеграцией Google Sheets
// API URL: https://script.google.com/macros/s/AKfycbwagYhGORpxyPWlQkiDoxIj8Hn4gMFL-RhAV8NrC7IEWvht06zQ00SGEtUASIZFENBRcQ/exec

class MaxMiniApp {
    constructor() {
        this.currentPage = 'orders';
        this.orders = [];
        this.categories = [];
        this.currentCategory = 'Все';
        this.isLoading = false;
        this.currentPageNum = 1;
        this.hasMoreOrders = true;
        
        // ⚠️ ВАЖНО: замените на актуальный URL вашего Apps Script
        this.API_URL = 'https://script.google.com/macros/s/AKfycbwagYhGORpxyPWlQkiDoxIj8Hn4gMFL-RhAV8NrC7IEWvht06zQ00SGEtUASIZFENBRcQ/exec';
        this.ORDERS_PER_PAGE = 10;
        
        this.init();
    }

    async init() {
        this.setupNavigation();
        this.setupSearch();
        this.setupTelegramIntegration();
        
        await this.loadCategories();
        await this.loadOrders();
        
        this.setupInfiniteScroll();
    }

    // Базовый метод для запросов к API
    async apiRequest(params) {
        try {
            const queryString = new URLSearchParams(params).toString();
            const response = await fetch(`${this.API_URL}?${queryString}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Неизвестная ошибка');
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Загрузка категорий
    async loadCategories() {
        try {
            const data = await this.apiRequest({ action: 'getCategories' });
            
            if (data.categories && data.categories.length > 0) {
                this.categories = data.categories;
                this.renderCategories();
            }
        } catch (error) {
            console.error('Ошибка загрузки категорий:', error);
            this.categories = [
                { id: 'all', name: 'Все', icon: '📋' },
                { id: 'Доставка', name: 'Доставка', icon: '🚚' },
                { id: 'Стройка', name: 'Стройка', icon: '🏗️' },
                { id: 'IT', name: 'IT', icon: '💻' },
                { id: 'Дизайн', name: 'Дизайн', icon: '🎨' },
                { id: 'Тексты', name: 'Тексты', icon: '📝' },
                { id: 'Ремонт', name: 'Ремонт', icon: '🔧' }
            ];
            this.renderCategories();
        }
    }

    // Загрузка заказов
    async loadOrders(reset = true) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        
        if (reset) {
            this.currentPageNum = 1;
            this.orders = [];
            this.showLoadingState();
        }
        
        try {
            const params = {
                action: 'getOrders',
                page: this.currentPageNum,
                limit: this.ORDERS_PER_PAGE
            };
            
            if (this.currentCategory !== 'Все') {
                params.category = this.currentCategory;
            }
            
            const searchQuery = document.querySelector('.search-input')?.value;
            if (searchQuery) {
                params.search = searchQuery;
            }
            
            const data = await this.apiRequest(params);
            
            if (reset) {
                this.orders = data.orders || [];
            } else {
                this.orders = [...this.orders, ...(data.orders || [])];
            }
            
            this.hasMoreOrders = data.hasMore || false;
            this.currentPageNum = data.page + 1;
            
            this.renderOrders();
            
        } catch (error) {
            console.error('Ошибка загрузки заказов:', error);
            this.showErrorState('Не удалось загрузить заказы. Проверьте подключение к интернету.');
        } finally {
            this.isLoading = false;
            this.hideLoadingState();
        }
    }

    async loadMoreOrders() {
        if (!this.hasMoreOrders || this.isLoading) return;
        await this.loadOrders(false);
    }

    // Отрисовка категорий
    renderCategories() {
        const categoriesContainer = document.querySelector('.categories-scroll');
        if (!categoriesContainer) return;
        
        categoriesContainer.innerHTML = this.categories.map(cat => 
            `<button class="category-btn ${cat.id === 'all' || cat.id === this.currentCategory ? 'active' : ''}" 
                     data-category="${cat.id}">
                ${cat.icon} ${cat.name}
            </button>`
        ).join('');
        
        categoriesContainer.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.dataset.category;
                this.currentCategory = category === 'all' ? 'Все' : category;
                
                categoriesContainer.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.loadOrders(true);
                
                if (window.Telegram?.WebApp?.HapticFeedback) {
                    window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                }
            });
        });
    }

    // Отрисовка карточек заказов
    renderOrders() {
        const ordersContainer = document.getElementById('ordersFeed');
        if (!ordersContainer) return;
        
        if (this.orders.length === 0) {
            this.showEmptyState();
            return;
        }
        
        ordersContainer.innerHTML = this.orders.map((order, index) => 
            this.createOrderCard(order, index)
        ).join('');
        
        if (this.hasMoreOrders) {
            ordersContainer.innerHTML += `
                <div class="load-more-indicator" id="loadMoreIndicator">
                    <div class="spinner"></div>
                </div>
            `;
        }
        
        this.setupOrderCards();
    }

    createOrderCard(order, index) {
        const isVip = order.category === 'VIP' || order.price > 20000;
        const isUrgent = this.isRecentOrder(order.date);
        const priceFormatted = this.formatPrice(order.price);
        
        const badges = [];
        if (isVip) badges.push('<span class="badge badge-vip">⭐ VIP</span>');
        if (isUrgent) badges.push('<span class="badge badge-urgent">🔥 Срочно</span>');
        if (!isVip && !isUrgent) {
            badges.push('<span class="badge badge-new">Новое</span>');
        }
        
        const avatarLetter = (order.city || 'Н')[0].toUpperCase();
        
        return `
            <div class="order-card ${isVip ? 'vip' : ''}" data-order-id="${order.id}" 
                 style="animation: fadeInUp 0.5s ease forwards; animation-delay: ${index * 0.05}s">
                <div class="order-card-header">
                    <div class="order-badges">
                        ${badges.join('')}
                    </div>
                    <span class="order-price ${isVip ? 'premium' : ''}">${priceFormatted} ₽</span>
                </div>
                <h3 class="order-title">${this.escapeHtml(order.title)}</h3>
                <p class="order-description">${this.escapeHtml(order.description)}</p>
                <div class="order-meta">
                    <span class="meta-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="10" r="3"></circle>
                            <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"></path>
                        </svg>
                        ${this.escapeHtml(order.city)}
                    </span>
                    <span class="meta-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        ${order.date}
                    </span>
                </div>
                <div class="order-card-footer">
                    <div class="customer-info">
                        <div class="customer-avatar">${avatarLetter}</div>
                        <span class="customer-name">${this.escapeHtml(order.city)}</span>
                        <span class="rating">⭐ ${(4 + Math.random()).toFixed(1)}</span>
                    </div>
                    <button class="btn-details" onclick="event.stopPropagation(); maxApp.showOrderDetails('${order.id}')">
                        Подробнее
                    </button>
                </div>
            </div>
        `;
    }

    showLoadingState() {
        const container = document.getElementById('ordersFeed');
        if (!container || this.orders.length > 0) return;
        
        container.innerHTML = `
            <div class="loading-state">
                <div class="spinner-large"></div>
                <p>Загрузка заказов...</p>
            </div>
        `;
    }

    hideLoadingState() {
        const indicator = document.getElementById('loadMoreIndicator');
        if (indicator) indicator.remove();
    }

    showEmptyState() {
        const container = document.getElementById('ordersFeed');
        if (!container) return;
        
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <h2>Пока заказов нет</h2>
                <p>Заказы появятся здесь, как только кто-то их разместит</p>
                <button class="btn-refresh" onclick="maxApp.loadOrders(true)">
                    Обновить
                </button>
            </div>
        `;
    }

    showErrorState(message) {
        const container = document.getElementById('ordersFeed');
        if (!container) return;
        
        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <h2>Что-то пошло не так</h2>
                <p>${message}</p>
                <button class="btn-refresh" onclick="maxApp.loadOrders(true)">
                    Попробовать снова
                </button>
            </div>
        `;
    }

    formatPrice(price) {
        return parseInt(price).toLocaleString('ru-RU');
    }

    isRecentOrder(dateStr) {
        if (!dateStr) return false;
        try {
            const orderDate = new Date(dateStr);
            const now = new Date();
            const hoursDiff = (now - orderDate) / (1000 * 60 * 60);
            return hoursDiff < 24;
        } catch { return false; }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setupInfiniteScroll() {
        const mainContent = document.getElementById('mainContent');
        if (!mainContent) return;
        
        mainContent.addEventListener('scroll', () => {
            const scrollTop = mainContent.scrollTop;
            const scrollHeight = mainContent.scrollHeight;
            const clientHeight = mainContent.clientHeight;
            
            if (scrollTop + clientHeight >= scrollHeight - 100) {
                this.loadMoreOrders();
            }
        });
    }

    setupSearch() {
        const searchInput = document.querySelector('.search-input');
        if (!searchInput) return;
        
        let searchTimeout;
        
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.loadOrders(true);
            }, 500);
        });
    }

    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const page = item.dataset.page;
                if (page === this.currentPage) return;
                
                this.animatePageTransition(() => {
                    this.navigateTo(page);
                    this.updateActiveNav(page);
                });
            });
        });
    }

    navigateTo(page) {
        this.currentPage = page;
        const mainContent = document.getElementById('mainContent');
        
        switch(page) {
            case 'orders':
                this.showOrdersPage();
                break;
            case 'create':
                this.showCreateOrderPage();
                break;
            case 'executors':
                this.showExecutorsPage();
                break;
            case 'vip':
                this.showVipPage();
                break;
            case 'profile':
                this.showProfilePage();
                break;
        }
    }

    updateActiveNav(page) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });
    }

    animatePageTransition(callback) {
        const mainContent = document.getElementById('mainContent');
        mainContent.style.opacity = '0';
        mainContent.style.transform = 'translateY(10px)';
        
        setTimeout(() => {
            callback();
            mainContent.style.transition = 'all 0.3s ease';
            mainContent.style.opacity = '1';
            mainContent.style.transform = 'translateY(0)';
        }, 150);
    }

    showOrdersPage() {
        document.querySelector('.header-title').textContent = 'Заказы';
        // При возврате на страницу заказов перезагружаем данные
        this.loadOrders(true);
    }

    showCreateOrderPage() {
        document.querySelector('.header-title').textContent = 'Разместить заказ';
        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = `
            <div class="placeholder-page">
                <div class="placeholder-icon">📝</div>
                <h2>Создание заказа</h2>
                <p>Здесь будет форма для размещения нового заказа</p>
            </div>
        `;
    }

    showExecutorsPage() {
        document.querySelector('.header-title').textContent = 'Исполнители';
        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = `
            <div class="placeholder-page">
                <div class="placeholder-icon">👷</div>
                <h2>Исполнители</h2>
                <p>Список доступных исполнителей и их рейтинг</p>
            </div>
        `;
    }

    showVipPage() {
        document.querySelector('.header-title').textContent = 'VIP Заказы';
        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = `
            <div class="placeholder-page">
                <div class="placeholder-icon">⭐</div>
                <h2>VIP Раздел</h2>
                <p>Премиум заказы и эксклюзивные предложения</p>
            </div>
        `;
    }

    showProfilePage() {
        document.querySelector('.header-title').textContent = 'Кабинет';
        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = `
            <div class="placeholder-page">
                <div class="placeholder-icon">👤</div>
                <h2>Личный кабинет</h2>
                <p>Ваш профиль, история заказов и настройки</p>
            </div>
        `;
    }

    setupOrderCards() {
        document.querySelectorAll('.order-card').forEach(card => {
            card.addEventListener('click', () => {
                const orderId = card.dataset.orderId;
                this.showOrderDetails(orderId);
            });
        });
    }

    showOrderDetails(orderId) {
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
        }
        
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        alert(`Заказ: ${order.title}\nГород: ${order.city}\nЦена: ${this.formatPrice(order.price)} ₽\n\nОписание: ${order.description}`);
    }

    setupTelegramIntegration() {
        if (window.Telegram?.WebApp) {
            const tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();
            
            document.documentElement.style.backgroundColor = tg.backgroundColor || '#0f0f1a';
            
            tg.BackButton.onClick(() => {
                if (this.currentPage !== 'orders') {
                    this.navigateTo('orders');
                    this.updateActiveNav('orders');
                }
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.maxApp = new MaxMiniApp();
});
