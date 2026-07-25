const UI = (() => {
    const mainContent = document.getElementById('main-content');
    const bottomNav = document.getElementById('bottom-nav');
    let currentScreen = 'home';
    let activeCategory = 'all';
    let searchQuery = '';
    let toastTimer = null;

    function createElement(tag, classes = [], attributes = {}, children = []) {
        const element = document.createElement(tag);
        if (classes.length) element.classList.add(...classes);
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'style' && typeof value === 'object') {
                Object.assign(element.style, value);
            } else if (key.startsWith('on')) {
                element.addEventListener(key.slice(2).toLowerCase(), value);
            } else if (key === 'dataset') {
                Object.entries(value).forEach(([dk, dv]) => {
                    element.dataset[dk] = dv;
                });
            } else {
                element.setAttribute(key, value);
            }
        });
        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                element.appendChild(child);
            }
        });
        return element;
    }

    function showToast(message, duration = 2500) {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = createElement('div', ['toast-container']);
            document.body.appendChild(container);
        }
        if (toastTimer) clearTimeout(toastTimer);
        container.innerHTML = '';
        const toast = createElement('div', ['toast'], {}, [message]);
        container.appendChild(toast);
        toastTimer = setTimeout(() => {
            toast.classList.add('removing');
            toast.addEventListener('animationend', () => {
                toast.remove();
                if (container.children.length === 0) {
                    container.remove();
                }
            }, { once: true });
        }, duration);
    }

    function showModal(title, text, onClose) {
        const overlay = createElement('div', ['modal-overlay']);
        const sheet = createElement('div', ['modal-sheet']);
        const modalTitle = createElement('div', ['modal-title'], {}, [title]);
        const modalText = createElement('div', ['modal-text'], {}, [text]);
        const closeBtn = createElement('button', ['modal-close'], {
            onclick: () => {
                overlay.remove();
                if (onClose) onClose();
            }
        }, ['Понятно']);
        sheet.appendChild(modalTitle);
        sheet.appendChild(modalText);
        sheet.appendChild(closeBtn);
        overlay.appendChild(sheet);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                if (onClose) onClose();
            }
        });
        document.body.appendChild(overlay);
    }

    function renderHeader() {
        const user = Auth.getUser();
        const header = createElement('div', ['header-section']);
        const headerTop = createElement('div', ['header-top']);

        const userInfo = createElement('div', ['user-info']);
        const avatarWrapper = createElement('div', ['avatar-wrapper']);
        const avatarRing = createElement('div', ['avatar-ring']);
        const avatar = createElement('div', ['avatar'], {}, [user.avatar]);
        avatarWrapper.appendChild(avatarRing);
        avatarWrapper.appendChild(avatar);

        const userDetails = createElement('div', ['user-details']);
        const userName = createElement('div', ['user-name'], {}, [user.firstName + ' ' + user.lastName]);
        const userStatus = createElement('div', ['user-status']);
        const statusDot = createElement('div', ['status-dot']);
        userStatus.appendChild(statusDot);
        userStatus.appendChild(document.createTextNode(user.status));
        userDetails.appendChild(userName);
        userDetails.appendChild(userStatus);
        userInfo.appendChild(avatarWrapper);
        userInfo.appendChild(userDetails);

        const balanceBadge = createElement('div', ['balance-badge']);
        const balanceIcon = createElement('div', ['balance-icon'], {}, ['💎']);
        const balanceInfo = createElement('div', ['balance-info']);
        const balanceLabel = createElement('div', ['balance-label'], {}, ['Баланс']);
        const balanceAmount = createElement('div', ['balance-amount'], {}, [Auth.formatBalance()]);
        balanceInfo.appendChild(balanceLabel);
        balanceInfo.appendChild(balanceAmount);
        balanceBadge.appendChild(balanceIcon);
        balanceBadge.appendChild(balanceInfo);

        headerTop.appendChild(userInfo);
        headerTop.appendChild(balanceBadge);
        header.appendChild(headerTop);

        const searchWrapper = createElement('div', ['search-wrapper']);
        const searchContainer = createElement('div', ['search-container']);
        const searchIcon = createElement('div', ['search-icon'], {}, ['🔍']);
        const searchInput = createElement('input', ['search-input'], {
            type: 'text',
            placeholder: 'Поиск скидок...',
            value: searchQuery,
            oninput: (e) => {
                searchQuery = e.target.value;
                const clearBtn = searchContainer.querySelector('.search-clear');
                if (clearBtn) {
                    if (searchQuery.length > 0) {
                        clearBtn.classList.add('visible');
                    } else {
                        clearBtn.classList.remove('visible');
                    }
                }
                renderOffersGrid();
            }
        });
        const searchClear = createElement('button', ['search-clear'], {
            onclick: () => {
                searchQuery = '';
                searchInput.value = '';
                searchClear.classList.remove('visible');
                renderOffersGrid();
            }
        }, ['✕']);
        if (searchQuery.length > 0) searchClear.classList.add('visible');
        searchContainer.appendChild(searchIcon);
        searchContainer.appendChild(searchInput);
        searchContainer.appendChild(searchClear);
        searchWrapper.appendChild(searchContainer);
        header.appendChild(searchWrapper);

        return header;
    }

    function renderCategories() {
        const categories = API.getCategories();
        const sectionTitle = createElement('div', ['section-title']);
        const titleIcon = createElement('span', ['section-title-icon'], {}, ['📋']);
        sectionTitle.appendChild(titleIcon);
        sectionTitle.appendChild(document.createTextNode('Категории'));

        const scrollContainer = createElement('div', ['categories-scroll']);
        categories.forEach(cat => {
            const chip = createElement('div', ['category-chip'], {
                dataset: { category: cat.id },
                onclick: () => {
                    activeCategory = cat.id;
                    const allChips = scrollContainer.querySelectorAll('.category-chip');
                    allChips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    renderOffersGrid();
                }
            });
            if (cat.id === activeCategory) {
                chip.classList.add('active');
            }
            const emoji = createElement('span', ['category-emoji'], {}, [cat.emoji]);
            const name = createElement('span', ['category-name'], {}, [cat.name]);
            chip.appendChild(emoji);
            chip.appendChild(name);
            scrollContainer.appendChild(chip);
        });

        const container = createElement('div');
        container.appendChild(sectionTitle);
        container.appendChild(scrollContainer);
        return container;
    }

    function renderOfferCard(offer) {
        const card = createElement('div', ['offer-card'], {
            dataset: { id: offer.id },
            onclick: (e) => {
                if (e.target.closest('.favorites-badge')) return;
                if (e.target.closest('.offer-card-button')) {
                    handleGetOffer(offer);
                    return;
                }
                handleGetOffer(offer);
            }
        });

        const favBadge = createElement('div', ['favorites-badge'], {
            onclick: (e) => {
                e.stopPropagation();
                const isNowFavorite = API.toggleFavorite(offer.id);
                if (isNowFavorite) {
                    favBadge.classList.add('liked');
                    favBadge.textContent = '❤️';
                    showToast('Добавлено в избранное');
                } else {
                    favBadge.classList.remove('liked');
                    favBadge.textContent = '🤍';
                    showToast('Удалено из избранного');
                }
                if (currentScreen === 'favorites') {
                    renderScreen('favorites');
                }
            }
        });
        favBadge.textContent = offer.isFavorite ? '❤️' : '🤍';
        if (offer.isFavorite) favBadge.classList.add('liked');

        const logo = createElement('div', ['offer-card-logo', offer.logoType], {}, [offer.logoEmoji]);
        const info = createElement('div', ['offer-card-info']);
        const title = createElement('div', ['offer-card-title'], {}, [offer.title]);
        const discount = createElement('div', ['offer-card-discount'], {}, [offer.discount]);
        info.appendChild(title);
        info.appendChild(discount);

        const button = createElement('button', ['offer-card-button'], {
            onclick: (e) => {
                e.stopPropagation();
                handleGetOffer(offer);
            }
        }, ['Получить']);

        card.appendChild(favBadge);
        card.appendChild(logo);
        card.appendChild(info);
        card.appendChild(button);
        return card;
    }

    function handleGetOffer(offer) {
        showModal(
            `🎉 ${offer.title}`,
            `${offer.description}\n\nРазмер скидки: ${offer.discount}\n\nНажмите «Получить», чтобы активировать предложение.`,
            () => {
                showToast('✅ Предложение активировано!');
            }
        );
    }

    function renderOffersGrid() {
        const existingGrid = mainContent.querySelector('.offers-grid');
        if (existingGrid) existingGrid.remove();
        const existingEmpty = mainContent.querySelector('.empty-state');
        if (existingEmpty) existingEmpty.remove();

        let offers;
        if (currentScreen === 'favorites') {
            offers = API.getFavoriteOffers();
        } else {
            offers = API.getOffers(activeCategory, searchQuery);
        }

        if (offers.length === 0) {
            const emptyState = createElement('div', ['empty-state']);
            const emptyIcon = createElement('div', ['empty-state-icon'], {}, ['🔍']);
            const emptyText = createElement('div', ['empty-state-text'], {}, [
                currentScreen === 'favorites'
                    ? 'Нет избранных предложений'
                    : 'Ничего не найдено'
            ]);
            emptyState.appendChild(emptyIcon);
            emptyState.appendChild(emptyText);
            mainContent.appendChild(emptyState);
            return;
        }

        const grid = createElement('div', ['offers-grid']);
        offers.forEach(offer => {
            grid.appendChild(renderOfferCard(offer));
        });
        mainContent.appendChild(grid);
    }

    function renderBottomNav() {
        bottomNav.innerHTML = '';
        const navItems = [
            { id: 'home', icon: '🏠', label: 'Главная' },
            { id: 'categories', icon: '📂', label: 'Категории' },
            { id: 'favorites', icon: '❤️', label: 'Избранное' },
            { id: 'notifications', icon: '🔔', label: 'Уведомления' },
            { id: 'profile', icon: '👤', label: 'Профиль' }
        ];

        navItems.forEach(item => {
            const navItem = createElement('button', ['nav-item'], {
                dataset: { screen: item.id },
                onclick: () => {
                    if (item.id === 'notifications') {
                        showToast('🔔 Уведомлений пока нет');
                        return;
                    }
                    if (item.id === 'profile') {
                        showModal(
                            '👤 Профиль',
                            'Раздел профиля находится в разработке. Скоро здесь появится управление аккаунтом.',
                            null
                        );
                        return;
                    }
                    renderScreen(item.id);
                }
            });
            if (item.id === currentScreen) {
                navItem.classList.add('active');
            }
            const icon = createElement('span', ['nav-icon'], {}, [item.icon]);
            const label = createElement('span', ['nav-label'], {}, [item.label]);
            navItem.appendChild(icon);
            navItem.appendChild(label);
            bottomNav.appendChild(navItem);
        });
    }

    function renderScreen(screen) {
        currentScreen = screen;
        if (screen === 'categories') {
            activeCategory = 'all';
        }
        if (screen === 'favorites') {
            activeCategory = 'all';
        }
        if (screen === 'home') {
            activeCategory = 'all';
        }
        searchQuery = '';

        mainContent.innerHTML = '';

        const header = renderHeader();
        mainContent.appendChild(header);

        if (screen === 'home') {
            const categoriesSection = renderCategories();
            mainContent.appendChild(categoriesSection);
            const offersTitle = createElement('div', ['section-title']);
            const offersTitleIcon = createElement('span', ['section-title-icon'], {}, ['🔥']);
            offersTitle.appendChild(offersTitleIcon);
            offersTitle.appendChild(document.createTextNode('Горячие предложения'));
            mainContent.appendChild(offersTitle);
        } else if (screen === 'categories') {
            const categoriesSection = renderCategories();
            mainContent.appendChild(categoriesSection);
            const offersTitle = createElement('div', ['section-title']);
            const offersTitleIcon = createElement('span', ['section-title-icon'], {}, ['📋']);
            offersTitle.appendChild(offersTitleIcon);
            offersTitle.appendChild(document.createTextNode('Все предложения'));
            mainContent.appendChild(offersTitle);
        } else if (screen === 'favorites') {
            const offersTitle = createElement('div', ['section-title']);
            const offersTitleIcon = createElement('span', ['section-title-icon'], {}, ['❤️']);
            offersTitle.appendChild(offersTitleIcon);
            offersTitle.appendChild(document.createTextNode('Избранное'));
            mainContent.appendChild(offersTitle);
        }

        renderOffersGrid();
        renderBottomNav();

        const searchInput = mainContent.querySelector('.search-input');
        if (searchInput) {
            searchInput.value = searchQuery;
            const clearBtn = mainContent.querySelector('.search-clear');
            if (clearBtn) clearBtn.classList.remove('visible');
        }
    }

    function renderPromotionsPage() {
        mainContent.innerHTML = '';

        const pageContainer = document.createElement('div');
        pageContainer.className = 'promotions-page';

        const headerSection = document.createElement('div');
        headerSection.className = 'promotions-header';

        const backButton = document.createElement('button');
        backButton.className = 'promo-back-btn';
        backButton.textContent = '← Назад';
        backButton.addEventListener('click', () => {
            renderScreen('home');
        });

        const pageTitle = document.createElement('div');
        pageTitle.className = 'promotions-page-title';
        pageTitle.textContent = '🎯 Каталог акций';

        const subtitle = document.createElement('div');
        subtitle.className = 'promotions-page-subtitle';
        subtitle.textContent = 'Лучшие предложения для вас';

        headerSection.appendChild(backButton);
        headerSection.appendChild(pageTitle);
        headerSection.appendChild(subtitle);

        const searchBar = Search.createSearchBar('Поиск по магазинам и скидкам...');
        const categoryFilters = Search.createCategoryFilters(Data.getActiveCategory());
        const sortBar = Search.createSortBar(Data.getActiveSort());

        const contentArea = document.createElement('div');
        contentArea.className = 'promo-content-area';

        const skeletonGrid = Cards.createSkeletonGrid(6);
        contentArea.appendChild(skeletonGrid);

        pageContainer.appendChild(headerSection);
        pageContainer.appendChild(searchBar);
        pageContainer.appendChild(categoryFilters);
        pageContainer.appendChild(sortBar);
        pageContainer.appendChild(contentArea);

        mainContent.appendChild(pageContainer);

        setTimeout(() => {
            loadPromotions(contentArea);
        }, 1000);

        const searchUpdateHandler = (e) => {
            loadPromotions(contentArea);
        };

        const filterUpdateHandler = (e) => {
            loadPromotions(contentArea);
        };

        const sortUpdateHandler = (e) => {
            loadPromotions(contentArea);
        };

        const retryHandler = () => {
            showToast('🔄 Повторная загрузка...');
            loadPromotions(contentArea);
        };

        window.addEventListener('search-updated', searchUpdateHandler);
        window.addEventListener('filter-updated', filterUpdateHandler);
        window.addEventListener('sort-updated', sortUpdateHandler);
        window.addEventListener('retry-load-promotions', retryHandler);

        if (!pageContainer._cleanup) {
            pageContainer._cleanup = () => {
                window.removeEventListener('search-updated', searchUpdateHandler);
                window.removeEventListener('filter-updated', filterUpdateHandler);
                window.removeEventListener('sort-updated', sortUpdateHandler);
                window.removeEventListener('retry-load-promotions', retryHandler);
            };
        }

        const originalRenderScreen = renderScreen;
        const cleanupOnLeave = () => {
            if (pageContainer._cleanup) {
                pageContainer._cleanup();
            }
        };

        renderBottomNavPromo();
    }

    function loadPromotions(container) {
        const category = Data.getActiveCategory();
        const sort = Data.getActiveSort();
        const query = Data.getSearchQuery();

        const promotions = Data.getPromotions(category, sort, query);
        Cards.renderPromoGrid(container, promotions);
    }

    function renderBottomNavPromo() {
        bottomNav.innerHTML = '';
        const navItems = [
            { id: 'home', icon: '🏠', label: 'Главная' },
            { id: 'promotions', icon: '🎯', label: 'Акции' },
            { id: 'favorites', icon: '❤️', label: 'Избранное' },
            { id: 'notifications', icon: '🔔', label: 'Уведомления' },
            { id: 'profile', icon: '👤', label: 'Профиль' }
        ];

        navItems.forEach(item => {
            const navItem = createElement('button', ['nav-item'], {
                dataset: { screen: item.id },
                onclick: () => {
                    if (item.id === 'notifications') {
                        showToast('🔔 Уведомлений пока нет');
                        return;
                    }
                    if (item.id === 'profile') {
                        showModal(
                            '👤 Профиль',
                            'Раздел профиля находится в разработке.',
                            null
                        );
                        return;
                    }
                    if (item.id === 'promotions') {
                        renderPromotionsPage();
                        return;
                    }
                    if (item.id === 'favorites') {
                        renderFavoritesPage();
                        return;
                    }
                    renderScreen(item.id);
                }
            });
            if (item.id === 'promotions') {
                navItem.classList.add('active');
            }
            const icon = createElement('span', ['nav-icon'], {}, [item.icon]);
            const label = createElement('span', ['nav-label'], {}, [item.label]);
            navItem.appendChild(icon);
            navItem.appendChild(label);
            bottomNav.appendChild(navItem);
        });
    }

    function renderFavoritesPage() {
        mainContent.innerHTML = '';

        const pageContainer = document.createElement('div');
        pageContainer.className = 'promotions-page';

        const headerSection = document.createElement('div');
        headerSection.className = 'promotions-header';

        const backButton = document.createElement('button');
        backButton.className = 'promo-back-btn';
        backButton.textContent = '← Назад';
        backButton.addEventListener('click', () => {
            renderScreen('home');
        });

        const pageTitle = document.createElement('div');
        pageTitle.className = 'promotions-page-title';
        pageTitle.textContent = '❤️ Избранное';

        headerSection.appendChild(backButton);
        headerSection.appendChild(pageTitle);

        const contentArea = document.createElement('div');
        contentArea.className = 'promo-content-area';

        const favPromotions = Favorites.getFavoritePromotions();
        Cards.renderPromoGrid(contentArea, favPromotions);

        pageContainer.appendChild(headerSection);
        pageContainer.appendChild(contentArea);

        mainContent.appendChild(pageContainer);

        const bottomNavLocal = document.getElementById('bottom-nav');
        bottomNavLocal.innerHTML = '';

        const navItems = [
            { id: 'home', icon: '🏠', label: 'Главная' },
            { id: 'promotions', icon: '🎯', label: 'Акции' },
            { id: 'favorites', icon: '❤️', label: 'Избранное' },
            { id: 'notifications', icon: '🔔', label: 'Уведомления' },
            { id: 'profile', icon: '👤', label: 'Профиль' }
        ];

        navItems.forEach(item => {
            const navItem = createElement('button', ['nav-item'], {
                dataset: { screen: item.id },
                onclick: () => {
                    if (item.id === 'notifications') {
                        showToast('🔔 Уведомлений пока нет');
                        return;
                    }
                    if (item.id === 'profile') {
                        showModal('👤 Профиль', 'Раздел профиля находится в разработке.', null);
                        return;
                    }
                    if (item.id === 'promotions') {
                        renderPromotionsPage();
                        return;
                    }
                    if (item.id === 'favorites') {
                        renderFavoritesPage();
                        return;
                    }
                    renderScreen(item.id);
                }
            });
            if (item.id === 'favorites') {
                navItem.classList.add('active');
            }
            const icon = createElement('span', ['nav-icon'], {}, [item.icon]);
            const label = createElement('span', ['nav-label'], {}, [item.label]);
            navItem.appendChild(icon);
            navItem.appendChild(label);
            bottomNavLocal.appendChild(navItem);
        });
    }

    function init() {
        renderScreen('home');
    }

    return {
        init,
        renderScreen,
        showToast,
        showModal,
        renderPromotionsPage,
        renderFavoritesPage,
        loadPromotions,
        renderBottomNavPromo
    };
})();
