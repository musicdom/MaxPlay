// Digital Gift Studio - Mini App
(function() {
  'use strict';

  // --- State ---
  const state = {
    currentScreen: 'home',
    selectedGift: null,
    orders: JSON.parse(localStorage.getItem('dg_orders') || '[]'),
    userId: null,
    cart: null
  };

  // --- PuzzleBot Integration Stub ---
  const PuzzleBot = {
    init() {
      // Получение user_id из URL или окружения Mini App
      const params = new URLSearchParams(window.location.search);
      state.userId = params.get('user_id') || 'demo_user_123';
      console.log('[PuzzleBot] User ID:', state.userId);
    },
    sendOrder(orderData) {
      return new Promise((resolve) => {
        console.log('[PuzzleBot] Sending order:', orderData);
        // Имитация отправки в бота
        setTimeout(() => {
          resolve({ status: 'success', order_id: 'DG' + Date.now() });
        }, 800);
      });
    },
    getOrderStatus(orderId) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ status: 'в обработке' });
        }, 400);
      });
    }
  };

  // --- Catalog Data ---
  const gifts = [
    { id: 'song', emoji: '🎵', title: 'Песня', price: 990 },
    { id: 'card', emoji: '💌', title: 'Открытка', price: 299 },
    { id: 'story', emoji: '📖', title: 'Семейная история', price: 1490 },
    { id: 'photo', emoji: '📸', title: 'AI-фотосессия', price: 990 }
  ];

  // --- DOM Elements ---
  const screens = {
    home: document.getElementById('homeScreen'),
    catalog: document.getElementById('catalogScreen'),
    orderForm: document.getElementById('orderFormScreen'),
    payment: document.getElementById('paymentScreen'),
    orders: document.getElementById('ordersScreen')
  };
  const backBtn = document.getElementById('backBtn');
  const headerTitle = document.querySelector('.header-title');
  const navItems = document.querySelectorAll('.nav-item');

  // --- Navigation ---
  function navigateTo(screenName, addToHistory = true) {
    if (!screens[screenName]) return;
    
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
    state.currentScreen = screenName;

    // Update nav
    navItems.forEach(item => {
      const screen = item.dataset.screen;
      item.classList.toggle('active', screen === screenName);
    });

    // Back button visibility
    if (screenName === 'home' || screenName === 'catalog' || screenName === 'orders') {
      backBtn.classList.add('hidden');
    } else {
      backBtn.classList.remove('hidden');
    }

    // Header title update
    const titles = {
      home: 'Digital Gift Studio',
      catalog: 'Каталог подарков',
      orderForm: 'Оформление',
      payment: 'Оплата',
      orders: 'Мои заказы'
    };
    headerTitle.textContent = titles[screenName] || 'Digital Gift Studio';

    // Specific screen actions
    if (screenName === 'catalog') renderCatalog();
    if (screenName === 'orders') renderOrders();
  }

  // --- Render Catalog ---
  function renderCatalog() {
    const container = document.getElementById('catalogContainer');
    container.innerHTML = gifts.map(gift => `
      <div class="gift-card glass-card" data-id="${gift.id}">
        <div class="gift-info">
          <h3>${gift.emoji} ${gift.title}</h3>
          <span class="price">${gift.price} ₽</span>
        </div>
        <button class="icon-btn">→</button>
      </div>
    `).join('');

    document.querySelectorAll('.gift-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const giftId = card.dataset.id;
        selectGift(giftId);
      });
    });
  }

  function selectGift(giftId) {
    const gift = gifts.find(g => g.id === giftId);
    if (!gift) return;
    state.selectedGift = gift;
    document.getElementById('giftTitle').value = `${gift.emoji} ${gift.title}`;
    document.getElementById('selectedGiftId').value = gift.id;
    navigateTo('orderForm');
  }

  // --- Order Form Submit ---
  document.getElementById('orderForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const orderData = {
      gift: state.selectedGift,
      recipient: document.getElementById('recipientName').value,
      message: document.getElementById('message').value,
      email: document.getElementById('email').value
    };
    state.cart = orderData;
    updatePaymentSummary();
    navigateTo('payment');
  });

  function updatePaymentSummary() {
    if (!state.cart || !state.cart.gift) return;
    const summary = document.getElementById('orderSummary');
    summary.innerHTML = `
      <p><strong>${state.cart.gift.emoji} ${state.cart.gift.title}</strong></p>
      <p>Для: ${state.cart.recipient}</p>
      <p style="font-size: 24px; font-weight: 700; color: #ff6b9d;">${state.cart.gift.price} ₽</p>
    `;
  }

  // --- Payment ---
  document.getElementById('payBtn').addEventListener('click', async function() {
    if (!state.cart) return;
    this.disabled = true;
    this.textContent = 'Обработка...';

    const fullOrder = {
      ...state.cart,
      user_id: state.userId,
      timestamp: new Date().toISOString()
    };

    try {
      const response = await PuzzleBot.sendOrder(fullOrder);
      const newOrder = {
        id: response.order_id,
        ...state.cart.gift,
        recipient: state.cart.recipient,
        status: 'оплачен',
        date: new Date().toLocaleDateString()
      };
      state.orders.unshift(newOrder);
      localStorage.setItem('dg_orders', JSON.stringify(state.orders));
      
      alert('Оплата прошла успешно! Заказ создан.');
      state.cart = null;
      navigateTo('orders');
    } catch (err) {
      alert('Ошибка оплаты. Попробуйте снова.');
    } finally {
      this.disabled = false;
      this.textContent = 'Оплатить';
    }
  });

  // --- Orders Rendering ---
  function renderOrders() {
    const list = document.getElementById('ordersList');
    const empty = document.getElementById('emptyOrders');
    if (state.orders.length === 0) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    list.innerHTML = state.orders.map(order => `
      <div class="order-item glass-card">
        <div>
          <strong>${order.emoji} ${order.title}</strong>
          <p style="font-size:13px; color:#ccc;">${order.recipient} · ${order.date}</p>
        </div>
        <span class="status-badge">${order.status}</span>
      </div>
    `).join('');
  }

  // --- Back Button Logic ---
  backBtn.addEventListener('click', () => {
    if (state.currentScreen === 'orderForm') navigateTo('catalog');
    else if (state.currentScreen === 'payment') navigateTo('orderForm');
  });

  // --- Bottom Navigation ---
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const screen = item.dataset.screen;
      navigateTo(screen);
    });
  });

  // --- Go to catalog from home ---
  document.getElementById('goToCatalogBtn').addEventListener('click', () => navigateTo('catalog'));
  document.getElementById('ordersBtn').addEventListener('click', () => navigateTo('orders'));

  // --- Init ---
  PuzzleBot.init();
  navigateTo('home');
  renderOrders(); // preload orders state
})();
