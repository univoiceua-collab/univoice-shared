/* =====================================================================
   UNIVOICE — СПІЛЬНИЙ СКРИПТ ДЛЯ ВСІХ СТОРІНОК (univoice-ui.js)
   Підключається на кожній сторінці разом з univoice-ui.css.

   Що робить сам:
   - вставляє меню (сайдбар на комп'ютері, висувне меню на телефоні)
     на місце <div data-vo-menu></div> і підсвічує поточну сторінку;
   - додає попап «Налаштування» (ім'я, прізвище, підпис) і діалоги alert/confirm;
   - вмикає тултіпи «і», кнопки меню та налаштувань.

   Що дає сторінкам (window.Univoice):
   on, onAll, show, escapeHtml, pad2, formatDate, lsGet, lsSet, LS_KEYS,
   getDictor, setModal, updateScrollLock, toggleMobileMenu,
   voAlert, voConfirm, scanAlpha, cropToPng, onSettingsSaved(fn)

   ЗМІСТ
   1. Налаштування: пункти меню, логотипи, тексти  ← редагувати тут
   2. Утиліти
   3. Розмітка: меню, налаштування, діалог
   4. Діалоги voAlert / voConfirm
   5. Підпис: canvas з вирівнюванням ліній + завантаження PNG
   6. Налаштування (ім'я, прізвище, підпис)
   7. Тултіпи, меню, запуск
   ===================================================================== */
(function () {
    'use strict';
    if (window.Univoice) return; // скрипт підключено двічі

    /* =================================================================
       1. НАЛАШТУВАННЯ
       ================================================================= */
    // ✎ Пункти меню. Порожній href = пункт прихований. Поточна сторінка підсвічується сама (за адресою).
    //    name — назва в сайдбарі, short — назва в мобільному меню
    const MENU = [
        { href: '/calculator', icon: 'fa-calculator',         name: 'Вартість',          short: 'Вартість' },
        { href: '/stress',     icon: 'fa-spell-check',        name: 'Наголошувач',       short: 'Наголошувач' },
        { href: '',            icon: 'fa-user',               name: 'Особистий кабінет', short: 'Кабінет' },
        { href: '',            icon: 'fa-magnifying-glass',   name: 'База дикторів',     short: 'Диктори' },
        { href: '',            icon: 'fa-gear',               name: 'Інструменти',       short: 'Інструменти' },
    ];
    const LOGO = {
        small: 'https://static.tildacdn.com/tild3761-3230-4138-b030-616163646432/Univ_l_n_m.svg',
        full:  'https://static.tildacdn.com/tild3530-6636-4436-a634-353162386166/Univoice_logo_new.svg',
    };
    const TEXTS = {
        settingsSaved: 'Ім\'я, прізвище та підпис збережено. Вони автоматично з\'являтимуться в рахунку калькулятора.',
    };

    /* =================================================================
       2. УТИЛІТИ
       ================================================================= */
    const show = (el, visible) => { el.hidden = !visible; };
    const on = (targets, event, handler) => [].concat(targets).forEach(el => el.addEventListener(event, handler));
    const onAll = (selector, event, handler) => on([...document.querySelectorAll(selector)], event, handler);
    const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const pad2 = (n) => String(n).padStart(2, '0');
    const formatDate = (d) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
    const $ = (id) => document.getElementById(id);

    // localStorage (з захистом від приватного режиму). Ключі — з префіксом vo_
    const LS_KEYS = { firstName: 'vo_dictor_first_name', lastName: 'vo_dictor_last_name', sign: 'vo_signature_img', strokes: 'vo_signature_strokes', note: 'vo_invoice_note' };
    function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    function lsSet(key, value) {
        try {
            if (value === null || value === undefined || value === '') localStorage.removeItem(key);
            else localStorage.setItem(key, value);
            return true;
        } catch (e) { console.warn('localStorage недоступний:', e); return false; }
    }

    // Ім'я та прізвище диктора (з Налаштувань)
    const getDictor = () => ({ first: (lsGet(LS_KEYS.firstName) || '').trim(), last: (lsGet(LS_KEYS.lastName) || '').trim() });

    // Перенесення старого збереженого "Ім'я Прізвище" (одне поле) в окремі поля
    (() => {
        const old = (lsGet('vo_dictor_name') || '').trim();
        if (!old || lsGet(LS_KEYS.firstName) || lsGet(LS_KEYS.lastName)) return;
        const [first, ...rest] = old.split(/\s+/);
        lsSet(LS_KEYS.firstName, first);
        lsSet(LS_KEYS.lastName, rest.join(' '));
        lsSet('vo_dictor_name', null);
    })();

    // Блокування прокрутки сторінки, поки відкрите меню / попап / діалог.
    // Будь-який власний повноекранний шар сторінки: додайте йому клас vo-lock-scroll
    function updateScrollLock() {
        const anyOpen = document.querySelector('.vo-modal-overlay.is-open, .vo-mobile-menu.active, .vo-dialog-overlay.active, .vo-lock-scroll:not([hidden])');
        document.body.classList.toggle('modal-open', !!anyOpen);
    }
    function setModal(modal, open) {
        modal.classList.toggle('is-open', open);
        updateScrollLock();
    }

    // Прозорі краї зображення: межі непрозорої частини та чи є прозорість узагалі (для підпису)
    function scanAlpha(canvas) {
        const { width: w, height: h } = canvas;
        const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
        let minX = w, minY = h, maxX = -1, maxY = -1, hasTransparency = false;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const a = data[(y * w + x) * 4 + 3];
                if (a < 250) hasTransparency = true;
                if (a > 8) {
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                }
            }
        }
        return { minX, minY, maxX, maxY, hasTransparency, empty: maxX < 0 };
    }

    // Обрізає canvas по непрозорій частині (+ відступ) і повертає PNG
    function cropToPng(canvas, box, pad = 12) {
        const x0 = Math.max(0, box.minX - pad), y0 = Math.max(0, box.minY - pad);
        const x1 = Math.min(canvas.width - 1, box.maxX + pad), y1 = Math.min(canvas.height - 1, box.maxY + pad);
        const out = document.createElement('canvas');
        out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
        out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
        return out.toDataURL('image/png');
    }

    /* =================================================================
       3. РОЗМІТКА
       ================================================================= */
    const normPath = (p) => (p || '').replace(/\/+$/, '') || '/';
    const isCurrent = (item) => !!item.href && normPath(item.href) === normPath(location.pathname);
    // Поточна сторінка — class="active" без href; порожній href — пункт прихований (див. CSS)
    const itemAttrs = (item, cls) => isCurrent(item) ? `class="${cls} active"` : `class="${cls}" href="${escapeHtml(item.href)}"`;

    function menuHtml() {
        const sidebarItems = MENU.map(item => `
    <a ${itemAttrs(item, 'vo-sidebar-item')}><div class="vo-sidebar-icon"><i class="fa-solid ${item.icon}"></i></div><div class="vo-sidebar-text">${escapeHtml(item.name)}</div></a>`).join('');
        const mobileItems = MENU.map(item => `
    <a ${itemAttrs(item, 'vo-mobile-item')}><i class="fa-solid ${item.icon}"></i>${escapeHtml(item.short || item.name)}</a>`).join('');
        return `
<nav class="vo-sidebar">
    <div class="vo-sidebar-logo-box js-go-home">
        <div class="vo-logo-switcher">
            <img src="${LOGO.small}" class="vo-logo-small vo-svg-logo" alt="U">
            <img src="${LOGO.full}" class="vo-logo-full-sidebar vo-svg-logo" alt="Univoice">
        </div>
    </div>
    <div class="vo-sidebar-divider"></div>
    ${sidebarItems}
    <div class="vo-sidebar-item vo-sidebar-item--bottom js-open-settings"><div class="vo-sidebar-icon"><i class="fa-solid fa-gear"></i></div><div class="vo-sidebar-text">Налаштування</div></div>
</nav>
<div class="vo-mobile-overlay js-close-menu" id="voMobileOverlay"></div>
<div class="vo-mobile-menu" id="voMobileMenu">
    <div class="vo-mobile-menu-head">
        <div class="vo-mobile-menu-logo js-go-home">
            <img src="${LOGO.full}" class="vo-svg-logo" alt="UNIVOICE">
        </div>
        <button class="vo-mobile-settings-btn js-open-settings" title="Налаштування"><i class="fa-solid fa-gear"></i></button>
    </div>
    <div class="vo-sidebar-divider"></div>
    ${mobileItems}
</div>`;
    }

    const SETTINGS_HTML = `
<div class="vo-modal-overlay" id="voSettingsModal">
    <div class="vo-modal-content vo-settings-content">
        <button class="vo-modal-close js-close-settings" title="Закрити"><i class="fa-solid fa-xmark"></i></button>
        <h3>Налаштування</h3>
        <div class="vo-settings-field vo-settings-name-row">
            <div>
                <label class="vo-label" for="voSettingsFirstName">Ім'я</label>
                <input type="text" id="voSettingsFirstName" class="vo-settings-input" placeholder="Іван" autocomplete="given-name">
            </div>
            <div>
                <label class="vo-label" for="voSettingsLastName">Прізвище</label>
                <input type="text" id="voSettingsLastName" class="vo-settings-input" placeholder="Петренко" autocomplete="family-name">
            </div>
        </div>
        <div class="vo-settings-field">
            <div class="vo-sign-head">
                <span class="vo-label">Підпис</span>
                <div class="vo-sign-tools">
                    <button type="button" class="vo-sign-tool" id="voSignUpload" title="Завантажити свій підпис (PNG з прозорим фоном)" aria-label="Завантажити свій підпис"><i class="fa-solid fa-upload"></i></button>
                    <input type="file" id="voSignUploadInput" accept="image/png" hidden>
                    <button type="button" class="vo-sign-tool" id="voSignUndo" title="Крок назад"><i class="fa-solid fa-rotate-left"></i></button>
                    <button type="button" class="vo-sign-tool" id="voSignRedo" title="Крок вперед"><i class="fa-solid fa-rotate-right"></i></button>
                    <button type="button" class="vo-sign-tool" id="voSignClear" title="Очистити підпис"><i class="fa-solid fa-eraser"></i></button>
                </div>
            </div>
            <div class="vo-sign-pad-wrap" id="voSignPadWrap">
                <div class="vo-sign-baseline"></div>
                <div class="vo-sign-placeholder">Розпишіться тут</div>
                <canvas id="voSignPad" class="vo-settings-sign-pad"></canvas>
            </div>
        </div>
        <button type="button" class="vo-btn vo-btn-primary vo-btn-block" id="voSettingsSave"><i class="fa-solid fa-check"></i> Зберегти</button>
    </div>
</div>`;

    const DIALOG_HTML = `
<div class="vo-dialog-overlay" id="voDialog">
    <div class="vo-dialog" role="dialog" aria-modal="true" aria-labelledby="voDialogTitle">
        <div class="vo-dialog-icon"><i class="fa-solid fa-circle-info" id="voDialogIcon"></i></div>
        <h4 class="vo-dialog-title" id="voDialogTitle">Увага</h4>
        <p class="vo-dialog-message" id="voDialogMessage"></p>
        <div class="vo-dialog-actions">
            <button type="button" class="vo-btn vo-btn-secondary" id="voDialogCancel">Скасувати</button>
            <button type="button" class="vo-btn vo-btn-primary" id="voDialogOk">OK</button>
        </div>
    </div>
</div>`;

    // Меню ставиться на місце <div data-vo-menu></div> — так сайдбар стоїть поруч із .container
    // (від цього залежить зсув сторінки при наведенні на сайдбар). Без мітки — перед першим .container
    function insertMarkup() {
        const slot = document.querySelector('[data-vo-menu]');
        const anchor = slot || document.querySelector('.container');
        const tpl = document.createElement('template');
        tpl.innerHTML = menuHtml();
        if (anchor) anchor.parentNode.insertBefore(tpl.content, anchor);
        else document.body.prepend(tpl.content);
        if (slot) slot.remove();
        document.body.insertAdjacentHTML('beforeend', SETTINGS_HTML + DIALOG_HTML);
    }

    /* =================================================================
       Запуск. Усе нижче створюється один раз — при першому зверненні
       сторінки або на DOMContentLoaded (що станеться раніше)
       ================================================================= */
    let api = null;
    function init() {
        if (api) return api;
        insertMarkup();
        api = build();
        return api;
    }

    function build() {
        const UI = {};
        ['MobileOverlay', 'MobileMenu', 'SettingsModal', 'SettingsFirstName', 'SettingsLastName', 'SettingsSave',
         'SignUpload', 'SignUploadInput', 'SignUndo', 'SignRedo', 'SignClear', 'SignPadWrap', 'SignPad',
         'Dialog', 'DialogIcon', 'DialogTitle', 'DialogMessage', 'DialogCancel', 'DialogOk'].forEach(k => { UI[k] = $('vo' + k); });

        /* =============================================================
           4. ДІАЛОГИ ALERT / CONFIRM
           voAlert('Текст', { title, icon })                        → Promise<true>
           voConfirm('Текст', { title, icon, okText, cancelText })  → Promise<true|false>
           ============================================================= */
        const Dialog = (() => {
            let resolver = null;
            function close(result) {
                if (!resolver) return;
                UI.Dialog.classList.remove('active');
                updateScrollLock();
                const r = resolver; resolver = null;
                r(result);
            }
            function open({ title = 'Увага', message = '', icon = 'fa-circle-info', isConfirm = false, okText = 'OK', cancelText = 'Скасувати' } = {}) {
                if (resolver) close(false);
                return new Promise(resolve => {
                    resolver = resolve;
                    UI.DialogTitle.textContent = title;
                    UI.DialogMessage.textContent = message;
                    UI.DialogIcon.className = `fa-solid ${icon}`;
                    UI.DialogOk.textContent = okText;
                    UI.DialogCancel.textContent = cancelText;
                    UI.DialogCancel.style.display = isConfirm ? '' : 'none';
                    UI.Dialog.classList.add('active');
                    updateScrollLock();
                    setTimeout(() => UI.DialogOk.focus(), 50);
                });
            }
            on(UI.DialogOk, 'click', () => close(true));
            on(UI.DialogCancel, 'click', () => close(false));
            on(UI.Dialog, 'click', (e) => { if (e.target === UI.Dialog) close(false); });
            on(document, 'keydown', (e) => {
                if (!resolver) return;
                if (e.key === 'Escape') { e.preventDefault(); close(false); }
                else if (e.key === 'Enter') { e.preventDefault(); close(true); }
            });
            return { open };
        })();
        const voAlert = (message, opts = {}) => Dialog.open({ title: 'Увага', icon: 'fa-circle-exclamation', ...opts, message, isConfirm: false });
        const voConfirm = (message, opts = {}) => Dialog.open({ title: 'Підтвердження', icon: 'fa-circle-question', okText: 'Так', cancelText: 'Скасувати', ...opts, message, isConfirm: true });

        /* =============================================================
           5. ПІДПИС: "РОЗУМНИЙ" CANVAS З ВИРІВНЮВАННЯМ ЛІНІЙ
           Кожен штрих після відпускання:
           1) рівномірно перевибирається і згладжується (прибирається тремтіння);
           2) ділиться на частини по гострих кутах (кути зберігаються);
           3) кожна частина: майже пряма → ідеальна пряма, схожа на дугу → ідеальна дуга,
              інакше → плавна каліграфічна крива.
           Товщина лінії залежить від швидкості: повільно — товстіше, швидко — тонше.
           ============================================================= */
        const SignaturePad = (() => {
            const W = 640, H = 360;   // логічна система координат (незалежна від розміру екрану)
            const INK = '#0033cc';    // колір чорнила (синя ручка)
            const MIN_W = 1.4;        // товщина при швидкому русі
            const MAX_W = 4.6;        // товщина при повільному русі
            const SPEED_REF = 3.2;    // швидкість (од./мс), при якій лінія найтонша
            const DEFAULT_W = 3.2;

            const canvas = UI.SignPad, wrap = UI.SignPadWrap, ctx = canvas.getContext('2d');
            let history = [{ base: null, strokes: [] }];  // base — завантажене/збережене зображення, strokes — штрихи
            let pointer = 0;
            let current = null;       // сирі точки поточного штриха: {x, y, t, w}
            let activePointerId = null;
            let rafId = null;
            const imgCache = {};

            const state = () => history[pointer];
            const hasInk = (s) => !!(s.base || s.strokes.length);

            // ---------- Геометрія ----------
            const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
            const pathLen = (p) => { let l = 0; for (let i = 1; i < p.length; i++) l += dist(p[i - 1], p[i]); return l; };

            function resample(pts, step) {
                const out = [{ x: pts[0].x, y: pts[0].y }];
                let acc = 0;
                for (let i = 1; i < pts.length; i++) {
                    let a = pts[i - 1]; const b = pts[i];
                    let seg = dist(a, b);
                    while (acc + seg >= step) {
                        const t = (step - acc) / seg;
                        const np = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
                        out.push(np);
                        a = np; seg = dist(a, b); acc = 0;
                    }
                    acc += seg;
                }
                const last = pts[pts.length - 1];
                if (dist(out[out.length - 1], last) > step * 0.3) out.push({ x: last.x, y: last.y });
                else out[out.length - 1] = { x: last.x, y: last.y };
                return out;
            }

            // Гаусове згладжування з фіксованими кінцями
            function gaussian(p, sigma) {
                const n = p.length, R = Math.ceil(sigma * 2.5), w = [];
                for (let k = -R; k <= R; k++) w.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
                return p.map((pt, i) => {
                    if (i === 0 || i === n - 1) return { x: pt.x, y: pt.y };
                    const r = Math.min(R, i, n - 1 - i);
                    let sx = 0, sy = 0, sw = 0;
                    for (let k = -r; k <= r; k++) { const ww = w[k + R]; sx += p[i + k].x * ww; sy += p[i + k].y * ww; sw += ww; }
                    return { x: sx / sw, y: sy / sw };
                });
            }

            function turnAngle(p, i, k) {
                const a = p[i - k], b = p[i], c = p[i + k];
                const v1x = b.x - a.x, v1y = b.y - a.y, v2x = c.x - b.x, v2y = c.y - b.y;
                const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
                if (l1 < 1e-6 || l2 < 1e-6) return 0;
                return Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2))));
            }

            // Пошук справжніх кутів (а не просто тісних петель)
            function findCorners(p) {
                const n = p.length, K = 6, K2 = 3, TH = 55 * Math.PI / 180;
                const cuts = [0];
                let group = null;
                for (let i = K; i < n - K; i++) {
                    const big = turnAngle(p, i, K);
                    if (big > TH && turnAngle(p, i, K2) > big * 0.7) {
                        if (!group || big > group.a) group = { i, a: big };
                    } else if (group) {
                        if (group.i - cuts[cuts.length - 1] >= K) cuts.push(group.i);
                        group = null;
                    }
                }
                if (group && group.i - cuts[cuts.length - 1] >= K) cuts.push(group.i);
                if (n - 1 - cuts[cuts.length - 1] < K && cuts.length > 1) cuts.pop();
                cuts.push(n - 1);
                return cuts;
            }

            function fitCircle(p) {
                const n = p.length;
                let mx = 0, my = 0;
                p.forEach(q => { mx += q.x; my += q.y; }); mx /= n; my /= n;
                let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
                p.forEach(q => {
                    const u = q.x - mx, v = q.y - my;
                    suu += u * u; suv += u * v; svv += v * v;
                    suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
                });
                const det = suu * svv - suv * suv;
                if (Math.abs(det) < 1e-9) return null;
                const b1 = 0.5 * (suuu + suvv), b2 = 0.5 * (svvv + svuu);
                const uc = (b1 * svv - b2 * suv) / det, vc = (suu * b2 - suv * b1) / det;
                const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
                const c = { x: uc + mx, y: vc + my, r };
                let se = 0; p.forEach(q => { const e = dist(q, c) - r; se += e * e; });
                c.rms = Math.sqrt(se / n);
                return c;
            }

            function sampleLine(a, b) {
                const n = Math.max(1, Math.ceil(dist(a, b) / 3));
                const out = [];
                for (let i = 0; i <= n; i++) out.push({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n });
                return out;
            }

            function fitPiece(p) {
                if (p.length < 4) return p.map(q => ({ x: q.x, y: q.y }));
                const a = p[0], b = p[p.length - 1];
                const L = pathLen(p), chord = dist(a, b);

                // 1) Пряма
                if (chord > 4) {
                    let maxDev = 0;
                    const dx = b.x - a.x, dy = b.y - a.y;
                    p.forEach(q => { maxDev = Math.max(maxDev, Math.abs((q.x - a.x) * dy - (q.y - a.y) * dx) / chord); });
                    if (maxDev <= Math.max(1.6, 0.035 * L)) return sampleLine(a, b);
                }

                // 2) Дуга / коло (кут дуги зберігається)
                if (L > 14) {
                    const c = fitCircle(p);
                    if (c && c.r > 5 && c.r < 800 && c.rms <= Math.max(0.9, 0.07 * c.r)) {
                        let sweep = 0, prev = Math.atan2(a.y - c.y, a.x - c.x);
                        const start = prev;
                        for (let i = 1; i < p.length; i++) {
                            const ang = Math.atan2(p[i].y - c.y, p[i].x - c.x);
                            let d = ang - prev;
                            if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
                            sweep += d; prev = ang;
                        }
                        if (Math.abs(sweep) >= 0.35 && Math.abs(sweep) <= Math.PI * 2.1) {
                            const ra = dist(a, c), rb = dist(b, c);
                            const n = Math.max(8, Math.ceil(Math.abs(sweep) * c.r / 2));
                            const out = [];
                            for (let i = 0; i <= n; i++) {
                                const t = i / n;
                                // Ідеальне коло в середині, плавне "пристиковування" до кінців (щоб не було розривів)
                                const r = c.r + (ra - c.r) * Math.max(0, 1 - t / 0.12) + (rb - c.r) * Math.max(0, (t - 0.88) / 0.12);
                                const ang = start + sweep * t;
                                out.push({ x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r });
                            }
                            return out;
                        }
                    }
                }

                // 3) Вільна крива — сильне каліграфічне згладжування
                return gaussian(p, 3.5);
            }

            // ---------- Товщина залежно від швидкості ----------
            const speedToWidth = (v) => MAX_W - (MAX_W - MIN_W) * Math.min(1, v / SPEED_REF);

            // Профіль товщини вздовж штриха: [{u (0..1 по довжині), w}] зі згладжуванням
            function widthProfile(pts) {
                const prof = [{ s: 0, w: pts[0].w || DEFAULT_W }];
                let len = 0;
                for (let i = 1; i < pts.length; i++) {
                    len += dist(pts[i - 1], pts[i]);
                    prof.push({ s: len, w: pts[i].w || DEFAULT_W });
                }
                return prof.map((p, i) => {
                    let sw = 0, n = 0;
                    for (let k = Math.max(0, i - 4); k <= Math.min(prof.length - 1, i + 4); k++) { sw += prof[k].w; n++; }
                    return { u: len ? p.s / len : 0, w: sw / n };
                });
            }

            function sampleProfile(prof, u) {
                if (u <= prof[0].u) return prof[0].w;
                for (let i = 1; i < prof.length; i++) {
                    if (u <= prof[i].u) {
                        const a = prof[i - 1], b = prof[i];
                        const t = (b.u - a.u) ? (u - a.u) / (b.u - a.u) : 0;
                        return a.w + (b.w - a.w) * t;
                    }
                }
                return prof[prof.length - 1].w;
            }

            function beautify(raw) {
                const pts = [];
                raw.forEach(q => { const l = pts[pts.length - 1]; if (!l || dist(l, q) > 0.3) pts.push(q); });
                const round = (q) => [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10, Math.round((q.w || DEFAULT_W) * 100) / 100];
                if (pts.length < 2 || pathLen(pts) < 2.5) {
                    const p0 = pts[0] || raw[0];
                    return [round({ x: p0.x, y: p0.y, w: MAX_W })];
                }

                const prof = widthProfile(pts);
                const rs = resample(pts, 1.5);
                let out = [];
                if (rs.length < 4) {
                    out = rs;
                } else {
                    const light = gaussian(rs, 1.2);
                    const cuts = findCorners(light);
                    for (let i = 0; i < cuts.length - 1; i++) {
                        const fitted = fitPiece(light.slice(cuts[i], cuts[i + 1] + 1));
                        if (out.length) fitted.shift();
                        out = out.concat(fitted);
                    }
                }

                // Переносимо товщину на вирівняну лінію + легке звуження на початку та в кінці (як від пера)
                const total = pathLen(out) || 1;
                let acc = 0;
                out.forEach((q, i) => {
                    if (i > 0) acc += dist(out[i - 1], q);
                    const u = acc / total;
                    const edge = Math.min(u, 1 - u);
                    const taper = edge < 0.06 ? 0.6 + 0.4 * (edge / 0.06) : 1;
                    q.w = Math.max(MIN_W * 0.8, sampleProfile(prof, u) * taper);
                });
                return out.map(round);
            }

            // ---------- Малювання ----------
            const toPoint = (q) => Array.isArray(q) ? { x: q[0], y: q[1], w: q[2] || DEFAULT_W } : { x: q.x, y: q.y, w: q.w || DEFAULT_W };

            function drawStroke(c, stroke) {
                const pts = stroke.map(toPoint);
                if (!pts.length) return;
                c.strokeStyle = INK; c.fillStyle = INK;
                c.lineCap = 'round'; c.lineJoin = 'round';

                if (pts.length === 1) {
                    c.beginPath(); c.arc(pts[0].x, pts[0].y, pts[0].w * 0.6, 0, Math.PI * 2); c.fill();
                    return;
                }
                if (pts.length === 2) {
                    c.lineWidth = (pts[0].w + pts[1].w) / 2;
                    c.beginPath(); c.moveTo(pts[0].x, pts[0].y); c.lineTo(pts[1].x, pts[1].y); c.stroke();
                    return;
                }
                // Сегменти між серединами відрізків: плавна крива зі змінною товщиною
                let prevMid = { x: pts[0].x, y: pts[0].y };
                for (let i = 1; i < pts.length - 1; i++) {
                    const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
                    c.lineWidth = pts[i].w;
                    c.beginPath(); c.moveTo(prevMid.x, prevMid.y); c.quadraticCurveTo(pts[i].x, pts[i].y, mid.x, mid.y); c.stroke();
                    prevMid = mid;
                }
                const last = pts[pts.length - 1];
                c.lineWidth = last.w;
                c.beginPath(); c.moveTo(prevMid.x, prevMid.y); c.lineTo(last.x, last.y); c.stroke();
            }

            function drawBase(c, src) {
                if (!imgCache[src]) {
                    imgCache[src] = new Image();
                    imgCache[src].onload = () => redraw();
                    imgCache[src].src = src;
                }
                const img = imgCache[src];
                if (!img.complete || !img.naturalWidth) return;
                const k = Math.min(W / img.naturalWidth, H / img.naturalHeight);
                const w = img.naturalWidth * k, h = img.naturalHeight * k;
                c.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
            }

            function drawState(c, s) {
                if (s.base) drawBase(c, s.base);
                s.strokes.forEach(st => drawStroke(c, st));
            }

            function redraw() {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
                drawState(ctx, state());
                if (current && current.length) drawStroke(ctx, current);
            }

            function resize() {
                const r = canvas.getBoundingClientRect();
                if (!r.width || !r.height) return;
                const dpr = window.devicePixelRatio || 1;
                canvas.width = Math.round(r.width * dpr);
                canvas.height = Math.round(r.height * dpr);
                redraw();
            }

            function refreshUI() {
                redraw();
                UI.SignUndo.disabled = pointer === 0;
                UI.SignRedo.disabled = pointer >= history.length - 1;
                UI.SignClear.disabled = !hasInk(state());
                wrap.classList.toggle('has-ink', hasInk(state()) || !!current);
            }

            function commit(newState) {
                history = history.slice(0, pointer + 1);
                history.push(newState);
                if (history.length > 150) history.shift();
                pointer = history.length - 1;
                refreshUI();
            }

            // ---------- Події вказівника (миша / тачпад / палець / стилус) ----------
            function toLocal(e) {
                const r = canvas.getBoundingClientRect();
                return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H, t: e.timeStamp || performance.now() };
            }

            function addPoint(p) {
                const prev = current[current.length - 1];
                const d = dist(prev, p);
                if (d < 0.3) return;
                const dt = Math.max(1, p.t - prev.t);
                p.w = prev.w + (speedToWidth(d / dt) - prev.w) * 0.3; // плавна зміна товщини
                current.push(p);
            }

            function scheduleRedraw() {
                if (rafId) return;
                rafId = requestAnimationFrame(() => { rafId = null; redraw(); });
            }

            function finishStroke(e) {
                if (!current || (e && e.pointerId !== activePointerId)) return;
                const raw = current;
                current = null; activePointerId = null;
                const fitted = beautify(raw);
                if (fitted && fitted.length) commit({ base: state().base, strokes: state().strokes.concat([fitted]) });
                else refreshUI();
            }

            on(canvas, 'pointerdown', (e) => {
                if ((e.pointerType === 'mouse' && e.button !== 0) || current) return;
                e.preventDefault();
                try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
                activePointerId = e.pointerId;
                const p = toLocal(e);
                p.w = (MIN_W + MAX_W) / 2 + 0.6;
                current = [p];
                wrap.classList.add('has-ink');
                scheduleRedraw();
            });
            on(canvas, 'pointermove', (e) => {
                if (!current || e.pointerId !== activePointerId) return;
                e.preventDefault();
                const events = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
                events.forEach(ev => addPoint(toLocal(ev)));
                scheduleRedraw();
            });
            on(canvas, 'pointerup', finishStroke);
            on(canvas, 'pointercancel', finishStroke);
            canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

            on(UI.SignUndo, 'click', () => { if (pointer > 0) { pointer--; refreshUI(); } });
            on(UI.SignRedo, 'click', () => { if (pointer < history.length - 1) { pointer++; refreshUI(); } });
            on(UI.SignClear, 'click', () => { if (hasInk(state())) commit({ base: null, strokes: [] }); });
            on(window, 'resize', () => { if (canvas.offsetParent) resize(); });

            // ---------- Публічні методи ----------
            function load() {
                let strokes = null;
                try { strokes = JSON.parse(lsGet(LS_KEYS.strokes) || 'null'); } catch (e) { strokes = null; }
                const img = lsGet(LS_KEYS.sign);
                let initial = { base: null, strokes: [] };
                if (Array.isArray(strokes) && strokes.length) initial = { base: null, strokes };
                else if (img) initial = { base: img, strokes: [] };
                history = [initial]; pointer = 0; current = null;
                resize();
                refreshUI();
            }

            // Експорт у PNG (прозорий фон, обрізаний по краях підпису)
            function exportImage() {
                const s = state();
                if (!hasInk(s)) return null;
                if (!s.strokes.length && s.base) return s.base;
                const SCALE = 3;
                const off = document.createElement('canvas');
                off.width = W * SCALE; off.height = H * SCALE;
                const oc = off.getContext('2d');
                oc.setTransform(SCALE, 0, 0, SCALE, 0, 0);
                drawState(oc, s);
                const box = scanAlpha(off);
                return box.empty ? null : cropToPng(off, box);
            }

            // Якщо є завантажене зображення — штрихи окремо не зберігаємо (підпис зберігається як одне PNG)
            const getStrokes = () => state().base ? [] : state().strokes;
            // Встановлює завантажене зображення як підпис (з можливістю "Крок назад")
            const setImage = (src) => commit({ base: src, strokes: [] });

            return { load, exportImage, getStrokes, setImage };
        })();

        /* ---------- Завантаження власного підпису (PNG з прозорим фоном) ----------
           Зображення зменшується, обрізається по краях підпису і після "Зберегти" потрапляє у localStorage. */
        function processSignatureFile(file) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                const url = URL.createObjectURL(file);
                img.onerror = () => { URL.revokeObjectURL(url); reject('read'); };
                img.onload = () => {
                    URL.revokeObjectURL(url);
                    const k = Math.min(1, 1600 / img.naturalWidth, 900 / img.naturalHeight);
                    const cvs = document.createElement('canvas');
                    cvs.width = Math.max(1, Math.round(img.naturalWidth * k));
                    cvs.height = Math.max(1, Math.round(img.naturalHeight * k));
                    cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);
                    const box = scanAlpha(cvs);
                    if (box.empty) return reject('empty');
                    if (!box.hasTransparency) return reject('opaque');
                    resolve(cropToPng(cvs, box));
                };
                img.src = url;
            });
        }

        const UPLOAD_ERRORS = {
            opaque: 'На зображенні немає прозорого фону. Виріжте фон навколо підпису та збережіть файл у PNG.',
            empty: 'Зображення повністю прозоре — на ньому не знайдено підпису.',
            read: 'Не вдалося прочитати файл. Спробуйте інше зображення.'
        };
        on(UI.SignUpload, 'click', () => UI.SignUploadInput.click());
        on(UI.SignUploadInput, 'change', async () => {
            const file = UI.SignUploadInput.files[0];
            UI.SignUploadInput.value = ''; // щоб можна було обрати той самий файл ще раз
            if (!file) return;
            if (file.type !== 'image/png' && !/\.png$/i.test(file.name)) {
                return voAlert('Завантажте зображення у форматі PNG з прозорим фоном.', { title: 'Невірний формат', icon: 'fa-file-image' });
            }
            try { SignaturePad.setImage(await processSignatureFile(file)); }
            catch (err) { voAlert(UPLOAD_ERRORS[err] || UPLOAD_ERRORS.read, { title: 'Не вдалося завантажити підпис', icon: 'fa-file-image' }); }
        });

        /* =============================================================
           6. НАЛАШТУВАННЯ
           Після збереження викликаються функції, передані через
           Univoice.onSettingsSaved(fn) — напр. калькулятор оновлює підпис у рахунку
           ============================================================= */
        const savedHandlers = [];

        function toggleSettings(open) {
            if (open) {
                toggleMobileMenu(false);
                const { first, last } = getDictor();
                UI.SettingsFirstName.value = first;
                UI.SettingsLastName.value = last;
                requestAnimationFrame(() => SignaturePad.load());
            }
            setModal(UI.SettingsModal, open);
        }

        on(UI.SettingsSave, 'click', async () => {
            const strokes = SignaturePad.getStrokes();
            const ok = lsSet(LS_KEYS.firstName, UI.SettingsFirstName.value.trim())
                && lsSet(LS_KEYS.lastName, UI.SettingsLastName.value.trim())
                && lsSet(LS_KEYS.sign, SignaturePad.exportImage())
                && lsSet(LS_KEYS.strokes, strokes.length ? JSON.stringify(strokes) : null);

            savedHandlers.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
            toggleSettings(false);
            if (ok) await voAlert(TEXTS.settingsSaved, { title: 'Збережено', icon: 'fa-circle-check' });
            else await voAlert('Не вдалося зберегти дані. Можливо, браузер блокує локальне сховище (приватний режим).', { title: 'Помилка збереження', icon: 'fa-triangle-exclamation' });
        });
        on(UI.SettingsModal, 'click', (e) => { if (e.target === UI.SettingsModal) toggleSettings(false); });

        /* =============================================================
           7. ТУЛТІПИ, МЕНЮ
           ============================================================= */
        // Тултіпи: наведення на десктопі, натискання на мобільному. Натискання на "і" не перемикає опцію.
        // Не виходять за краї екрана
        function fitTooltip(tip) {
            const text = tip.querySelector('.vo-tooltip-text');
            if (!text) return;
            text.style.setProperty('--dx', '0px');
            const r = text.getBoundingClientRect();
            const vw = document.documentElement.clientWidth;
            const dx = r.left < 12 ? 12 - r.left : (r.right > vw - 12 ? (vw - 12) - r.right : 0);
            text.style.setProperty('--dx', `${Math.round(dx)}px`);
        }
        on(document, 'mouseover', (e) => {
            const tip = e.target.closest && e.target.closest('.vo-tooltip');
            if (tip && !tip.contains(e.relatedTarget)) fitTooltip(tip);
        });
        document.addEventListener('click', (e) => {
            const tip = e.target.closest('.vo-tooltip');
            document.querySelectorAll('.vo-tooltip.active').forEach(t => { if (t !== tip) t.classList.remove('active'); });
            if (tip) {
                e.preventDefault();
                e.stopPropagation();
                fitTooltip(tip);
                tip.classList.toggle('active');
            }
        }, true);

        function toggleMobileMenu(open) {
            UI.MobileMenu.classList.toggle('active', open);
            UI.MobileOverlay.classList.toggle('active', open);
            updateScrollLock();
        }

        // Кнопки меню й налаштувань можуть бути будь-де на сторінці (напр. ☰ у шапці сторінки)
        document.addEventListener('click', (e) => {
            if (!e.target.closest) return;
            if (e.target.closest('.js-open-menu')) toggleMobileMenu(true);
            else if (e.target.closest('.js-close-menu')) toggleMobileMenu(false);
            else if (e.target.closest('.js-open-settings')) toggleSettings(true);
            else if (e.target.closest('.js-close-settings')) toggleSettings(false);
        });

        return {
            voAlert, voConfirm, toggleMobileMenu, toggleSettings,
            onSettingsSaved: (fn) => { savedHandlers.push(fn); },
        };
    }

    // Публічні функції для сторінок. Ті, що працюють з розміткою, спершу запускають init()
    window.Univoice = {
        version: '1.0.0',
        on, onAll, show, escapeHtml, pad2, formatDate, lsGet, lsSet, LS_KEYS, getDictor,
        setModal, updateScrollLock, scanAlpha, cropToPng,
        voAlert: (...a) => init().voAlert(...a),
        voConfirm: (...a) => init().voConfirm(...a),
        toggleMobileMenu: (open) => init().toggleMobileMenu(open),
        openSettings: () => init().toggleSettings(true),
        onSettingsSaved: (fn) => init().onSettingsSaved(fn),
        init,
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
