// Sotheby's Mansion - Theme Manager
(function() {
    const THEME_STORAGE_KEY = 'sothebys_mansion_theme';
    
    // Khởi tạo theme ngay khi script load để tránh chớp màn hình (FOUC)
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'light';
    applyTheme(savedTheme);

    function resolveBrandAssetPath(filename) {
        const isChapterPage = /(?:^|\/)chapters\//.test(window.location.pathname);
        const basePrefix = isChapterPage ? '../../../' : '';
        return new URL(basePrefix + 'assets/brand/' + filename, window.location.href).href;
    }

    function updateBannerLogo(theme) {
        const logoPath = theme === 'dark' ? 'logo_orig.webp' : 'logo.webp';
        document.querySelectorAll('.banner-logo-img').forEach(img => {
            img.src = resolveBrandAssetPath(logoPath);
            img.onerror = () => {
                img.src = resolveBrandAssetPath(logoPath);
            };
        });
    }

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        updateToggleButtons(theme);
        updateBannerLogo(theme);
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
        applyTheme(newTheme);
    }

    function updateToggleButtons(theme) {
        const btns = document.querySelectorAll('.theme-toggle-btn');
        btns.forEach(btn => {
            if (theme === 'dark') {
                btn.innerHTML = '<i class="fas fa-sun"></i><div class="theme-label">Sáng</div>';
                btn.setAttribute('title', 'Chuyển sang chế độ Sáng');
            } else {
                btn.innerHTML = '<i class="fas fa-moon"></i><div class="theme-label">Tối</div>';
                btn.setAttribute('title', 'Chuyển sang chế độ Tối (Dễ đọc)');
            }
        });
    }

    // Gắn sự kiện khi DOM đã sẵn sàng
    document.addEventListener('DOMContentLoaded', () => {
        const btns = document.querySelectorAll('.theme-toggle-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                toggleTheme();
            });
        });
        const current = localStorage.getItem(THEME_STORAGE_KEY) || 'light';
        updateToggleButtons(current);
        updateBannerLogo(current);
    });

    // Expose toggle function ra window nếu cần gọi trực tiếp
    window.toggleTheme = toggleTheme;
})();