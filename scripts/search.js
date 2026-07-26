// Поиск, фильтры, сортировка
var Search = {
    debounceTimer: null,

    createSearchBar: function(placeholder, onSearch) {
        var wrapper = document.createElement('div');
        wrapper.className = 'search-wrapper promo-search-wrapper';

        var container = document.createElement('div');
        container.className = 'search-container promo-search-container';

        var icon = document.createElement('div');
        icon.className = 'search-icon';
        icon.textContent = '🔍';

        var input = document.createElement('input');
        input.className = 'search-input promo-search-input';
        input.type = 'text';
        input.placeholder = placeholder || 'Поиск акций...';
        input.autocomplete = 'off';

        var clearBtn = document.createElement('button');
        clearBtn.className = 'search-clear';
        clearBtn.textContent = '✕';
        clearBtn.style.display = 'none';

        clearBtn.addEventListener('click', function() {
            input.value = '';
            clearBtn.style.display = 'none';
            if (onSearch) onSearch('');
        });

        input.addEventListener('input', function() {
            var val = input.value;
            clearBtn.style.display = val.length > 0 ? 'flex' : 'none';
            if (Search.debounceTimer) clearTimeout(Search.debounceTimer);
            Search.debounceTimer = setTimeout(function() {
                if (onSearch) onSearch(val);
            }, CONFIG.DEBOUNCE_DELAY);
        });

        container.appendChild(icon);
        container.appendChild(input);
        container.appendChild(clearBtn);
        wrapper.appendChild(container);

        return {
            wrapper: wrapper,
            input: input,
            clear: clearBtn,
            getValue: function() { return input.value; },
            setValue: function(val) {
                input.value = val;
                clearBtn.style.display = val.length > 0 ? 'flex' : 'none';
            }
        };
    },

    createCategoryFilters: function(categories, activeCategory, onFilter) {
        var container = document.createElement('div');
        container.className = 'promo-filters-container';

        var scroll = document.createElement('div');
        scroll.className = 'promo-filters-scroll';

        categories.forEach(function(cat) {
            var chip = document.createElement('button');
            chip.className = 'promo-filter-chip';
            if (cat.id === activeCategory) chip.classList.add('active');
            chip.setAttribute('data-category', cat.id);

            var emoji = document.createElement('span');
            emoji.className = 'filter-chip-emoji';
            emoji.textContent = cat.emoji;

            var name = document.createElement('span');
            name.className = 'filter-chip-name';
            name.textContent = cat.name;

            chip.appendChild(emoji);
            chip.appendChild(name);

            chip.addEventListener('click', function() {
                var all = scroll.querySelectorAll('.promo-filter-chip');
                all.forEach(function(c) { c.classList.remove('active'); });
                chip.classList.add('active');
                if (onFilter) onFilter(cat.id);
            });

            scroll.appendChild(chip);
        });

        container.appendChild(scroll);
        return container;
    },

    createSortBar: function(sortOptions, activeSort, onSort) {
        var container = document.createElement('div');
        container.className = 'promo-sort-container';

        var label = document.createElement('span');
        label.className = 'sort-label';
        label.textContent = 'Сортировка:';

        var buttons = document.createElement('div');
        buttons.className = 'sort-buttons';

        sortOptions.forEach(function(opt) {
            var btn = document.createElement('button');
            btn.className = 'sort-btn';
            if (opt.id === activeSort) btn.classList.add('active');
            btn.setAttribute('data-sort', opt.id);
            btn.textContent = opt.name;

            btn.addEventListener('click', function() {
                var allBtns = buttons.querySelectorAll('.sort-btn');
                allBtns.forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                if (onSort) onSort(opt.id);
            });

            buttons.appendChild(btn);
        });

        container.appendChild(label);
        container.appendChild(buttons);
        return container;
    }
};
