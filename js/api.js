// js/api.js
// Абстракция для работы с данными заказов и пользователей
const API = {
    // Сохранение заказа локально и отправка в PuzzleBot
    async placeOrder(orderData) {
        // Здесь отправка заказа через PuzzleBot API
        const botResponse = await PuzzleBot.createOrder(orderData);
        if (botResponse.success) {
            const order = {
                id: botResponse.order_id,
                ...orderData,
                status: 'В работе',
                date: new Date().toISOString()
            };
            // Сохраняем локально
            const orders = JSON.parse(localStorage.getItem('dg_orders') || '[]');
            orders.unshift(order);
            localStorage.setItem('dg_orders', JSON.stringify(orders));
            return order;
        }
        throw new Error('Ошибка создания заказа');
    },

    getOrders() {
        return JSON.parse(localStorage.getItem('dg_orders') || '[]');
    },

    getUser() {
        return PuzzleBot.getUser();
    },

    resetData() {
        localStorage.removeItem('dg_orders');
        localStorage.removeItem('dg_user');
        window.location.reload();
    }
};
