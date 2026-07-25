const Auth = (() => {
    const DEFAULT_USER = {
        id: 'usr_max_001',
        firstName: 'Алексей',
        lastName: 'Максимов',
        avatar: 'АМ',
        balance: 3480,
        currency: '₽',
        status: 'online'
    };

    let currentUser = null;

    function init() {
        const saved = localStorage.getItem('maxvygoda_user');
        if (saved) {
            try {
                currentUser = JSON.parse(saved);
            } catch (e) {
                currentUser = { ...DEFAULT_USER };
                saveUser();
            }
        } else {
            currentUser = { ...DEFAULT_USER };
            saveUser();
        }
        return currentUser;
    }

    function saveUser() {
        localStorage.setItem('maxvygoda_user', JSON.stringify(currentUser));
    }

    function getUser() {
        if (!currentUser) {
            return init();
        }
        return { ...currentUser };
    }

    function updateBalance(amount) {
        if (!currentUser) return null;
        currentUser.balance += amount;
        if (currentUser.balance < 0) currentUser.balance = 0;
        saveUser();
        return currentUser.balance;
    }

    function formatBalance() {
        const user = getUser();
        return user.balance.toLocaleString('ru-RU') + ' ' + user.currency;
    }

    return {
        init,
        getUser,
        updateBalance,
        formatBalance
    };
})();