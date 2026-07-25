const App = (() => {
    function init() {
        Auth.init();
        API.init();
        Data.init();
        UI.init();
        setupGlobalListeners();
        setupPromoListeners();
        document.addEventListener("DOMContentLoaded", () => {
            document.body.style.opacity = "1";
        });
        document.body.style.opacity = "0";
        document.body.style.transition = "opacity 0.3s ease";
        requestAnimationFrame(() => {
            document.body.style.opacity = "1";
        });
    }

    function setupGlobalListeners() {
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                const mainContent = document.getElementById("main-content");
                if (mainContent) {
                    const header = mainContent.querySelector(".header-section");
                    if (header) {
                        const balanceAmount = header.querySelector(".balance-amount");
                        if (balanceAmount) {
                            balanceAmount.textContent = Auth.formatBalance();
                        }
                    }
                }
            }
        });

        window.addEventListener("resize", () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty("--vh", `${vh}px`);
        });

        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty("--vh", `${vh}px`);
    }

    function setupPromoListeners() {
        document.addEventListener("click", (e) => {
            const promoTab = e.target.closest('[data-screen="promotions"]');
            if (promoTab) {
                e.preventDefault();
                UI.renderPromotionsPage();
            }
        });
    }

    return { init };
})();

App.init();
