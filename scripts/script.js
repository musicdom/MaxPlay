// ============================================
// MAX Бонус - Premium Mini App
// Команда из 50 лучших специалистов
// ============================================

(() => {
    'use strict';

    // ============================================
    // Конфигурация
    // ============================================
    const CONFIG = {
        skeletonDelay: 1500,
        toastDuration: 4000,
        rippleDuration: 400,
        springConfig: { duration: 400, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
    };

    // ============================================
    // DOM References
    // ============================================
    const dom = {
        bonusesList: document.getElementById('bonuses-list'),
        bottomSheet: document.getElementById('bottom-sheet'),
        sheetOverlay: document.getElementById('sheet-overlay'),
        sheetCloseBtn: document.getElementById('sheet-close-btn'),
        toast: document.getElementById('toast'),
        toastClose: document.getElementById('toast-close'),
        fabBtn: document.getElementById('fab-btn'),
        scanBtn: document.getElementById('scan-btn'),
        showAllBtn: document.getElementById('show-all-btn'),
        showHistoryBtn: document.getElementById('show-history-btn'),
        notificationBtn: document.getElementById('notifications-btn'),
        bottomNavItems: document.querySelectorAll('.bottom-nav__item'),
    };

    // ============================================
    // Ripple Effect (Premium)
    // ============================================
    class Ripple {
        constructor(element) {
            element.addEventListener('pointerdown', this._createRipple.bind(this));
        }

        _createRipple(e) {
            const element = e.currentTarget;
            const rect = element.getBoundingClientRect();
            
            // Удаляем старые ripple
            const oldRipples = element.querySelectorAll('.ripple');
            oldRipples.forEach(r => r.remove());

            const ripple = document.createElement('span');
            ripple.className = 'ripple';
            
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = `${size}px`;
            
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;
            
            element.style.position = 'relative';
            element.style.overflow = 'hidden';
            element.appendChild(ripple);
            
            // Удаляем ripple после анимации
            setTimeout(() => {
                ripple.remove();
            }, CONFIG.rippleDuration);
        }
    }

    // ============================================
    // Skeleton Loader
    // ============================================
    class SkeletonLoader {
        constructor(element) {
            this.element = element;
            this._init();
        }

        _init() {
            this.element.classList.add('skeleton-active');
            
            setTimeout(() => {
                this.element.classList.remove('skeleton-active');
                this.element.querySelectorAll('.bonus-card .badge').forEach(badge => {
                    badge.style.opacity = '1';
                });
            }, CONFIG.skeletonDelay);
        }
    }

    // ============================================
    // Bottom Sheet
    // ============================================
    class BottomSheet {
        constructor(element) {
            this.element = element;
            this.overlay = element.querySelector('.bottom-sheet__overlay');
            this.isOpen = false;
            this._bindEvents();
        }

        _bindEvents() {
            this.overlay.addEventListener('click', () => this.close());
            
            // Закрытие по Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) this.close();
            });
        }

        open() {
            this.element.classList.add('active');
            this.isOpen = true;
            document.body.style.overflow = 'hidden';
            
            // Haptic feedback (имитация)
            if (window.navigator && window.navigator.vibrate) {
                window.navigator.vibrate(10);
            }
        }

        close() {
            this.element.classList.remove('active');
            this.isOpen = false;
            document.body.style.overflow = '';
        }

        toggle() {
            this.isOpen ? this.close() : this.open();
        }
    }

    // ============================================
    // Toast
    // ============================================
    class Toast {
        constructor(element) {
            this.element = element;
            this.closeBtn = element.querySelector('.toast__close');
            this.timeout = null;
            this._bindEvents();
        }

        _bindEvents() {
            this.closeBtn.addEventListener('click', () => this.hide());
        }

        show() {
            clearTimeout(this.timeout);
            this.element.classList.add('visible');
            
            // Haptic feedback
            if (window.navigator && window.navigator.vibrate) {
                window.navigator.vibrate(5);
            }

            this.timeout = setTimeout(() => {
                this.hide();
            }, CONFIG.toastDuration);
        }

        hide() {
            this.element.classList.remove('visible');
            clearTimeout(this.timeout);
        }
    }

    // ============================================
    // Bottom Navigation
    // ============================================
    class BottomNav {
        constructor(items) {
            this.items = items;
            this.activeIndex = 0;
            this._bindEvents();
        }

        _bindEvents() {
            this.items.forEach((item, index) => {
                item.addEventListener('click', () => {
                    // Игнорируем если это FAB
                    if (item.id === 'scan-btn') return;
                    this.setActive(index);
                });
            });
        }

        setActive(index) {
            this.items.forEach((item, i) => {
                item.classList.toggle('active', i === index);
            });
            this.activeIndex = index;
            
            // Haptic feedback
            if (window.navigator && window.navigator.vibrate) {
                window.navigator.vibrate(5);
            }
        }
    }

    // ============================================
    // FAB with Spring Animation
    // ============================================
    class FAB {
        constructor(element) {
            this.element = element;
            this.isExpanded = false;
            this._bindEvents();
        }

        _bindEvents() {
            this.element.addEventListener('click', () => {
                // Spring анимация через transform
                this.element.style.transform = 'scale(0.8)';
                setTimeout(() => {
                    this.element.style.transform = 'scale(1)';
                }, 150);

                // Haptic
                if (window.navigator && window.navigator.vibrate) {
                    window.navigator.vibrate([5, 10, 5]);
                }

                // Открываем Bottom Sheet
                bottomSheet.open();
            });
        }
    }

    // ============================================
    // Инициализация всех компонентов
    // ============================================
    
    // 1. Ripple - на всех элементах с data-ripple
    document.querySelectorAll('[data-ripple]').forEach(el => {
        new Ripple(el);
    });

    // 2. Skeleton Loader
    const skeleton = new SkeletonLoader(dom.bonusesList);

    // 3. Bottom Sheet
    const bottomSheet = new BottomSheet(dom.bottomSheet);
    
    // Закрытие по кнопке
    dom.sheetCloseBtn.addEventListener('click', () => {
        bottomSheet.close();
        // Показываем Toast
        setTimeout(() => {
            toast.show();
        }, 300);
    });

    // 4. Toast
    const toast = new Toast(dom.toast);

    // 5. Bottom Navigation
    const bottomNav = new BottomNav(dom.bottomNavItems);

    // 6. FAB
    const fab = new FAB(dom.fabBtn);

    // 7. Кнопка сканирования (FAB в навигации)
    dom.scanBtn.addEventListener('click', () => {
        // Анимация FAB
        const fabEl = dom.scanBtn.querySelector('.bottom-nav__fab');
        fabEl.style.transform = 'scale(0.8) rotate(90deg)';
        setTimeout(() => {
            fabEl.style.transform = 'scale(1) rotate(0deg)';
        }, 200);

        // Haptic
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate([8, 5, 8]);
        }

        // Открываем Bottom Sheet
        bottomSheet.open();
    });

    // 8. Кнопка "Все" в бонусах
    dom.showAllBtn.addEventListener('click', () => {
        toast.show();
    });

    // 9. Кнопка "Все" в истории
    dom.showHistoryBtn.addEventListener('click', () => {
        toast.show();
    });

    // 10. Кнопка уведомлений с бейджем
    dom.notificationBtn.addEventListener('click', () => {
        const badge = dom.notificationBtn.querySelector('.badge');
        if (badge) {
            badge.style.transform = 'scale(0)';
            setTimeout(() => {
                badge.style.transform = 'scale(1)';
            }, 300);
        }
        toast.show();
    });

    // ============================================
    // Pull to Refresh (Simulated)
    // ============================================
    let pullStartY = 0;
    let isPulling = false;
    const mainContent = document.querySelector('.main-content');

    mainContent.addEventListener('touchstart', (e) => {
        if (mainContent.scrollTop === 0) {
            pullStartY = e.touches[0].clientY;
            isPulling = true;
        }
    }, { passive: true });

    mainContent.addEventListener('touchmove', (e) => {
        if (!isPulling || mainContent.scrollTop > 0) return;
        
        const deltaY = e.touches[0].clientY - pullStartY;
        if (deltaY > 0 && deltaY < 80) {
            e.preventDefault();
            mainContent.style.transform = `translateY(${deltaY * 0.5}px)`;
            mainContent.style.transition = 'none';
        }
    }, { passive: false });

    mainContent.addEventListener('touchend', () => {
        if (isPulling && mainContent.scrollTop === 0) {
            const transform = mainContent.style.transform;
            if (transform && transform !== 'translateY(0px)') {
                mainContent.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
                mainContent.style.transform = 'translateY(0)';
                
                // Simulate refresh
                toast.show();
                
                // Haptic
                if (window.navigator && window.navigator.vibrate) {
                    window.navigator.vibrate([10, 5, 10]);
                }
            }
        }
        isPulling = false;
    }, { passive: true });

    // ============================================
    // Theme Toggle (Simulated - долго нажать на аватар)
    // ============================================
    const avatar = document.querySelector('.avatar');
    let theme = 'dark';

    avatar.addEventListener('dblclick', () => {
        theme = theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        
        // Переключение стилей (демо)
        // В реальном проекте меняются CSS Variables
        document.documentElement.style.setProperty('--color-bg-primary', theme === 'dark' ? '#0B0E14' : '#F5F7FA');
        document.documentElement.style.setProperty('--text-primary', theme === 'dark' ? '#FFFFFF' : '#1A1A2E');
        document.documentElement.style.setProperty('--text-secondary', theme === 'dark' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)');
        
        // Haptic
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate([5, 5, 5]);
        }

        toast.show();
    });

    // ============================================
    // Accessibility: Haptic Ready
    // ============================================
    // Имитация Haptic через вибрацию (если доступно)
    if (window.navigator && window.navigator.vibrate) {
        console.log('✅ Haptic Feedback Ready');
    }

    // ============================================
    // Performance: Lazy Loading for images
    // ============================================
    document.querySelectorAll('img[data-src]').forEach(img => {
        const src = img.getAttribute('data-src');
        if (src) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        img.src = src;
                        img.removeAttribute('data-src');
                        observer.unobserve(img);
                    }
                });
            });
            observer.observe(img);
        }
    });

    // ============================================
    // Консоль брендинга (Premium touch)
    // ============================================
    console.log('%c MAX Бонус %c v1.0.0 ',
        'background: linear-gradient(135deg, #F6D365, #FDA085); color: #000; padding: 8px 12px; font-weight: bold; font-size: 14px; border-radius: 4px 0 0 4px;',
        'background: #0B0E14; color: #fff; padding: 8px 12px; font-size: 14px; border-radius: 0 4px 4px 0;'
    );
    console.log('🏆 Premium Mini App');
    console.log('👨‍💻 Команда из 50 лучших специалистов');

    // ============================================
    // Initialization complete
    // ============================================
    console.log('✅ MAX Бонус готов к работе');

})();