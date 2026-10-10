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

   ЗМІСТ
   1. Налаштування темпу і пауз  ← редагувати тут
   2. Числа словами (кількісні, порядкові, родовий відмінок)
   3. Словники: місяці, валюти, одиниці, скорочення, абревіатури
   4. Нормалізація тексту (правила застосовуються по черзі)
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
        hard: { 'm.nom': 'ий', 'm.gen': 'ого', 'm.dat': 'ому', 'm.loc': 'ому', 'f.nom': 'а', 'f.gen': 'ої', 'f.dat': 'ій', 'f.loc': 'ій', 'f.acc': 'у', 'n.nom': 'е', 'pl.nom': 'і', 'pl.gen': 'их', 'pl.ins': 'ими' },
        soft: { 'm.nom': 'ій', 'm.gen': 'ього', 'm.dat': 'ьому', 'm.loc': 'ьому', 'f.nom': 'я', 'f.gen': 'ьої', 'f.dat': 'ій', 'f.loc': 'ій', 'f.acc': 'ю', 'n.nom': 'є', 'pl.nom': 'і', 'pl.gen': 'іх', 'pl.ins': 'іми' },
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
        ['ГБ|Гб', 'm', ['гігабайт', 'гігабайти', 'гігабайтів', 'гігабайта']],
        ['МБ|Мб', 'm', ['мегабайт', 'мегабайти', 'мегабайтів', 'мегабайта']],
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
    ];

    // Назви літер для абревіатур
    const CYR_LETTERS = { А: 'а', Б: 'бе', В: 'ве', Г: 'ге', Ґ: 'ґе', Д: 'де', Е: 'е', Є: 'є', Ж: 'же', З: 'зе', И: 'и', І: 'і', Ї: 'ї', Й: 'йот', К: 'ка', Л: 'ел', М: 'ем', Н: 'ен', О: 'о', П: 'пе', Р: 'ер', С: 'ес', Т: 'те', У: 'у', Ф: 'еф', Х: 'ха', Ц: 'це', Ч: 'че', Ш: 'ша', Щ: 'ща', Ь: 'м’який знак', Ю: 'ю', Я: 'я' };
    const LAT_LETTERS = { A: 'ей', B: 'бі', C: 'сі', D: 'ді', E: 'і', F: 'еф', G: 'джі', H: 'ейч', I: 'ай', J: 'джей', K: 'кей', L: 'ел', M: 'ем', N: 'ен', O: 'оу', P: 'пі', Q: "к'ю", R: 'ар', S: 'ес', T: 'ті', U: 'ю', V: 'ві', W: 'дабл-ю', X: 'екс', Y: 'вай', Z: 'зед' };
    // Абревіатури, які читаються як слово, а не по літерах
    const READ_AS_WORD = new Set(['ФОП', 'МОЗ', 'ЖЕК', 'ВООЗ', 'НАТО', 'ПАТ', 'ВАТ', 'ДАІ', 'ЦУМ', 'ГУМ', 'ВУЗ', 'ЗНО', 'ЮНЕСКО', 'НАСА', 'МАФ', 'ЦНАП', 'АЗС']);
    // Абревіатури, які читаються по літерах навіть серед великих літер
    const SPELLED = new Set(['ТОВ', 'СБУ', 'ЗСУ', 'МВС', 'НБУ', 'США', 'ЄС', 'ООН', 'ПДВ', 'ЄДРПОУ', 'ПДФО', 'ДСНС', 'ОСББ', 'АТБ', 'ВНЗ', 'НМТ', 'СТО', 'КМУ', 'ДТП', 'ЖК', 'ТЦ', 'ТРЦ', 'ЄСВ', 'ІПН', 'ПП', 'ПрАТ', 'ЕКГ', 'УЗД', 'МРТ', 'ЛОР', 'ВВП', 'ІТ', 'ЄІБ', 'ЄБРР', 'МВФ']);
    const SPECIAL_WORDS = { OK: 'окей', ok: 'окей', Ok: 'окей', 'Wi-Fi': 'вай-фай', WiFi: 'вай-фай', iPhone: 'айфон', YouTube: "ют'юб", TikTok: 'тікток', Instagram: 'інстаграм', Facebook: 'фейсбук', Telegram: 'телеграм', Viber: 'вайбер', Google: 'гугл', Shorts: 'шортс', NATO: 'нато', NASA: 'наса', IKEA: 'ікеа', FIFA: 'фіфа', UEFA: 'уєфа', ZARA: 'зара', LEGO: 'лего', ASUS: 'асус', OPEC: 'опек', UNICEF: 'юнісеф', COVID: 'ковід', SALE: 'сейл', PRO: 'про', MAX: 'макс', VIP: 'віп', ІТ: 'ай-ті', IT: 'ай-ті', SMS: 'ес-ем-ес', PDF: 'пе-де-еф', USB: 'ю-ес-бі', TV: 'ті-ві', DJ: 'ді-джей', PR: 'пі-ар', 'Digital': 'діджитал' };

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

    /* =================================================================
       4. НОРМАЛІЗАЦІЯ ТЕКСТУ
       ================================================================= */
    const NUM = '\\d{1,3}(?:[ \\u00A0\\u202F]\\d{3})+|\\d+'; // 1 000 000 або 1000000
    const cleanNum = (s) => s.replace(/[ \u00A0\u202F]/g, '');
    const LETTER = 'A-Za-zА-Яа-яІіЇїЄєҐґ';

    function currencyCode(sign) {
        for (const [re, code] of CURRENCY_SIGNS) if (new RegExp(`^(?:${re})$`, 'i').test(sign)) return code;
        return null;
    }
    const CURRENCY_RE = CURRENCY_SIGNS.map(c => c[0]).join('|');

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
    // Після цих слів число стоїть у родовому відмінку: "до п'яти", "від десяти"
    const GEN_PREPS = new Set(['від', 'до', 'з', 'із', 'зі', 'після', 'близько', 'біля', 'для', 'без', 'більше', 'менше', 'протягом', 'замість', 'крім', 'серед', 'навколо', 'кількох']);
    const isGen = (str, offset) => GEN_PREPS.has(wordBefore(str, offset));

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

    const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    function romanToInt(s) {
        let total = 0;
        for (let i = 0; i < s.length; i++) {
            const v = ROMAN[s[i]], next = ROMAN[s[i + 1]] || 0;
            total += v < next ? -v : v;
        }
        return total;
    }

    function normalize(input) {
        let t = String(input ?? '');

        // Однакові пробіли, лапки, тире, апострофи
        t = t.replace(/\r\n?/g, '\n').replace(/[\u00A0\u202F\u2009]/g, ' ').replace(/[ \t]+/g, ' ')
             .replace(/[’ʼ`´]/g, "'").replace(/\u2212/g, '-');

        // Посилання та пошта: протокол і www не читаються, крапка → "крапка", @ → "собака"
        t = t.replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, m => ` ${m.replace('@', ' собака ').replace(/\./g, ' крапка ').replace(/[_-]/g, ' ')} `);
        t = t.replace(/\b(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+(?:com|ua|online|net|org|info|io|me|biz|shop|store|app|dev|eu|pl|de|uk|tv|fm|co|in\.ua|com\.ua))((?:\/[^\s]*)?)/gi,
            (m, host, path) => ` ${host.replace(/\./g, ' крапка ')}${path.replace(/[/?=&#_-]+/g, ' слеш ').replace(/\s+слеш\s*$/, '')} `);

        // Телефони: +380 67 123 45 67, (067) 123-45-67, 0800 300 545, 0671234567
        t = t.replace(/(^|[^\d\w])(\+?\(?\d[\d\s()\-]{7,}\d)(?![\d\w])/g, (m, pre, ph) => {
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

        // Довгі ряди чисел через пробіл (123 123 123 123 123 …) — окремі числа, а не одне величезне
        t = t.replace(/(?<![\d.,])\d{1,3}(?: \d{3}){4,}(?!\d)/g, m => m.replace(/ /g, ' ⁣'));

        // Дати: день у родовому ("дванадцятого травня"), а після "сьогодні", "на", "по" — "дванадцяте травня"
        const dayForm = (str, offset) => /^(?:сьогодні|завтра|вчора|післязавтра|на|по|це)$/.test(wordBefore(str, offset)) ? 'n.nom' : 'm.gen';
        // 12.05.2024, 01/09/24 → "дванадцятого травня дві тисячі двадцять четвертого року"
        t = t.replace(/\b(0?[1-9]|[12]\d|3[01])[./](0?[1-9]|1[0-2])[./](\d{4}|\d{2})\b/g, (m, d, mo, y, off, str) => {
            const year = y.length === 2 ? 2000 + +y : +y;
            return `${ordinalWords(+d, dayForm(str, off))} ${MONTHS_GEN[+mo - 1]} ${ordinalWords(year, 'm.gen')} року`;
        });
        const monthRe = MONTHS_GEN.join('|');
        // з 1 по 5 травня → "з першого по п'яте травня"; від 1 до 5 травня → "від першого до п'ятого травня"
        t = t.replace(new RegExp(`(?<!\\p{L})(з|із|від)\\s(\\d{1,2})\\s(по|до)\\s(\\d{1,2})\\s(${monthRe})`, 'giu'), (m, a, d1, b, d2, mo) =>
            `${a} ${ordinalWords(+d1, 'm.gen')} ${b} ${ordinalWords(+d2, b.toLowerCase() === 'по' ? 'n.nom' : 'm.gen')} ${mo}`);
        // 1-5 травня → "з першого по п'яте травня"; 12 травня → "дванадцятого травня"
        t = t.replace(new RegExp(`\\b(\\d{1,2})(?:\\s?[-–—]\\s?(\\d{1,2}))?\\s(${monthRe})`, 'gi'), (m, d1, d2, mo, off, str) =>
            d2 ? `з ${ordinalWords(+d1, 'm.gen')} по ${ordinalWords(+d2, 'n.nom')} ${mo}` : `${ordinalWords(+d1, dayForm(str, off))} ${mo}`);

        // Роки: 2024 р., 2024 року, у 2024 році, 1990-ті
        t = t.replace(/\b(\d{4})\s?(?:р\.|рік|року|році|роком)(?![А-Яа-яІіЇїЄєҐґ])/g, (m, y, off, str) => {
            const tail = m.slice(y.length).trim();
            const form = tail === 'р.' || tail === 'року' ? 'm.gen' : tail === 'році' ? 'm.loc' : tail === 'роком' ? 'm.dat' : 'm.nom';
            const noun = tail === 'р.' ? 'року' : tail;
            return keepDot(m, off, str, `${ordinalWords(+y, form)} ${noun}`);
        });
        t = t.replace(/\b(\d{4})\s?[-–—]\s?(\d{4})\s?рр\./g, (m, a, b) => `${ordinalWords(+a, 'm.nom')} – ${ordinalWords(+b, 'm.nom')} роки`);

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
        t = t.replace(/(^|[^\p{L}])(о|об|О|Об)\s(1?\d|2[0-4])(?![\d.,:\-])/gu, (m, pre, o, h) => `${pre}${o} ${ordinalWords(+h, 'f.loc')}`);

        // Римські числа перед "століття": XXI століття → "двадцять перше століття"
        t = t.replace(/\b([IVXLC]{1,7})\s?(століття|сторіччя|ст\.)/g, (m, r, w) =>
            `${ordinalWords(romanToInt(r), 'n.nom')} ${w === 'ст.' ? 'століття' : w}`);

        // Складні слова: 5-річний → "п'ятирічний", 2-кімнатна → "двокімнатна", 100-річчя → "сторіччя"
        t = t.replace(new RegExp(`\\b(\\d{1,4})\\s?-\\s?([а-яіїєґ']{5,})`, 'g'), (m, n, word) => combiningForm(+n) + word);
        // Порядкові з закінченням: 5-й, 21-го, 1-ша, 3-тя, 90-ті
        t = t.replace(new RegExp(`\\b(\\d+)\\s?-\\s?([а-яіїєґ]{1,4})(?![${LETTER}])`, 'g'), (m, n, suf) => ordinalWords(+n, ordinalForm(suf)));

        // Гроші: 1 499,99 грн, $100, 100$, 5 тис. грн, €3.50
        t = t.replace(new RegExp(`(${CURRENCY_RE})\\s?(${NUM})(?:[.,](\\d{1,2}))?(?![\\d])`, 'gi'), (m, sign, int, frac, off, str) => {
            const code = currencyCode(sign);
            return code && !/^[а-яіїєґ]/i.test(sign) ? ' ' + moneyWords(int, frac, code, isGen(str, off)) : m;
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
            : countWords(+cleanNum(int), 'm', ['відсоток', 'відсотки', 'відсотків', 'відсотка'], isGen(str, off)));
        t = t.replace(/%/g, ' відсотків ');

        // Номер: №5, # 3
        t = t.replace(/[№#]\s?(?=\d)/g, ' номер ');
        t = t.replace(/#(?=[A-Za-zА-Яа-яІіЇїЄєҐґ])/g, ' хештег ');

        // Одиниці: 5 км, 2,5 кг, 3 тис., 10 млн
        UNITS.forEach(([re, gender, forms]) => {
            const rx = new RegExp(`(?<![\\d.,])(${NUM})(?:[.,](\\d+))?\\s?(?:${re})(?![${LETTER}\\d])`, 'g');
            t = t.replace(rx, (m, int, frac, off, str) => keepDot(m, off, str, frac
                ? `${decimalWords(cleanNum(int), frac)} ${forms[3]}`
                : countWords(+cleanNum(int), gender, forms, isGen(str, off))));
        });

        // Дії й рахунок: 2+2=4 → "два плюс два дорівнює чотири", 24/7 → "двадцять чотири на сім", 3:1 → "три – один"
        t = t.replace(/\b24\/7\b/g, 'двадцять чотири на сім');
        t = t.replace(/(\d)\s?\+\s?(?=\d)/g, '$1 плюс ').replace(/(\d)\s?=\s?(?=\d)/g, '$1 дорівнює ');
        t = t.replace(/\b(\d{1,2}):(\d{1,2})\b/g, '$1 \u2063$2');

        // Дроби: 1/2 → "одна друга", 3/4 → "три четвертих", 2 1/2 → "два з половиною"
        const fraction = (n, d) => `${numberToWords(n, 'f')} ${ordinalWords(d, n % 10 === 1 && n % 100 !== 11 ? 'f.nom' : 'pl.gen')}`;
        t = t.replace(/\b(\d{1,3}) (\d{1,2})\/(\d{1,2})\b/g, (m, i, a, b) => +a && +b > +a
            ? `${numberToWords(+i)} ${+a === 1 && +b === 2 ? 'з половиною' : 'і ' + fraction(+a, +b)}` : m);
        t = t.replace(/\b(\d{1,3})\/(\d{1,3})\b/g, (m, a, b) => +b ? fraction(+a, +b) : m);

        // Діапазони: 10-15 → "від десяти до п'ятнадцяти"
        t = t.replace(new RegExp(`(?<![\\d.,])(${NUM})\\s?[-–—]\\s?(${NUM})(?![\\d.,]\\d)`, 'g'), (m, a, b) =>
            `від ${numberToWords(+cleanNum(a)) === 'нуль' ? 'нуля' : numberToWordsGen(+cleanNum(a))} до ${numberToWordsGen(+cleanNum(b))}`);

        // Знаки перед числом: +5, -5, ~100, 2×2
        t = t.replace(/(^|[\s(])\+\s?(?=\d)/g, '$1плюс ');
        t = t.replace(/(^|[\s(])-(?=\d)/g, '$1мінус ');
        t = t.replace(/(^|[\s(])[~≈]\s?(?=\d)/g, '$1близько ');
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

        // Решта чисел: 1 000 000, 123, 007
        t = t.replace(new RegExp(`(${NUM})`, 'g'), (m, n, off, str) => {
            const s = cleanNum(m);
            if (s.length > 1 && s[0] === '0') return digitsToWords(s);
            if (s.length > 15) return digitsToWords(s);
            return isGen(str, off) ? numberToWordsGen(+s) : numberToWords(+s);
        });

        // Скорочення
        ABBREVIATIONS.forEach(([re, rep, canEnd]) => {
            t = t.replace(re, (m, pre, off, str) => canEnd ? keepDot(m, off, str, rep.replace('$1', pre)) : rep.replace('$1', pre));
        });

        // Символи між словами
        t = t.replace(/\s&\s/g, ' і ').replace(/\s\+\s/g, ' плюс ').replace(/\s=\s/g, ' дорівнює ').replace(/@/g, ' собака ');
        t = t.replace(new RegExp(`([${LETTER}])\\/([${LETTER}])`, 'g'), '$1 $2');

        // Слова й абревіатури
        t = readWords(t);

        // Немовні символи (емоджі, зірочки тощо) прибираємо, розділові знаки лишаємо
        t = t.replace(/[^\p{L}\p{N}\s.,;:!?…()\-–—'"«»„“”]/gu, ' ');
        return t.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/ ([,.;:!?…)])/g, '$1').trim();
    }

    // Абревіатури по літерах (ТОВ → "те-о-ве"), але слова, написані великими для наголосу, читаються як слова:
    // "ТІЛЬКИ СЬОГОДНІ ВСЕ ЗА ПІВЦІНИ"
    function readWords(t) {
        const re = /[A-Za-zА-ЯІЇЄҐа-яіїєґ]+(?:[-'][A-Za-zА-ЯІЇЄҐа-яіїєґ]+)*/g;
        const tokens = [...t.matchAll(re)];
        const upper = tokens.map(m => m[0].length >= 2 && /^[A-ZА-ЯІЇЄҐ]+$/.test(m[0]));
        const shout = tokens.map((m, i) => upper[i] && readsAsWord(m[0]));
        let out = '', last = 0;
        tokens.forEach((m, i) => {
            const w = m[0];
            let r = w;
            if (SPECIAL_WORDS[w]) r = SPECIAL_WORDS[w];
            else if (upper[i]) {
                const inShout = (shout[i - 1] || shout[i + 1]) && !SPELLED.has(w) && UPPER_VOWEL.test(w);
                r = shout[i] || inShout ? w.toLowerCase() : spellAcronym(w);
            } else if (/^[A-Z]$/.test(w)) r = LAT_LETTERS[w];  // план B, I
            out += t.slice(last, m.index) + r;
            last = m.index + w.length;
        });
        return out + t.slice(last);
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

    const api = { version: '1.1.0', CONFIG, analyze, normalize, numberToWords, numberToWordsGen, ordinalWords, plural };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.UnivoiceSpeech = api;
})(typeof window !== 'undefined' ? window : this);
