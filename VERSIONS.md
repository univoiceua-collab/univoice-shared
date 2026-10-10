# Версії спільних файлів

Номер у посиланні після `@` — код коміту з файлами цієї версії. Кожна версія доступна назавжди.

| Версія | Дата | Код для посилання | Що змінилося |
|---|---|---|---|
| 1.0.0 | 2026-10-10 | `f86f760ca0275be82facf2b749a190f47fee0bf4` | Перша версія: меню, «Налаштування» з підписом, діалоги, тултіпи, спільні стилі |
| 1.1.0 | 2026-10-10 | `7f9e7b8e85767ff67b10afd15c007bd2fe41e12e` | Новий файл `univoice-speech.js` (Хрономір): числа, дати, суми, скорочення → слова, час прочитання за звуками й паузами. `univoice-ui.css` і `univoice-ui.js` без змін |

## Рядки для Tilda (поточна версія 1.1.0)

Усі сторінки:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/univoiceua-collab/univoice-shared@7f9e7b8e85767ff67b10afd15c007bd2fe41e12e/univoice-ui.css">
<script src="https://cdn.jsdelivr.net/gh/univoiceua-collab/univoice-shared@7f9e7b8e85767ff67b10afd15c007bd2fe41e12e/univoice-ui.js"></script>
```

Сторінки, яким потрібен Хрономір (калькулятор), — ще один рядок:

```html
<script src="https://cdn.jsdelivr.net/gh/univoiceua-collab/univoice-shared@7f9e7b8e85767ff67b10afd15c007bd2fe41e12e/univoice-speech.js"></script>
```
