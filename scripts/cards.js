const Cards = (() => {
    function createPromoCard(promotion, index) {
        const card = document.createElement("div");
        card.className = "promo-card";
        card.style.animationDelay = `${index * 0.05}s`;
        card.setAttribute("data-id", promotion.id);

        const logoContainer = document.createElement("div");
        logoContainer.className = "promo-card-logo-container";

        const logo = document.createElement("img");
        logo.className = "promo-card-logo";
        logo.src = promotion.logo;
        logo.alt = promotion.store;
        logo.loading = "lazy";
        logo.onerror = function() {
            this.style.display = "none";
            this.nextElementSibling.style.display = "flex";
        };

        const logoFallback = document.createElement("div");
        logoFallback.className = "promo-card-logo-fallback";
        logoFallback.style.display = "none";
        logoFallback.textContent = promotion.store.charAt(0).toUpperCase();

        logoContainer.appendChild(logo);
        logoContainer.appendChild(logoFallback);

        const favoriteBtn = document.createElement("button");
        favoriteBtn.className = "promo-favorite-btn";
        favoriteBtn.innerHTML = Data.isFavorite(promotion.id) ? "❤️" : "🤍";
        if (Data.isFavorite(promotion.id)) {
            favoriteBtn.classList.add("active");
        }
        favoriteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isNowFav = Data.toggleFavorite(promotion.id);
            favoriteBtn.innerHTML = isNowFav ? "❤️" : "🤍";
            if (isNowFav) {
                favoriteBtn.classList.add("active");
                favoriteBtn.style.animation = "none";
                favoriteBtn.offsetHeight;
                favoriteBtn.style.animation = "heartBeat 0.4s ease";
            } else {
                favoriteBtn.classList.remove("active");
            }
        });

        const infoContainer = document.createElement("div");
        infoContainer.className = "promo-card-info";

        const storeName = document.createElement("div");
        storeName.className = "promo-card-store";
        storeName.textContent = promotion.store;

        const discount = document.createElement("div");
        discount.className = "promo-card-discount";
        discount.textContent = promotion.discount;

        const description = document.createElement("div");
        description.className = "promo-card-description";
        description.textContent = promotion.text;

        const dateContainer = document.createElement("div");
        dateContainer.className = "promo-card-date";
        const dateIcon = document.createElement("span");
        dateIcon.className = "date-icon";
        dateIcon.textContent = "⏳";
        const dateText = document.createElement("span");
        dateText.textContent = `до ${promotion.date}`;
        dateContainer.appendChild(dateIcon);
        dateContainer.appendChild(dateText);

        const newBadge = document.createElement("div");
        newBadge.className = "promo-card-new-badge";
        newBadge.textContent = "NEW";
        newBadge.style.display = promotion.isNew ? "flex" : "none";

        const button = document.createElement("button");
        button.className = "promo-card-button";
        button.textContent = "Получить скидку";
        button.addEventListener("click", (e) => {
            e.stopPropagation();
            handleGetPromo(promotion);
        });

        infoContainer.appendChild(storeName);
        infoContainer.appendChild(discount);
        infoContainer.appendChild(description);
        infoContainer.appendChild(dateContainer);

        card.appendChild(logoContainer);
        card.appendChild(favoriteBtn);
        card.appendChild(newBadge);
        card.appendChild(infoContainer);
        card.appendChild(button);

        card.addEventListener("click", () => {
            handleGetPromo(promotion);
        });

        return card;
    }

    function handleGetPromo(promotion) {
        if (!navigator.onLine) {
            UI.showToast("❌ Нет подключения к интернету");
            return;
        }

        try {
            const newWindow = window.open(promotion.link, "_blank", "noopener,noreferrer");
            if (!newWindow) {
                UI.showToast("🔗 Переход на сайт партнёра");
                setTimeout(() => {
                    window.open(promotion.link, "_blank", "noopener,noreferrer");
                }, 100);
            }
        } catch (e) {
            UI.showToast("🔗 " + promotion.link);
        }
    }

    function createOfflineCard() {
        const card = document.createElement("div");
        card.className = "promo-card offline-card";

        const icon = document.createElement("div");
        icon.className = "offline-icon";
        icon.textContent = "📡";

        const title = document.createElement("div");
        title.className = "offline-title";
        title.textContent = "Нет подключения";

        const text = document.createElement("div");
        text.className = "offline-text";
        text.textContent = "Проверьте интернет-соединение";

        const retryBtn = document.createElement("button");
        retryBtn.className = "promo-card-button retry-btn";
        retryBtn.textContent = "Повторить";
        retryBtn.addEventListener("click", () => {
            window.dispatchEvent(new Event("retry-load-promotions"));
        });

        card.appendChild(icon);
        card.appendChild(title);
        card.appendChild(text);
        card.appendChild(retryBtn);

        return card;
    }

    function createSkeletonCard() {
        const card = document.createElement("div");
        card.className = "promo-card skeleton-card";

        const logoPlaceholder = document.createElement("div");
        logoPlaceholder.className = "skeleton skeleton-logo";

        const lines = [
            document.createElement("div"),
            document.createElement("div"),
            document.createElement("div"),
            document.createElement("div")
        ];

        lines.forEach((line, i) => {
            line.className = `skeleton skeleton-line skeleton-line-${i + 1}`;
        });

        const buttonPlaceholder = document.createElement("div");
        buttonPlaceholder.className = "skeleton skeleton-button";

        card.appendChild(logoPlaceholder);
        lines.forEach(line => card.appendChild(line));
        card.appendChild(buttonPlaceholder);

        return card;
    }

    function createSkeletonGrid(count = 6) {
        const grid = document.createElement("div");
        grid.className = "promo-grid skeleton-grid";

        for (let i = 0; i < count; i++) {
            grid.appendChild(createSkeletonCard());
        }

        return grid;
    }

    function renderPromoGrid(container, promotions) {
        container.innerHTML = "";

        if (!navigator.onLine) {
            const offlineContainer = document.createElement("div");
            offlineContainer.className = "promo-grid";
            offlineContainer.appendChild(createOfflineCard());
            container.appendChild(offlineContainer);
            return;
        }

        if (!promotions || promotions.length === 0) {
            const emptyContainer = document.createElement("div");
            emptyContainer.className = "promo-grid";

            const emptyCard = document.createElement("div");
            emptyCard.className = "promo-card empty-card";

            const emptyIcon = document.createElement("div");
            emptyIcon.className = "offline-icon";
            emptyIcon.textContent = "🔍";

            const emptyTitle = document.createElement("div");
            emptyTitle.className = "offline-title";
            emptyTitle.textContent = "Ничего не найдено";

            const emptyText = document.createElement("div");
            emptyText.className = "offline-text";
            emptyText.textContent = "Попробуйте изменить фильтры";

            emptyCard.appendChild(emptyIcon);
            emptyCard.appendChild(emptyTitle);
            emptyCard.appendChild(emptyText);
            emptyContainer.appendChild(emptyCard);
            container.appendChild(emptyContainer);
            return;
        }

        const grid = document.createElement("div");
        grid.className = "promo-grid";

        promotions.forEach((promo, index) => {
            grid.appendChild(createPromoCard(promo, index));
        });

        container.appendChild(grid);
    }

    return {
        createPromoCard,
        createOfflineCard,
        createSkeletonCard,
        createSkeletonGrid,
        renderPromoGrid,
        handleGetPromo
    };
})();
