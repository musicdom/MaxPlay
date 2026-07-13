// ========================================
// Digital Gift Studio - Premium App Logic
// ========================================

class DigitalGiftStudio {
    constructor() {
        // State
        this.currentScreen = 'home';
        this.screenHistory = ['home'];
        this.selectedGift = null;
        this.selectedOccasion = 'birthday';
        this.currentOrder = null;
        this.orders = [];
        
        // PuzzleBot Integration
        this.puzzleBotUser = {
            userId: null,
            username: null
        };
        
        // Load data
        this.loadOrders();
        this.initPuzzleBot();
        
        // Bind methods
        this.navigateTo = this.navigateTo.bind(this);
        this.goBack = this.goBack.bind(this);
        
        // Initialize
        this.init();
    }
    
    init() {
        // Hide splash screen after animation
        setTimeout(() => {
            const splash = document.getElementById('splashScreen');
            if (splash) {
                splash.style.display = 'none';
            }
        }, 2000);
        
        // Setup navigation
        this.setupNavigation();
        
        // Setup form handlers
        this.setupFormHandlers();
        
        // Setup occasion buttons
        this.setupOccasionButtons();
        
        // Setup photo upload
        this.setupPhotoUpload();
        
        // Setup payment
        this.setupPayment();
        
        // Setup back button
        document.getElementById('backButton').addEventListener('click', this.goBack);
        
        // Setup header action
        document.getElementById('headerAction').addEventListener('click', () => {
            this.navigateTo('orders');
        });
        
        // Render initial state
        this.updateUI();
    }
    
    // PuzzleBot Integration
    initPuzzleBot() {
        // Здесь подключение PuzzleBot API
        // Получение user_id и username из Mini App контекста
        
        try {
            // Симуляция получения данных пользователя
            if (window.Telegram && window.Telegram.WebApp) {
                const webApp = window.Telegram.WebApp;
                this.puzzleBotUser.userId = webApp.initDataUnsafe?.user?.id || 'demo_user';
                this.puzzleBotUser.username = webApp.initDataUnsafe?.user?.username || 'Пользователь';
                webApp.ready();
            } else {
                // Демо данные для разработки
                this.puzzleBotUser.userId = 'user_' + Math.random().toString(36).substr(2, 9);
                this.puzzleBotUser.username = 'Александр';
            }
        } catch (error) {
            console.log('PuzzleBot initialization:', error);
            this.puzzleBotUser.userId = 'demo_user_12345';
            this.puzzleBotUser.username = 'Александр';
        }
        
        console.log('PuzzleBot User:', this.puzzleBotUser);
    }
    
    // API: Создание заказа
    async createOrder(orderData) {
        // Здесь подключение PuzzleBot API для создания заказа
        console.log('Creating order:', orderData);
        
        // Симуляция API запроса
        return new Promise((resolve) => {
            setTimeout(() => {
                const order = {
                    id: Date.now(),
                    orderId: '#' + (1000 + Math.floor(Math.random() * 9000)),
                    ...orderData,
                    status: 'В работе',
                    createdAt: new Date().toISOString(),
                    userId: this.puzzleBotUser.userId
                };
                resolve(order);
            }, 1000);
        });
    }
    
    // API: Проверка оплаты
    async checkPayment(orderId) {
        // Здесь проверка оплаты через PuzzleBot
        console.log('Checking payment for:', orderId);
        
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    success: true,
                    transactionId: 'txn_' + Date.now()
                });
            }, 500);
        });
    }
    
    // API: Получение статуса заказа
    async getOrderStatus(orderId) {
        // Здесь получение статуса заказа из PuzzleBot
        console.log('Getting status for:', orderId);
        
        return new Promise((resolve) => {
            setTimeout(() => {
                const statuses = ['В работе', 'Создание', 'Готово'];
                resolve({
                    status: statuses[Math.floor(Math.random() * statuses.length)]
                });
            }, 500);
        });
    }
    
    setupNavigation() {
        // Handle all navigation clicks
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-navigate]');
            if (target) {
                const screen = target.dataset.navigate;
                this.navigateTo(screen);
            }
        });
    }
    
    setupFormHandlers() {
        const orderForm = document.getElementById('orderForm');
        if (orderForm) {
            orderForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleOrderSubmit();
            });
        }
    }
    
    setupOccasionButtons() {
        const occasionButtons = document.querySelectorAll('.occasion-btn');
        occasionButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                occasionButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedOccasion = btn.dataset.occasion;
            });
        });
    }
    
    setupPhotoUpload() {
        const photoArea = document.getElementById('photoUpload');
        const photoInput = document.getElementById('photoInput');
        
        if (photoArea && photoInput) {
            photoArea.addEventListener('click', () => {
                photoInput.click();
            });
            
            photoInput.addEventListener('change', (e) => {
                const files = e.target.files;
                if (files.length > 0) {
                    photoArea.innerHTML = `
                        <div class="photo-upload-icon">📸</div>
                        <span>Загружено ${files.length} фото</span>
                    `;
                }
            });
        }
    }
    
    setupPayment() {
        const payButton = document.getElementById('payButton');
        if (payButton) {
            payButton.addEventListener('click', async () => {
                await this.handlePayment();
            });
        }
    }
    
    async handleOrderSubmit() {
        const recipientName = document.getElementById('recipientName').value;
        const description = document.getElementById('orderDescription').value;
        
        if (!recipientName || !this.selectedGift) {
            alert('Пожалуйста, заполните все обязательные поля');
            return;
        }
        
        // Сохраняем данные заказа
        this.currentOrder = {
            gift: this.selectedGift,
            recipient: recipientName,
            occasion: this.selectedOccasion,
            description: description,
        };
        
        // Обновляем страницу оплаты
        this.updatePaymentPage();
        
        // Переходим к оплате
        this.navigateTo('payment');
    }
    
    updatePaymentPage() {
        if (!this.currentOrder) return;
        
        document.getElementById('summaryGift').textContent = 
            `${this.currentOrder.gift.emoji} ${this.currentOrder.gift.name}`;
        document.getElementById('summaryRecipient').textContent = 
            this.currentOrder.recipient;
        document.getElementById('summaryPrice').textContent = 
            `${this.currentOrder.gift.price} ₽`;
    }
    
    async handlePayment() {
        const payButton = document.getElementById('payButton');
        
        // Блокируем кнопку
        payButton.disabled = true;
        payButton.innerHTML = '<span>Обработка...</span>';
        
        try {
            // Здесь проверка оплаты через PuzzleBot
            const paymentResult = await this.checkPayment(this.currentOrder?.id);
            
            if (paymentResult.success) {
                // Создаем заказ
                const order = await this.createOrder(this.currentOrder);
                
                // Добавляем в список заказов
                this.orders.unshift(order);
                this.saveOrders();
                
                // Показываем экран успеха
                this.showSuccessScreen(order);
            }
        } catch (error) {
            console.error('Payment error:', error);
            alert('Произошла ошибка при оплате. Попробуйте снова.');
        } finally {
            payButton.disabled = false;
            payButton.innerHTML = '<span>Оплатить</span>';
        }
    }
    
    showSuccessScreen(order) {
        document.getElementById('successOrderId').textContent = order.orderId;
        document.getElementById('successGift').textContent = 
            `${order.gift.emoji} ${order.gift.name}`;
        document.getElementById('successStatus').textContent = order.status;
        
        this.navigateTo('success');
    }
    
    selectGift(giftId) {
        const gifts = {
            song: { id: 'song', emoji: '🎵', name: 'Песня на заказ', price: 990 },
            card: { id: 'card', emoji: '💌', name: 'Именная открытка', price: 299 },
            story: { id: 'story', emoji: '📖', name: 'Семейная история', price: 1490 },
            photo: { id: 'photo', emoji: '📸', name: 'AI-фотосессия', price: 990 }
        };
        
        this.selectedGift = gifts[giftId];
        
        // Обновляем форму заказа
        if (this.selectedGift) {
            document.getElementById('selectedGiftEmoji').textContent = this.selectedGift.emoji;
            document.getElementById('selectedGiftName').textContent = this.selectedGift.name;
            document.getElementById('selectedGiftPrice').textContent = `${this.selectedGift.price} ₽`;
        }
    }
    
    navigateTo(screen) {
        // Скрываем все экраны
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        
        // Показываем нужный экран
        const screenElement = document.getElementById(`screen${screen.charAt(0).toUpperCase() + screen.slice(1)}`);
        if (screenElement) {
            screenElement.classList.add('active');
        }
        
        // Обновляем историю
        if (this.currentScreen !== screen) {
            this.screenHistory.push(this.currentScreen);
        }
        this.currentScreen = screen;
        
        // Обновляем UI
        this.updateUI();
        
        // Прокручиваем вверх
        document.getElementById('mainContent').scrollTop = 0;
    }
    
    goBack() {
        if (this.screenHistory.length > 1) {
            const previousScreen = this.screenHistory.pop();
            this.navigateTo(previousScreen);
            // Убираем лишнюю запись из истории
            this.screenHistory.pop();
        }
    }
    
    updateUI() {
        const backButton = document.getElementById('backButton');
        const headerTitle = document.getElementById('headerTitle');
        const headerAction = document.getElementById('headerAction');
        
        // Обновляем заголовок
        const titles = {
            home: '🎁 Digital Gift Studio',
            catalog: 'Каталог подарков',
            order: 'Создание заказа',
            payment: 'Оплата',
            success: 'Заказ создан',
            orders: 'Мои заказы'
        };
        
        headerTitle.textContent = titles[this.currentScreen] || '🎁 Digital Gift Studio';
        
        // Управляем видимостью кнопки назад
        if (this.currentScreen === 'home') {
            backButton.style.opacity = '0';
            backButton.style.pointerEvents = 'none';
        } else {
            backButton.style.opacity = '1';
            backButton.style.pointerEvents = 'auto';
        }
        
        // Обновляем отображение заказов если нужно
        if (this.currentScreen === 'orders') {
            this.renderOrders();
        }
        
        // Обновляем профиль
        this.updateProfile();
    }
    
    updateProfile() {
        const profileName = document.getElementById('profileName');
        const profileId = document.getElementById('profileId');
        const profileAvatar = document.getElementById('profileAvatar');
        
        if (profileName && this.puzzleBotUser.username) {
            profileName.textContent = this.puzzleBotUser.username;
            profileId.textContent = `ID: ${this.puzzleBotUser.userId}`;
            if (profileAvatar) {
                profileAvatar.querySelector('span').textContent = 
                    this.puzzleBotUser.username.charAt(0).toUpperCase();
            }
        }
    }
    
    renderOrders() {
        const ordersList = document.getElementById('ordersList');
        const emptyOrders = document.getElementById('emptyOrders');
        
        if (!ordersList) return;
        
        if (this.orders.length === 0) {
            ordersList.innerHTML = '';
            if (emptyOrders) emptyOrders.style.display = 'block';
            return;
        }
        
        if (emptyOrders) emptyOrders.style.display = 'none';
        
        ordersList.innerHTML = this.orders.map(order => `
            <div class="order-card glass-card">
                <div class="order-card-header">
                    <span class="order-number">${order.orderId}</span>
                    <span class="status-badge status-progress">${order.status}</span>
                </div>
                <div class="order-gift">${order.gift.emoji} ${order.gift.name}</div>
                <div class="order-footer">
                    <span class="order-date">${new Date(order.createdAt).toLocaleDateString('ru-RU')}</span>
                    <span class="gift-card-price">${order.gift.price} ₽</span>
                </div>
            </div>
        `).join('');
    }
    
    loadOrders() {
        try {
            const saved = localStorage.getItem('digitalGiftOrders');
            this.orders = saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('Error loading orders:', error);
            this.orders = [];
        }
    }
    
    saveOrders() {
        try {
            localStorage.setItem('digitalGiftOrders', JSON.stringify(this.orders));
        } catch (error) {
            console.error('Error saving orders:', error);
        }
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DigitalGiftStudio();
});

// Global functions for onclick handlers
function navigateTo(screen) {
    if (window.app) {
        window.app.navigateTo(screen);
    }
}

function selectGiftAndNavigate(giftId) {
    if (window.app) {
        window.app.selectGift(giftId);
        window.app.navigateTo('order');
    }
}
