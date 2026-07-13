// js/app.js
// Основная логика приложения
(function() {
    const screens = {
        home: document.getElementById('homeScreen'),
        catalog: document.getElementById('catalogScreen'),
        gift: document.getElementById('giftScreen'),
        order: document.getElementById('orderScreen'),
        payment: document.getElementById('paymentScreen'),
        success: document.getElementById('successScreen'),
        orders: document.getElementById('ordersScreen'),
        profile: document.getElementById('profileScreen')
    };

    let currentScreen = 'home';
    let selectedGift = null;

    const gifts = [
        { id: 'song', emoji: '🎵', name: 'Песня на заказ', desc: 'Персональная песня с вашим текстом и именем получателя.', price: 990 },
        { id: 'card', emoji: '💌', name: 'Именная открытка', desc: 'Красивое поздравление с индивидуальным дизайном.', price: 299 },
        { id: 'story', emoji: '📖', name: 'Семейная история', desc: 'История семьи из фотографий и воспоминаний.', price: 1490 },
        { id: 'photo', emoji: '📸', name: 'AI-фотосессия', desc: 'Профессиональные фотографии в разных стилях.', price: 990 }
    ];

    // Навигация
    window.navigateTo = function(screenName, data) {
        if (data) selectedGift = data;
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[screenName].classList.add('active');
        currentScreen = screenName;

        // Обновление нижней навигации
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.screen === screenName);
        });

        // Управление кнопкой "назад" (показываем не на главных экранах)
        const backBtn = document.getElementById('backButton');
        if (['home','catalog','orders','profile'].includes(screenName)) {
            backBtn.classList.add('hidden');
        } else {
            backBtn.classList.remove('hidden');
        }

        // Специфическая логика экранов
        if (screenName === 'catalog') renderCatalog();
        if (screenName === 'gift' && selectedGift) renderGiftDetail();
        if (screenName === 'payment') renderPaymentSummary();
        if (screenName === 'orders') renderOrders();
        if (screenName === 'profile') renderProfile();

        document.getElementById('mainContent').scrollTop = 0;
    };

    window.selectGift = function(giftId) {
        const gift = gifts.find(g => g.id === giftId);
        if (gift) navigateTo('gift', gift);
    };

    window.openOrderForm = function() {
        if (!selectedGift) return;
        document.getElementById('orderScreen').querySelector('.screen-title').textContent = 
            `Оформление: ${selectedGift.emoji} ${selectedGift.name}`;
        navigateTo('order');
    };

    // Обработка формы заказа
    document.getElementById('orderForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const orderData = {
            gift: selectedGift,
            customer: document.getElementById('customerName').value,
            recipient: document.getElementById('recipientName').value,
            occasion: document.getElementById('occasion').value,
            description: document.getElementById('description').value
        };
        // Переход к оплате
        navigateTo('payment');
    });

    // Оплата
    document.getElementById('payButton').addEventListener('click', async function() {
        const btn = this;
        btn.disabled = true;
        btn.textContent = 'Обработка...';
        const orderData = {
            gift: selectedGift,
            recipient: document.getElementById('recipientName').value,
            occasion: document.getElementById('occasion').value
        };
        try {
            const order = await API.placeOrder(orderData);
            document.getElementById('successOrderId').textContent = order.id;
            navigateTo('success');
        } catch (err) {
            alert('Ошибка: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Оплатить';
        }
    });

    function renderCatalog() {
        const container = document.getElementById('catalogContainer');
        container.innerHTML = gifts.map(g => `
            <div class="popular-card glass" onclick="selectGift('${g.id}')">
                <div class="popular-emoji">${g.emoji}</div>
                <div class="popular-name">${g.name}</div>
                <div class="popular-price">${g.price} ₽</div>
            </div>
        `).join('');
    }

    function renderGiftDetail() {
        document.getElementById('detailEmoji').textContent = selectedGift.emoji;
        document.getElementById('detailName').textContent = selectedGift.name;
        document.getElementById('detailDesc').textContent = selectedGift.desc;
        document.getElementById('detailPrice').textContent = selectedGift.price + ' ₽';
    }

    function renderPaymentSummary() {
        document.getElementById('payGift').textContent = selectedGift.emoji + ' ' + selectedGift.name;
        document.getElementById('payRecipient').textContent = document.getElementById('recipientName').value || '—';
        document.getElementById('payPrice').textContent = selectedGift.price + ' ₽';
    }

    function renderOrders() {
        const orders = API.getOrders();
        const list = document.getElementById('ordersList');
        const emptyMsg = document.getElementById('emptyOrdersMessage');
        if (orders.length === 0) {
            list.innerHTML = '';
            emptyMsg.style.display = 'block';
            return;
        }
        emptyMsg.style.display = 'none';
        list.innerHTML = orders.map(o => `
            <div class="order-item glass">
                <div>
                    <strong>${o.gift.emoji} ${o.gift.name}</strong>
                    <div style="font-size:13px; color:var(--text-secondary)">${o.recipient}</div>
                </div>
                <div class="status-badge">${o.status}</div>
            </div>
        `).join('');
    }

    function renderProfile() {
        const user = API.getUser();
        document.getElementById('profileAvatar').textContent = '👤';
        document.getElementById('profileName').textContent = user.first_name || user.username;
        document.getElementById('profileId').textContent = 'id: ' + user.id;
    }

    window.resetData = function() {
        API.resetData();
    };

    // Кнопка назад
    document.getElementById('backButton').addEventListener('click', function() {
        if (currentScreen === 'gift') navigateTo('catalog');
        else if (currentScreen === 'order') navigateTo('gift');
        else if (currentScreen === 'payment') navigateTo('order');
        else if (currentScreen === 'success') navigateTo('orders');
        else navigateTo('home');
    });

    // Кнопка корзины в хедере
    document.getElementById('cartButton').addEventListener('click', () => navigateTo('orders'));

    // Нижняя навигация
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => navigateTo(btn.dataset.screen));
    });

    // Инициализация
    renderCatalog();
    renderProfile();
    navigateTo('home');
})();
