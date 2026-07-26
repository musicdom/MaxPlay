import CONFIG from './config.js';

const Search = {
    debounceTimer: null,

    createSearchBar(placeholder, onSearch) {
        const searchWrapper = document.createElement('div');
        searchWrapper.className = 'search-wrapper promo-search-wrapper';

        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container promo-search-container';

        const searchIcon = document.createElement('div');
        searchIcon.className = 'search-icon';
        searchIcon.textContent = '🔍';

        const searchInput = document.createElement('input');
        searchInput.className = 'search-input promo-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = placeholder || 'Поиск акций...';
        searchInput.autocomplete = 'off';

        const clearButton = document.createElement('button');
        clearButton.className = 'search-clear';
        clearButton.textContent = '✕';
        clearButton.style.display = 'none';

        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            clearButton.style.display = 'none';
            if (onSearch) onSearch('');
        });

        searchInput.addEventListener('input', () => {
            const value = searchInput.value;
            clearButton.style.display = value.length > 0 ? 'flex' : 'none';

            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                if (onSearch) onSearch(value);
            }, CONFIG.DEBOUNCE_DELAY);
        });

        searchContainer.appendChild(searchIcon);
        searchContainer.appendChild(searchInput);
        searchContainer.appendChild(clearButton);
        searchWrapper.appendChild(searchContainer);

        return {
            wrapper: searchWrapper,
            input: searchInput,
            clear: clearButton,
            getValue: () => searchInput.value,
            setValue: (val) => {
                searchInput.value = val;
                clearButton.style.display = val.length > 0 ? 'flex' : 'none';
            }
        };
    },

    createCategoryFilters(categories, activeCategory, onFilter) {
        const filtersContainer = document.createElement('div');
        filtersContainer.className = 'promo-filters-container';

        const filtersScroll = document.createElement('div');
        filtersScroll.className = 'promo-filters-scroll';

        categories.forEach(cat => {
            const chip = document.createElement('button');
            chip.className = 'promo-filter-chip';
            if (cat.id === activeCategory) {
                chip.classList.add('active');
            }
            chip.setAttribute('data-category', cat.id);

            const emoji = document.createElement('span');
            emoji.className = 'filter-chip-emoji';
            emoji.textContent = cat.emoji;

            const name = document.createElement('span');
            name.className = 'filter-chip-name';
            name.textContent = cat.name;

            chip.appendChild(emoji);
            chip.appendChild(name);

            chip.addEventListener('click', () => {
                const allChips = filtersScroll.querySelectorAll('.promo-filter-chip');
                allChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                if (onFilter) onFilter(cat.id);
            });

            filtersScroll.appendChild(chip);
        });

        filtersContainer.appendChild(filtersScroll);
        return filtersContainer;
    },

    createSortBar(sortOptions, activeSort, onSort) {
        const sortContainer = document.createElement('div');
        sortContainer.className = 'promo-sort-container';

        const sortLabel = document.createElement('span');
        sortLabel.className = 'sort-label';
        sortLabel.textContent = 'Сортировка:';

        const sortButtons = document.createElement('div');
        sortButtons.className = 'sort-buttons';

        sortOptions.forEach(option => {
            const btn = document.createElement('button');
            btn.className = 'sort-btn';
            if (option.id === activeSort) {
                btn.classList.add('active');
            }
            btn.setAttribute('data-sort', option.id);
            btn.textContent = option.name;

            btn.addEventListener('click', () => {
                const allBtns = sortButtons.querySelectorAll('.sort-btn');
                allBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (onSort) onSort(option.id);
            });

            sortButtons.appendChild(btn);
        });

        sortContainer.appendChild(sortLabel);
        sortContainer.appendChild(sortButtons);
        return sortContainer;
    }
};

export default Search;
