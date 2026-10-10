# univoice-shared

Спільні файли для всіх сторінок сайту Univoice (Tilda): меню, «Налаштування» (ім'я, прізвище, підпис), діалоги, кнопки, попапи й загальні стилі.

| Файл | Що в ньому |
|---|---|
| `univoice-ui.css` | Кольори, база, меню, поля, кнопки, попапи, діалоги, налаштування й підпис, загальний адаптив |
| `univoice-ui.js` | Вставляє меню, попап «Налаштування» з підписом і діалоги; дає сторінкам `window.Univoice` |

Репозиторій публічний, бо сайт завантажує ці файли через jsDelivr. Тут немає паролів чи особистих даних: ім'я та підпис диктора зберігаються лише в його браузері.

## Як підключити на сторінці

У CSS-блоці сторінки (перед `<style>` сторінки):

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/univoiceua-collab/univoice-shared@1.0.0/univoice-ui.css">
<script src="https://cdn.jsdelivr.net/gh/univoiceua-collab/univoice-shared@1.0.0/univoice-ui.js"></script>
```

На початку HTML-блоку сторінки — місце для меню:

```html
<div data-vo-menu></div>
```

У скрипті сторінки спільні функції беруться так:

```js
const { on, onAll, show, escapeHtml, formatDate, lsGet, lsSet, LS_KEYS, getDictor, setModal, updateScrollLock, voAlert, voConfirm } = window.Univoice;
Univoice.onSettingsSaved(() => { /* напр. оновити підпис у рахунку */ });
```

## Як оновлювати

1. Змінити файли й зробити коміт.
2. Поставити новий тег версії (`1.0.1`, `1.1.0` …).
3. На сторінках у Tilda замінити номер після `@` на новий.

Старі версії лишаються доступними, тож будь-яку сторінку можна повернути на попередній номер.

## Пункти меню

Список — на початку `univoice-ui.js` (`MENU`). Порожній `href` = пункт прихований. Поточна сторінка підсвічується сама за адресою (`/calculator`, `/stress`).
