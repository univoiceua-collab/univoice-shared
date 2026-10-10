/* Перевірка Хрономіра: node tests/speech.test.js */
const assert = require('assert');
const S = require('../univoice-speech.js');

const said = (text, expected) => assert.strictEqual(S.normalize(text), expected, `"${text}"`);
const same = (a, b) => assert.ok(Math.abs(S.analyze(a).seconds - S.analyze(b).seconds) < 0.01, `"${a}" ≈ "${b}"`);
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('✓', name); };

test('числа словами', () => {
    assert.strictEqual(S.numberToWords(0), 'нуль');
    assert.strictEqual(S.numberToWords(21), 'двадцять один');
    assert.strictEqual(S.numberToWords(1000), 'тисяча');
    assert.strictEqual(S.numberToWords(2002), 'дві тисячі два');
    assert.strictEqual(S.numberToWords(1234567), 'мільйон двісті тридцять чотири тисячі п\'ятсот шістдесят сім');
    assert.strictEqual(S.numberToWords(21, 'f'), 'двадцять одна');
    assert.strictEqual(S.ordinalWords(2024, 'm.gen'), 'дві тисячі двадцять четвертого');
    assert.strictEqual(S.ordinalWords(3, 'f.nom'), 'третя');
    assert.strictEqual(S.ordinalWords(2000, 'm.nom'), 'двохтисячний');
});

test('баг 1: цифри й слова звучать однаково', () => {
    same(Array(20).fill('123').join(' '), Array(20).fill('сто двадцять три').join(' '));
    same('Знижка 15%', 'Знижка п\'ятнадцять відсотків');
    same('Ціна 250 грн', 'Ціна двісті п\'ятдесят гривень');
});

test('баг 2: однолітерні слова рахуються', () => {
    assert.strictEqual(S.analyze('Я і ти').words, 3);
    assert.strictEqual(S.analyze('я').words, 1);
    assert.strictEqual(S.analyze('і').words, 1);
    assert.strictEqual(S.analyze('a I').words, 2);
    assert.ok(S.analyze('я').seconds > 0);
});

test('баг 4: текст без слів — нуль', () => {
    for (const t of ['!!!', '😀', '...', '— — —', '   ', '***', '🔥🔥🔥 !!!']) {
        const r = S.analyze(t);
        assert.strictEqual(r.hasSpeech, false, t);
        assert.strictEqual(r.words, 0, t);
        assert.strictEqual(r.seconds, 0, t);
    }
});

test('дати й час', () => {
    said('Акція до 12.05.2024!', 'Акція до дванадцятого травня дві тисячі двадцять четвертого року!');
    said('Сьогодні 1 вересня.', 'Сьогодні перше вересня.');
    said('з 1 по 5 травня', 'з першого по п\'яте травня');
    said('у 2024 році', 'у дві тисячі двадцять четвертому році');
    said('о 18:30', 'о вісімнадцятій тридцять');
    said('з 9:00 до 18:00', 'з дев\'ятої до вісімнадцятої');
    said('XXI століття', 'двадцять перше століття');
});

test('гроші, відсотки, одиниці', () => {
    said('1 499,99 грн', 'тисяча чотириста дев\'яносто дев\'ять гривень дев\'яносто дев\'ять копійок');
    said('$100', 'сто доларів');
    said('від 500 грн', 'від п\'ятисот гривень');
    said('5 тис. грн', 'п\'ять тисяч гривень');
    said('2,5%', 'два з половиною відсотка');
    said('21 км', 'двадцять один кілометр');
    said('1,5 л', 'півтора літра');
    said('до 5 км', 'до п\'яти кілометрів');
});

test('телефони, сайти, пошта', () => {
    said('+380 67 123 45 67', 'плюс триста вісімдесят, шістдесят сім, сто двадцять три, сорок п\'ять, шістдесят сім');
    said('0800 300 545', 'нуль вісімсот, триста, п\'ятсот сорок п\'ять');
    said('www.univoice.com.ua', 'univoice крапка com крапка ua');
    said('info@univoice.ua', 'info собака univoice крапка ua');
});

test('скорочення й абревіатури', () => {
    said('вул. Хрещатик, буд. 5', 'вулиця Хрещатик, будинок п\'ять');
    said('Овочі, фрукти і т.д. Далі', 'Овочі, фрукти і так далі. Далі');
    said('ТОВ «Сяйво»', 'те-о-ве «Сяйво»');
    said('ФОП', 'фоп');
    said('ТІЛЬКИ СЬОГОДНІ ВСЕ!', 'тільки сьогодні все!');
    said('OK', 'окей');
});

test('інші форми чисел', () => {
    said('5-й поверх', 'п\'ятий поверх');
    said('100-річчя', 'сторіччя');
    said('10-15 хвилин', 'від десяти до п\'ятнадцяти хвилин');
    said('3/4', 'три четвертих');
    said('№5', 'номер п\'ять');
    said('0,75', 'нуль цілих сімдесят п\'ять сотих');
    said('1 000 000', 'мільйон');
});

test('паузи', () => {
    const plain = S.analyze('Свіжа випічка щоранку').seconds;
    assert.ok(S.analyze('Свіжа випічка, щоранку').seconds > plain);
    assert.ok(S.analyze('Свіжа випічка. Щоранку').seconds > S.analyze('Свіжа випічка, щоранку').seconds);
    assert.strictEqual(S.analyze('Свіжа випічка щоранку!!!').seconds, plain); // у кінці тексту пауза не рахується
});

console.log(`\nУсі перевірки пройдено: ${passed}`);
