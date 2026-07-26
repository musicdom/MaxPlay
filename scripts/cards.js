import Stats from './stats.js';
import Favorites from './favorites.js';

const Cards = {
    createOfflineCard(onRetry) {
        const card = document.createElement('div');
        card.className = 'promo-card offline-card';

        const icon = document.createElement('div');
        icon.className = 'offline-icon';
        icon.textContent = '📡';

        const title = document.createElement('div');
        title.className = 'offline-title';
        title.textContent = 'Нет подключения';

        const text = document.createElement('div');
        text.className = 'offline-text';
        text.textContent = 'Проверьте интернет-соединение';

        const retryBtn = document.createElement('button');
        retryBtn.className = 'promo-card-button retry-btn';
        retryBtn.textContent = 'Повторить';
        retryBtn.addEventListener('click', () => {
            if (onRetry) onRetry();
        });

        card.appendChild(icon);
        card.appendChild(title);
        card.appendChild(text);
        card.appendChild(retryBtn);

        return card;
    },

    createErrorCard(message, onRetry) {
        const card = document.createElement('div');
        card.className = 'promo-card offline-card';

        const icon = document.createElement('div');
        icon.className = 'offline-icon';
        icon.textContent = '⚠️';

        const title = document.createElement('div');
        title.className = 'offline-title';
        title.textContent = 'Не удалось загрузить акции';

        const text = document.createElement('div');
        text.className = 'offline-text';
        text.textContent = message || 'Попробуйте позже';

        const retryBtn = document.createElement('button');
        retryBtn.className = 'promo-card-button retry-btn';
        retryBtn.textContent = 'Повторить';
        retryBtn.addEventListener('click', () => {
            if (onRetry) onRetry();
        });

        card.appendChild(icon);
        card.appendChild(title);
        card.appendChild(text);
        card.appendChild(retryBtn);

        return card;
    },

    createEmptyCard() {
        const card = document.createElement('div');
        card.className = 'promo-card empty-card';

        const icon = document.createElement('div');
        icon.className = 'offline-icon';
        icon.textContent = '🔍';

        const title = document.createElement('div');
        title.className = 'offline-title';
        title.textContent = 'Ничего не найдено';

        const text = document.createElement('div');
        text.className = 'offline-text';
        text.textContent = 'Попробуйте изменить фильтры';

        card.appendChild(icon);
        card.appendChild(title);
        card.appendChild(text);

        return card;
    },

    createSkeletonCard() {
        const card = document.createElement('div');
        card.className = 'promo-card skeleton-card';

        const logoPlaceholder = document.createElement('div');
        logoPlaceholder.className = 'skeleton skeleton-logo';

        const lines = [];
        for (let i = 0; i < 4; i++) {
            const line = document.createElement('div');
            line.className = `skeleton skeleton-line skeleton-line-${i + 1}`;
            lines.push(line);
        }

        const buttonPlaceholder = document.createElement('div');
        buttonPlaceholder.className = 'skeleton skeleton-button';

        card.appendChild(logoPlaceholder);
        lines.forEach(line => card.appendChild(line));
        card.appendChild(buttonPlaceholder);

        return card;
    },

    createSkeletonGrid(count = 6) {
        const grid = document.createElement('div');
        grid.className = 'promo-grid skeleton-grid';

        for (let i = 0; i < count; i++) {
            grid.appendChild(this.createSkeletonCard());
        }

        return grid;
    },

    createPromoCard(offer, index) {
        const card = document.createElement('div');
        card.className = 'promo-card';
        card.style.animationDelay = `${index * 0.05}s`;
        card.setAttribute('data-id', offer.id);

        if (offer.isVip) {
            card.classList.add('vip-card');
        }

        Stats.recordView(offer.id);

        const logoContainer = document.createElement('div');
        logoContainer.className = 'promo-card-logo-container';

        const logo = document.createElement('img');
        logo.className = 'promo-card-logo';
        logo.src = offer.logo || `images/placeholder.png`;
        logo.alt = offer.store;
        logo.loading = 'lazy';
        logo.onerror = function() {
            this.style.display = 'none';
            this.nextElementSibling.style.display = 'flex';
        };

        const logoFallback = document.createElement('div');
        logoFallback.className = 'promo-card-logo-fallback';
        logoFallback.style.display = 'none';
        logoFallback.textContent = offer.store.charAt(0).toUpperCase();

        logoContainer.appendChild(logo);
        logoContainer.appendChild(logoFallback);

        const favoriteBtn = document.createElement('button');
        favoriteBtn.className = 'promo-favorite-btn';
        const isFav = Favorites.isFavorite(offer.id);
        favoriteBtn.innerHTML = isFav ? '❤️' : '🤍';
        if (isFav) favoriteBtn.classList.add('active');

        favoriteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isNowFav = Favorites.toggleFavorite(offer.id);
            favoriteBtn.innerHTML = isNowFav ? '❤️' : '🤍';
            if (isNowFav) {
                favoriteBtn.classList.add('active');
                favoriteBtn.style.animation = 'none';
                favoriteBtn.offsetHeight;
                favoriteBtn.style.animation = 'heartBeat 0.4s ease';
            } else {
                favoriteBtn.classList.remove('active');
            }
        });

        const vipBadge = document.createElement('div');
        vipBadge.className = 'promo-card-vip-badge';
        vipBadge.textContent = '⭐ VIP';
        vipBadge.style.display = offer.isVip ? 'flex' : 'none';

        const newBadge = document.createElement('div');
        newBadge.className = 'promo-card-new-badge';
        newBadge.textContent = 'NEW';
        const isNew = offer.id > (this._maxId || 0);
        newBadge.style.display = isNew ? 'flex' : 'none';

        const infoContainer = document.createElement('div');
        infoContainer.className = 'promo-card-info';

        const storeName = document.createElement('div');
        storeName.className = 'promo-card-store';
        storeName.textContent = offer.store;

        const discount = document.createElement('div');
        discount.className = 'promo-card-discount';
        discount.textContent = offer.discount;

        const description = document.createElement('div');
        description.className = 'promo-card-description';
        description.textContent = offer.description;

        const dateContainer = document.createElement('div');
        dateContainer.className = 'promo-card-date';
        const dateIcon = document.createElement('span');
        dateIcon.className = 'date-icon';
        dateIcon.textContent = '⏳';
        const dateText = document.createElement('span');
        dateText.textContent = offer.date ? `до ${offer.date}` : '';
        dateContainer.appendChild(dateIcon);
        dateContainer.appendChild(dateText);

        const statsContainer = document.createElement('div');
        statsContainer.className = 'promo-card-stats';
        const stats = Stats.getOfferStats(offer.id);
        const viewsSpan = document.createElement('span');
        viewsSpan.className = 'stat-item';
        viewsSpan.textContent = `👁 ${stats.views}`;
        const clicksSpan = document.createElement('span');
        clicksSpan.className = 'stat-item';
        clicksSpan.textContent = `🔗 ${stats.clicks}`;
        statsContainer.appendChild(viewsSpan);
        statsContainer.appendChild(clicksSpan);

        const button = document.createElement('button');
        button.className = 'promo-card-button';
        button.textContent = 'Получить скидку';
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            Stats.recordClick(offer.id);
            clicksSpan.textContent = `🔗 ${stats.clicks + 1}`;
            handleGetPromo(offer);
        });

        infoContainer.appendChild(storeName);
        infoContainer.appendChild(discount);
        infoContainer.appendChild(description);
        infoContainer.appendChild(dateContainer);
        infoContainer.appendChild(statsContainer);

        card.appendChild(logoContainer);
        card.appendChild(favoriteBtn);
        card.appendChild(vipBadge);
        card.appendChild(newBadge);
        card.appendChild(infoContainer);
        card.appendChild(button);

        card.addEventListener('click', () => {
            Stats.recordClick(offer.id);
            handleGetPromo(offer);
        });

        return card;
    },

    renderPromoGrid(container, offers, onRetry) {
        container.innerHTML = '';

        if (!offers || offers.length === 0) {
            const emptyCard = this.createEmptyCard();
            const grid = document.createElement('div');
            grid.className = 'promo-grid';
            grid.appendChild(emptyCard);
            container.appendChild(grid);
            return;
        }

        this._maxId = Math.max(...offers.map(o => o.id));

        const grid = document.createElement('div');
        grid.className = 'promo-grid';

        offers.forEach((offer, index) => {
            grid.appendChild(this.createPromoCard(offer, index));
        });

        container.appendChild(grid);
    },

    showSkeleton(container) {
        container.innerHTML = '';
        container.appendChild(this.createSkeletonGrid(6));
    },

    showOffline(container, onRetry) {
        container.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'promo-grid';
        grid.appendChild(this.createOfflineCard(onRetry));
        container.appendChild(grid);
    },

    showError(container, message, onRetry) {
        container.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'promo-grid';
        grid.appendChild(this.createErrorCard(message, onRetry));
        container.appendChild(grid);
    }
};

function handleGetPromo(offer) {
    if (!navigator.onLine) {
        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast('❌ Нет подключения к интернету');
        }
        return;
    }

    try {
        const newWindow = window.open(offer.link, '_blank', 'noopener,noreferrer');
        if (!newWindow) {
            if (typeof UI !== 'undefined' && UI.showToast) {
                UI.showToast('🔗 Переход на сайт партнёра');
            }
            setTimeout(() => {
                window.open(offer.link, '_blank', 'noopener,noreferrer');
            }, 100);
        }
    } catch (e) {
        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast('🔗 ' + offer.link);
        }
    }
}

export default Cards;
