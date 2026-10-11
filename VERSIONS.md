# Версії спільних файлів

Номер у посиланні після `@` — код коміту з файлами цієї версії. Кожна версія доступна назавжди.

| Версія | Дата | Код для посилання | Що змінилося |
|---|---|---|---|
| 1.0.0 | 2026-10-10 | `f86f760ca0275be82facf2b749a190f47fee0bf4` | Перша версія: меню, «Налаштування» з підписом, діалоги, тултіпи, спільні стилі |
| 1.1.0 | 2026-10-10 | `7f9e7b8e85767ff67b10afd15c007bd2fe41e12e` | Новий файл `univoice-speech.js` (Хрономір): числа, дати, суми, скорочення → слова, час прочитання за звуками й паузами. `univoice-ui.css` і `univoice-ui.js` без змін |
| 1.2.0 | 2026-10-11 | `13cc21adf928a4bb3a5e73b8011043b2d6461496` | `univoice-speech.js`: вербалізатор для Наголошувача (`verbalize`, `verbalizeParts`): дати без року, діапазони з відсотками й валютами, дні тижня, час через крапку, римські числа, рід числа за іменником (21 година, 2 кімнати), дюйми, «грн/міс», нові скорочення, словник іншомовних слів і їх читання за правилами. Хрономір так само читає латиницю. `univoice-ui.css` і `univoice-ui.js` без змін |

## Рядки для Tilda (поточна версія 1.2.0)

Усі сторінки:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/univoiceua-collab/univoice-shared@13cc21adf928a4bb3a5e73b8011043b2d6461496/univoice-ui.css">
<script src="https://cdn.jsdelivr.net/gh/univoiceua-collab/univoice-shared@13cc21adf928a4bb3a5e73b8011043b2d6461496/univoice-ui.js"></script>
```

Сторінки, яким потрібен Хрономір або вербалізатор (калькулятор, Наголошувач), — ще один рядок:

```html
<script src="https://cdn.jsdelivr.net/gh/univoiceua-collab/univoice-shared@13cc21adf928a4bb3a5e73b8011043b2d6461496/univoice-speech.js"></script>
```
