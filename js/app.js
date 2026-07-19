// MAX Mini App - Управление навигацией и интерфейсом
class MaxMiniApp {
    constructor() {
        this.currentPage = 'orders';
        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupCategoryFilter();
        this.setupSearch();
        this.setupOrderCards();
        this.setupTelegramIntegration();
    }

    // Настройка нижней навигации
    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const page = item.dataset.page;
                if (page === this.currentPage) return;
                
                // Анимация перехода
                this.animatePageTransition(() => {
                    this.navigateTo(page);
                    this.updateActiveNav(page);
                });
            });
        });
    }

    // Навигация между страницами
    navigateTo(page) {
        this.currentPage = page;
        const mainContent = document.getElementById('mainContent');
        
        // Здесь будет логика загрузки контента для разных страниц
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

    // Обновление активного пункта меню
    updateActiveNav(page) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });
    }

    // Анимация перехода между страницами
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

    // Страница заказов
    showOrdersPage() {
        document.querySelector('.header-title').textContent = 'Заказы';
        // В будущем здесь будет загрузка из Google Sheets
        console.log('Показана страница заказов');
    }

    // Страница создания заказа
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

    // Страница исполнителей
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

    // VIP страница
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

    // Личный кабинет
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

    // Фильтрация по категориям
    setupCategoryFilter() {
        const categoryButtons = document.querySelectorAll('.category-btn');
        
        categoryButtons.forEach(button => {
            button.addEventListener('click', () => {
                categoryButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                const category = button.textContent.trim();
                this.filterOrdersByCategory(category);
                
                // Тактильная обратная связь
                if (window.Telegram?.WebApp?.HapticFeedback) {
                    window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                }
            });
        });
    }

    // Фильтрация заказов
    filterOrdersByCategory(category) {
        const orderCards = document.querySelectorAll('.order-card');
        
        orderCards.forEach(card => {
            if (category === 'Все') {
                card.style.display = 'block';
                card.style.animation = 'fadeInUp 0.3s ease forwards';
            } else {
                // Здесь будет логика фильтрации по категориям
                card.style.display = Math.random() > 0.3 ? 'block' : 'none';
            }
        });
    }

    // Поиск заказов
    setupSearch() {
        const searchInput = document.querySelector('.search-input');
        
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            this.searchOrders(query);
        });
    }

    searchOrders(query) {
        const orderCards = document.querySelectorAll('.order-card');
        
        orderCards.forEach(card => {
            const title = card.querySelector('.order-title').textContent.toLowerCase();
            const description = card.querySelector('.order-description').textContent.toLowerCase();
            
            if (title.includes(query) || description.includes(query)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }

    // Обработчики карточек заказов
    setupOrderCards() {
        document.querySelectorAll('.order-card').forEach(card => {
            const detailsBtn = card.querySelector('.btn-details');
            
            detailsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showOrderDetails(card);
            });
            
            card.addEventListener('click', () => {
                this.showOrderDetails(card);
            });
        });
    }

    // Показать детали заказа
    showOrderDetails(card) {
        // Тактильная обратная связь
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
        }
        
        const title = card.querySelector('.order-title').textContent;
        console.log(`Открыт заказ: ${title}`);
        
        // Здесь будет переход на страницу с деталями заказа
        alert(`Открыт заказ:\n${title}\n\nДетальная страница будет добавлена на следующем этапе.`);
    }

    // Интеграция с Telegram Mini App
    setupTelegramIntegration() {
        // Проверяем, запущено ли в Telegram
        if (window.Telegram?.WebApp) {
            const tg = window.Telegram.WebApp;
            
            // Настройка цветов под тему Telegram
            tg.ready();
            tg.expand();
            
            // Установка цвета фона
            document.documentElement.style.backgroundColor = tg.backgroundColor || '#0f0f1a';
            
            // Настройка кнопки "Назад" в Telegram
            tg.BackButton.onClick(() => {
                if (this.currentPage !== 'orders') {
                    this.navigateTo('orders');
                    this.updateActiveNav('orders');
                }
            });
            
            console.log('Запущено в Telegram Mini App');
        } else {
            console.log('Запущено в браузере');
        }
    }
}

// Инициализация приложения при загрузке
document.addEventListener('DOMContentLoaded', () => {
    window.maxApp = new MaxMiniApp();
});

// Обработка жестов для мобильных устройств
let touchStartY = 0;
document.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
});

document.addEventListener('touchmove', (e) => {
    const touchY = e.touches[0].clientY;
    const mainContent = document.getElementById('mainContent');
    
    // Pull-to-refresh эффект
    if (mainContent.scrollTop === 0 && touchY > touchStartY + 50) {
        // Здесь можно добавить pull-to-refresh
        console.log('Pull to refresh detected');
    }
});
