// Отрисовка карточек
var Cards = {
    _maxId: 0,

    createOfflineCard: function(onRetry) {
        var card = document.createElement('div');
        card.className = 'promo-card offline-card';

        var icon = document.createElement('div');
        icon.className = 'offline-icon';
        icon.textContent = '📡';

        var title = document.createElement('div');
        title.className = 'offline-title';
        title.textContent = 'Нет подключения';

        var text = document.createElement('div');
        text.className = 'offline-text';
        text.textContent = 'Проверьте интернет-соединение';

        var btn = document.createElement('button');
        btn.className = 'promo-card-button retry-btn';
        btn.textContent = 'Повторить';
        btn.addEventListener('click', function() { if (onRetry) onRetry(); });

        card.appendChild(icon);
        card.appendChild(title);
        card.appendChild(text);
        card.appendChild(btn);
        return card;
    },

    createErrorCard: function(message, onRetry) {
        var card = document.createElement('div');
        card.className = 'promo-card offline-card';

        var icon = document.createElement('div');
        icon.className = 'offline-icon';
        icon.textContent = '⚠️';

        var title = document.createElement('div');
        title.className = 'offline-title';
        title.textContent = 'Не удалось загрузить акции';

        var text = document.createElement('div');
        text.className = 'offline-text';
        text.textContent = message || 'Попробуйте позже';

        var btn = document.createElement('button');
        btn.className = 'promo-card-button retry-btn';
        btn.textContent = 'Повторить';
        btn.addEventListener('click', function() { if (onRetry) onRetry(); });

        card.appendChild(icon);
        card.appendChild(title);
        card.appendChild(text);
        card.appendChild(btn);
        return card;
    },

    createEmptyCard: function() {
        var card = document.createElement('div');
        card.className = 'promo-card empty-card';

        var icon = document.createElement('div');
        icon.className = 'offline-icon';
        icon.textContent = '🔍';

        var title = document.createElement('div');
        title.className = 'offline-title';
        title.textContent = 'Ничего не найдено';

        var text = document.createElement('div');
        text.className = 'offline-text';
        text.textContent = 'Попробуйте изменить фильтры';

        card.appendChild(icon);
        card.appendChild(title);
        card.appendChild(text);
        return card;
    },

    createSkeletonCard: function() {
        var card = document.createElement('div');
        card.className = 'promo-card skeleton-card';

        var logo = document.createElement('div');
        logo.className = 'skeleton skeleton-logo';

        card.appendChild(logo);
        for (var i = 1; i <= 4; i++) {
            var line = document.createElement('div');
            line.className = 'skeleton skeleton-line skeleton-line-' + i;
            card.appendChild(line);
        }
        var btn = document.createElement('div');
        btn.className = 'skeleton skeleton-button';
        card.appendChild(btn);

        return card;
    },

    createSkeletonGrid: function(count) {
        var grid = document.createElement('div');
        grid.className = 'promo-grid skeleton-grid';
        for (var i = 0; i < count; i++) {
            grid.appendChild(this.createSkeletonCard());
        }
        return grid;
    },

    createPromoCard: function(offer, index) {
        var self = this;
        var card = document.createElement('div');
        card.className = 'promo-card';
        card.style.animationDelay = (index * 0.05) + 's';
        card.setAttribute('data-id', offer.id);
        if (offer.isVip) card.classList.add('vip-card');

        Stats.recordView(offer.id);

        // логотип
        var logoContainer = document.createElement('div');
        logoContainer.className = 'promo-card-logo-container';
        var img = document.createElement('img');
        img.className = 'promo-card-logo';
        img.src = offer.logo || 'images/placeholder.png';
        img.alt = offer.store;
        img.loading = 'lazy';
        img.onerror = function() {
            this.style.display = 'none';
            this.nextElementSibling.style.display = 'flex';
        };
        var fallback = document.createElement('div');
        fallback.className = 'promo-card-logo-fallback';
        fallback.style.display = 'none';
        fallback.textContent = offer.store.charAt(0).toUpperCase();
        logoContainer.appendChild(img);
        logoContainer.appendChild(fallback);

        // избранное
        var favBtn = document.createElement('button');
        favBtn.className = 'promo-favorite-btn';
        var isFav = Favorites.isFavorite(offer.id);
        favBtn.innerHTML = isFav ? '❤️' : '🤍';
        if (isFav) favBtn.classList.add('active');
        favBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var added = Favorites.toggleFavorite(offer.id);
            favBtn.innerHTML = added ? '❤️' : '🤍';
            if (added) {
                favBtn.classList.add('active');
                favBtn.style.animation = 'none';
                favBtn.offsetHeight;
                favBtn.style.animation = 'heartBeat 0.4s ease';
            } else {
                favBtn.classList.remove('active');
            }
        });

        // VIP-бейдж
        var vipBadge = document.createElement('div');
        vipBadge.className = 'promo-card-vip-badge';
        vipBadge.textContent = '⭐ VIP';
        vipBadge.style.display = offer.isVip ? 'flex' : 'none';

        // NEW-бейдж
        var newBadge = document.createElement('div');
        newBadge.className = 'promo-card-new-badge';
        newBadge.textContent = 'NEW';
        newBadge.style.display = (offer.id > self._maxId) ? 'flex' : 'none';

        // информация
        var info = document.createElement('div');
        info.className = 'promo-card-info';

        var storeEl = document.createElement('div');
        storeEl.className = 'promo-card-store';
        storeEl.textContent = offer.store;

        var discountEl = document.createElement('div');
        discountEl.className = 'promo-card-discount';
        discountEl.textContent = offer.discount;

        var descEl = document.createElement('div');
        descEl.className = 'promo-card-description';
        descEl.textContent = offer.description;

        var dateContainer = document.createElement('div');
        dateContainer.className = 'promo-card-date';
        var dateIcon = document.createElement('span');
        dateIcon.className = 'date-icon';
        dateIcon.textContent = '⏳';
        var dateText = document.createElement('span');
        dateText.textContent = offer.date ? 'до ' + offer.date : '';
        dateContainer.appendChild(dateIcon);
        dateContainer.appendChild(dateText);

        // статистика
        var statsContainer = document.createElement('div');
        statsContainer.className = 'promo-card-stats';
        var stat = Stats.getOfferStats(offer.id);
        var viewsSpan = document.createElement('span');
        viewsSpan.className = 'stat-item';
        viewsSpan.textContent = '👁 ' + stat.views;
        var clicksSpan = document.createElement('span');
        clicksSpan.className = 'stat-item';
        clicksSpan.textContent = '🔗 ' + stat.clicks;
        statsContainer.appendChild(viewsSpan);
        statsContainer.appendChild(clicksSpan);

        info.appendChild(storeEl);
        info.appendChild(discountEl);
        info.appendChild(descEl);
        info.appendChild(dateContainer);
        info.appendChild(statsContainer);

        // кнопка
        var button = document.createElement('button');
        button.className = 'promo-card-button';
        button.textContent = 'Получить скидку';
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            Stats.recordClick(offer.id);
            clicksSpan.textContent = '🔗 ' + (stat.clicks + 1);
            handleGetPromo(offer);
        });

        card.appendChild(logoContainer);
        card.appendChild(favBtn);
        card.appendChild(vipBadge);
        card.appendChild(newBadge);
        card.appendChild(info);
        card.appendChild(button);

        card.addEventListener('click', function() {
            Stats.recordClick(offer.id);
            handleGetPromo(offer);
        });

        return card;
    },

    renderPromoGrid: function(container, offers, onRetry) {
        container.innerHTML = '';
        if (!offers || offers.length === 0) {
            var grid = document.createElement('div');
            grid.className = 'promo-grid';
            grid.appendChild(this.createEmptyCard());
            container.appendChild(grid);
            return;
        }
        this._maxId = Math.max.apply(null, offers.map(function(o) { return o.id; }));
        var grid = document.createElement('div');
        grid.className = 'promo-grid';
        for (var i = 0; i < offers.length; i++) {
            grid.appendChild(this.createPromoCard(offers[i], i));
        }
        container.appendChild(grid);
    },

    showSkeleton: function(container) {
        container.innerHTML = '';
        container.appendChild(this.createSkeletonGrid(6));
    },

    showOffline: function(container, onRetry) {
        container.innerHTML = '';
        var grid = document.createElement('div');
        grid.className = 'promo-grid';
        grid.appendChild(this.createOfflineCard(onRetry));
        container.appendChild(grid);
    },

    showError: function(container, message, onRetry) {
        container.innerHTML = '';
        var grid = document.createElement('div');
        grid.className = 'promo-grid';
        grid.appendChild(this.createErrorCard(message, onRetry));
        container.appendChild(grid);
    }
};

// Функция открытия ссылки
function handleGetPromo(offer) {
    if (!navigator.onLine) {
        alert('❌ Нет подключения к интернету');
        return;
    }
    try {
        var win = window.open(offer.link, '_blank', 'noopener,noreferrer');
        if (!win) {
            alert('🔗 Переход на сайт: ' + offer.link);
            setTimeout(function() {
                window.open(offer.link, '_blank', 'noopener,noreferrer');
            }, 100);
        }
    } catch (e) {
        alert('🔗 ' + offer.link);
    }
}
