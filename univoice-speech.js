/* =====================================================================
   UNIVOICE — ХРОНОМІР: ТЕКСТ → МОВЛЕННЯ (univoice-speech.js)
   Перетворює текст на те, що реально прозвучить (числа, дати, суми,
   відсотки, телефони, одиниці, скорочення, абревіатури → слова),
   і рахує час прочитання за звуками й паузами.

   Використання на сторінці:
     const r = UnivoiceSpeech.analyze(text);
     r.seconds   — час прочитання, сек (дробове число)
     r.words     — кількість слів, які буде вимовлено
     r.syllables — кількість складів
     r.pauses    — кількість пауз
     r.spoken    — текст так, як його буде прочитано
     r.hasSpeech — чи є в тексті що озвучувати (false для "!!!", емоджі тощо)
   Також: UnivoiceSpeech.normalize(text), UnivoiceSpeech.numberToWords(n, gender)

   Вербалізатор (для Наголошувача):
     UnivoiceSpeech.verbalize(text)      — текст, де числа, дати, суми, скорочення,
                                           абревіатури й іншомовні слова написані словами
     UnivoiceSpeech.verbalizeParts(text) — те саме частинами з позначками змін

   ЗМІСТ
   1. Налаштування темпу і пауз  ← редагувати тут
   2. Числа словами (кількісні, порядкові, родовий відмінок)
   3. Словники: місяці, валюти, одиниці, скорочення, абревіатури, іншомовні слова
   4. Нормалізація тексту (правила застосовуються по черзі)
   4а. Вербалізатор
   5. Підрахунок звуків, складів, пауз і часу
   ===================================================================== */
(function (root) {
    'use strict';

    /* =================================================================
       1. НАЛАШТУВАННЯ ТЕМПУ І ПАУЗ
       Час слова = (голосні × VOWEL + приголосні × CONSONANT) × PACE.
       PACE підібрано так, щоб звичайний текст без чисел у середньому
       звучав так само, як у попередній версії калькулятора.
       ================================================================= */
    const CONFIG = {
        PACE: 1,                // загальний множник темпу (1 — звичайний)
        VOWEL: 0.117,           // сек на голосний звук (склад)
        CONSONANT: 0.059,       // сек на приголосний звук
        PAUSE: {
            comma: 0.3,         // , ; : – —
            bracket: 0.15,      // ( )
            sentence: 0.5,      // . ! ? …
            paragraph: 0.25,    // додатково на новий рядок / абзац
        },
    };

    /* =================================================================
       2. ЧИСЛА СЛОВАМИ
       ================================================================= */
    const ONES = {
        m: ['нуль', 'один', 'два', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім', "дев'ять"],
        f: ['нуль', 'одна', 'дві', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім', "дев'ять"],
        n: ['нуль', 'одне', 'два', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім', "дев'ять"],
    };
    const TEENS = ['десять', 'одинадцять', 'дванадцять', 'тринадцять', 'чотирнадцять', "п'ятнадцять", 'шістнадцять', 'сімнадцять', 'вісімнадцять', "дев'ятнадцять"];
    const TENS = ['', '', 'двадцять', 'тридцять', 'сорок', "п'ятдесят", 'шістдесят', 'сімдесят', 'вісімдесят', "дев'яносто"];
    const HUNDREDS = ['', 'сто', 'двісті', 'триста', 'чотириста', "п'ятсот", 'шістсот', 'сімсот', 'вісімсот', "дев'ятсот"];
    const SCALES = [
        { value: 1e12, gender: 'm', forms: ['трильйон', 'трильйони', 'трильйонів'], gen: ['трильйона', 'трильйонів'], stem: 'трильйонн' },
        { value: 1e9,  gender: 'm', forms: ['мільярд', 'мільярди', 'мільярдів'],     gen: ['мільярда', 'мільярдів'],   stem: 'мільярдн' },
        { value: 1e6,  gender: 'm', forms: ['мільйон', 'мільйони', 'мільйонів'],     gen: ['мільйона', 'мільйонів'],   stem: 'мільйонн' },
        { value: 1e3,  gender: 'f', forms: ['тисяча', 'тисячі', 'тисяч'],            gen: ['тисячі', 'тисяч'],         stem: 'тисячн' },
    ];

    // Форма слова після числа: 1 гривня, 2 гривні, 5 гривень
    function plural(n, forms) {
        n = Math.abs(Math.floor(n));
        const n100 = n % 100, n10 = n % 10;
        if (n100 >= 11 && n100 <= 14) return forms[2];
        if (n10 === 1) return forms[0];
        if (n10 >= 2 && n10 <= 4) return forms[1];
        return forms[2];
    }

    function triad(n, gender) {
        const out = [];
        const h = Math.floor(n / 100), rest = n % 100;
        if (h) out.push(HUNDREDS[h]);
        if (rest >= 10 && rest < 20) out.push(TEENS[rest - 10]);
        else {
            if (rest >= 20) out.push(TENS[Math.floor(rest / 10)]);
            if (rest % 10) out.push(ONES[gender][rest % 10]);
        }
        return out;
    }

    // Кількісне число: 1234 → "тисяча двісті тридцять чотири". gender: 'm' | 'f' | 'n'
    function numberToWords(n, gender = 'm') {
        n = Math.floor(Math.abs(n));
        if (n === 0) return 'нуль';
        if (!Number.isSafeInteger(n) || n >= 1e15) return digitsToWords(String(n));
        const out = [];
        let rest = n;
        SCALES.forEach(s => {
            const k = Math.floor(rest / s.value);
            if (!k) return;
            rest %= s.value;
            if (k === 1 && !out.length) out.push(s.forms[0]); // "тисяча", "мільйон" без "одна/один"
            else out.push(...triad(k, s.gender), plural(k, s.forms));
        });
        if (rest) out.push(...triad(rest, gender));
        return out.join(' ');
    }

    // Родовий відмінок: від 10 до 15 → "від десяти до п'ятнадцяти"
    const ONES_GEN = ['нуля', 'одного', 'двох', 'трьох', 'чотирьох', "п'яти", 'шести', 'семи', 'восьми', "дев'яти"];
    const ONES_GEN_F = ['нуля', 'однієї', 'двох', 'трьох', 'чотирьох', "п'яти", 'шести', 'семи', 'восьми', "дев'яти"];
    const TEENS_GEN = ['десяти', 'одинадцяти', 'дванадцяти', 'тринадцяти', 'чотирнадцяти', "п'ятнадцяти", 'шістнадцяти', 'сімнадцяти', 'вісімнадцяти', "дев'ятнадцяти"];
    const TENS_GEN = ['', '', 'двадцяти', 'тридцяти', 'сорока', "п'ятдесяти", 'шістдесяти', 'сімдесяти', 'вісімдесяти', "дев'яноста"];
    const HUNDREDS_GEN = ['', 'ста', 'двохсот', 'трьохсот', 'чотирьохсот', "п'ятисот", 'шестисот', 'семисот', 'восьмисот', "дев'ятисот"];

    function triadGen(n, gender) {
        const out = [];
        const h = Math.floor(n / 100), rest = n % 100;
        if (h) out.push(HUNDREDS_GEN[h]);
        if (rest >= 10 && rest < 20) out.push(TEENS_GEN[rest - 10]);
        else {
            if (rest >= 20) out.push(TENS_GEN[Math.floor(rest / 10)]);
            if (rest % 10) out.push((gender === 'f' ? ONES_GEN_F : ONES_GEN)[rest % 10]);
        }
        return out;
    }

    function numberToWordsGen(n, gender = 'm') {
        n = Math.floor(Math.abs(n));
        if (n === 0) return 'нуля';
        if (!Number.isSafeInteger(n) || n >= 1e15) return digitsToWords(String(n));
        const out = [];
        let rest = n;
        SCALES.forEach(s => {
            const k = Math.floor(rest / s.value);
            if (!k) return;
            rest %= s.value;
            if (k === 1 && !out.length) out.push(s.gen[0]);
            else out.push(...triadGen(k, s.gender), k % 10 === 1 && k % 100 !== 11 ? s.gen[0] : s.gen[1]);
        });
        if (rest) out.push(...triadGen(rest, gender));
        return out.join(' ');
    }

    // Порядкові числа: 1 → перший / першого / перша …
    const ORD_STEM = {
        0: 'нульов', 1: 'перш', 2: 'друг', 3: 'трет', 4: 'четверт', 5: "п'ят", 6: 'шост', 7: 'сьом', 8: 'восьм', 9: "дев'ят",
        10: 'десят', 11: 'одинадцят', 12: 'дванадцят', 13: 'тринадцят', 14: 'чотирнадцят', 15: "п'ятнадцят",
        16: 'шістнадцят', 17: 'сімнадцят', 18: 'вісімнадцят', 19: "дев'ятнадцят",
        20: 'двадцят', 30: 'тридцят', 40: 'сороков', 50: "п'ятдесят", 60: 'шістдесят', 70: 'сімдесят', 80: 'вісімдесят', 90: "дев'яност",
        100: 'сот', 200: 'двохсот', 300: 'трьохсот', 400: 'чотирьохсот', 500: "п'ятисот", 600: 'шестисот', 700: 'семисот', 800: 'восьмисот', 900: "дев'ятисот",
    };
    const ORD_END = {
        hard: { 'm.nom': 'ий', 'm.gen': 'ого', 'm.dat': 'ому', 'm.loc': 'ому', 'm.ins': 'им', 'f.nom': 'а', 'f.gen': 'ої', 'f.dat': 'ій', 'f.loc': 'ій', 'f.acc': 'у', 'f.ins': 'ою', 'n.nom': 'е', 'pl.nom': 'і', 'pl.gen': 'их', 'pl.ins': 'ими' },
        soft: { 'm.nom': 'ій', 'm.gen': 'ього', 'm.dat': 'ьому', 'm.loc': 'ьому', 'm.ins': 'ім', 'f.nom': 'я', 'f.gen': 'ьої', 'f.dat': 'ій', 'f.loc': 'ій', 'f.acc': 'ю', 'f.ins': 'ьою', 'n.nom': 'є', 'pl.nom': 'і', 'pl.gen': 'іх', 'pl.ins': 'іми' },
    };
    const ordWord = (stem, form) => stem + ORD_END[stem === 'трет' ? 'soft' : 'hard'][form] ;

    // Частина складного слова: 2000 → "двох|тисячний", 25000 → "двадцятип'яти|тисячний"
    function combining(k) {
        if (k === 1) return '';
        return triadGen(k, 'm').join('').replace(/^одного$/, '');
    }

    function ordinalWords(n, form = 'm.nom') {
        n = Math.floor(Math.abs(n));
        if (!ORD_END.hard[form]) form = 'm.nom';
        if (n === 0) return ordWord(ORD_STEM[0], form);
        if (!Number.isSafeInteger(n) || n >= 1e15) return numberToWords(n);
        const t = n % 1000;
        if (t) {
            const head = n - t ? numberToWords(n - t) + ' ' : '';
            const h = Math.floor(t / 100) * 100, rest = t % 100;
            if (!rest) return head + ordWord(ORD_STEM[h], form);
            const prefix = (h ? HUNDREDS[h / 100] + ' ' : '');
            if (rest < 20 || rest % 10 === 0) return head + prefix + ordWord(ORD_STEM[rest], form);
            return head + prefix + TENS[Math.floor(rest / 10)] + ' ' + ordWord(ORD_STEM[rest % 10], form);
        }
        for (const s of SCALES.slice().reverse()) { // найменший ненульовий розряд
            const k = Math.floor(n / s.value) % 1000;
            if (!k) continue;
            const higher = n - (n % (s.value * 1000));
            const head = higher ? numberToWords(higher) + ' ' : '';
            return head + combining(k) + ordWord(s.stem, form);
        }
        return numberToWords(n);
    }

    // Цифри по одній: "007" → "нуль нуль сім"
    function digitsToWords(str) {
        return [...String(str)].filter(c => /\d/.test(c)).map(d => ONES.m[+d]).join(' ');
    }

    // Група цифр у номері телефону: "067" → "нуль шістдесят сім", "00" → "нуль нуль"
    function digitGroup(g) {
        const lead = g.match(/^0+/);
        if (!lead) return numberToWords(+g);
        if (lead[0].length === g.length) return digitsToWords(g);
        return digitsToWords(lead[0]) + ' ' + numberToWords(+g.slice(lead[0].length));
    }

    // Десятковий дріб: 2,5 → "два з половиною", 0,75 → "нуль цілих сімдесят п'ять сотих"
    function decimalWords(intStr, fracStr) {
        const int = +intStr;
        if (/^50*$/.test(fracStr)) return int === 1 ? 'півтора' : int === 0 ? 'пів' : `${numberToWords(int)} з половиною`;
        const frac = +fracStr;
        const intPart = `${numberToWords(int, 'f')} ${plural(int, ['ціла', 'цілих', 'цілих'])}`;
        const denoms = { 1: ['десята', 'десятих'], 2: ['сота', 'сотих'], 3: ['тисячна', 'тисячних'], 4: ['десятитисячна', 'десятитисячних'] };
        const d = denoms[fracStr.length];
        if (!d) return `${intPart} ${digitsToWords(fracStr)}`;
        const one = frac % 10 === 1 && frac % 100 !== 11;
        return `${intPart} ${numberToWords(frac, 'f')} ${one ? d[0] : d[1]}`;
    }

    /* =================================================================
       3. СЛОВНИКИ
       Форми іменників: [1, 2–4, 5+, після дробу]
       ================================================================= */
    const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

    const CURRENCIES = {
        UAH: { gender: 'f', forms: ['гривня', 'гривні', 'гривень', 'гривні'], minor: { gender: 'f', forms: ['копійка', 'копійки', 'копійок'] } },
        USD: { gender: 'm', forms: ['долар', 'долари', 'доларів', 'долара'], minor: { gender: 'm', forms: ['цент', 'центи', 'центів'] } },
        EUR: { gender: 'm', forms: ['євро', 'євро', 'євро', 'євро'], minor: { gender: 'm', forms: ['цент', 'центи', 'центів'] } },
        GBP: { gender: 'm', forms: ['фунт', 'фунти', 'фунтів', 'фунта'], minor: { gender: 'm', forms: ['пенс', 'пенси', 'пенсів'] } },
        PLN: { gender: 'm', forms: ['злотий', 'злоті', 'злотих', 'злотого'], minor: { gender: 'm', forms: ['грош', 'гроші', 'грошів'] } },
    };
    // Позначення валют (до або після числа)
    const CURRENCY_SIGNS = [
        ['₴', 'UAH'], ['грн\\.?', 'UAH'], ['UAH', 'UAH'], ['гривень|гривні|гривня', 'UAH'],
        ['\\$', 'USD'], ['USD', 'USD'], ['дол\\.', 'USD'], ['доларів|долари|долар', 'USD'],
        ['€', 'EUR'], ['EUR', 'EUR'], ['євро', 'EUR'],
        ['£', 'GBP'], ['GBP', 'GBP'],
        ['zł|PLN|злотих', 'PLN'],
    ];

    // Одиниці після числа: "5 км" → "п'ять кілометрів"
    const UNITS = [
        ['км/год', 'm', ['кілометр на годину', 'кілометри на годину', 'кілометрів на годину', 'кілометра на годину']],
        ['кв\\.\\s?м|м²|м2', 'm', ['квадратний метр', 'квадратні метри', 'квадратних метрів', 'квадратного метра']],
        ['км', 'm', ['кілометр', 'кілометри', 'кілометрів', 'кілометра']],
        ['см', 'm', ['сантиметр', 'сантиметри', 'сантиметрів', 'сантиметра']],
        ['мм', 'm', ['міліметр', 'міліметри', 'міліметрів', 'міліметра']],
        ['м', 'm', ['метр', 'метри', 'метрів', 'метра']],
        ['кг', 'm', ['кілограм', 'кілограми', 'кілограмів', 'кілограма']],
        ['мг', 'm', ['міліграм', 'міліграми', 'міліграмів', 'міліграма']],
        ['г|гр', 'm', ['грам', 'грами', 'грамів', 'грама']],
        ['мл', 'm', ['мілілітр', 'мілілітри', 'мілілітрів', 'мілілітра']],
        ['л', 'm', ['літр', 'літри', 'літрів', 'літра']],
        ['год', 'f', ['година', 'години', 'годин', 'години']],
        ['хв', 'f', ['хвилина', 'хвилини', 'хвилин', 'хвилини']],
        ['сек|с', 'f', ['секунда', 'секунди', 'секунд', 'секунди']],
        ['шт', 'f', ['штука', 'штуки', 'штук', 'штуки']],
        ['ГБ|Гб|GB|Gb', 'm', ['гігабайт', 'гігабайти', 'гігабайтів', 'гігабайта']],
        ['МБ|Мб|MB|Mb', 'm', ['мегабайт', 'мегабайти', 'мегабайтів', 'мегабайта']],
        ['кВт', 'm', ['кіловат', 'кіловати', 'кіловатів', 'кіловата']],
        ['Вт', 'm', ['ват', 'вати', 'ватів', 'вата']],
        ['°C|°С|℃', 'm', ['градус Цельсія', 'градуси Цельсія', 'градусів Цельсія', 'градуса Цельсія']],
        ['°', 'm', ['градус', 'градуси', 'градусів', 'градуса']],
        ['тис\\.?', 'f', ['тисяча', 'тисячі', 'тисяч', 'тисячі']],
        ['млн\\.?', 'm', ['мільйон', 'мільйони', 'мільйонів', 'мільйона']],
        ['млрд\\.?', 'm', ['мільярд', 'мільярди', 'мільярдів', 'мільярда']],
        ['р\\.|рр\\.', 'm', ['рік', 'роки', 'років', 'року']],
        ['дн\\.', 'm', ['день', 'дні', 'днів', 'дня']],
        ['стор\\.', 'f', ['сторінка', 'сторінки', 'сторінок', 'сторінки']],
        ['x|х|×', 'm', ['раз', 'рази', 'разів', 'раза']],
    ];

    // Скорочення в тексті. true — скорочення може стояти в кінці речення ("і т.д."), тоді крапка лишається
    const ABBREVIATIONS = [
        [/(^|[\s(])(?:і|та)\s?т\.\s?д\./g, '$1і так далі', true],
        [/(^|[\s(])т\.\s?д\./g, '$1так далі', true],
        [/(^|[\s(])т\.\s?п\./g, '$1тому подібне', true],
        [/(^|[\s(])т\.\s?ч\./g, '$1тому числі'],
        [/(^|[\s(])та\s?ін\./g, '$1та інші', true],
        [/(^|[\s(])напр\./g, '$1наприклад'],
        [/(^|[\s(])див\./g, '$1дивіться'],
        [/(^|[\s(])тел\./gi, '$1телефон'],
        [/(^|[\s(])вул\./gi, '$1вулиця'],
        [/(^|[\s(])(?:просп\.|пр-т)/gi, '$1проспект'],
        [/(^|[\s(])пров\./gi, '$1провулок'],
        [/(^|[\s(])(?:бульв\.|б-р)/gi, '$1бульвар'],
        [/(^|[\s(])пл\.(?=\s?[А-ЯІЇЄҐ])/g, '$1площа'],
        [/(^|[\s(])обл\./gi, '$1область', true],
        [/(^|[\s(])р-н/gi, '$1район', true],
        [/(^|[\s(])буд\./gi, '$1будинок'],
        [/(^|[\s(])кв\./gi, '$1квартира'],
        [/(^|[\s(])оф\./gi, '$1офіс'],
        [/(^|[\s(])м\.(?=\s?[А-ЯІЇЄҐ])/g, '$1місто'],
        [/(^|[\s(])с\.(?=\s?[А-ЯІЇЄҐ])/g, '$1село'],
        [/(^|[\s(])смт(?=[\s.,]|$)/g, '$1селище міського типу'],
        [/(^|[\s(])ім\./g, '$1імені'],
        [/(^|[\s(])проф\./g, '$1професор'],
        [/(^|[\s(])доц\./g, '$1доцент'],
        [/(^|[\s(])зам\./g, '$1заступник'],
        [/(^|[\s(])ст\.(?=\s?\d)/g, '$1стаття'],
        [/(^|[\s(])коп\./g, '$1копійок', true],
        [/(^|[\s(])грн\.?(?=[\s.,;:!?)]|$)/g, '$1гривень', true],
        [/(^|[\s(])тис\.(?=\s)/g, '$1тисяч', true],
        [/(^|[\s(])млн\.?(?=[\s.,;:!?)]|$)/g, '$1мільйонів', true],
        [/(^|[\s(])млрд\.?(?=[\s.,;:!?)]|$)/g, '$1мільярдів', true],
        [/(^|[\s(])P\.\s?S\.?/gi, '$1пі ес'],
        [/(^|[\s(])т\.\s?зв\./g, '$1так званий'],
        [/(^|[\s(])н\.\s?е\./g, '$1нашої ери', true],
        [/(^|[\s(])ст\.\s?м\./g, '$1станція метро'],
        [/(^|[\s(])ст\.(?=\s?метро)/g, '$1станція'],
        [/(^|[\s(])корп\./gi, '$1корпус'],
        [/(^|[\s(])мкрн?\./gi, '$1мікрорайон'],
        [/(^|[\s(])моб\./gi, '$1мобільний'],
        [/(^|[\s(])с\.(?=\s?\d)/g, '$1сторінка'],
        [/(^|[\s(])п\.(?=\s?\d)/g, '$1пункт'],
        [/(^|[\s(])ч\.(?=\s?\d)/g, '$1частина'],
        [/(^|[\s(])рис\.(?=\s?\d)/g, '$1рисунок'],
        [/(^|[\s(])табл\.(?=\s?\d)/g, '$1таблиця'],
        [/(^|[\s(])д-р(?=[\s.,]|$)/g, '$1доктор'],
        [/(^|[\s(])акад\./g, '$1академік'],
        [/(^|[\s(])вид-во/g, '$1видавництво'],
        [/(^|[\s(])с-ще/g, '$1селище'],
        [/(^|[\s(])шт\.(?=[\s.,;:!?)]|$)/g, '$1штук', true],
    ];

    // Назви літер для абревіатур
    const CYR_LETTERS = { А: 'а', Б: 'бе', В: 'ве', Г: 'ге', Ґ: 'ґе', Д: 'де', Е: 'е', Є: 'є', Ж: 'же', З: 'зе', И: 'и', І: 'і', Ї: 'ї', Й: 'йот', К: 'ка', Л: 'ел', М: 'ем', Н: 'ен', О: 'о', П: 'пе', Р: 'ер', С: 'ес', Т: 'те', У: 'у', Ф: 'еф', Х: 'ха', Ц: 'це', Ч: 'че', Ш: 'ша', Щ: 'ща', Ь: 'м’який знак', Ю: 'ю', Я: 'я' };
    const LAT_LETTERS = { A: 'ей', B: 'бі', C: 'сі', D: 'ді', E: 'і', F: 'еф', G: 'джі', H: 'ейч', I: 'ай', J: 'джей', K: 'кей', L: 'ел', M: 'ем', N: 'ен', O: 'оу', P: 'пі', Q: "к'ю", R: 'ар', S: 'ес', T: 'ті', U: 'ю', V: 'ві', W: 'дабл-ю', X: 'ікс', Y: 'вай', Z: 'зет' };
    // Абревіатури, які читаються як слово, а не по літерах
    const READ_AS_WORD = new Set(['ФОП', 'МОЗ', 'ЖЕК', 'ВООЗ', 'НАТО', 'ПАТ', 'ВАТ', 'ДАІ', 'ЦУМ', 'ГУМ', 'ВУЗ', 'ЗНО', 'ЮНЕСКО', 'НАСА', 'МАФ', 'ЦНАП', 'АЗС']);
    // Абревіатури, які читаються по літерах навіть серед великих літер
    const SPELLED = new Set(['ТОВ', 'СБУ', 'ЗСУ', 'МВС', 'НБУ', 'США', 'ЄС', 'ООН', 'ПДВ', 'ЄДРПОУ', 'ПДФО', 'ДСНС', 'ОСББ', 'АТБ', 'ВНЗ', 'НМТ', 'СТО', 'КМУ', 'ДТП', 'ЖК', 'ТЦ', 'ТРЦ', 'ЄСВ', 'ІПН', 'ПП', 'ПрАТ', 'ЕКГ', 'УЗД', 'МРТ', 'ЛОР', 'ВВП', 'ІТ', 'ЄІБ', 'ЄБРР', 'МВФ']);
    const SPECIAL_WORDS = { ІТ: 'ай-ті' };

    // Іншомовні слова: як їх вимовляють українською (ключ — малими літерами).
    // Слова, яких тут немає, читаються за правилами англійської вимови і позначаються «перевірте читання».
    // ✎ Додати слово: "слово:читання" через | (наприклад |nescafe:нескафе)
    const FOREIGN_WORDS = Object.fromEntries((
        // техніка, сервіси, банки
        'apple:епл|iphone:айфон|ipad:айпед|imac:аймак|macbook:макбук|mac:мак|airpods:ейрподс|airtag:ейртег|watch:вотч|samsung:самсунг|galaxy:гелексі|' +
        'xiaomi:сяомі|redmi:редмі|poco:поко|huawei:хуавей|honor:хонор|oppo:оппо|realme:ріалмі|nokia:нокіа|motorola:моторола|sony:соні|playstation:плейстейшн|' +
        'xbox:ікс-бокс|nintendo:нінтендо|switch:світч|lg:ел-джі|philips:філіпс|bosch:бош|siemens:сіменс|dyson:дайсон|tefal:тефаль|braun:браун|delonghi:делонгі|' +
        'lenovo:леново|asus:асус|acer:асер|dell:делл|hp:ейч-пі|intel:інтел|amd:ей-ем-ді|nvidia:енвідіа|geforce:джифорс|windows:віндоус|microsoft:майкрософт|' +
        'office:офіс|google:гугл|android:андроїд|ios:ай-о-ес|chrome:хром|gmail:джимейл|youtube:ютуб|tiktok:тікток|instagram:інстаграм|insta:інста|' +
        'facebook:фейсбук|telegram:телеграм|viber:вайбер|whatsapp:вотсап|twitter:твіттер|threads:тредс|linkedin:лінкедін|netflix:нетфлікс|spotify:спотіфай|' +
        'megogo:мегого|sweet:світ|zoom:зум|skype:скайп|uber:убер|bolt:болт|uklon:уклон|glovo:глово|wolt:вольт|amazon:амазон|ebay:ібей|aliexpress:аліекспрес|' +
        'temu:тему|olx:о-ел-ікс|prom:пром|rozetka:розетка|allo:алло|foxtrot:фокстрот|comfy:комфі|eldorado:ельдорадо|citrus:цитрус|monobank:монобанк|' +
        'privatbank:приватбанк|privat:приват|abank:а-банк|pumb:пумб|visa:віза|mastercard:мастеркард|paypal:пейпал|pay:пей|bitcoin:біткоїн|crypto:крипто|' +
        'chatgpt:чат-джі-пі-ті|openai:опен-ей-ай|ai:ей-ай|gpt:джі-пі-ті|wi-fi:вай-фай|wifi:вай-фай|bluetooth:блютуз|usb:ю-ес-бі|sms:ес-ем-ес|pdf:пе-де-еф|' +
        'tv:ті-ві|dj:ді-джей|pr:пі-ар|it:ай-ті|ok:окей|okay:окей|email:імейл|e-mail:імейл|online:онлайн|offline:офлайн|' +
        // одяг, косметика, магазини
        'zara:зара|nike:найк|adidas:адідас|puma:пума|reebok:рібок|new:нью|balance:беланс|gucci:гуччі|prada:прада|chanel:шанель|dior:діор|louis:луї|' +
        'vuitton:віттон|hermes:ермес|mango:манго|bershka:бершка|stradivarius:страдіваріус|reserved:резервд|sinsay:сінсей|lacoste:лакост|tommy:томмі|' +
        'hilfiger:хілфігер|calvin:келвін|klein:кляйн|guess:гес|levis:лівайс|converse:конверс|vans:ванс|lego:лего|ikea:ікеа|jysk:юск|loreal:лореаль|' +
        'garnier:гарньє|nivea:нівея|dove:дав|maybelline:мейбеллін|avon:ейвон|oriflame:оріфлейм|gillette:жилет|colgate:колгейт|pampers:памперс|' +
        'ariel:аріель|persil:персіл|vanish:веніш|fairy:фейрі|sephora:сефора|notino:нотіно|makeup:мейкап|eva:єва|watsons:вотсонс|' +
        // авто
        'toyota:тойота|honda:хонда|mazda:мазда|nissan:ніссан|mitsubishi:міцубісі|subaru:субару|suzuki:сузукі|hyundai:хюндай|kia:кіа|bmw:бе-ем-ве|audi:ауді|' +
        'mercedes:мерседес|benz:бенц|volkswagen:фольксваген|vw:фольксваген|skoda:шкода|renault:рено|peugeot:пежо|citroen:сітроен|ford:форд|' +
        'chevrolet:шевроле|tesla:тесла|volvo:вольво|porsche:порше|ferrari:феррарі|lamborghini:ламборгіні|jeep:джип|lexus:лексус|land:ленд|rover:ровер|' +
        'okko:окко|wog:вог|socar:сокар|shell:шелл|upg:ю-пі-джі|' +
        // їжа й напої
        'coca:кока|cola:кола|pepsi:пепсі|fanta:фанта|sprite:спрайт|mcdonalds:макдональдс|mcdonald\'s:макдональдс|kfc:кей-еф-сі|burger:бургер|king:кінг|' +
        'starbucks:старбакс|coffee:кофі|latte:лате|cappuccino:капучино|espresso:еспресо|americano:американо|pizza:піца|sushi:суші|nestle:нестле|' +
        'nescafe:нескафе|jacobs:якобс|lipton:ліптон|milka:мілка|snickers:снікерс|twix:твікс|kitkat:кіткет|oreo:орео|lays:лейс|pringles:прінглс|' +
        'heineken:хайнекен|carlsberg:карлсберг|jameson:джеймсон|red:ред|bull:булл|monster:монстр|silpo:сільпо|novus:новус|auchan:ашан|metro:метро|' +
        'varus:варус|fora:фора|ekomarket:екомаркет|' +
        // слова з реклами
        'sale:сейл|black:блек|friday:фрайдей|cyber:сайбер|monday:мандей|hot:хот|top:топ|best:бест|price:прайс|free:фрі|shop:шоп|store:стор|' +
        'delivery:делівері|fast:фаст|food:фуд|street:стріт|style:стайл|smart:смарт|home:хоум|beauty:б\'юті|fitness:фітнес|gym:джим|spa:спа|' +
        'wellness:велнес|premium:преміум|lux:люкс|luxury:лакшері|vip:віп|pro:про|max:макс|plus:плюс|mini:міні|ultra:ультра|lite:лайт|light:лайт|' +
        'air:ейр|one:ван|go:гоу|play:плей|show:шоу|live:лайв|love:лав|happy:хепі|day:дей|weekend:вікенд|party:паті|event:івент|team:тім|club:клаб|' +
        'city:сіті|park:парк|mall:мол|center:центр|centre:центр|market:маркет|super:супер|family:фемілі|kids:кідс|baby:бейбі|cashback:кешбек|' +
        'cash:кеш|back:бек|bonus:бонус|promo:промо|code:код|gift:гіфт|card:кард|deal:діл|deals:ділс|off:офф|discount:дисконт|outlet:аутлет|' +
        'brand:бренд|startup:стартап|business:бізнес|marketing:маркетинг|digital:діджитал|web:веб|app:епп|smartphone:смартфон|laptop:лептоп|' +
        'notebook:ноутбук|gaming:геймінг|game:гейм|games:геймз|cloud:клауд|service:сервіс|support:сапорт|manager:менеджер|coach:коуч|hr:ейч-ар|' +
        'ceo:сі-і-о|lifestyle:лайфстайл|travel:тревел|tour:тур|hotel:готель|resort:резорт|booking:букінг|airbnb:ейрбіенбі|check:чек|in:ін|out:аут|' +
        'yes:єс|wow:вау|like:лайк|follow:фоловь|subscribe:сабскрайб|stories:сторіз|story:сторі|reels:рілз|shorts:шортс|stream:стрім|blog:блог|' +
        'blogger:блогер|podcast:подкаст|news:ньюз|studio:студіо|music:м\'юзік|rock:рок|pop:поп|jazz:джаз|dance:денс|fest:фест|festival:фестиваль|' +
        'open:опен|white:вайт|gold:голд|silver:сілвер|green:грін|blue:блу|pink:пінк|star:стар|stars:старз|sun:сан|sky:скай|fresh:фреш|eco:еко|' +
        'bio:біо|organic:органік|natural:нейчерал|care:кер|skin:скін|hair:хеа|nail:нейл|nails:нейлз|bar:бар|grill:гриль|pub:паб|cafe:кафе|tea:ті|' +
        'house:хаус|garden:гарден|cinema:сінема|film:фільм|sport:спорт|sports:спортс|run:ран|bike:байк|auto:авто|motors:моторс|car:кар|wash:вош|' +
        'express:експрес|post:пост|nova:нова|poshta:пошта|ukrposhta:укрпошта|meest:міст|mobile:мобайл|phone:фон|kyivstar:київстар|vodafone:водафон|' +
        'lifecell:лайфселл|life:лайф|ukraine:юкрейн|kyiv:київ|lviv:львів|kharkiv:харків|odesa:одеса|dnipro:дніпро|world:ворлд|global:глобал|' +
        'group:груп|company:компані|inc:інк|ltd:лімітед|llc:ел-ел-сі|by:бай|for:фор|and:енд|the:зе|of:оф|to:ту|with:віз|from:фром|my:май|your:йор|' +
        'you:ю|me:мі|we:ві|all:ол|inclusive:інклюзив|real:ріл|estate:естейт|art:арт|design:дизайн|designer:дизайнер|decor:декор|lab:лаб|tech:тек|' +
        'technology:текнолоджі|systems:системз|solutions:солюшнз|academy:академі|school:скул|english:інгліш|speaking:спікінг|junior:джуніор|' +
        'senior:сіньйор|fashion:фешн|beauty-bar:б\'юті-бар|barbershop:барбершоп|barber:барбер|shopping:шопінг|look:лук|size:сайз|plus-size:плюс-сайз|' +
        'black-friday:блек-фрайдей|sold:солд|stock:сток|limited:лімітед|edition:едішн|special:спешл|offer:офер|order:ордер|now:нав|buy:бай|get:гет|' +
        'win:він|winner:віннер|first:ферст|last:ласт|next:некст|time:тайм|fun:фан|good:гуд|great:грейт|cool:кул|nice:найс|easy:ізі|full:фул|' +
        'pack:пек|box:бокс|kit:кіт|set:сет|food-court:фуд-корт|drive:драйв|take:тейк|away:евей|to-go:ту-гоу|coworking:коворкінг|hub:хаб|space:спейс|' +
        'loft:лофт|craft:крафт|beer:бір|wine:вайн|cocktail:коктейль|brunch:бранч|breakfast:брекфаст|lunch:ланч|dinner:дінер|menu:меню|chef:шеф|' +
        'grand:гранд|royal:роял|palace:палас|plaza:плаза|tower:тауер|residence:резиденс|comfort:комфорт|town:таун|village:віледж|' +
        'univoice:юнівойс|catalog:каталог|item:айтем|info:інфо|com:ком|net:нет|ua:юа|covid:ковід|nato:нато|nasa:наса|fifa:фіфа|uefa:уєфа|unicef:юнісеф|opec:опек|juice:джус|eur:євро|smoothie:смузі|burger-bar:бургер-бар|nike-air:найк-ейр|jordan:джордан|max-pro:макс-про|watch-ultra:вотч-ультра'
    ).split('|').map(p => p.split(':')));

    function spellAcronym(word) {
        const isLatin = /^[A-Z]+$/.test(word);
        const map = isLatin ? LAT_LETTERS : CYR_LETTERS;
        return [...word].map(ch => map[ch] || ch.toLowerCase()).join('-');
    }

    // Абревіатура читається як слово, якщо вона довга або в ній чергуються голосні й приголосні (НАТО, ЮНЕСКО)
    const UPPER_VOWEL = /[АЕЄИІЇОУЮЯAEIOUY]/;
    function readsAsWord(word) {
        if (READ_AS_WORD.has(word)) return true;
        if (SPELLED.has(word) || word.length < 4 || !UPPER_VOWEL.test(word)) return false;
        if (word.length >= 6) return true;  // ЗНИЖКИ, ТІЛЬКИ — так пишуть для наголосу
        return !/[^АЕЄИІЇОУЮЯAEIOUYЬ]{3,}/.test(word.replace(/Ь/g, ''));
    }

    // Англійське слово за правилами вимови: make → мейк, black → блек, light → лайт.
    // Це припущення, тому вербалізатор позначає такі слова для перевірки
    function translitEn(word) {
        let w = word.toLowerCase();
        const R = (re, s) => { w = w.replace(re, s); };
        const VOW = 'aeiouyаеєиіїоуюя';
        // магічне e: make → мейк, time → тайм, home → хоум, face → фейс, page → пейдж
        w = w.replace(/(?<![aeiou])([aiou])([b-df-hj-np-tv-z])e([sd]?)$/, (m, v, c, s) =>
            ({ a: 'ей', i: 'ай', o: 'оу', u: 'ю' })[v] + ({ c: 'с', g: 'дж' }[c] || c) + s);
        R(/tion/g, 'шн'); R(/sion/g, 'жн'); R(/ture/g, 'чер'); R(/sch/g, 'ск'); R(/tch/g, 'ч');
        R(/ough/g, 'оу'); R(/augh/g, 'о'); R(/igh/g, 'ай'); R(/(?<=[aeiou])gh/g, '');
        R(/^kn/, 'н'); R(/^wr/, 'р'); R(/^wh/, 'в'); R(/^ps/, 'с');
        R(/ph/g, 'ф'); R(/sh/g, 'ш'); R(/ch/g, 'ч'); R(/th/g, 'т'); R(/ck/g, 'к'); R(/qu/g, 'кв');
        R(/ind$/, 'айнд'); R(/ild$/, 'айлд'); R(/all/g, 'ол');
        R(/c(?=[eiy])/g, 'с'); R(/g(?=[eiy])/g, 'дж');
        R(/oo/g, 'у'); R(/ee/g, 'і'); R(/ea/g, 'і'); R(/a[iy]/g, 'ей'); R(/ei/g, 'ей');
        R(/ey$/, w.length > 4 ? 'і' : 'ей');
        R(/oa/g, 'оу'); R(/ou/g, 'ау'); R(/ow$/, 'оу'); R(/ow/g, 'ау'); R(/o[iy]/g, 'ой'); R(/a[uw]/g, 'о');
        R(/ew/g, 'ю'); R(/ue$/, 'ю'); R(/ie$/, 'і'); R(/ui/g, 'у'); R(/[iu]r/g, 'ер'); R(/wa(?=[^aeiouy])/g, 'во'); R(/ar/g, 'ар');
        R(/([b-df-hj-np-tv-z])le$/, '$1л');
        R(/^y/, 'й');
        const syllables = (w.match(/[aeiouаеєиіїоуюя]+/g) || []).length;
        R(/(?<=[^aeiouаеєиіїоуюя])y$/, syllables > 0 ? 'і' : 'ай');
        R(/y/g, 'і');
        // німе e в кінці: store → стор
        w = w.replace(/([^aeiouаеєиіїоуюя])e$/, (m, c, off) => (new RegExp(`[${VOW}]`).test(w.slice(0, off)) ? c : m));
        const CONS = '[b-df-hj-np-tv-xzбвгґджзклмнпрстфхцчшщ]', V = '[aeiouаеєиіїоуюя]';
        R(/a$/, 'а');
        R(new RegExp(`a(?=${CONS}${V})`, 'g'), 'ей');
        R(/a/g, 'е');
        R(/^u/, 'ю');
        R(new RegExp(`u(?=${CONS}${V})`, 'g'), 'ю');
        R(/u/g, 'а');
        R(/i/g, 'і'); R(/o/g, 'о'); R(/e/g, 'е');
        R(/x/g, 'кс'); R(/j/g, 'дж'); R(/w/g, 'в'); R(/q/g, 'к'); R(/c/g, 'к'); R(/g/g, 'г'); R(/h$/, ''); R(/h/g, 'х');
        R(/s$/, 'с');
        const LAT = { b: 'б', d: 'д', f: 'ф', k: 'к', l: 'л', m: 'м', n: 'н', p: 'п', r: 'р', s: 'с', t: 'т', v: 'в', z: 'з' };
        w = w.replace(/[a-z]/g, ch => LAT[ch] || '');
        R(/([бвгґджзклмнпрстфхцчшщ])\1/g, '$1');
        R(/([бпвмфр])([юяєї])/g, "$1'$2");
        return w;
    }

    /* =================================================================
       4. НОРМАЛІЗАЦІЯ ТЕКСТУ
       ================================================================= */
    const NUM = '\\d{1,3}(?:[ \\u00A0\\u202F]\\d{3})+|\\d+'; // 1 000 000 або 1000000
    const cleanNum = (s) => s.replace(/[   ]/g, '');
    const LETTER = 'A-Za-zА-Яа-яІіЇїЄєҐґ';
    const GUESS_START = '', GUESS_END = ''; // позначки «перевірте читання» (лише всередині вербалізатора)

    function currencyCode(sign) {
        for (const [re, code] of CURRENCY_SIGNS) if (new RegExp(`^(?:${re})$`, 'i').test(sign)) return code;
        return null;
    }
    const CURRENCY_RE = CURRENCY_SIGNS.map(c => c[0]).join('|');
    const UNIT_RE = UNITS.map(u => u[0]).join('|');
    const PERCENT_FORMS = ['відсоток', 'відсотки', 'відсотків', 'відсотка'];

    function moneyWords(intStr, fracStr, code, gen) {
        const c = CURRENCIES[code];
        const int = +cleanNum(intStr);
        let out = countWords(int, c.gender, c.forms, gen);
        if (fracStr && +fracStr) {
            const minor = +(fracStr + '0').slice(0, 2);
            out += ` ${countWords(minor, c.minor.gender, c.minor.forms, gen)}`;
        }
        return out;
    }

    // Форма порядкового за закінченням: "5-го" → m.gen, "1-ша" → f.nom …
    function ordinalForm(suffix) {
        const s = suffix.toLowerCase();
        if (/^(?:й|ий|ій)$/.test(s)) return 'm.nom';
        if (/(?:го)$/.test(s)) return 'm.gen';
        if (/(?:му)$/.test(s)) return 'm.dat';
        if (/(?:ої)$/.test(s)) return 'f.gen';
        if (/(?:ми|ими|іми)$/.test(s)) return 'pl.ins';
        if (/(?:х|их|іх)$/.test(s)) return 'pl.gen';
        if (/^(?:а|ша|га|та|я|тя|ма|ва)$/.test(s)) return 'f.nom';
        if (/^(?:у|шу|гу|ту|ю|тю|му|ву)$/.test(s)) return 'f.acc';
        if (/^(?:е|ше|ге|те|є|тє|ме|ве)$/.test(s)) return 'n.nom';
        if (/^(?:і|ті|ні)$/.test(s)) return 'pl.nom';
        return 'm.nom';
    }

    // Слово перед збігом (для відмінка): "до 18:00" → "до"
    function wordBefore(str, offset) {
        const m = str.slice(Math.max(0, offset - 25), offset).match(/([\p{L}']+)[\s(«"]*$/u);
        return m ? m[1].toLowerCase() : '';
    }
    // Слово одразу після збігу: "21 година" → "година"
    function wordAfter(str, end) {
        const m = str.slice(end, end + 30).match(/^\s+([\p{L}'’ʼ]+)/u);
        return m ? m[1] : '';
    }
    // Після цих слів число стоїть у родовому відмінку: "до п'яти", "від десяти"
    const GEN_PREPS = new Set(['від', 'до', 'з', 'із', 'зі', 'після', 'близько', 'біля', 'для', 'без', 'більше', 'менше', 'протягом', 'замість', 'крім', 'серед', 'навколо', 'кількох']);
    const isGen = (str, offset) => GEN_PREPS.has(wordBefore(str, offset));
    // Прийменники, після яких діапазон читається через дефіс: "на 5-7%" → "на п'ять-сім відсотків"
    const RANGE_PREPS = new Set(['на', 'за', 'у', 'в', 'по', 'понад', 'через', 'о', 'об']);

    // Рід іменника після числа, щоб узгодити "один / одна / одне", "два / дві"
    const FEM_STEMS = /^(?:годин|хвилин|секунд|доб|книг|книжк|особ|штук|тисяч|гривн|копійк|сторінк|пляшк|порці|кав|піц|чашк|ложк|кімнат|квартир|сері|частин|реч|ноч|зірк|позиці|послуг|акці|знижк|одиниц|пар[аиі]|машин|дитин|людин|сім'|родин|груп|категорі|мов[аиі]|ідеї|ідея|програм|зустріч|подорож|екскурсі|лекці|консультаці|процедур|сесі|ванн|спальн|хат|сумк|таблетк|капсул|упаковк|коробк|банк[аиі]$|верси|модел|функці|камер|гр[аиі]$|ігр|задач|вправ|відповід|помилк|зміна|змін[иі]|причин|секці|школ|ночі|доба|ставк|виплат|страв|піцу)/;
    function nounGender(word, n) {
        const w = word.toLowerCase().replace(/[’ʼ]/g, "'");
        if (!w) return 'm';
        if (FEM_STEMS.test(w) || /(?:ість|ості|ія|ії)$/.test(w)) return 'f';
        const n100 = n % 100, n10 = n % 10;
        if (n10 === 1 && n100 !== 11) {
            if (/(?:нн|тт|дд|сс|чч|лл|жж|зз|цц|шш)я$|(?:ще|тво|ко|ло|но|то|во|ро|мо|по|зо|со|хо|до|це|те|ре|не|ле|ве)$/.test(w)) return 'n';
            if (/[ая]$/.test(w)) return 'f';
        } else if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) {
            if (/(?:ини|ги|[нжшчрвмз]ки)$/.test(w)) return 'f';
        }
        return 'm';
    }

    // Число з іменником у потрібному відмінку: (5, одиниця) → "п'ять кілометрів" або "п'яти кілометрів"
    function countWords(n, gender, forms, gen) {
        if (!gen) return `${numberToWords(n, gender)} ${plural(n, forms)}`;
        const one = n % 10 === 1 && n % 100 !== 11;
        return `${numberToWordsGen(n, gender)} ${one ? forms[3] || forms[0] : forms[2]}`;
    }

    // Скорочення з крапкою в кінці речення ("… 100 грн. Далі") — крапка лишається як кінець речення
    function keepDot(m, off, str, out) {
        return /\.$/.test(m) && /^\s*(?:$|\n|[A-ZА-ЯІЇЄҐ«"])/.test(str.slice(off + m.length)) ? out + '.' : out;
    }

    // Перша частина складного слова: 5-річний → "п'ятирічний", 100-річчя → "сторіччя"
    const COMBINING = { 1: 'одно', 2: 'дво', 3: 'три', 4: 'чотири', 40: 'сорока', 90: "дев'яносто", 100: 'сто', 1000: 'тисячо' };
    const combiningForm = (n) => COMBINING[n] || numberToWordsGen(n).replace(/ /g, '');

    // Римські числа (латиницею або схожими кириличними І, Х): II, ІІІ, XXI
    const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    const ROMAN_VALID = /^(?:X{0,3})(?:IX|IV|V?I{0,3})$|^(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$|^C{0,3}(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;
    const romanLatin = (s) => s.replace(/І/g, 'I').replace(/Х/g, 'X');
    function romanToInt(s) {
        s = romanLatin(s);
        if (!s || !ROMAN_VALID.test(s)) return 0;
        let total = 0;
        for (let i = 0; i < s.length; i++) {
            const v = ROMAN[s[i]], next = ROMAN[s[i + 1]] || 0;
            total += v < next ? -v : v;
        }
        return total;
    }
    // Іменники, перед якими пишуть римське число, і відмінок за закінченням: "у II кварталі" → "другому"
    const ROMAN_M = /^(?:квартал|курс|клас|розділ|том|тур|етап|сезон|чемпіонат|форум|конкурс|пункт|параграф|турнір|корпус|поверх|з'їзд|фестивал|рів[ен]|ступ[іе]н|вік|кубк|кубок|міжнародн|всеукраїнськ|благодійн|ювілейн|щорічн|відкрит)/;
    const ROMAN_F = /^(?:глав|книг|серія|частин|груп|категорі|сесі|світов|олімпіад|ліг|конференці|рад|республік|династі|хвил|чверт|половин|ступін|світов)/;
    const ROMAN_N = /^(?:століт|сторіч|тисячоліт|скликан|ст\.$)/;
    function romanForm(word, gen) {
        const w = word.toLowerCase();
        let f = null;
        if (ROMAN_N.test(w)) f = /ям$/.test(w) ? 'm.ins' : /і$/.test(w) ? 'm.loc' : gen ? 'm.gen' : 'n.nom';
        else if (ROMAN_F.test(w)) f = /(?:ою|єю)$/.test(w) ? 'f.ins' : /(?:ої|и)$/.test(w) ? 'f.gen' : /(?:ій|і|ї)$/.test(w) ? (gen ? 'f.gen' : 'f.loc') : /[ую]$/.test(w) ? 'f.acc' : 'f.nom';
        else if (ROMAN_M.test(w)) f = /(?:ом|ем|єм|им)$/.test(w) ? 'm.ins' : /(?:ові|і)$/.test(w) ? 'm.loc' : /(?:ого|[уаяю])$/.test(w) ? 'm.gen' : 'm.nom';
        return f;
    }

    // Дні тижня: Пн-Пт → "з понеділка по п'ятницю"
    const DAYS = {
        пн: ['понеділок', 'понеділка', 'понеділок'], вт: ['вівторок', 'вівторка', 'вівторок'], ср: ['середа', 'середи', 'середу'],
        чт: ['четвер', 'четверга', 'четвер'], пт: ["п'ятниця", "п'ятниці", "п'ятницю"], сб: ['субота', 'суботи', 'суботу'], нд: ['неділя', 'неділі', 'неділю'],
    };
    // Читання доменів: ua → "юа", com → "ком"
    const DOMAIN_WORDS = { ua: 'юа', com: 'ком', net: 'нет', org: 'орг', info: 'інфо', io: 'ай-о', me: 'мі', biz: 'біз', shop: 'шоп', store: 'стор', app: 'епп', dev: 'дев', eu: 'еу', pl: 'пе-ел', de: 'де', uk: 'юкей', tv: 'ті-ві', fm: 'еф-ем', co: 'ко', in: 'ін', online: 'онлайн', www: 'дабл-ю дабл-ю дабл-ю' };
    // За одиницю: 100 грн/міс → "сто гривень на місяць"
    const PER = [
        ['міс(?:яць)?|мес', 'на місяць'], ['тиж(?:день)?', 'на тиждень'], ['день|дн', 'на день'], ['добу|доба', 'на добу'], ['рік', 'на рік'],
        ['год(?:ину)?', 'за годину'], ['хв', 'за хвилину'], ['шт', 'за штуку'], ['кг', 'за кілограм'], ['л', 'за літр'], ['м²|м2|кв\\.\\s?м', 'за квадратний метр'],
        ['ос(?:обу)?|люд(?:ину)?|чол', 'за особу'], ['ніч', 'за ніч'], ['км', 'за кілометр'], ['пару', 'за пару'], ['заняття', 'за заняття'],
    ];

    // Перетворення тексту. verbal = true — для вербалізатора: зберігає вигляд тексту (рядки, емоджі, знаки),
    // позначає слова, прочитані «за правилами» (GUESS_START…GUESS_END)
    function convert(input, verbal) {
        let t = String(input ?? '');

        // Однакові пробіли, лапки, тире, апострофи
        t = t.replace(/\r\n?/g, '\n').replace(/[   ]/g, ' ').replace(/[ \t]+/g, ' ')
             .replace(/[’ʼ`´]/g, "'").replace(/−/g, '-');

        // Посилання та пошта: протокол не читається, крапка → "крапка", @ → "собака", ua → "юа"
        const host = (h) => h.split('.').map((p, i, all) => (i === all.length - 1 || p === 'www') && DOMAIN_WORDS[p.toLowerCase()] ? DOMAIN_WORDS[p.toLowerCase()] : p).join(' крапка ');
        t = t.replace(/\b([\w.+-]+)@([\w-]+(?:\.[\w-]+)+)\b/g, (m, user, h) => ` ${user.replace(/\./g, ' крапка ').replace(/[_-]/g, ' ')} собака ${host(h)} `);
        t = t.replace(/\b(?:https?:\/\/)?((?:www\.)?(?:[a-z0-9-]+\.)+(?:com|ua|online|net|org|info|io|me|biz|shop|store|app|dev|eu|pl|de|uk|tv|fm|co|in\.ua|com\.ua))((?:\/[^\s]*)?)/gi,
            (m, h, path) => {
                const p = path.replace(/[.,!?)]+$/, '');
                return ` ${host(h.replace(/^www\./i, verbal ? 'www.' : ''))}${p.replace(/[/?=&#_-]+/g, ' слеш ').replace(/\s+слеш\s*$/, '')} ${path.slice(p.length)}`;
            });
        // Нік: @univoice_ua → "univoice ua" (собака не читається)
        t = t.replace(/(^|[\s(])@([A-Za-z0-9_.]*[A-Za-z0-9])/g, (m, pre, nick) => `${pre}${nick.replace(/[_.]+/g, ' ')}`);

        // Телефони: +380 67 123 45 67, (067) 123-45-67, 0800 300 545, 0671234567
        t = t.replace(/(^|[^\d\w])(\+?\(?\d[\d ()\-]{7,}\d)(?![\d\w])/g, (m, pre, ph) => {
            const digits = ph.replace(/\D/g, '');
            const phoneLike = /^\+/.test(ph) || /^\(/.test(ph) || /^0/.test(digits) || /^380/.test(digits);
            if (!phoneLike || digits.length < 9 || digits.length > 13) return m;
            let groups = ph.replace(/^\+/, '').split(/[\s()\-]+/).filter(Boolean);
            if (groups.length === 1) { // суцільні цифри: 380 67 123 45 67 / 067 123 45 67
                const g = groups[0], out = [];
                let i = 0;
                if (g.startsWith('380')) { out.push('380'); i = 3; }
                const rest = g.slice(i);
                const pattern = rest.length === 10 ? [3, 3, 2, 2] : rest.length === 9 ? [2, 3, 2, 2] : [3, 3, 3];
                let p = 0;
                pattern.forEach(n => { if (p < rest.length) { out.push(rest.slice(p, p + n)); p += n; } });
                if (p < rest.length) out.push(rest.slice(p));
                groups = out;
            }
            return `${pre}${/^\+/.test(ph) ? 'плюс ' : ''}${groups.map(digitGroup).join(', ')}`;
        });

        // Латинські літери й цифри разом: S24 → "S 24", 5G → "5 G" (але 5GB — одиниця)
        t = t.replace(/(?<![A-Za-z])([A-Za-z]{1,3})(?=\d)/g, '$1 ').replace(/(\d)(?=[A-Za-z](?![A-Za-z]))/g, '$1 ');

        // Довгі ряди чисел через пробіл (123 123 123 123 123 …) — окремі числа, а не одне величезне
        t = t.replace(/(?<![\d.,])\d{1,3}(?: \d{3}){4,}(?!\d)/g, m => m.replace(/ /g, ' ⁣'));

        // Дні тижня: Пн-Пт → "з понеділка по п'ятницю", Сб: 10:00 → "субота: …"
        const dayRe = Object.keys(DAYS).join('|');
        t = t.replace(new RegExp(`(?<!\\p{L})(${dayRe})\\.?\\s?[-–—]\\s?(${dayRe})\\.?(?!\\p{L})`, 'giu'), (m, a, b) =>
            `з ${DAYS[a.toLowerCase()][1]} по ${DAYS[b.toLowerCase()][2]}`);
        t = t.replace(new RegExp(`(?<!\\p{L})(${dayRe})\\.?(?=\\s?[,:]|\\s\\d)`, 'giu'), (m, a) => DAYS[a.toLowerCase()][0]);

        // Час через крапку: о 18.00, з 9.00 до 18.00, 9.30-18.30 → як 18:00
        const roundMin = /^(?:00|15|30|45)$/;
        t = t.replace(/(?<![\d.,])([01]?\d|2[0-3])\.([0-5]\d)(\s?[-–—]\s?)([01]?\d|2[0-3])\.([0-5]\d)(?![\d]|[.,]\d)/g, (m, h1, m1, dash, h2, m2) =>
            roundMin.test(m1) && roundMin.test(m2) ? `${h1}:${m1}${dash}${h2}:${m2}` : m);
        t = t.replace(/(?<!\p{L})(о|об|з|із|до|після|від)(\s)([01]?\d|2[0-3])\.([0-5]\d)(?![\d]|[.,]\d)/giu, (m, p, sp, h, mi) =>
            /^об?$/i.test(p) || roundMin.test(mi) ? `${p}${sp}${h}:${mi}` : m);

        // Дати: день у родовому ("дванадцятого травня"), а після "сьогодні", "на", "по" — "дванадцяте травня"
        const dayForm = (str, offset) => /^(?:сьогодні|завтра|вчора|післязавтра|на|по|це)$/.test(wordBefore(str, offset)) ? 'n.nom' : 'm.gen';
        // 12.05.2024, 01/09/24 → "дванадцятого травня дві тисячі двадцять четвертого року"
        t = t.replace(/\b(0?[1-9]|[12]\d|3[01])[./](0?[1-9]|1[0-2])[./](\d{4}|\d{2})(?!\d)(\s?(?:р\.|року)(?![А-Яа-яІіЇїЄєҐґ]))?/g, (m, d, mo, y, suffix, off, str) => {
            const year = y.length === 2 ? 2000 + +y : +y;
            const out = `${ordinalWords(+d, dayForm(str, off))} ${MONTHS_GEN[+mo - 1]} ${ordinalWords(year, 'm.gen')} року`;
            return suffix ? keepDot(m, off, str, out) : out;
        });
        // Дати без року: 25.11 → "двадцять п'ятого листопада", 25.11-30.11 → "з двадцять п'ятого по тридцяте листопада"
        const notAmount = `(?![\\d]|[.,]\\d)(?!\\s?(?:%|${CURRENCY_RE}|${UNIT_RE})(?![${LETTER}]))`;
        t = t.replace(new RegExp(`(?<![\\d.,:$€£₴])(0?[1-9]|[12]\\d|3[01])\\.(0[1-9]|1[0-2])\\s?[-–—]\\s?(0?[1-9]|[12]\\d|3[01])\\.(0[1-9]|1[0-2])${notAmount}`, 'g'), (m, d1, m1, d2, m2, off, str) => {
            const pre = isGen(str, off) ? '' : 'з ';
            return m1 === m2
                ? `${pre}${ordinalWords(+d1, 'm.gen')} по ${ordinalWords(+d2, 'n.nom')} ${MONTHS_GEN[+m2 - 1]}`
                : `${pre}${ordinalWords(+d1, 'm.gen')} ${MONTHS_GEN[+m1 - 1]} по ${ordinalWords(+d2, 'n.nom')} ${MONTHS_GEN[+m2 - 1]}`;
        });
        t = t.replace(new RegExp(`(?<![\\d.,:$€£₴])(0?[1-9]|[12]\\d|3[01])\\.(0[1-9]|1[0-2])${notAmount}`, 'g'), (m, d, mo, off, str) =>
            `${ordinalWords(+d, dayForm(str, off))} ${MONTHS_GEN[+mo - 1]}`);
        const monthRe = MONTHS_GEN.join('|');
        // з 1 по 5 травня → "з першого по п'яте травня"; від 1 до 5 травня → "від першого до п'ятого травня"
        t = t.replace(new RegExp(`(?<!\\p{L})(з|із|від)\\s(\\d{1,2})\\s(по|до)\\s(\\d{1,2})\\s(${monthRe})`, 'giu'), (m, a, d1, b, d2, mo) =>
            `${a} ${ordinalWords(+d1, 'm.gen')} ${b} ${ordinalWords(+d2, b.toLowerCase() === 'по' ? 'n.nom' : 'm.gen')} ${mo}`);
        // 1-5 травня → "з першого по п'яте травня"; 12 травня → "дванадцятого травня"
        t = t.replace(new RegExp(`\\b(\\d{1,2})(?:\\s?[-–—]\\s?(\\d{1,2}))?\\s(${monthRe})`, 'gi'), (m, d1, d2, mo, off, str) =>
            d2 ? `${isGen(str, off) ? '' : 'з '}${ordinalWords(+d1, 'm.gen')} по ${ordinalWords(+d2, 'n.nom')} ${mo}` : `${ordinalWords(+d1, dayForm(str, off))} ${mo}`);

        // Роки: 2024 р., 2024 року, у 2024 році, 1990-ті
        t = t.replace(/\b(\d{4})\s?(?:р\.|рік|року|році|роком)(?![А-Яа-яІіЇїЄєҐґ])/g, (m, y, off, str) => {
            const tail = m.slice(y.length).trim();
            const form = tail === 'р.' || tail === 'року' ? 'm.gen' : tail === 'році' ? 'm.loc' : tail === 'роком' ? 'm.dat' : 'm.nom';
            const noun = tail === 'р.' ? 'року' : tail;
            return keepDot(m, off, str, `${ordinalWords(+y, form)} ${noun}`);
        });
        t = t.replace(/\b(\d{4})\s?[-–—]\s?(\d{4})\s?рр\./g, (m, a, b) => `${ordinalWords(+a, 'm.nom')} – ${ordinalWords(+b, 'm.nom')} роки`);
        // з 2020 по 2023 → "з дві тисячі двадцятого по дві тисячі двадцять третій"
        t = t.replace(/(?<!\p{L})(з|із|від)\s((?:19|20)\d\d)\s(по|до)\s((?:19|20)\d\d)(?![\d.,]\d|\d|\s?(?:р\.|рік|року|рр|грн|₴|\$|€|%))/giu, (m, a, y1, b, y2) =>
            `${a} ${ordinalWords(+y1, 'm.gen')} ${b} ${ordinalWords(+y2, b.toLowerCase() === 'по' ? 'm.nom' : 'm.gen')}`);
        // Рік без слова "рік": у 2024, з 2020 по 2023 → "у дві тисячі двадцять четвертому", "з дві тисячі двадцятого"
        t = t.replace(/(?<!\p{L})(у|в|з|із|після|по)\s((?:19|20)\d\d)(?=\s*(?:$|[.,;:!?)»"])|\s(?:по|до|і|та|ми|ви|вони|він|вона|я|компанія|команда|бренд|магазин)(?!\p{L}))/giu, (m, p, y) =>
            `${p} ${ordinalWords(+y, /^[ув]$/i.test(p) ? 'm.loc' : p.toLowerCase() === 'по' ? 'm.nom' : 'm.gen')}`);

        // Час: 18:30 → "вісімнадцята тридцять", о 9:05 → "о дев'ятій нуль п'ять", до 18:00 → "до вісімнадцятої"
        const clock = (h, mi, form) => `${ordinalWords(+h, form)}${mi === '00' ? '' : ' ' + (mi[0] === '0' ? 'нуль ' + numberToWords(+mi[1]) : numberToWords(+mi))}`;
        const clockForm = (str, off) => {
            const w = wordBefore(str, off);
            return w === 'о' || w === 'об' ? 'f.loc' : w === 'на' ? 'f.acc' : GEN_PREPS.has(w) ? 'f.gen' : 'f.nom';
        };
        t = t.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\s?[-–—]\s?([01]?\d|2[0-3]):([0-5]\d)\b/g, (m, h1, m1, h2, m2, off, str) =>
            `${isGen(str, off) ? '' : 'з '}${clock(h1, m1, 'f.gen')} до ${clock(h2, m2, 'f.gen')}`);
        t = t.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (m, h, mi, off, str) => clock(h, mi, clockForm(str, off)));
        // о 9 ранку → "о дев'ятій ранку"
        t = t.replace(/(^|[^\p{L}])(о|об|О|Об)\s(1?\d|2[0-4])(?![\d,:\-]|\.\d)/gu, (m, pre, o, h) => `${pre}${o} ${ordinalWords(+h, 'f.loc')}`);

        // Римські числа: XXI століття → "двадцять перше століття", у II кварталі → "у другому кварталі", ІІ курс → "другий курс"
        t = t.replace(/(?<![\p{L}\d])([IVXІХ]{1,6})(\s?)([\p{L}']+\.?)/gu, (m, r, sp, word, off, str) => {
            const n = romanToInt(r);
            const w = word.replace(/\.$/, '');
            const form = n && romanForm(word === 'ст.' ? word : w, isGen(str, off));
            if (!form || (!sp && word !== 'ст.')) return m;
            if (r.length === 1 && /^[ІХ]$/.test(r) && !ROMAN_N.test(word) && !/^(?:квартал|курс|клас|розділ|етап|тур|сезон|частин|груп|категорі)/.test(w.toLowerCase())) return m;
            const tail = word === 'ст.' ? 'століття' : word;
            return `${ordinalWords(n, form)}${sp || ' '}${tail}`;
        });
        // Іменник перед римським числом: розділ IV → "розділ четвертий", глава II → "глава друга"
        t = t.replace(/(?<!\p{L})([\p{L}']{2,})\s([IVXІХ]{1,6})(?![\p{L}\d])/gu, (m, word, r) => {
            const n = romanToInt(r), w = word.toLowerCase();
            if (!n || (/^[ІХ]$/.test(r))) return m;
            const g = ROMAN_N.test(w) ? 'n.nom' : (ROMAN_F.test(w) || /^(?:глав|книг|серія|частина)/.test(w)) ? 'f.nom' : ROMAN_M.test(w) ? 'm.nom' : null;
            return g ? `${word} ${ordinalWords(n, g)}` : m;
        });
        // Імена з римським числом: Петро I → "Петро Перший", Єлизавета II → "Єлизавета Друга"
        t = t.replace(/(?<!\p{L})(\p{Lu}[\p{Ll}']{2,})\s([IVX]{1,4})(?![\p{L}\d])/gu, (m, name, r) => {
            const n = romanToInt(r);
            if (!n || !/[а-яіїєґ]/.test(name)) return m;
            const word = ordinalWords(n, /[ая]$/.test(name) ? 'f.nom' : 'm.nom');
            return `${name} ${word[0].toUpperCase()}${word.slice(1)}`;
        });

        // Складні слова: 5-річний → "п'ятирічний", 2-кімнатна → "двокімнатна", 100-річчя → "сторіччя"
        t = t.replace(new RegExp(`\\b(\\d{1,4})\\s?-\\s?([а-яіїєґ']{5,})`, 'g'), (m, n, word) => combiningForm(+n) + word);
        // Порядкові з закінченням: 5-й, 21-го, 1-ша, 3-тя, 90-ті; але 5-ти, 2-х → "п'яти", "двох"
        t = t.replace(new RegExp(`\\b(\\d+)\\s?-\\s?([а-яіїєґ]{1,4})(?![${LETTER}])`, 'g'), (m, n, suf) => {
            const s = suf.toLowerCase();
            if (/^(?:ти|ми|и|ох|ьох|х)$/.test(s) && !(s === 'х' && +n >= 10 && +n % 10 === 0)) return numberToWordsGen(+n);
            return ordinalWords(+n, ordinalForm(suf));
        });

        // Знаки перед числом: +5, -5, ~100 (до грошей і відсотків: "-50%" → "мінус п'ятдесят відсотків")
        t = t.replace(/(^|[\s(])\+\s?(?=\d)/g, '$1плюс ');
        t = t.replace(/(^|[\s(])-(?=\d)/g, '$1мінус ');
        t = t.replace(/(^|[\s(])[~≈]\s?(?=\d)/g, '$1близько ');

        // Діапазони з одиницями: 5-7% → "від п'яти до семи відсотків", на 2-3 км → "на два-три кілометри"
        t = t.replace(new RegExp(`(?<![\\d.,:])(${NUM})\\s?[-–—]\\s?(${NUM})\\s?(%|${CURRENCY_RE}|${UNIT_RE})(?![${LETTER}\\d])`, 'g'), (m, a, b, unit, off, str) => {
            let gender = 'm', forms = PERCENT_FORMS;
            if (unit !== '%') {
                const code = currencyCode(unit);
                const u = code ? null : UNITS.find(x => new RegExp(`^(?:${x[0]})$`).test(unit));
                if (code) ({ gender, forms } = CURRENCIES[code]);
                else if (u) { gender = u[1]; forms = u[2]; }
                else return m;
            }
            const x = +cleanNum(a), y = +cleanNum(b);
            const prep = wordBefore(str, off);
            let out;
            if (GEN_PREPS.has(prep)) out = `${numberToWordsGen(x, gender)}-${countWords(y, gender, forms, true)}`;
            else if (RANGE_PREPS.has(prep)) out = `${numberToWords(x, gender)}-${countWords(y, gender, forms, false)}`;
            else out = `від ${numberToWordsGen(x, gender)} до ${countWords(y, gender, forms, true)}`;
            return keepDot(m, off, str, out);
        });

        // Гроші: 1 499,99 грн, $100, 100$, 5 тис. грн, €3.50
        t = t.replace(new RegExp(`(${CURRENCY_RE})\\s?(${NUM})(?:[.,](\\d{1,2}))?(?![\\d]|[.,]\\d)(?!\\s?(?:${CURRENCY_RE})(?![${LETTER}]))`, 'gi'), (m, sign, int, frac, off, str) => {
            const code = currencyCode(sign);
            return code && !/^[а-яіїєґ]/i.test(sign) ? (off && /\S/.test(str[off - 1]) ? ' ' : '') + moneyWords(int, frac, code, isGen(str, off)) : m;
        });
        t = t.replace(new RegExp(`(?<![\\d.,])(${NUM})(?:[.,](\\d{1,2}))?\\s?(тис\\.?|млн\\.?|млрд\\.?)?\\s?(${CURRENCY_RE})(?![${LETTER}])`, 'gi'), (m, int, frac, scale, sign, off, str) => {
            const code = currencyCode(sign);
            if (!code) return m;
            const c = CURRENCIES[code];
            if (scale) { // 5 тис. грн → "п'ять тисяч гривень"
                const unit = UNITS.find(u => new RegExp(`^(?:${u[0]})$`).test(scale));
                const num = frac ? `${decimalWords(cleanNum(int), frac)} ${unit[2][3]}` : countWords(+cleanNum(int), unit[1], unit[2], isGen(str, off));
                return keepDot(m, off, str, `${num} ${c.forms[2]}`);
            }
            return keepDot(m, off, str, moneyWords(int, frac, code, isGen(str, off)));
        });

        // Відсотки: 15% → "п'ятнадцять відсотків", 2,5% → "два з половиною відсотка"
        t = t.replace(new RegExp(`(${NUM})(?:[.,](\\d+))?\\s?%`, 'g'), (m, int, frac, off, str) => frac
            ? `${decimalWords(cleanNum(int), frac)} відсотка`
            : countWords(+cleanNum(int), 'm', PERCENT_FORMS, isGen(str, off)));
        t = t.replace(/(\S?)%/g, (m, pre) => `${pre}${pre && pre !== ' ' ? ' ' : ''}відсотків`);

        // Номер: №5, # 3
        t = t.replace(/(\S?)[№#]\s?(?=\d)/g, (m, pre) => `${pre}${pre && pre !== ' ' && pre !== '(' ? ' ' : ''}номер `);
        t = t.replace(/(^|[\s(])#(?=[A-Za-zА-Яа-яІіЇїЄєҐґ])/g, verbal ? '$1хештег ' : '$1 хештег ');

        // Дюйми: 55" → "п'ятдесят п'ять дюймів" (лише якщо лапка не закриває цитату)
        t = t.replace(/(?<![\d.,])(\d{1,3})(?:[.,](\d))?(″|")(?=[\s,.;)]|$)/g, (m, int, frac, q, off, str) => {
            if (q === '"' && (str.slice(0, off).match(/"/g) || []).length % 2) return m;
            const forms = ['дюйм', 'дюйми', 'дюймів', 'дюйма'];
            return frac ? `${decimalWords(int, frac)} ${forms[3]}` : countWords(+int, 'm', forms, isGen(str, off));
        });

        // Одиниці: 5 км, 2,5 кг, 3 тис., 10 млн
        UNITS.forEach(([re, gender, forms]) => {
            const rx = new RegExp(`(?<![\\d.,])(${NUM})(?:[.,](\\d+))?\\s?(?:${re})(?![${LETTER}\\d])`, 'g');
            t = t.replace(rx, (m, int, frac, off, str) => keepDot(m, off, str, frac
                ? `${decimalWords(cleanNum(int), frac)} ${forms[3]}`
                : countWords(+cleanNum(int), gender, forms, isGen(str, off))));
        });
        // За одиницю: гривень/міс → "гривень на місяць"
        PER.forEach(([re, words]) => {
            t = t.replace(new RegExp(`(?<=[\\p{L}\\d])\\s?\\/\\s?(?:${re})\\.?(?![\\p{L}\\d])`, 'gu'), ` ${words}`);
        });

        // Дії й рахунок: 2+2=4 → "два плюс два дорівнює чотири", 24/7 → "двадцять чотири на сім", 3:1 → "три – один", 18+ → "вісімнадцять плюс"
        t = t.replace(/\b24\/7\b/g, 'двадцять чотири на сім');
        t = t.replace(/(\d)\s?\+\s?(?=\d)/g, '$1 плюс ').replace(/(\d)\s?=\s?(?=\d)/g, '$1 дорівнює ');
        t = t.replace(/(\d)\+(?![\d\p{L}])/gu, '$1 плюс');
        t = t.replace(/\b(\d{1,2}):(\d{1,2})\b/g, '$1 ⁣$2');

        // Дроби: 1/2 → "одна друга", 3/4 → "три четвертих", 2 1/2 → "два з половиною", 16/9 → "шістнадцять на дев'ять", 5/5 → "п'ять із п'яти"
        const fraction = (n, d) => `${numberToWords(n, 'f')} ${ordinalWords(d, n % 10 === 1 && n % 100 !== 11 ? 'f.nom' : 'pl.gen')}`;
        t = t.replace(/\b(\d{1,3}) (\d{1,2})\/(\d{1,2})\b/g, (m, i, a, b) => +a && +b > +a
            ? `${numberToWords(+i)} ${+a === 1 && +b === 2 ? 'з половиною' : 'і ' + fraction(+a, +b)}` : m);
        t = t.replace(/\b(\d{1,4})\/(\d{1,4})\b/g, (m, a, b, off, str) => {
            if (!+b) return m;
            if (/(?:будинок|буд|корпус|корп|кв|квартира|офіс|оф|№)\.?\s*$/i.test(str.slice(Math.max(0, off - 12), off))) return `${numberToWords(+a)} дріб ${numberToWords(+b)}`;
            if (+a === +b && +a !== 50) return `${numberToWords(+a)} із ${numberToWordsGen(+a)}`;
            if (+a >= +b) return `${numberToWords(+a)} на ${numberToWords(+b)}`;
            return fraction(+a, +b);
        });

        // Діапазони: 10-15 → "від десяти до п'ятнадцяти", 2-3 дні → "два-три дні", 1-2 години → "одна-дві години"
        t = t.replace(new RegExp(`(?<![\\d.,])(${NUM})\\s?[-–—]\\s?(${NUM})(?![\\d.,]\\d|\\d)`, 'g'), (m, a, b, off, str) => {
            const x = +cleanNum(a), y = +cleanNum(b);
            const next = wordAfter(str, off + m.length);
            const prep = wordBefore(str, off);
            const g = next ? nounGender(next, y) : 'm';
            if (x >= 1900 && y > x && y <= 2099 && y - x <= 50) { // роки: 2024-2025 → "дві тисячі двадцять четвертий – дві тисячі двадцять п'ятий"
                const f = /^рок(?:ах)$/.test(next) ? 'pl.nom' : /^років$/.test(next) || GEN_PREPS.has(prep) ? 'm.gen' : 'm.nom';
                const form = f === 'pl.nom' ? 'm.loc' : f;
                return `${ordinalWords(x, form)} – ${ordinalWords(y, form)}`;
            }
            if (GEN_PREPS.has(prep)) return `${numberToWordsGen(x, g)}-${numberToWordsGen(y, g)}`;
            if (next && /^[а-яіїєґ]/.test(next) || RANGE_PREPS.has(prep)) return `${numberToWords(x, g)}-${numberToWords(y, g)}`;
            return `від ${x === 0 ? 'нуля' : numberToWordsGen(x)} до ${numberToWordsGen(y)}`;
        });

        // Множення: 2×2, 1920x1080
        t = t.replace(/(\d)\s?[x×х]\s?(?=\d)/g, '$1 на ');

        // Тисячі через крапку чи кому: 1.500 / 2,000,000
        t = t.replace(/\b([1-9]\d{0,2})((?:[.,]\d{3})+)(?![\d.,]\d)/g, (m, a, rest) => {
            const groups = rest.split(/[.,]/).slice(1);
            const sameSep = new Set(rest.match(/[.,]/g)).size === 1;
            if (groups.length === 1 && rest[0] === ',' && !/0$/.test(groups[0])) return m; // 1,125 — швидше десятковий дріб
            return sameSep ? a + groups.join('') : m;
        });

        // Десяткові дроби: 1,5 / 0.75
        t = t.replace(new RegExp(`(?<![\\d.,])(${NUM})[.,](\\d+)(?![\\d.,]\\d)`, 'g'), (m, int, frac) => decimalWords(cleanNum(int), frac));

        // Решта чисел: 1 000 000, 123, 007; рід за іменником: 1 година → "одна година", 2 кімнати → "дві кімнати"
        t = t.replace(new RegExp(`(${NUM})`, 'g'), (m, n, off, str) => {
            const s = cleanNum(m);
            if (s.length > 1 && s[0] === '0') return digitsToWords(s);
            if (s.length > 15) return digitsToWords(s);
            const next = wordAfter(str, off + m.length);
            const g = next ? nounGender(next, +s) : 'm';
            return isGen(str, off) ? numberToWordsGen(+s, g) : numberToWords(+s, g);
        });

        // Скорочення
        ABBREVIATIONS.forEach(([re, rep, canEnd]) => {
            t = t.replace(re, (m, pre, off, str) => canEnd ? keepDot(m, off, str, rep.replace('$1', pre)) : rep.replace('$1', pre));
        });

        // Символи між словами
        t = t.replace(/\s&\s/g, ' і ').replace(/\s\+\s/g, ' плюс ').replace(/\s=\s/g, ' дорівнює ').replace(/@/g, ' собака ');
        t = t.replace(/(?<=[A-Za-z])&(?=[A-Za-z])/g, ' енд ');
        if (!verbal) t = t.replace(new RegExp(`([${LETTER}])\\/([${LETTER}])`, 'g'), '$1 $2');

        // Окремі римські числа: розділ II → "розділ другий"
        t = t.replace(/(?<![\p{L}\d-])([IVXІХ]{2,6})(?![\p{L}\d-])/gu, (m, r) => {
            const n = romanToInt(r);
            return n && (/[IVX]/.test(r) || /^[ІХ]+$/.test(r)) ? ordinalWords(n, 'm.nom') : m;
        });

        // Слова й абревіатури
        t = readWords(t, verbal);

        if (!verbal) t = t.replace(/[^\p{L}\p{N}\s.,;:!?…()\-–—'"«»„“”]/gu, ' '); // емоджі, зірочки тощо не звучать
        return t.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/ ([,.;:!?…)])/g, '$1').replace(/\( /g, '(').trim();
    }

    // Великі літери як у джерелі: SALE → "СЕЙЛ", Apple → "Епл"
    function matchCase(src, out) {
        if (src.length > 1 && src === src.toUpperCase()) return out.includes('-') || src.length < 4 ? out : out.toUpperCase();
        if (src.length > 1 && src[0] !== src[0].toLowerCase()) return out[0].toUpperCase() + out.slice(1);
        return out;
    }

    // Латинське слово: зі словника, по літерах (BMW), або за правилами вимови (позначається як припущення)
    function readLatin(w, spell) {
        const key = w.toLowerCase();
        if (FOREIGN_WORDS[key]) return { r: FOREIGN_WORDS[key], guess: false };
        if (spell) return { r: spellAcronym(w), guess: false };
        if (/-/.test(w)) { // Wi-Fi-роутер, e-commerce
            const parts = w.split('-').map(p => (/[A-Za-z]/.test(p) ? readLatin(p, p.length > 1 && p === p.toUpperCase() && !readsAsWord(p)) : { r: p, guess: false }));
            return { r: parts.map(p => p.r).join('-'), guess: parts.some(p => p.guess) };
        }
        const camel = w.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g);
        if (camel && camel.length > 1 && camel.join('') === w) { // PlayStation, SmartWatch
            const parts = camel.map(p => readLatin(p, false));
            return { r: parts.map(p => p.r).join(''), guess: parts.some(p => p.guess) };
        }
        if (w.length === 1) return { r: LAT_LETTERS[w.toUpperCase()], guess: false };
        return { r: translitEn(w), guess: true };
    }

    // Абревіатури по літерах (ТОВ → "те-о-ве"), але слова, написані великими для наголосу, читаються як слова:
    // "ТІЛЬКИ СЬОГОДНІ ВСЕ ЗА ПІВЦІНИ". Латинські слова — українськими літерами
    function readWords(t, verbal) {
        const re = /[A-Za-zА-ЯІЇЄҐа-яіїєґ]+(?:[-'][A-Za-zА-ЯІЇЄҐа-яіїєґ]+)*/g;
        const tokens = [...t.matchAll(re)];
        const upper = tokens.map(m => m[0].length >= 2 && /^[A-ZА-ЯІЇЄҐ]+$/.test(m[0]));
        const shout = tokens.map((m, i) => upper[i] && (readsAsWord(m[0]) || (/^[A-Z]+$/.test(m[0]) && !!FOREIGN_WORDS[m[0].toLowerCase()] && !FOREIGN_WORDS[m[0].toLowerCase()].includes('-'))));
        let out = '', last = 0;
        tokens.forEach((m, i) => {
            const w = m[0];
            let r = w;
            if (SPECIAL_WORDS[w]) r = SPECIAL_WORDS[w];
            else if (/[A-Za-z]/.test(w)) {
                const inShout = upper[i] && (shout[i - 1] || shout[i + 1]) && UPPER_VOWEL.test(w);
                const spell = upper[i] && !shout[i] && !inShout;
                let latin;
                if (/[А-Яа-яІіЇїЄєҐґ]/.test(w)) { // Wi-Fi-роутер
                    const parts = [];
                    w.split('-').forEach(p => {
                        const isLat = /^[A-Za-z']+$/.test(p), prev = parts[parts.length - 1];
                        if (isLat && prev && prev.lat) prev.s += '-' + p; else parts.push({ s: p, lat: isLat });
                    });
                    const read = parts.map(p => (p.lat ? readLatin(p.s, p.s.length > 1 && p.s === p.s.toUpperCase() && !readsAsWord(p.s)) : { r: p.s, guess: false }));
                    latin = { r: read.map(p => p.r).join('-'), guess: read.some(p => p.guess) };
                } else latin = readLatin(w, spell);
                r = verbal ? matchCase(w, latin.r) : latin.r;
                if (verbal && latin.guess) r = GUESS_START + r + GUESS_END;
            } else if (upper[i]) {
                const inShout = (shout[i - 1] || shout[i + 1]) && !SPELLED.has(w) && UPPER_VOWEL.test(w);
                if (shout[i] || inShout) r = verbal ? w : w.toLowerCase();
                else r = spellAcronym(w);
            }
            out += t.slice(last, m.index) + r;
            last = m.index + w.length;
        });
        return out + t.slice(last);
    }

    // Текст так, як його буде прочитано (для Хрономіра)
    function normalize(input) {
        return convert(input, false);
    }

    /* =================================================================
       4а. ВЕРБАЛІЗАТОР
       verbalize(text) — той самий текст, але числа, дати, суми, скорочення,
       абревіатури й іншомовні слова написані українськими словами.
       Рядки, розділові знаки й емоджі лишаються на місці.
       verbalizeParts(text) — те саме частинами: [{ t, changed, guess, src: [від, до] }],
       src — місце частини у вихідному тексті (для перенесення наголосів).
       ================================================================= */
    const DIFF_TOKEN = /[^]*|[\p{L}\p{N}'’ʼ]+(?:-[\p{L}\p{N}'’ʼ]+)*|\s+|./gsu;

    // Найкоротша різниця між двома списками слів (алгоритм Маєрса): ['=', i, j] | ['-', i] | ['+', null, j]
    function diffTokens(a, b) {
        const n = a.length, m = b.length, max = n + m, off = max + 1;
        const v = new Int32Array(2 * max + 3);
        const trace = [];
        for (let d = 0; d <= max; d++) {
            trace.push(v.slice(off - d - 1, off + d + 2));
            for (let k = -d; k <= d; k += 2) {
                let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
                let y = x - k;
                while (x < n && y < m && a[x] === b[y]) { x++; y++; }
                v[off + k] = x;
                if (x >= n && y >= m) return backtrack(trace, n, m, d);
            }
        }
        return [];
    }
    function backtrack(trace, n, m, dEnd) {
        const ops = [];
        let x = n, y = m;
        for (let d = dEnd; d > 0; d--) {
            const vv = trace[d], get = (k) => vv[k + d + 1];
            const k = x - y;
            const prevK = (k === -d || (k !== d && get(k - 1) < get(k + 1))) ? k + 1 : k - 1;
            const prevX = get(prevK), prevY = prevX - prevK;
            while (x > prevX && y > prevY) { ops.push(['=', x - 1, y - 1]); x--; y--; }
            if (x === prevX) ops.push(['+', null, y - 1]); else ops.push(['-', x - 1, null]);
            x = prevX; y = prevY;
        }
        while (x > 0 && y > 0) { ops.push(['=', x - 1, y - 1]); x--; y--; }
        return ops.reverse();
    }

    function verbalizeParts(input) {
        const text = String(input ?? '').replace(/\r\n?/g, '\n');
        // апостроф як у джерелі: якщо диктор пише ’ — вербалізатор теж
        const apostrophe = /[’ʼ]/.test(text) && !/'/.test(text) ? text.match(/[’ʼ]/)[0] : "'";
        const parts = [];
        // Частина тексту: перетворюємо і порівнюємо слово за словом, щоб знати, що змінилося
        const segment = (seg, segPos) => {
            // дуже довге речення ділимо ще й по комах (порівняння довгих шматків повільне)
            if (seg.length > 700) {
                const cut = seg.slice(0, 600).search(/[,;:]\s+(?=[^,;:]*$)/);
                if (cut > 100) {
                    const end = cut + 1, ws = seg.slice(end).match(/^\s+/)[0];
                    segment(seg.slice(0, end), segPos);
                    parts.push({ t: ws, changed: false, src: [segPos + end, segPos + end + ws.length] });
                    return segment(seg.slice(end + ws.length), segPos + end + ws.length);
                }
            }
            let out = convert(seg, true).replace(/⁣/g, '');
            if (apostrophe !== "'") out = out.replace(/'/g, apostrophe);
            const a = seg.match(DIFF_TOKEN) || [], b = out.match(DIFF_TOKEN) || [];
            const aPos = [];
            a.reduce((p, tok) => { aPos.push(p); return p + tok.length; }, segPos);
            const ops = diffTokens(a, b);
            for (let i = 0; i < ops.length;) {
                if (ops[i][0] === '=') {
                    const ai = ops[i++][1];
                    parts.push({ t: a[ai], changed: false, src: [aPos[ai], aPos[ai] + a[ai].length] });
                    continue;
                }
                const removed = [], added = [];
                for (; i < ops.length && ops[i][0] !== '='; i++) {
                    if (ops[i][0] === '-') removed.push(ops[i][1]); else added.push(b[ops[i][2]]);
                }
                const last = removed[removed.length - 1];
                const src = removed.length ? [aPos[removed[0]], aPos[last] + a[last].length] : null;
                added.forEach(tok => {
                    if (/^\s+$/.test(tok)) return parts.push({ t: tok, changed: false, src: null });
                    const guess = tok[0] === GUESS_START;
                    parts.push({ t: guess ? tok.slice(1, -1) : tok, changed: true, guess, src });
                });
            }
        };
        let pos = 0;
        text.split('\n').forEach((line, li) => {
            if (li) parts.push({ t: '\n', changed: false, src: [pos - 1, pos] });
            // Рядок ділимо на речення (крапка після звичайного слова + велика літера), щоб довгий текст оброблявся швидко
            let start = 0;
            const re = /([\p{L}\p{N}]*)([.!?…]+["»”)]*)(\s+)(?=[\p{Lu}«"])/gu;
            let m;
            while ((m = re.exec(line))) {
                if (m[2][0] === '.' && /^\p{L}{0,3}$/u.test(m[1])) continue; // м. Київ, 100 грн. Далі — не ділимо
                const end = m.index + m[0].length - m[3].length;
                segment(line.slice(start, end), pos + start);
                parts.push({ t: m[3], changed: false, src: [pos + end, pos + end + m[3].length] });
                start = end + m[3].length;
            }
            if (start < line.length) segment(line.slice(start), pos + start);
            pos += line.length + 1;
        });

        // Склеюємо сусідні частини: "п'ять" + " " + "кілометрів" → одна змінена частина
        const merged = [];
        parts.forEach(p => {
            if (!p.t) return;
            const prev = merged[merged.length - 1], prev2 = merged[merged.length - 2];
            const sameKind = (x) => x && x.changed && x.guess === p.guess;
            const join = (x, y) => (x && y ? [Math.min(x[0], y[0]), Math.max(x[1], y[1])] : x || y);
            if (p.changed && prev && !prev.changed && /^ +$/.test(prev.t) && sameKind(prev2)) {
                prev2.t += prev.t + p.t;
                prev2.src = join(prev2.src, p.src);
                merged.pop();
            } else if (p.changed && sameKind(prev)) {
                prev.t += p.t;
                prev.src = join(prev.src, p.src);
            } else if (!p.changed && prev && !prev.changed && prev.src && p.src && prev.src[1] === p.src[0]) {
                prev.t += p.t;
                prev.src = [prev.src[0], p.src[1]];
            } else {
                merged.push({ t: p.t, changed: p.changed, guess: !!p.guess, src: p.src ? p.src.slice() : null });
            }
        });

        // Велика літера на початку речення: "5 кг" → "П'ять кілограмів"
        let out = '';
        merged.forEach(p => {
            if (p.changed && /(?:^|[.!?…]["»”)]*\s+|\n\s*)$/.test(out) && /^\p{Ll}/u.test(p.t)) {
                const first = p.src ? text.slice(p.src[0], p.src[1]).match(/[\p{L}\p{N}]/u) : null;
                if (!first || !/\p{Ll}/u.test(first[0])) p.t = p.t[0].toUpperCase() + p.t.slice(1);
            }
            out += p.t;
        });
        return merged;
    }

    function verbalize(input) {
        return verbalizeParts(input).map(p => p.t).join('');
    }

    /* =================================================================
       5. ПІДРАХУНОК ЗВУКІВ, СКЛАДІВ, ПАУЗ І ЧАСУ
       ================================================================= */
    const CYR_VOWELS = 'аеєиіїоуюя';
    const IOTATED = 'єюяї';  // на початку слова чи після голосного — ще й звук [й]
    const WORD_RE = /\p{L}+(?:['\-]\p{L}+)*/gu;

    function wordSounds(word) {
        const w = word.toLowerCase();
        let vowels = 0, consonants = 0;
        if (/[a-z]/.test(w) && !/[а-яіїєґ]/.test(w)) { // латиниця: склади за групами голосних
            const groups = (w.match(/[aeiouy]+/g) || []).length;
            vowels = Math.max(1, groups - (/[^aeiouy]e$/.test(w) && groups > 1 ? 1 : 0));
            consonants = (w.match(/[b-df-hj-np-tv-xz]/g) || []).length;
            return { vowels, consonants };
        }
        const chars = [...w];
        chars.forEach((ch, i) => {
            if (CYR_VOWELS.includes(ch)) {
                vowels++;
                const prev = chars[i - 1];
                if (ch === 'ї' || (IOTATED.includes(ch) && (!prev || CYR_VOWELS.includes(prev) || prev === "'" || prev === '-'))) consonants++;
            } else if (ch === 'щ') consonants += 2;
            else if (/[а-яіїєґ]/.test(ch) && ch !== 'ь') consonants++;
        });
        consonants -= (w.match(/д[жз]/g) || []).length; // дж, дз — один звук
        return { vowels, consonants: Math.max(0, consonants) };
    }

    function countPauses(spoken) {
        const P = CONFIG.PAUSE;
        // паузи рахуються лише між словами: на початку й у кінці тексту їх немає
        const body = spoken.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
        let seconds = 0, count = 0;
        const add = (n, sec) => { count += n; seconds += n * sec; };
        add((body.match(/[.!?…]+/g) || []).length, P.sentence);
        add((body.match(/[,;:]|\s[-–—]\s/g) || []).length, P.comma);
        add((body.match(/[()]/g) || []).length, P.bracket);
        const lines = body.split(/\n+/);
        for (let i = 0; i < lines.length - 1; i++) {
            if (/[.!?…]["»”]?\s*$/.test(lines[i])) add(1, P.paragraph);
            else if (/[,;:]\s*$/.test(lines[i])) add(1, P.paragraph);
            else add(1, P.sentence); // рядок без розділового знака — як кінець речення
        }
        return { count, seconds };
    }

    function analyze(text) {
        const spoken = normalize(text);
        const words = spoken.match(WORD_RE) || [];
        let vowels = 0, consonants = 0;
        words.forEach(w => { const s = wordSounds(w); vowels += s.vowels; consonants += s.consonants; });
        const hasSpeech = words.length > 0;
        const pauses = hasSpeech ? countPauses(spoken) : { count: 0, seconds: 0 };
        const speech = (vowels * CONFIG.VOWEL + consonants * CONFIG.CONSONANT) * CONFIG.PACE;
        return {
            spoken,
            hasSpeech,
            words: words.length,
            syllables: vowels,
            sounds: vowels + consonants,
            pauses: pauses.count,
            seconds: hasSpeech ? speech + pauses.seconds * CONFIG.PACE : 0,
        };
    }

    const api = { version: '1.2.0', CONFIG, analyze, normalize, verbalize, verbalizeParts, numberToWords, numberToWordsGen, ordinalWords, plural };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.UnivoiceSpeech = api;
})(typeof window !== 'undefined' ? window : this);
