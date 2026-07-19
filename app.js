// ============================================
// MAX Mini App - Основной JavaScript
// Версия: 2.0 с интеграцией Google Sheets
// ============================================

class MaxMiniApp {
    constructor() {
        this.currentPage = 'orders';
        this.orders = [];
        this.categories = [];
        this.currentCategory = 'Все';
        this.isLoading = false;
        this.currentPageNum = 1;
        this.hasMoreOrders = true;
        
        // Настройки API
        this.API_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL'; // Замените на URL вашего Apps Script
        this.ORDERS_PER_PAGE = 10;
        
        this.init();
    }

    async init() {
        this.setupNavigation();
        this.setupSearch();
        this.setupTelegramIntegration();
        
        // Загружаем категории и заказы
        await this.loadCategories();
        await this.loadOrders();
        
        // Настраиваем бесконечную прокрутку
        this.setupInfiniteScroll();
    }

    // ============================================
    // API методы
    // ============================================

    /**
     * Базовый метод для запросов к API
     */
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

    /**
     * Загрузка категорий из Google Sheets
     */
    async loadCategories() {
        try {
            const data = await this.apiRequest({ action: 'getCategories' });
            
            if (data.categories && data.categories.length > 0) {
                this.categories = data.categories;
                this.renderCategories();
            }
        } catch (error) {
            console.error('Ошибка загрузки категорий:', error);
            // Используем категории по умолчанию
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

    /**
     * Загрузка заказов из Google Sheets
     */
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
            
            // Добавляем фильтры
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

    /**
     * Загрузка следующей страницы заказов
     */
    async loadMoreOrders() {
        if (!this.hasMoreOrders || this.isLoading) return;
        await this.loadOrders(false);
    }

    // ============================================
    // UI Методы
    // ============================================

    /**
     * Отрисовка категорий
     */
    renderCategories() {
        const categoriesContainer = document.querySelector('.categories-scroll');
        if (!categoriesContainer) return;
        
        categoriesContainer.innerHTML = this.categories.map(cat => 
            `<button class="category-btn ${cat.id === 'all' || cat.id === this.currentCategory ? 'active' : ''}" 
                     data-category="${cat.id}">
                ${cat.icon} ${cat.name}
            </button>`
        ).join('');
        
        // Добавляем обработчики
        categoriesContainer.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.dataset.category;
                this.currentCategory = category === 'all' ? 'Все' : category;
                
                // Обновляем активную кнопку
                categoriesContainer.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Перезагружаем заказы с фильтром
                this.loadOrders(true);
                
                // Тактильная обратная связь
                if (window.Telegram?.WebApp?.HapticFeedback) {
                    window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                }
            });
        });
    }

    /**
     * Отрисовка карточек заказов
     */
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
        
        // Добавляем индикатор загрузки в конец списка
        if (this.hasMoreOrders) {
            ordersContainer.innerHTML += `
                <div class="load-more-indicator" id="loadMoreIndicator">
                    <div class="spinner"></div>
                </div>
            `;
        }
        
        // Настраиваем обработчики для карточек
        this.setupOrderCards();
    }

    /**
     * Создание HTML карточки заказа
     */
    createOrderCard(order, index) {
        const isVip = order.category === 'VIP' || order.price > 20000;
        const isUrgent = this.isRecentOrder(order.date);
        const priceFormatted = this.formatPrice(order.price);
        
        // Определяем бейджи
        const badges = [];
        if (isVip) badges.push('<span class="badge badge-vip">⭐ VIP</span>');
        if (isUrgent) badges.push('<span class="badge badge-urgent">🔥 Срочно</span>');
        if (!isVip && !isUrgent) {
            badges.push('<span class="badge badge-new">Новое</span>');
        }
        
        // Аватар заказчика (первая буква города или названия)
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

    /**
     * Показ состояния загрузки
     */
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

    /**
     * Скрытие состояния загрузки
     */
    hideLoadingState() {
        const indicator = document.getElementById('loadMoreIndicator');
        if (indicator) {
            indicator.remove();
        }
    }

    /**
     * Показ пустого состояния
     */
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

    /**
     * Показ состояния ошибки
     */
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

    // ============================================
    // Вспомогательные методы
    // ============================================

    /**
     * Форматирование цены
     */
    formatPrice(price) {
        return parseInt(price).toLocaleString('ru-RU');
    }

    /**
     * Проверка на недавний заказ (меньше 24 часов)
     */
    isRecentOrder(dateStr) {
        if (!dateStr) return false;
        
        try {
            const orderDate = new Date(dateStr);
            const now = new Date();
            const hoursDiff = (now - orderDate) / (1000 * 60 * 60);
            return hoursDiff < 24;
        } catch {
            return false;
        }
    }

    /**
     * Экранирование HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Настройка бесконечной прокрутки
     */
    setupInfiniteScroll() {
        const mainContent = document.getElementById('mainContent');
        if (!mainContent) return;
        
        mainContent.addEventListener('scroll', () => {
            const scrollTop = mainContent.scrollTop;
            const scrollHeight = mainContent.scrollHeight;
            const clientHeight = mainContent.clientHeight;
            
            // Если доскролили до низа (с запасом в 100px)
            if (scrollTop + clientHeight >= scrollHeight - 100) {
                this.loadMoreOrders();
            }
        });
    }

    /**
     * Настройка поиска с задержкой
     */
    setupSearch() {
        const searchInput = document.querySelector('.search-input');
        if (!searchInput) return;
        
        let searchTimeout;
        
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            
            searchTimeout = setTimeout(() => {
                this.loadOrders(true);
            }, 500); // Задержка 500мс перед поиском
        });
    }

    /**
     * Настройка карточек заказов
     */
    setupOrderCards() {
        document.querySelectorAll('.order-card').forEach(card => {
            card.addEventListener('click', () => {
                const orderId = card.dataset.orderId;
                this.showOrderDetails(orderId);
            });
        });
    }

    /**
     * Показ деталей заказа
     */
    showOrderDetails(orderId) {
        // Тактильная обратная связь
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
        }
        
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        // В будущем здесь будет модальное окно или новая страница
        alert(`Заказ: ${order.title}\nГород: ${order.city}\nЦена: ${this.formatPrice(order.price)} ₽\n\nОписание: ${order.description}`);
    }

    // ... (остальные методы из предыдущей версии остаются без изменений)
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    window.maxApp = new MaxMiniApp();
});
