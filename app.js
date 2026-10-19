let currentSymbol = 'ETHEUR', currentInterval = '1m', currentLang = 'bg', currentLimit = 200;
let chart, candleSeries, volSeries, ema20S, ema50S, bbUpS, bbLoS, ws;
let lastLegend = null, show = { ema20: false, ema50: false, bb: false, sig: false, sigs: true, vol: false };
let candlesData = [], paperBalance = 10000, currentPosition = null;

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const num = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const $ = id => document.getElementById(id);

const T = {
    bg: { buy: "ВЛИЗАЙ (BUY)", sell: "ПРОДАВАЙ / НЕ КУПУВАЙ", hold: "ИЗЧАКАЙ",
        bull: "Бичи поглъщане", bear: "Мечи поглъщане", none: "Няма",
        rSell: "Пазарът е свръхкупен (RSI > 70) или има мечи сигнал. Рисково е да купуваш!",
        rBuy: "Пазарът е свръхпродаден (RSI < 35) или има бичи сигнал!",
        rHold: "Пазарът е неутрален. Изчакай добра формация.",
        noPos: "Няма отворена позиция", open: (q, e) => `Отворена: ${q.toFixed(4)} @ ${eur.format(e)}` },
    en: { buy: "BUY SIGNAL", sell: "SELL / DO NOT BUY", hold: "WAIT / HOLD",
        bull: "Bullish Engulfing", bear: "Bearish Engulfing", none: "None",
        rSell: "Overbought (RSI > 70) or bearish signal. Do not buy!",
        rBuy: "Oversold (RSI < 35) or bullish signal!",
        rHold: "Market is neutral. Wait for a clean setup.",
        noPos: "No open position", open: (q, e) => `Open: ${q.toFixed(4)} @ ${eur.format(e)}` }
};

window.onload = () => { initChart(); loadHistoricalData(); setupEventListeners(); setupUI(); setupWallet(); setupPeriods(); setupOrders(); setupSelect(); setupTabs(); applyLang(); renderPosition(); };

/* ---------- Chart ---------- */
function initChart() {
    const container = $('chartContainer');
    chart = LightweightCharts.createChart(container, {
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true }, handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#a9b2d0', fontFamily: 'Chakra Petch', fontSize: 12 },
        grid: { vertLines: { color: 'rgba(255,255,255,0.06)' }, horzLines: { color: 'rgba(255,255,255,0.06)' } },
        crosshair: { mode: 0, vertLine: { color: 'rgba(255,255,255,.35)', style: 3, labelBackgroundColor: '#fff' }, horzLine: { color: 'rgba(255,255,255,.35)', style: 3, labelBackgroundColor: '#fff' } },
        rightPriceScale: { borderColor: 'rgba(255,255,255,.1)', scaleMargins: { top: .08, bottom: .08 } },
        timeScale: { timeVisible: true, secondsVisible: false, borderColor: 'rgba(255,255,255,.1)', rightOffset: 6, tickMarkFormatter: (t, ty) => ty === 0 ? sofia(t * 1000, { year: 'numeric' }) : ty === 1 ? sofia(t * 1000, { month: 'short' }) : ty === 2 ? sofia(t * 1000, { day: 'numeric' }) : sofia(t * 1000, { hour: '2-digit', minute: '2-digit', hour12: false }) },
        localization: { priceFormatter: p => p < 10 ? p.toFixed(4).replace('.', ',') + ' €' : eur.format(p), timeFormatter: t => (currentInterval === '1d' || currentInterval === '1w') ? sofia(t * 1000, { day: '2-digit', month: '2-digit', year: 'numeric' }) : fmtShort(t * 1000) }
    });
    candleSeries = chart.addCandlestickSeries({
        priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
        upColor: '#22c55e', downColor: '#ef4444', borderVisible: false,
        wickUpColor: '#22c55e', wickDownColor: '#ef4444', priceLineColor: '#fff', priceLineStyle: 2
    });
    volSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', visible: false, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: .8, bottom: 0 } });
    const line = (color, w = 1.5, style = 0) => chart.addLineSeries({ color, lineWidth: w, lineStyle: style, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, visible: false });
    ema20S = line('#fcd34d'); ema50S = line('#93c5fd');
    bbUpS = line('rgba(255,255,255,.28)', 1, 2); bbLoS = line('rgba(255,255,255,.28)', 1, 2);

    chart.subscribeCrosshairMove(p => {
        const d = p.seriesData && p.seriesData.get(candleSeries);
        const v = p.seriesData && p.seriesData.get(volSeries);
        const last = candlesData[candlesData.length - 1];
        showLegend(d || last, v ? v.value : last && last.vol);
    });
    const fit = () => chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    new ResizeObserver(fit).observe(container); fit();
}

function showLegend(c, vol) {
    if (!c) return; lastLegend = [c, vol]; const L = I18N[currentLang];
    const col = c.close >= c.open ? 'var(--up)' : 'var(--down)', ch = (c.close / c.open - 1) * 100, u = currentSymbol.replace('EUR', '');
    $('legend').innerHTML = `<span>${L.lo_}<b style="color:${col}">${eur.format(c.open)}</b></span><span>${L.hi}<b style="color:${col}">${eur.format(c.high)}</b></span><span>${L.lw}<b style="color:${col}">${eur.format(c.low)}</b></span><span>${L.cl}<b style="color:${col}">${eur.format(c.close)}</b></span><span><b style="color:${col}">${ch >= 0 ? '+' : ''}${ch.toFixed(2).replace('.', ',')}%</b></span><span>${L.vl}<b style="color:#fff">${num.format(vol || 0)} ${u}</b></span>`;
}

const toCandle = d => ({ time: +d[0], open: +d[1], high: +d[2], low: +d[3], close: +d[4], vol: +d[6] });

async function loadHistoricalData() {
    if (ws) { const w = ws; ws = null; w.close(); }
    const url = `https://api.kraken.com/0/public/OHLC?pair=${KRAKEN[currentSymbol].rest}&interval=${KMIN[currentInterval]}`;
    try {
        const j = await (await fetch(url)).json();
        if (j.error && j.error.length) throw new Error(j.error.join(', '));
        candlesData = Object.values(j.result).find(Array.isArray).slice(-currentLimit).map(toCandle);
        redraw();
        updateEntryLine(); clearSel();
        chart.timeScale().fitContent();
        setTimeout(() => chart.timeScale().fitContent(), 350);
        connectWebSocket();
    } catch (e) { console.error("Грешка при зареждане на данни:", e); toast(I18N[currentLang].offlineMsg); clearTimeout(retryT); retryT = setTimeout(loadHistoricalData, 5000); }
}

function connectWebSocket() {
    const sym = currentSymbol, iv = currentInterval, sock = ws = new WebSocket('wss://ws.kraken.com/v2'); lastWsMsg = Date.now();
    sock.onopen = () => sock.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ohlc', symbol: [KRAKEN[sym].ws], interval: KMIN[iv] } }));
    sock.onmessage = ev => {
        if (sock !== ws) return;
        const m = JSON.parse(ev.data); lastWsMsg = Date.now(); if (m.channel !== 'ohlc' || !m.data) return;
        m.data.forEach(k => {
            const c = { time: Math.floor(Date.parse(k.interval_begin) / 1000), open: +k.open, high: +k.high, low: +k.low, close: +k.close, vol: +k.volume };
            const last = candlesData[candlesData.length - 1];
            if (!last || c.time < last.time) return;
            if (last.time === c.time) candlesData[candlesData.length - 1] = c; else candlesData.push(c);
            candleSeries.update(c); volSeries.update(volPoint(c)); pushTick(sym, c.close);
        });
        redraw(true);
    };
    sock.onclose = () => { if (sock === ws) setTimeout(() => { if (sock === ws) connectWebSocket(); }, 3000); };
}

const volPoint = c => ({ time: c.time, value: c.vol, color: c.close >= c.open ? 'rgba(34,197,94,.35)' : 'rgba(239,68,68,.35)' });

/* ---------- Indicators ---------- */
function ema(data, p) {
    const k = 2 / (p + 1); let e = data[0].close;
    return data.map((c, i) => { e = i ? c.close * k + e * (1 - k) : e; return { time: c.time, value: e }; }).slice(p - 1);
}
function bollinger(data, p = 20, m = 2) {
    const up = [], lo = [];
    for (let i = p - 1; i < data.length; i++) {
        const s = data.slice(i - p + 1, i + 1).map(c => c.close), mean = s.reduce((a, b) => a + b) / p;
        const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / p);
        up.push({ time: data[i].time, value: mean + m * sd }); lo.push({ time: data[i].time, value: mean - m * sd });
    }
    return [up, lo];
}
function engulfing(prev, c) {
    if (prev.close < prev.open && c.close > c.open && c.close > prev.open && c.open < prev.close) return 'bull';
    if (prev.close > prev.open && c.close < c.open && c.close < prev.open && c.open > prev.close) return 'bear';
    return null;
}
function calculateRSI(candles, period = 14) {
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) { const ch = candles[i].close - candles[i - 1].close; if (ch >= 0) gains += ch; else losses -= ch; }
    let ag = gains / period, al = losses / period;
    const rsi = [100 - 100 / (1 + ag / (al || 1))];
    for (let i = period + 1; i < candles.length; i++) {
        const ch = candles[i].close - candles[i - 1].close;
        ag = (ag * (period - 1) + Math.max(ch, 0)) / period; al = (al * (period - 1) + Math.max(-ch, 0)) / period;
        rsi.push(100 - 100 / (1 + ag / (al || 1)));
    }
    return rsi;
}

function redraw(live) {
    if (candlesData.length < 52) return;
    if (!live) { candleSeries.setData(candlesData); volSeries.setData(candlesData.map(volPoint)); btDirty = true; }
    const e20 = ema(candlesData, 20), e50 = ema(candlesData, 50), [bu, bl] = bollinger(candlesData);
    ema20S.setData(e20); ema50S.setData(e50); bbUpS.setData(bu); bbLoS.setData(bl);
    refreshMarkers();
    $('emaValue').innerText = `${num.format(e20[e20.length - 1].value)} / ${num.format(e50[e50.length - 1].value)}`;
    const last = candlesData[candlesData.length - 1], first = candlesData[0];
    $('currentPrice').innerText = eur.format(last.close);
    const pct = (last.close / first.open - 1) * 100, el = $('priceChange');
    el.innerText = (pct >= 0 ? '+' : '') + pct.toFixed(2).replace('.', ',') + '%'; el.className = 'change ' + (pct >= 0 ? 'up' : 'down');
    $('stHigh').innerText = eur.format(Math.max(...candlesData.map(c => c.high)));
    $('stLow').innerText = eur.format(Math.min(...candlesData.map(c => c.low)));
    $('stVol').innerText = num.format(candlesData.reduce((a, c) => a + c.vol, 0)) + ' ' + currentSymbol.replace('EUR', '');
    showLegend(last, last.vol);
    updateAnalysis();
    renderPosition();
}

function updateAnalysis() {
    const t = T[currentLang], rsi = calculateRSI(candlesData), r = rsi[rsi.length - 1];
    $('rsiValue').innerText = r.toFixed(2); $('rsiFill').style.left = r + '%';
    const p = engulfing(candlesData[candlesData.length - 2], candlesData[candlesData.length - 1]);
    $('engulfingValue').innerText = p === 'bull' ? t.bull : p === 'bear' ? t.bear : t.none;
    renderSignal();
}

/* ---------- UI ---------- */
function setupEventListeners() {
    document.querySelectorAll('.tf-btn').forEach(b => b.addEventListener('click', e => {
        document.querySelectorAll('.tf-btn').forEach(x => x.classList.remove('active'));
        e.target.classList.add('active'); currentInterval = e.target.dataset.tf; currentLimit = 200;
        document.querySelectorAll('.per-btn').forEach(x => x.classList.remove('active')); loadHistoricalData();
    }));
    $('symbolSelect').addEventListener('change', e => {
        currentSymbol = e.target.value; $('currentSymbol').innerText = currentSymbol.replace('EUR', '/EUR'); loadHistoricalData();
    });
    $('langBgBtn').addEventListener('click', () => switchLang('bg'));
    $('langEnBtn').addEventListener('click', () => switchLang('en'));
}
function switchLang(lang) {
    currentLang = lang;
    $('langBgBtn').classList.toggle('active', lang === 'bg'); $('langEnBtn').classList.toggle('active', lang === 'en');
    applyLang(); if (candlesData.length > 15) updateAnalysis(); renderPosition();
}

/* ---------- Текстове (BG / EN) и помощник ---------- */
const I18N = {
 bg: { help:'? Помощник', high:'Най-висока', low:'Най-ниска', vol:'Търгувано', live:'НА ЖИВО', onChart:'Показвай на графиката:',
  ema20:'Средна цена 20', ema50:'Средна цена 50', bb:'Ценови коридор', sig:'Стрелки-сигнали', volchip:'Обем',
  sensor:'ИИ сензор', indic:'Индикатори', rsi:'RSI – сила на пазара', emaV:'Средни цени (20 / 50)', eng:'Формация „поглъщане“',
  sim:'Демо симулатор', balance:'Баланс', buy:'Купи', sell:'Продай',
  lo_:'Отваряне', hi:'Най-висока', lw:'Най-ниска', cl:'Затваряне', vl:'Обем',
  t_help:'Кратко и просто обяснение как да четеш графиката.',
  t_price:'Текущата цена на една монета в евро. Процентът показва промяната от първата до последната показана свещ.',
  t_high:'Най-високата цена, достигната в свещите, които виждаш на графиката.',
  t_low:'Най-ниската цена в свещите, които виждаш на графиката.',
  t_vol:'Колко от монетата е купена и продадена общо в показаните свещи. Голямо число = много интерес към монетата.',
  t_live:'Цената идва директно от борсата Kraken и се обновява сама.',
  t_zin:'Приближи графиката. Можеш и с колелцето на мишката върху нея.', t_zout:'Отдалечи графиката (виж повече свещи).', t_zreset:'Покажи всички свещи наведнъж.',
  t_ema20:'Плавна линия със средната цена на последните 20 свещи. Цената над линията = пазарът леко расте, под нея = пада. Само за ориентир.',
  t_ema50:'Като предишната, но по-бавна (50 свещи) – показва по-дългия курс на цената.',
  t_bb:'Две пунктирани линии около цената – „коридорът“, в който обикновено се движи. Близо до горната линия цената е сравнително висока, до долната – сравнително ниска.',
  t_sig:'Стрелки върху свещите, където се е появила формация „поглъщане“: нагоре = възможен растеж, надолу = възможен спад. Не са гаранция.',
  t_vchip:'Стълбчета най-долу: колко е търгувано във всяка свещ. По-високо стълбче = по-голямо движение.',
  t_sensor:'Прост съвет, изчислен от RSI и формациите. Не е финансов съвет – само ориентир.',
  t_rsi:'Число от 0 до 100. Над 70 = цената се е вдигнала твърде бързо и може да падне. Под 30 = паднала е много и може да се върне. Между 30 и 70 е нормално.',
  t_emaV:'Двете плавни линии като числа. Ако първото е по-голямо от второто, краткият тренд е нагоре.',
  t_eng:'Две свещи подред, при които втората „поглъща“ първата. Зелена след червена може да значи обрат нагоре; червена след зелена – обрат надолу.',
  t_sim:'Тренировъчна търговия с изкуствени пари (10 000 €). Нищо реално не се купува или продава.',
  t_buy:'Купува с цялата ти сума по текущата цена (демо).', t_sell:'Продава позицията и връща парите в баланса (демо).',
  helpHtml:'<h2>Как да четеш графиката</h2><p><b>Свещ</b> = какво е станало с цената за един период (например 1 минута). <b>Зелена</b> – цената е вдигнала. <b>Червена</b> – паднала.</p><p>Дебелата част показва цената в началото и в края на периода. Тънките „фитили“ – най-високата и най-ниската цена в него.</p><p><b>1m, 5m, 1h…</b> – колко време е една свещ.</p><p><b>Мащаб:</b> върти колелцето на мишката върху графиката, за да приближаваш и отдалечаваш; дръпни с мишката, за да я местиш.</p><p><b>ИИ сензор:</b> прост ориентир – ВЛИЗАЙ, ИЗЧАКАЙ или ПРОДАВАЙ. Не е финансов съвет.</p><p><b>Съвет:</b> задръж мишката върху всяко име, за да видиш обяснение. Графиката е чиста; допълнителните линии включваш от бутоните под нея. Симулаторът е с изкуствени пари.</p>' },
 en: { help:'? Helper', high:'Highest', low:'Lowest', vol:'Traded', live:'LIVE', onChart:'Show on chart:',
  ema20:'Average price 20', ema50:'Average price 50', bb:'Price corridor', sig:'Signal arrows', volchip:'Volume',
  sensor:'AI sensor', indic:'Indicators', rsi:'RSI – market strength', emaV:'Average prices (20 / 50)', eng:'Engulfing pattern',
  sim:'Demo simulator', balance:'Balance', buy:'Buy', sell:'Sell',
  lo_:'Open', hi:'High', lw:'Low', cl:'Close', vl:'Volume',
  t_help:'A short, simple guide to reading the chart.',
  t_price:'Current price of one coin in euro. The percentage is the change from the first to the last visible candle.',
  t_high:'The highest price reached in the candles you see.', t_low:'The lowest price in the candles you see.',
  t_vol:'How much of the coin was bought and sold in the visible candles. Big number = lots of interest.',
  t_live:'Price streams straight from Kraken and updates by itself.',
  t_zin:'Zoom in. You can also use the mouse wheel over the chart.', t_zout:'Zoom out (see more candles).', t_zreset:'Show all candles at once.',
  t_ema20:'A smooth line of the average price of the last 20 candles. Price above it = gently rising, below = falling. Just a guide.',
  t_ema50:'Like the previous one but slower (50 candles) – shows the longer trend.',
  t_bb:'Two dashed lines around the price – the "corridor" it usually moves in. Near the top line price is relatively high, near the bottom relatively low.',
  t_sig:'Arrows on candles where an engulfing pattern appeared: up = possible rise, down = possible drop. Not a guarantee.',
  t_vchip:'Bars at the bottom: how much was traded in each candle. Taller = bigger move.',
  t_sensor:'A simple tip computed from RSI and patterns. Not financial advice – just a guide.',
  t_rsi:'A number from 0 to 100. Above 70 = price rose too fast and may drop. Below 30 = fell a lot and may bounce. 30–70 is normal.',
  t_emaV:'The two smooth lines as numbers. If the first is bigger than the second, the short trend is up.',
  t_eng:'Two candles in a row where the second "swallows" the first. Green after red may mean a turn up; red after green, a turn down.',
  t_sim:'Practice trading with fake money (€10,000). Nothing real is bought or sold.',
  t_buy:'Buys with your whole balance at the current price (demo).', t_sell:'Sells the position and returns the money to your balance (demo).',
  helpHtml:'<h2>How to read the chart</h2><p>A <b>candle</b> shows what the price did in one period (e.g. 1 minute). <b>Green</b> – price went up. <b>Red</b> – it went down.</p><p>The thick body spans the start and end price; the thin "wicks" show the highest and lowest price in that period.</p><p><b>1m, 5m, 1h…</b> – how long one candle lasts.</p><p><b>Zoom:</b> use the mouse wheel over the chart; drag to move it.</p><p><b>AI sensor:</b> a simple guide – BUY, WAIT or SELL. Not financial advice.</p><p><b>Tip:</b> hover any label for an explanation. Extra lines are off by default – turn them on with the buttons under the chart. The simulator uses fake money.</p>' }
};

function applyLang() {
    const L = I18N[currentLang];
    document.querySelectorAll('[data-i]').forEach(el => { if (L[el.dataset.i] != null) el.innerText = L[el.dataset.i]; });
    document.querySelectorAll('[data-t]').forEach(el => {
        if (L[el.dataset.t]) el.setAttribute('data-tip', L[el.dataset.t]); else el.removeAttribute('data-tip');
        (el.dataset.tipcls || '').split(' ').filter(Boolean).forEach(c => el.classList.add(c));
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    });
    $('helpBody').innerHTML = L.helpHtml;
    if (lastLegend) showLegend(...lastLegend);
    if (typeof W !== 'undefined') { dirty = true; renderPosition(); uiLabels(); updatePreview(); updateEntryLine(); refreshMarkers(); renderSignal(true); renderDrawer(true); renderGuard(); if (sel) showRange(sel.a, sel.b); }
}

function zoom(f) {
    const ts = chart.timeScale(), r = ts.getVisibleLogicalRange(); if (!r) return;
    const len = (r.to - r.from) * f; ts.setVisibleLogicalRange({ from: r.to - len, to: r.to });
}

function setupUI() {
    $('zIn').onclick = () => zoom(.7); $('zOut').onclick = () => zoom(1.4); $('zReset').onclick = () => chart.timeScale().fitContent();
    $('helpBtn').onclick = () => $('help').hidden = false;
    $('helpClose').onclick = () => $('help').hidden = true;
    $('help').onclick = e => { if (e.target.id === 'help') $('help').hidden = true; };
    addEventListener('keydown', e => { if (e.key === 'Escape') $('help').hidden = true; });
    document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
        const k = chip.dataset.ind; show[k] = !show[k]; chip.classList.toggle('on', show[k]);
        if (k === 'ema20') ema20S.applyOptions({ visible: show.ema20 });
        if (k === 'ema50') ema50S.applyOptions({ visible: show.ema50 });
        if (k === 'bb') { bbUpS.applyOptions({ visible: show.bb }); bbLoS.applyOptions({ visible: show.bb }); }
        if (k === 'vol') { volSeries.applyOptions({ visible: show.vol }); chart.priceScale('right').applyOptions({ scaleMargins: { top: .08, bottom: show.vol ? .26 : .08 } }); }
        if (k === 'sig' || k === 'sigs') refreshMarkers();
    }));
}



/* ======================================================================
   Портфейл – огледало на Kraken: депозит в EUR, покупка/продажба на монети,
   ръчни такси, по желание ръчна цена и час от историята на Kraken.
   ====================================================================== */
const WKEY = 'tradeOrderKraken', SYMS = ['ETHEUR', 'BTCEUR', 'SOLEUR', 'XRPEUR'];
const KRAKEN = { ETHEUR: { rest: 'ETHEUR', ws: 'ETH/EUR', code: 'ETH' }, BTCEUR: { rest: 'XBTEUR', ws: 'BTC/EUR', code: 'XBT' }, SOLEUR: { rest: 'SOLEUR', ws: 'SOL/EUR', code: 'SOL' }, XRPEUR: { rest: 'XRPEUR', ws: 'XRP/EUR', code: 'XRP' } };
const KMIN = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080 };
const IV = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 };
const lastPrices = {}; let W = loadW(), entryLine = null, side = 'buy', mode = 'amount', dirty = true, posKey = '';
const sofia = (ms, o) => new Intl.DateTimeFormat('bg-BG', { timeZone: 'Europe/Sofia', ...o }).format(new Date(ms));
const fmtShort = ms => sofia(ms, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const fmtFull = ms => sofia(ms, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const sgn = v => (v >= 0 ? '+' : '−') + eur.format(Math.abs(v));
const pctf = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2).replace('.', ',') + '%';
const esc = s => String(s).replace(/"/g, '&quot;');
const price = () => candlesData.length ? candlesData[candlesData.length - 1].close : 0;
const base = () => currentSymbol.replace('EUR', '');
const val_ = id => parseFloat(String($(id).value).replace(',', '.')) || 0;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const priceOf = s => (s === currentSymbol && price()) ? price() : (lastPrices[s] || 0);
function loadW() { try { const s = JSON.parse(localStorage.getItem(WKEY)); if (s && Array.isArray(s.trades) && Array.isArray(s.deposits)) return Object.assign({ orders: [], feePct: 0.25 }, s); } catch (e) {} return { deposits: [], trades: [], orders: [], feePct: 0.25 }; }
function saveW() { try { localStorage.setItem(WKEY, JSON.stringify(W)); } catch (e) {} }
const netDeposits = () => W.deposits.reduce((a, d) => a + d.amount, 0);
const cashNow = () => Math.round((netDeposits() + W.trades.reduce((a, t) => a + (t.side === 'buy' ? -t.paid : t.net), 0)) * 1e6) / 1e6;

/* позиция по метода на средната цена */
function posOf(sym, upTo = Infinity) {
    let units = 0, cost = 0, paid = 0, fees = 0, first = null, realized = 0;
    W.trades.filter(t => t.sym === sym && t.ts <= upTo).sort((x, y) => x.ts - y.ts).forEach(t => {
        if (t.side === 'buy') { units += t.units; cost += t.units * t.price; paid += t.paid; fees += t.fee; if (first == null) first = t.ts; }
        else if (units > 0) {
            const f = Math.min(1, t.units / units); realized += t.net - paid * f;
            cost -= cost * f; paid -= paid * f; fees -= fees * f; units = Math.max(0, units - t.units);
            if (units < 1e-12) { units = 0; cost = paid = fees = 0; first = null; }
        }
    });
    return { units, avg: units ? cost / units : 0, paid, fees, be: units ? paid / units : 0, first, realized };
}
function portfolio() {
    let coins = 0; SYMS.forEach(s => { const p = posOf(s); if (p.units > 0) coins += p.units * (priceOf(s) || p.avg); });
    const cash = cashNow(); return { cash, coins, total: cash + coins, net: netDeposits() };
}

/* ---- изчертаване ---- */
function renderPosition() { checkOrders(); renderWallet(); renderPos(); if (dirty) { renderHistory(); dirty = false; } renderBadge(); renderDrawer(); }
function renderWallet() {
    const pf = portfolio(), r = pf.total - pf.net;
    $('pfValue').innerText = eur.format(pf.total); $('cashValue').innerText = eur.format(pf.cash); $('coinsValue').innerText = eur.format(pf.coins);
    $('pfRet').innerText = pf.net > 0 ? `${sgn(r)} (${pctf(r / pf.net * 100)})` : ''; $('pfRet').className = 'hero-sub ' + (r >= 0 ? 'up' : 'down');
}
function renderPos() {
    const L = I18N[currentLang], rp = posOf(currentSymbol), el = $('pos'), p = price();
    $('posTitle').innerText = `${L.posT} · ${base()}`;
    if (rp.units <= 0) { if (posKey !== 'none|' + currentLang) { el.innerHTML = `<p class="nopos">${L.noPos}</p>`; posKey = 'none|' + currentLang; } $('avgStat').hidden = true; $('avgGap').innerText = ''; return; }
    const key = [currentSymbol, rp.units, rp.paid, rp.fees, rp.realized, currentLang].join('|');
    if (key !== posKey) {
        const row = (k, x, t, id) => `<div class="row" data-tip="${esc(L[t])}"><span>${L[k]}</span><b${id ? ` id="${id}"` : ''}>${x}</b></div>`;
        el.innerHTML = `<div class="plbig" id="pPL" data-tip="${esc(L.t_pl)}"></div>` +
            `<div class="cmp" data-tip="${esc(L.t_cmp)}"><div><span>${L.rNow}</span><b id="pNow"></b></div><div><span>${L.rAvg}</span><b class="gold">${eur.format(rp.avg)}</b></div><div><span>${L.rDiff}</span><b id="pGap"></b></div></div>` +
            `<p class="beline" id="pBE"></p>` +
            row('avg', eur.format(rp.avg), 't_avg') + row('be', eur.format(rp.be), 't_be') + row('qty', rp.units.toFixed(6) + ' ' + base(), 't_qty') + row('rPaid', eur.format(rp.paid), 't_rPaid') +
            row('val', '', 't_val', 'pVal') + row('rFees', eur.format(rp.fees), 't_fees') + (rp.realized ? row('rReal', sgn(rp.realized), 't_rReal') : '') + row('rFirst', fmtFull(rp.first), 't_bat');
        posKey = key;
    }
    const v = rp.units * p, pl = v - rp.paid, gap = (p / rp.avg - 1) * 100, toBE = (rp.be / p - 1) * 100, cls = x => x >= 0 ? 'up' : 'down';
    $('pPL').className = 'plbig ' + cls(pl); $('pPL').innerHTML = `${sgn(pl)} <small>${pctf(pl / rp.paid * 100)}</small>`;
    $('pNow').innerText = eur.format(p); $('pGap').innerText = pctf(gap); $('pGap').className = cls(gap); $('pVal').innerText = eur.format(v);
    $('pBE').className = 'beline ' + cls(-toBE); $('pBE').innerText = toBE > 0 ? `${L.beNeed} ${pctf(toBE)} (${eur.format(rp.be)})` : `${L.beAbove} ${pctf(-toBE)}`;
    $('avgStat').hidden = false; $('stAvg').innerText = eur.format(rp.avg); $('avgGap').innerText = pctf(gap); $('avgGap').className = cls(gap);
}
function historyRows(limit) {
    const L = I18N[currentLang];
    const items = W.deposits.map(d => ({ k: 'd', ts: d.ts, id: d.id, d })).concat(W.trades.map(t => ({ k: 't', ts: t.ts, id: t.id, t }))).sort((x, y) => y.ts - x.ts).slice(0, limit);
    return items.length ? items.map(it => {
        const txt = it.k === 'd' ? `${it.d.amount >= 0 ? L.depW : L.wdW} <b>${eur.format(Math.abs(it.d.amount))}</b>`
            : `${it.t.side === 'buy' ? L.buyW : L.sellW} <b>${it.t.units.toFixed(6)} ${it.t.sym.replace('EUR', '')}</b> @ ${eur.format(it.t.price)}${it.t.fee ? ` · ${L.feeW} ${eur.format(it.t.fee)}` : ''}${it.t.auto ? ` <em class="auto">${L.autoW}</em>` : ''}`;
        return `<div class="hr"><span class="hr-t">${fmtShort(it.ts)}</span><span>${txt}</span><button class="x" data-k="${it.k}" data-del="${it.id}" title="${L.del}" aria-label="${L.del}">×</button></div>`;
    }).join('') : `<p class="nopos">${L.noHist}</p>`;
}
function renderHistory() { $('history').innerHTML = historyRows(300); }
function sigMarkers() {
    if (!show.sig) return [];
    return candlesData.slice(1).map((c, i) => { const p = engulfing(candlesData[i], c);
        return p && { time: c.time, position: p === 'bull' ? 'belowBar' : 'aboveBar', color: '#fff', shape: p === 'bull' ? 'arrowUp' : 'arrowDown', text: p === 'bull' ? 'E+' : 'E−' }; }).filter(Boolean);
}
function tradeMarkers() {
    const L = I18N[currentLang], t0 = candlesData.length ? candlesData[0].time : 0;
    return W.trades.filter(t => t.sym === currentSymbol).map(t => ({ time: bucketTime(t.ts), position: t.side === 'buy' ? 'belowBar' : 'aboveBar',
        color: t.side === 'buy' ? '#f0d8a8' : '#fca5a5', shape: t.side === 'buy' ? 'arrowUp' : 'arrowDown',
        text: (t.side === 'buy' ? L.buyW : L.sellW) + ' ' + sofia(t.ts, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) })).filter(m => m.time >= t0);
}
let emKey = '', emCache = [];
function engineMarkers() {
    if (!show.sigs || candlesData.length < 130) return [];
    const L = I18N[currentLang], key = `${currentSymbol}|${currentInterval}|${candlesData.length}`;
    if (key !== emKey) {
        emKey = key; emCache = []; const cc = candlesData.slice(0, -1), P = prep(cc), H = Math.max(6, Math.min(24, Math.round(cc.length / 20)));
        for (let i = 60; i < cc.length; i++) { const sc = evalAt(P, i).score; if (sc >= 25) { emCache.push({ time: cc[i].time, b: 1 }); i += H; } else if (sc <= -25) { emCache.push({ time: cc[i].time, b: 0 }); i += H; } }
    }
    return emCache.map(m => m.b ? { time: m.time, position: 'belowBar', color: '#22c55e', shape: 'arrowUp', text: L.mkBuy } : { time: m.time, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: L.mkSell });
}
function refreshMarkers() { if (candleSeries) candleSeries.setMarkers(sigMarkers().concat(tradeMarkers(), engineMarkers()).sort((a, b) => a.time - b.time)); }
let orderLines = [];
function updateEntryLine() {
    if (!candleSeries) return;
    if (entryLine) { candleSeries.removePriceLine(entryLine); entryLine = null; }
    orderLines.forEach(l => candleSeries.removePriceLine(l)); orderLines = [];
    const L = I18N[currentLang], rp = posOf(currentSymbol);
    if (rp.units > 0) entryLine = candleSeries.createPriceLine({ price: rp.avg, color: '#f0d8a8', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: L.entry });
    W.orders.filter(o => o.sym === currentSymbol).forEach(o => orderLines.push(candleSeries.createPriceLine({ price: o.price, color: o.kind === 'stop' ? '#ef4444' : o.kind === 'tp' ? '#22c55e' : '#93b4ff', lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: L['k_' + o.side + o.kind] })));
}

/* ---- форма за сделка ---- */
const sofiaToTs = v => {
    const m = String(v).match(/([0-9]+)-([0-9]+)-([0-9]+)T([0-9]+):([0-9]+)(?::([0-9]+))?/); if (!m) return NaN;
    const [y, mo, d, h, mi, s] = m.slice(1).map(x => +x || 0), guess = Date.UTC(y, mo - 1, d, h, mi, s);
    const off = t => { const o = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
        return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second) - t; };
    let ts = guess - off(guess); ts = guess - off(ts); return ts;
};
const nowSofia = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()).replace(' ', 'T');
function uiLabels() {
    const L = I18N[currentLang];
    $('amtLabel').innerText = mode === 'amount' ? (side === 'buy' ? L.amtBuy : L.amtSell) : `${L.unitsLbl} (${base()})`;
    $('btnTrade').innerText = `${side === 'buy' ? L.sideBuy : L.sideSell} ${base()}${typ === 'limit' ? ' · ' + L.typeLimit.toLowerCase() : ''}`;
    $('btnTrade').className = `btn big ${side}`;
    $('limitBox').hidden = typ !== 'limit'; $('manualRow').hidden = typ === 'limit'; $('feeWrap').hidden = typ === 'limit'; $('manualBox').hidden = typ === 'limit' || !$('manualOn').checked;
}
function calcTrade() {
    const lim = typ === 'limit', manual = !lim && $('manualOn').checked, P = lim ? val_('limitPrice') : manual ? val_('mPrice') : price(), V = val_('amountIn');
    if (!(P > 0)) return { err: lim || manual ? 'e_price' : 'm_wait' }; if (!(V > 0)) return { err: 'e_val' };
    const gross = mode === 'amount' ? V : V * P, F = lim ? gross * W.feePct / 100 : val_('feeIn');
    if (side === 'buy') {
        if (mode === 'amount') { if (F >= V) return { err: 'e_fee' }; return { price: P, units: (V - F) / P, paid: V }; }
        return { price: P, units: V, paid: V * P + F };
    }
    const u = mode === 'amount' ? V / P : V, net = u * P - F; if (net <= 0) return { err: 'e_fee' };
    return { price: P, units: u, net };
}
function updatePreview() {
    const L = I18N[currentLang], r = calcTrade(), el = $('preview'); el.className = 'preview';
    el.innerText = r.err ? '' : `≈ ${r.units.toFixed(6)} ${base()} · ${r.paid != null ? L.rPaid + ' ' + eur.format(r.paid) : L.rNet + ' ' + eur.format(r.net)} · @ ${eur.format(r.price)}`;
}
function say(k) { const el = $('preview'); el.className = 'preview bad'; el.innerText = I18N[currentLang][k]; }
function afterChange() { saveW(); dirty = true; posKey = ''; renderPosition(); updateEntryLine(); refreshMarkers(); updatePreview(); renderGuard(); renderDrawer(true); }
function submitTrade() {
    if (typ === 'limit') return placeLimit();
    const manual = $('manualOn').checked; let ts = Date.now();
    if (manual) { ts = sofiaToTs($('mDate').value); if (!isFinite(ts)) return say('e_date'); }
    const r = calcTrade(); if (r.err) return say(r.err);
    if (side === 'buy' && r.paid > availCash() + 1e-9) return say('e_cash');
    if (side === 'sell' && r.units > posOf(currentSymbol, ts).units * 1.0000001 + 1e-9) return say('e_units');
    W.trades.push({ id: uid(), ts, sym: currentSymbol, side, price: r.price, units: r.units, paid: r.paid || 0, net: r.net || 0, fee: val_('feeIn'), manual });
    $('amountIn').value = ''; afterChange();
}
const cents = x => Math.round(x * 100) / 100;
function moveMoney(dir) {
    const L = I18N[currentLang], a = cents(val_('depIn')), m = $('wdMsg'); m.className = 'preview'; m.innerText = '';
    if (!(a > 0)) return;
    if (dir < 0 && a > cents(availCash()) + 0.004) { m.className = 'preview bad'; m.innerText = `${L.e_wd} ${eur.format(Math.max(0, availCash()))}`; return; }
    W.deposits.push({ id: uid(), ts: Date.now(), amount: dir * a }); $('depIn').value = ''; afterChange();
}
function deleteRecord(kind, id) { if (kind === 'd') W.deposits = W.deposits.filter(d => d.id !== id); else W.trades = W.trades.filter(t => t.id !== id); afterChange(); }
function resetAll() {
    const L = I18N[currentLang]; if (!confirm(L.confirmReset)) return;
    W.deposits = []; W.trades = []; W.orders = []; clearSel(); afterChange(); toast(L.resetDone);
}

/* красиви стрелки за числата вместо стандартните на браузъра */
const CHEV = '<svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true"><path d="M1 5l3.5-3.8L8 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function setupSteppers() {
    const steps = { amountIn: 10, feeIn: .01, depIn: 10, mPrice: .01 };
    document.querySelectorAll('input[type=number]').forEach(inp => {
        const w = document.createElement('div'); w.className = 'num'; inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
        const st = document.createElement('div'); st.className = 'stp';
        [[1, '+'], [-1, '−']].forEach(([dir, lbl]) => {
            const b = document.createElement('button'); b.type = 'button'; b.tabIndex = -1; b.setAttribute('aria-label', lbl); b.innerHTML = CHEV;
            b.onclick = () => { inp.value = Math.round(Math.max(0, val_(inp.id) + dir * (['gStop', 'gTp', 'limitPrice'].includes(inp.id) ? (price() > 100 ? 1 : price() > 10 ? .1 : .01) : (steps[inp.id] || 1))) * 1e4) / 1e4; inp.dispatchEvent(new Event('input', { bubbles: true })); };
            st.appendChild(b);
        });
        w.appendChild(st);
    });
}
async function pollPrices() {
    try {
        const j = await (await fetch('https://api.kraken.com/0/public/Ticker?pair=' + SYMS.map(s => KRAKEN[s].rest).join(','))).json();
        Object.entries(j.result || {}).forEach(([k, v]) => { const s = SYMS.find(x => k.includes(KRAKEN[x].code)); if (s) lastPrices[s] = +v.c[0]; });
        feedTick(currentSymbol, lastPrices[currentSymbol]); SYMS.forEach(s => pushTick(s, lastPrices[s])); checkOrders(); renderWallet(); renderBadge(); renderDrawer();
    } catch (e) {}
}
function setupWallet() {
    setupSteppers();
    const seg = (id, set) => $(id).querySelectorAll('button').forEach(b => b.onclick = () => { set(b.dataset.v); $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); uiLabels(); updatePreview(); });
    seg('sideSeg', v => side = v); seg('modeSeg', v => mode = v);
    seg('typeSeg', v => { typ = v; if (v === 'limit' && !val_('limitPrice') && price()) $('limitPrice').value = price().toFixed(price() < 10 ? 4 : 2); });
    ['amountIn', 'feeIn', 'mPrice', 'limitPrice'].forEach(id => $(id).addEventListener('input', updatePreview));
    document.querySelectorAll('[data-pct]').forEach(b => b.onclick = () => {
        const f = b.dataset.pct / 100, rp = posOf(currentSymbol), p = price();
        const baseAmt = side === 'buy' ? availCash() : (mode === 'amount' ? rp.units * p : rp.units);
        $('amountIn').value = (Math.floor(baseAmt * f * 1e4) / 1e4).toString(); updatePreview();
    });
    document.querySelectorAll('[data-fee]').forEach(b => b.onclick = () => {
        const V = val_('amountIn'), gross = mode === 'amount' ? V : V * ($('manualOn').checked ? val_('mPrice') : price());
        $('feeIn').value = (Math.round(gross * b.dataset.fee / 100 * 1e4) / 1e4).toString(); updatePreview();
    });
    $('manualOn').addEventListener('change', e => { $('manualBox').hidden = !e.target.checked; if (e.target.checked) { $('mDate').value = nowSofia(); $('mPrice').value = price() ? price().toFixed(2) : ''; } updatePreview(); });
    $('btnTrade').onclick = submitTrade; $('btnDep').onclick = () => moveMoney(1); $('btnWd').onclick = () => moveMoney(-1);
    $('history').addEventListener('click', e => {
        const id = e.target.dataset && e.target.dataset.del; if (!id) return;
        if (e.target.dataset.k === 'd') W.deposits = W.deposits.filter(d => d.id !== id); else W.trades = W.trades.filter(t => t.id !== id);
        afterChange();
    });
    $('symbolSelect').addEventListener('change', () => { posKey = ''; mtfRes = null; mtfRows = null; uiLabels(); updatePreview(); renderSignal(true); loadMTF(); updateEntryLine(); renderGuard(); });
    uiLabels(); pollPrices(); setInterval(pollPrices, 3000);
}

/* ---------- Периоди: 1Д, 1С, 1М, 3М, 1Г, MAX ---------- */
const PERIODS = { '1d': ['5m', 288], '1w': ['30m', 336], '1m': ['4h', 180], '3m': ['1d', 90], '1y': ['1d', 365], 'max': ['1w', 1000] };
const bucketTime = ts => { const s = Math.floor(ts / 1000); let t = -1; for (const c of candlesData) { if (c.time <= s) t = c.time; else break; } return t; };
function setupPeriods() {
    document.querySelectorAll('.per-btn').forEach(b => b.addEventListener('click', () => {
        const [iv, lim] = PERIODS[b.dataset.per]; currentInterval = iv; currentLimit = lim;
        document.querySelectorAll('.per-btn').forEach(x => x.classList.toggle('active', x === b));
        document.querySelectorAll('.tf-btn').forEach(x => x.classList.toggle('active', x.dataset.tf === iv));
        loadHistoricalData();
    }));
}

/* ---------- Текстове ---------- */
Object.assign(I18N.bg, { p1d: '1Д', p1w: '1С', p1m: '1М', p3m: '3М', p1y: '1Г', pmax: 'MAX', avgShort: 'Средна цена', entry: 'Средна цена', avg: 'Средна цена',
 t_p1d: 'Последните 24 часа (свещи от 5 минути).', t_p1w: 'Последната седмица (свещи от 30 минути).', t_p1m: 'Последния месец (свещи от 4 часа).', t_p3m: 'Последните 3 месеца (дневни свещи).', t_p1y: 'Последната година (дневни свещи).', t_pmax: 'Цялата налична история (седмични свещи).',
 wallet: 'Портфейл', cash: 'Налични EUR', inCoins: 'В монети', deposit: 'Депозит', withdraw: 'Теглене', newTrade: 'Нова сделка', sideBuy: 'Купи', sideSell: 'Продай', modeAmt: 'Сума (€)', modeUnits: 'Монети',
 amtBuy: 'Сума за покупка (€)', amtSell: 'Сума от продажба (€)', unitsLbl: 'Брой монети', fee: 'Такса (€)', feePreset: 'Бърза такса:', all: 'Всичко',
 manual: 'Ръчна цена и час (от историята на Kraken)', mPrice: 'Изпълнена цена (€)', mDate: 'Дата и час (българско време)',
 posT: 'Позиция', hist: 'История', noPos: 'Нямаш отворена позиция за тази монета. Добави депозит и купи, за да я следиш тук.', noHist: 'Още няма записи. Започни с депозит.',
 depW: 'Депозит', wdW: 'Теглене', buyW: 'Купих', sellW: 'Продадох', feeW: 'такса', del: 'Изтрий', rNow: 'Сега', rAvg: 'Средна цена', rDiff: 'Разлика', rPaid: 'Вложено', rNet: 'Получено', rFees: 'Такси', rReal: 'Реализирана печалба', rFirst: 'Първа покупка',
 beNeed: 'До нулата (след такси) още', beAbove: 'Над нулата след такси с', qty: 'Количество', be: 'Цена „на нулата“', val: 'Текуща стойност',
 e_date: 'Въведи валидна дата и час.', e_price: 'Въведи изпълнената цена.', e_val: 'Въведи сума или брой монети над 0.', e_fee: 'Таксата трябва да е по-малка от сумата.', e_units: 'Нямаш толкова монети за продажба към тази дата.',
 e_cash: 'Нямаш достатъчно налични EUR. Добави депозит.', e_wd: 'Нямаш толкова налични EUR.', m_wait: 'Изчакай цената да се зареди.',
 t_wallet: 'Огледало на твоя Kraken портфейл: пари в евро плюс монетите, които държиш. Започваш с депозит, както в Kraken.', t_cash: 'Свободните евро, с които можеш да купуваш.', t_inv: 'Текущата стойност на монетите, които държиш.',
 t_dep: 'Добавя евро в портфейла, като депозит в Kraken. Въведи сумата в полето вляво.', t_wd: 'Изважда евро от портфейла (теглене).',
 t_fee: 'Таксата, която Kraken ти е взел, в евро. Въведи я ръчно от историята на сделките. Тя се удържа от сумата и влиза в печалбата/загубата.',
 t_manual: 'Включи, ако преписваш сделка, която вече си направил в Kraken: въвеждаш цената и часа от историята ѝ, вместо да се ползват текущите.', t_mPrice: 'Изпълнената цена (Price) от историята на поръчките в Kraken.', t_mDate: 'Кога е изпълнена сделката. Въвежда се по българско време.',
 t_hist: 'Депозити и сделки, най-новите най-отгоре. С × можеш да изтриеш грешен запис.', t_cmp: 'Текущата цена спрямо твоята средна цена. Зелено = над средната (печалба преди такси).',
 t_pl: 'Колко печелиш (+) или губиш (−) в момента, като броим всички такси.', t_qty: 'Колко от монетата притежаваш.', t_val: 'Колко струва твоята монета сега.', t_fees: 'Общо платени такси по тази позиция.', t_bat: 'Кога си купил за пръв път, по българско време.',
 t_rPaid: 'Общо платени пари за монетите, които още държиш, включително таксите.', t_rReal: 'Печалба или загуба от вече продадени монети.', t_be: 'Ако цената е под това число, още си на загуба заради таксите. Над него излизаш на печалба.',
 t_avg: 'Средната цена, на която си купил – ориентирай се по нея: над нея си на плюс, под нея – на минус. Показва се и като линия на графиката.', t_sim: 'Портфейлът ти в приложението.' });
Object.assign(I18N.en, { p1d: '1D', p1w: '1W', p1m: '1M', p3m: '3M', p1y: '1Y', pmax: 'MAX', avgShort: 'Average price', entry: 'Average price', avg: 'Average price',
 t_p1d: 'Last 24 hours (5-minute candles).', t_p1w: 'Last week (30-minute candles).', t_p1m: 'Last month (4-hour candles).', t_p3m: 'Last 3 months (daily candles).', t_p1y: 'Last year (daily candles).', t_pmax: 'All available history (weekly candles).',
 wallet: 'Wallet', cash: 'Cash EUR', inCoins: 'In coins', deposit: 'Deposit', withdraw: 'Withdraw', newTrade: 'New trade', sideBuy: 'Buy', sideSell: 'Sell', modeAmt: 'Amount (€)', modeUnits: 'Coins',
 amtBuy: 'Amount to buy (€)', amtSell: 'Sale amount (€)', unitsLbl: 'Number of coins', fee: 'Fee (€)', feePreset: 'Quick fee:', all: 'All',
 manual: 'Manual price and time (from Kraken history)', mPrice: 'Fill price (€)', mDate: 'Date and time (Bulgarian time)',
 posT: 'Position', hist: 'History', noPos: 'No open position for this coin. Add a deposit and buy to track it here.', noHist: 'No records yet. Start with a deposit.',
 depW: 'Deposit', wdW: 'Withdrawal', buyW: 'Bought', sellW: 'Sold', feeW: 'fee', del: 'Delete', rNow: 'Now', rAvg: 'Average', rDiff: 'Difference', rPaid: 'Invested', rNet: 'Received', rFees: 'Fees', rReal: 'Realized profit', rFirst: 'First buy',
 beNeed: 'To break even (after fees) still', beAbove: 'Above break-even after fees by', qty: 'Amount', be: 'Break-even price', val: 'Current value',
 e_date: 'Enter a valid date and time.', e_price: 'Enter the fill price.', e_val: 'Enter an amount or coins above 0.', e_fee: 'The fee must be smaller than the amount.', e_units: 'You do not hold that many coins at that date.',
 e_cash: 'Not enough cash EUR. Add a deposit.', e_wd: 'Not enough cash EUR.', m_wait: 'Wait for the price to load.',
 t_wallet: 'A mirror of your Kraken wallet: euro cash plus the coins you hold. You start with a deposit, like on Kraken.', t_cash: 'Free euro you can buy with.', t_inv: 'Current value of the coins you hold.',
 t_dep: 'Adds euro to the wallet, like a Kraken deposit. Enter the amount in the field on the left.', t_wd: 'Takes euro out of the wallet (withdrawal).',
 t_fee: 'The fee Kraken charged you, in euro. Enter it manually from your trade history. It comes out of the amount and counts in profit/loss.',
 t_manual: 'Turn on when copying a trade you already made on Kraken: enter the price and time from its history instead of using the current ones.', t_mPrice: 'The filled price from your Kraken order history.', t_mDate: 'When the trade was filled. Entered in Bulgarian time.',
 t_hist: 'Deposits and trades, newest first. Use × to delete a wrong entry.', t_cmp: 'Current price vs your average price. Green = above average (profit before fees).',
 t_pl: 'How much you are up (+) or down (−) right now, counting all fees.', t_qty: 'How much of the coin you own.', t_val: 'What your coins are worth now.', t_fees: 'Total fees paid on this position.', t_bat: 'When you first bought, in Bulgarian time.',
 t_rPaid: 'Total money paid for the coins you still hold, including fees.', t_rReal: 'Profit or loss from coins already sold.', t_be: 'Below this price you are still at a loss because of fees. Above it you are in profit.',
 t_avg: 'The average price you bought at – use it as your guide: above it you are in profit, below it at a loss. Also drawn as a line on the chart.', t_sim: 'Your portfolio in the app.' });

/* ======================================================================
   СИГНАЛ ПО ДАННИ: индикатори от свещите (тренд, RSI, MACD, Bollinger, обем,
   формации, поддръжка/съпротива, ATR) на няколко периода (15м, 1ч, 4ч, 1д),
   с обяснение и проверка как е работил в миналото на тази монета.
   ====================================================================== */
//#ENGINE-START
function emaS(v, p) { const k = 2 / (p + 1), o = []; let e = v[0]; for (let i = 0; i < v.length; i++) { e = i ? v[i] * k + e * (1 - k) : v[0]; o.push(e); } return o; }
function rsiS(v, p = 14) {
    const o = new Array(v.length).fill(50); if (v.length <= p) return o; let g = 0, l = 0;
    for (let i = 1; i <= p; i++) { const d = v[i] - v[i - 1]; d >= 0 ? g += d : l -= d; }
    let ag = g / p, al = l / p; o[p] = 100 - 100 / (1 + ag / (al || 1e-9));
    for (let i = p + 1; i < v.length; i++) { const d = v[i] - v[i - 1]; ag = (ag * (p - 1) + Math.max(d, 0)) / p; al = (al * (p - 1) + Math.max(-d, 0)) / p; o[i] = 100 - 100 / (1 + ag / (al || 1e-9)); }
    return o;
}
function macdS(v) { const a = emaS(v, 12), b = emaS(v, 26), m = a.map((x, i) => x - b[i]), s = emaS(m, 9); return { h: m.map((x, i) => x - s[i]) }; }
function atrS(c, p = 14) {
    const tr = c.map((x, i) => i ? Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close)) : x.high - x.low);
    let a = tr.slice(0, p).reduce((s, x) => s + x, 0) / p; return tr.map((x, i) => { if (i >= p) a = (a * (p - 1) + x) / p; return a; });
}
function prep(c) { const cl = c.map(x => x.close); return { c, cl, e20: emaS(cl, 20), e50: emaS(cl, 50), r: rsiS(cl), M: macdS(cl), atr: atrS(c) }; }
function evalAt(P, i) {
    const { c, cl, e20, e50, r, M, atr } = P, x = c[i], f = [], add = (k, p) => { f.push({ k, p }); };
    const up = cl[i] > e50[i], ex = e20[i] > e50[i];
    if (up && ex) add('trendUp', 2); else if (!up && !ex) add('trendDown', -2); else if (up) add('trendMixUp', .5); else add('trendMixDown', -.5);
    for (let j = Math.max(1, i - 2); j <= i; j++) {
        if (e20[j - 1] <= e50[j - 1] && e20[j] > e50[j]) { add('crossUp', 1.5); break; }
        if (e20[j - 1] >= e50[j - 1] && e20[j] < e50[j]) { add('crossDown', -1.5); break; }
    }
    const rv = r[i]; if (rv < 30) add('rsiLow', 2); else if (rv < 40) add('rsiLow2', 1); else if (rv > 70) add('rsiHigh', -2); else if (rv > 62) add('rsiHigh2', -.5);
    const h = M.h, hp = h[i - 1];
    if (hp <= 0 && h[i] > 0) add('macdCrossUp', 1.5); else if (hp >= 0 && h[i] < 0) add('macdCrossDown', -1.5); else if (h[i] > 0 && h[i] > hp) add('macdUp', 1); else if (h[i] < 0 && h[i] < hp) add('macdDown', -1);
    if (i >= 19) {
        const s = cl.slice(i - 19, i + 1), m = s.reduce((a, b) => a + b) / 20, sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / 20), b = (cl[i] - (m - 2 * sd)) / ((4 * sd) || 1e-9);
        if (b < .05) add('bbLow', 1.5); else if (b > .95) add('bbHigh', -1.5);
    }
    if (i >= 20) { const av = c.slice(i - 20, i).reduce((a, y) => a + y.vol, 0) / 20; if (av > 0 && x.vol > 1.8 * av) add(x.close >= x.open ? 'volUp' : 'volDown', x.close >= x.open ? 1 : -1); }
    const body = Math.abs(x.close - x.open), lw = Math.min(x.open, x.close) - x.low, uw = x.high - Math.max(x.open, x.close), en = i ? engulfing(c[i - 1], x) : null;
    if (en === 'bull') add('engUp', 1.5); else if (en === 'bear') add('engDown', -1.5);
    else if (lw > 2 * body && uw < body * .8 && r[i] < 50) add('hammer', 1); else if (uw > 2 * body && lw < body * .8 && r[i] > 50) add('star', -1);
    if (i >= 50) {
        const w = c.slice(i - 50, i), lo = Math.min(...w.map(y => y.low)), hi = Math.max(...w.map(y => y.high));
        if (x.low <= lo + atr[i]) add('nearSup', 1); else if (x.high >= hi - atr[i]) add('nearRes', -1);
    }
    const total = f.reduce((a, y) => a + y.p, 0);
    return { score: Math.max(-100, Math.min(100, Math.round(total / 9 * 100))), f };
}
function backtest(c) {
    if (c.length < 130) return null;
    const cc = c.slice(0, -1), P = prep(cc), H = Math.max(6, Math.min(24, Math.round(cc.length / 20))), FEE = .5;
    const out = { H, buy: { n: 0, w: 0, s: 0 }, sell: { n: 0, w: 0, s: 0 }, base: 0 }; let up = 0, tot = 0;
    for (let i = 60; i < cc.length - H; i++) { tot++; if (cc[i + H].close > cc[i].close) up++; }
    for (let i = 60; i < cc.length - H; i++) {
        const sc = evalAt(P, i).score, ret = (cc[i + H].close / cc[i].close - 1) * 100;
        if (sc >= 25) { out.buy.n++; if (ret > FEE) out.buy.w++; out.buy.s += ret; i += H; }
        else if (sc <= -25) { out.sell.n++; if (ret < -FEE) out.sell.w++; out.sell.s += ret; i += H; }
    }
    out.base = tot ? up / tot * 100 : 0; return out;
}
//#ENGINE-END

const MTF = [[15, '15м', .15], [60, '1ч', .25], [240, '4ч', .30], [1440, '1д', .30]];
const KMIN_LABEL = { '1m': '1м', '5m': '5м', '15m': '15м', '30m': '30м', '1h': '1ч', '4h': '4ч', '1d': '1д', '1w': '1С' };
let mtfRes = null, bt = null, btDirty = true, lastVerdict = null, lastSigRender = 0, mtfBusy = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function loadMTF() {
    if (mtfBusy) return; mtfBusy = true; const sym = currentSymbol, rows = [];
    try {
        for (const [m, label, w] of MTF) {
            try {
                const j = await (await fetch(`https://api.kraken.com/0/public/OHLC?pair=${KRAKEN[sym].rest}&interval=${m}`)).json();
                const cs = Object.values(j.result).find(Array.isArray).map(toCandle).slice(0, -1);
                if (cs.length >= 60) { const P = prep(cs), i = cs.length - 1, ev = evalAt(P, i); rows.push({ m, label, w, score: ev.score, f: ev.f, atr: P.atr[i], price: cs[i].close }); }
            } catch (e) {}
            await sleep(350);
        }
    } finally { mtfBusy = false; }
    if (sym !== currentSymbol) return loadMTF();
    if (!rows.length) return;
    mtfRows = rows; mtfAt = Date.now(); renderSignal(true);
}

const FX = {
 bg: { trendUp: 'Цената е над средната 50 и краткият тренд е нагоре', trendDown: 'Цената е под средната 50 и трендът е надолу', trendMixUp: 'Цената е над средната 50, но краткият тренд се колебае', trendMixDown: 'Цената е под средната 50, но краткият тренд се колебае',
  crossUp: 'Средната 20 тъкмо пресече средната 50 нагоре', crossDown: 'Средната 20 тъкмо пресече средната 50 надолу', rsiLow: 'RSI под 30: силно изпродадено, възможен отскок', rsiLow2: 'RSI под 40: цената е ниска спрямо последните свещи',
  rsiHigh: 'RSI над 70: прекалено покачена, риск от спад', rsiHigh2: 'RSI над 62: започва да се претегля нагоре', macdUp: 'Импулсът (MACD) расте', macdDown: 'Импулсът (MACD) отслабва', macdCrossUp: 'MACD обърна нагоре', macdCrossDown: 'MACD обърна надолу',
  bbLow: 'Цената е на долния ръб на ценовия коридор', bbHigh: 'Цената е на горния ръб на ценовия коридор', volUp: 'Голям обем при покачване', volDown: 'Голям обем при спад', engUp: 'Бичо поглъщане – обръща нагоре', engDown: 'Мечо поглъщане – обръща надолу',
  hammer: 'Свещ „чук“ – купувачите спряха падането', star: 'Свещ „падаща звезда“ – продавачите спряха покачването', nearSup: 'Близо до скорошно дъно (поддръжка)', nearRes: 'Близо до скорошен връх (съпротива)' },
 en: { trendUp: 'Price is above the 50 average and the short trend is up', trendDown: 'Price is below the 50 average and the trend is down', trendMixUp: 'Price is above the 50 average but the short trend wavers', trendMixDown: 'Price is below the 50 average but the short trend wavers',
  crossUp: 'The 20 average just crossed above the 50', crossDown: 'The 20 average just crossed below the 50', rsiLow: 'RSI below 30: heavily oversold, possible bounce', rsiLow2: 'RSI below 40: price is low versus recent candles',
  rsiHigh: 'RSI above 70: overstretched, risk of a drop', rsiHigh2: 'RSI above 62: leaning overbought', macdUp: 'Momentum (MACD) is rising', macdDown: 'Momentum (MACD) is fading', macdCrossUp: 'MACD turned up', macdCrossDown: 'MACD turned down',
  bbLow: 'Price is at the lower edge of its corridor', bbHigh: 'Price is at the upper edge of its corridor', volUp: 'Big volume on a rise', volDown: 'Big volume on a fall', engUp: 'Bullish engulfing – turning up', engDown: 'Bearish engulfing – turning down',
  hammer: 'Hammer candle – buyers stopped the fall', star: 'Shooting star – sellers stopped the rise', nearSup: 'Near a recent low (support)', nearRes: 'Near a recent high (resistance)' } };

/* общ сигнал: 15м/1ч/4ч/1д + живата графика, ако е на друг период */
function buildVerdict() {
    if (!mtfRows || !mtfRows.length) return null; const rows = mtfRows.slice();
    if (![15, 60, 240, 1440].includes(KMIN[currentInterval]) && candlesData.length >= 70) {
        const cs = candlesData.slice(0, -1), P = prep(cs), i = cs.length - 1, ev = evalAt(P, i);
        rows.unshift({ m: KMIN[currentInterval], label: KMIN_LABEL[currentInterval] || currentInterval, w: .15, score: ev.score, f: ev.f, atr: P.atr[i], price: cs[i].close, live: true });
    }
    const Wt = rows.reduce((a, r) => a + r.w, 0), combined = Math.round(rows.reduce((a, r) => a + r.score * r.w, 0) / Wt);
    const verdict = combined >= 25 ? 'buy' : combined <= -25 ? 'sell' : 'wait', dir = verdict === 'buy' ? 1 : verdict === 'sell' ? -1 : 0;
    const agree = rows.filter(r => dir === 0 ? Math.abs(r.score) < 25 : dir * r.score >= 12).length;
    const by = {}; rows.forEach(r => r.f.forEach(x => { const o = by[x.k] || (by[x.k] = { k: x.k, p: 0, tf: [] }); o.p += x.p * r.w; o.tf.push(r.label); }));
    const factors = Object.values(by).sort((a, b) => Math.abs(b.p) - Math.abs(a.p)).slice(0, 5);
    const ref = rows.find(r => r.m === 60) || rows[0], price_ = price() || ref.price;
    return { rows, combined, verdict, agree, total: rows.length, factors, levels: { price: price_, stop: price_ - 1.5 * ref.atr, target: price_ + 2.5 * ref.atr }, at: mtfAt };
}
function renderSignal(force) {
    const now = Date.now(); if (!force && now - lastSigRender < 1000) return; lastSigRender = now;
    const L = I18N[currentLang]; if (!$('signalText')) return;
    if (btDirty && candlesData.length) { bt = backtest(candlesData); btDirty = false; }
    const R = buildVerdict(); mtfRes = R;
    if (!R) { $('signalText').innerText = L.sigWait; $('signalStatus').className = 'signal hold'; $('sigScore').innerText = ''; $('signalReason').innerText = L.loadingSig; $('tfRow').innerHTML = ''; $('sigWhy').innerHTML = ''; $('sigLevels').innerHTML = ''; $('sigBt').innerText = ''; $('sigPill').innerText = ''; return; }
    const v = R.verdict, strong = Math.abs(R.combined) >= 50;
    $('signalStatus').className = 'signal ' + v; $('signalText').innerText = v === 'buy' ? L.sigBuy : v === 'sell' ? L.sigSell : L.sigWait;
    $('sigScore').innerText = `${L.score} ${R.combined > 0 ? '+' : ''}${R.combined} · ${L.agree} ${R.agree}/${R.total}${strong ? ' · ' + L.strong : ''} · ${sofia(Date.now(), { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`;
    $('sigMeter').style.left = (R.combined + 100) / 2 + '%';
    $('signalReason').innerText = v === 'buy' ? L.rBuy : v === 'sell' ? L.rSell : L.rWait;
    $('tfRow').style.gridTemplateColumns = `repeat(${R.rows.length},1fr)`;
    $('tfRow').innerHTML = R.rows.map(r => `<div class="tf ${r.score >= 25 ? 'up' : r.score <= -25 ? 'down' : r.score >= 8 ? 'upw' : r.score <= -8 ? 'downw' : ''}" data-tip="${esc(L.t_tf)}"><span>${r.label}${r.live ? ' ●' : ''}</span><b>${r.score >= 0 ? '+' : ''}${r.score}</b></div>`).join('');
    $('sigWhy').innerHTML = R.factors.map(x => `<li class="${x.p > 0 ? 'up' : 'down'}"><i>${x.p > 0 ? '▲' : '▼'}</i><span>${FX[currentLang][x.k]} ${x.tf.map(t => `<em>${t}</em>`).join('')}</span></li>`).join('');
    const lv = R.levels, p = lv.price, risk = p - lv.stop, rr = risk > 0 ? (lv.target - p) / risk : 0;
    $('sigLevels').innerHTML = `<div data-tip="${esc(L.t_levels)}"><span>${L.lvStop}</span><b class="down">${eur.format(lv.stop)}</b></div><div><span>${L.lvTarget}</span><b class="up">${eur.format(lv.target)}</b></div><div><span>${L.lvRR}</span><b>1 : ${rr.toFixed(1).replace('.', ',')}</b></div>`;
    $('sigBt').innerText = bt ? L.btText(bt, KMIN_LABEL[currentInterval] || currentInterval, base()) : L.btNone;
    $('sigPill').className = 'sig-pill ' + v; $('sigPill').innerText = v === 'buy' ? L.pillBuy : v === 'sell' ? L.pillSell : L.pillWait;
    if (lastVerdict && lastVerdict !== v && v !== 'wait') notifySignal(`${base()}: ${v === 'buy' ? L.sigBuy : L.sigSell} (${R.combined > 0 ? '+' : ''}${R.combined})`);
    lastVerdict = v;
}

/* ---------- известия ---------- */
let toastT = null;
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.setValueAtTime(.12, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .35); o.start(); o.stop(a.currentTime + .35); } catch (e) {} }
function toast(msg, sys) {
    const t = $('toast'); t.innerText = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 6000);
    if (sys && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('Trade Order', { body: msg }); } catch (e) {} }
}
function notifySignal(msg) { if (!$('notifyOn').checked) return; beep(); toast(msg, true); }

/* ---------- поръчки: чакащи (лимит, стоп, цел), изпълнение по цената на живо ---------- */
let typ = 'market', checking = false, tab = 'pos', lastDrawer = 0; const ticks = {};
function pushTick(sym, p) { if (!p) return; const a = ticks[sym] || (ticks[sym] = []), t = Date.now(); if (a.length && t - a[a.length - 1][0] < 2500) { a[a.length - 1][1] = p; return; } a.push([t, p]); if (a.length > 180) a.shift(); }
const reservedCash = () => W.orders.filter(o => o.side === 'buy').reduce((a, o) => a + o.amount, 0);
const availCash = () => cashNow() - reservedCash();
const reservedUnits = sym => W.orders.filter(o => o.side === 'sell' && o.kind === 'limit' && o.sym === sym).reduce((a, o) => a + o.units, 0);
function placeLimit() {
    const L = I18N[currentLang], P = val_('limitPrice'), V = val_('amountIn'), cur = price();
    if (!(P > 0)) return say('e_price'); if (!(V > 0)) return say('e_val');
    if (side === 'buy') {
        const A = mode === 'amount' ? V : V * P * (1 + W.feePct / 100);
        if (A > availCash() + 1e-9) return say('e_cash'); if (cur && P >= cur) return say('e_limitBuy');
        W.orders.push({ id: uid(), ts: Date.now(), sym: currentSymbol, side: 'buy', kind: 'limit', price: P, amount: A });
    } else {
        const u = mode === 'amount' ? V / P : V;
        if (u > posOf(currentSymbol).units - reservedUnits(currentSymbol) + 1e-9) return say('e_units'); if (cur && P <= cur) return say('e_limitSell');
        W.orders.push({ id: uid(), ts: Date.now(), sym: currentSymbol, side: 'sell', kind: 'limit', price: P, units: u });
    }
    $('amountIn').value = ''; afterChange(); toast(L.placed);
}
function checkOrders() {
    if (checking || !W.orders.length) return; checking = true; let changed = false;
    try {
        for (const o of [...W.orders]) {
            const p = priceOf(o.sym); if (!p) continue;
            const hit = o.side === 'buy' ? p <= o.price : (o.kind === 'stop' ? p <= o.price : p >= o.price); if (!hit) continue;
            const L = I18N[currentLang], b = o.sym.replace('EUR', ''); W.orders = W.orders.filter(x => x.id !== o.id); changed = true;
            if (o.side === 'buy') {
                if (o.amount > cashNow() + 1e-9) continue;
                const fp = Math.min(p, o.price), fee = o.amount * W.feePct / 100;
                W.trades.push({ id: uid(), ts: Date.now(), sym: o.sym, side: 'buy', price: fp, units: (o.amount - fee) / fp, paid: o.amount, net: 0, fee, manual: false, auto: o.kind });
                toast(`${L.filled}: ${L.buyW} ${b} @ ${eur.format(fp)}`, true);
            } else {
                const held = posOf(o.sym).units, u = Math.min(o.units, held); if (u <= 1e-12) continue;
                const fp = o.kind === 'stop' ? p : Math.max(p, o.price), gross = u * fp, fee = gross * W.feePct / 100;
                W.trades.push({ id: uid(), ts: Date.now(), sym: o.sym, side: 'sell', price: fp, units: u, paid: 0, net: gross - fee, fee, manual: false, auto: o.kind });
                if (posOf(o.sym).units < 1e-9) W.orders = W.orders.filter(x => x.sym !== o.sym || x.side === 'buy');
                toast(`${L.filled}: ${L['k_sell' + o.kind]} ${b} @ ${eur.format(fp)}`, true);
            }
        }
    } finally { checking = false; }
    if (changed) afterChange();
}
function sellAll(sym) {
    const rp = posOf(sym), p = priceOf(sym); if (rp.units <= 0 || !p) return;
    const gross = rp.units * p, fee = gross * W.feePct / 100;
    W.trades.push({ id: uid(), ts: Date.now(), sym, side: 'sell', price: p, units: rp.units, paid: 0, net: gross - fee, fee, manual: false, auto: 'market' });
    W.orders = W.orders.filter(o => o.sym !== sym || o.side === 'buy'); afterChange();
}
function renderGuard() {
    const L = I18N[currentLang], rp = posOf(currentSymbol); $('guard').hidden = rp.units <= 0;
    const s = W.orders.find(o => o.sym === currentSymbol && o.kind === 'stop'), t = W.orders.find(o => o.sym === currentSymbol && o.kind === 'tp');
    $('guardNote').className = 'preview'; $('guardNote').innerText = (s || t) ? `${s ? L.k_sellstop + ' ' + eur.format(s.price) : ''}${s && t ? ' · ' : ''}${t ? L.k_selltp + ' ' + eur.format(t.price) : ''}` : '';
}
function setGuard() {
    const L = I18N[currentLang], rp = posOf(currentSymbol), st = val_('gStop'), tp = val_('gTp'), p = price(), el = $('guardNote');
    const bad = k => { el.className = 'preview bad'; el.innerText = L[k]; };
    if (rp.units <= 0) return; if (!st && !tp) return bad('e_guard');
    if (st && (st >= p)) return bad('e_stop'); if (tp && tp <= p) return bad('e_tp');
    W.orders = W.orders.filter(o => !(o.sym === currentSymbol && (o.kind === 'stop' || o.kind === 'tp')));
    if (st) W.orders.push({ id: uid(), ts: Date.now(), sym: currentSymbol, side: 'sell', kind: 'stop', price: st, units: rp.units });
    if (tp) W.orders.push({ id: uid(), ts: Date.now(), sym: currentSymbol, side: 'sell', kind: 'tp', price: tp, units: rp.units });
    afterChange(); toast(L.placed);
}
function autoGuard() { const lv = mtfRes && mtfRes.levels; if (!lv) return; const f = x => x.toFixed(x < 10 ? 4 : 2); $('gStop').value = f(lv.stop); $('gTp').value = f(lv.target); }

/* ---------- панел „Поръчки“ ---------- */
const openCount = () => SYMS.filter(s => posOf(s).units > 0).length + W.orders.length;
function renderBadge() { const n = openCount(); $('ordersCount').innerText = n; $('ordersBtn').classList.toggle('has', n > 0); }
function spark(sym, up) {
    const a = ticks[sym]; if (!a || a.length < 3) return ''; const v = a.map(x => x[1]), mn = Math.min(...v), mx = Math.max(...v), w = 96, h = 28;
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${v.map((y, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 2 - (y - mn) / ((mx - mn) || 1) * (h - 4)).toFixed(1)}`).join(' ')}" fill="none" stroke="${up ? '#22c55e' : '#ef4444'}" stroke-width="1.6"/></svg>`;
}
function renderDrawer(force) {
    const dr = $('ordersDrawer'); if (dr.hidden) return; const now = Date.now(); if (!force && now - lastDrawer < 900) return; lastDrawer = now;
    const L = I18N[currentLang], cls = x => x >= 0 ? 'up' : 'down'; let html = '';
    if (tab === 'pos') {
        html = SYMS.filter(s => posOf(s).units > 0).map(s => {
            const rp = posOf(s), p = priceOf(s) || rp.avg, v = rp.units * p, pl = v - rp.paid, b = s.replace('EUR', '');
            return `<div class="oc"><div class="oc-h"><b>${b}</b><span>${rp.units.toFixed(6)}</span>${spark(s, pl >= 0)}</div>
            <div class="oc-g"><div><span>${L.rAvg}</span><b>${eur.format(rp.avg)}</b></div><div><span>${L.rNow}</span><b class="${cls(p - rp.avg)}">${eur.format(p)}</b></div><div><span>${L.rPL}</span><b class="${cls(pl)}">${sgn(pl)} (${pctf(pl / rp.paid * 100)})</b></div></div>
            <button class="ghost" data-sellall="${s}">${L.sellAll}</button></div>`;
        }).join('') || `<p class="nopos">${L.noPosAll}</p>`;
    } else if (tab === 'pend') {
        html = (W.orders.length ? `<button class="ghost danger" data-clearpend="1">${L.delAll}</button>` : '') + W.orders.slice().sort((x, y) => y.ts - x.ts).map(o => {
            const p = priceOf(o.sym), dist = p ? (o.price / p - 1) * 100 : 0, b = o.sym.replace('EUR', ''), size = o.side === 'buy' ? eur.format(o.amount) : o.units.toFixed(6) + ' ' + b;
            return `<div class="oc"><div class="oc-h"><b>${L['k_' + o.side + o.kind]}</b><span>${b}</span></div>
            <div class="oc-g"><div><span>${L.trigger}</span><b>${eur.format(o.price)}</b></div><div><span>${L.rNow}</span><b>${p ? eur.format(p) : '--'}</b></div><div><span>${L.toFill}</span><b class="${cls(dist)}">${pctf(dist)}</b></div></div><p class="oc-s">${size} · ${fmtShort(o.ts)}</p>
            <button class="ghost danger" data-cancel="${o.id}">${L.del}</button></div>`;
        }).join('') || `<p class="nopos">${L.noOrders}</p>`;
    } else html = `<div class="hist">${historyRows(40)}</div>`;
    $('ordBody').innerHTML = html;
}
function setupOrders() {
    const dr = $('ordersDrawer');
    $('ordersBtn').onclick = () => { dr.hidden = !dr.hidden; renderDrawer(true); };
    $('drawerClose').onclick = () => dr.hidden = true;
    addEventListener('keydown', e => { if (e.key === 'Escape') dr.hidden = true; });
    $('ordTabs').querySelectorAll('button').forEach(b => b.onclick = () => { tab = b.dataset.v; $('ordTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderDrawer(true); });
    $('ordBody').addEventListener('click', e => {
        const d = e.target.dataset || {};
        if (d.cancel) { W.orders = W.orders.filter(o => o.id !== d.cancel); afterChange(); }
        if (d.clearpend) { W.orders = []; afterChange(); }
        if (d.del) deleteRecord(d.k, d.del);
        if (d.sellall) sellAll(d.sellall);
    });
    $('autoFee').value = W.feePct; $('autoFee').addEventListener('input', () => { W.feePct = Math.max(0, val_('autoFee')); saveW(); updatePreview(); });
    $('gSet').onclick = setGuard; $('gAuto').onclick = autoGuard;
    try { $('notifyOn').checked = localStorage.getItem('tradeOrderNotify') === '1'; } catch (e) {}
    $('notifyOn').addEventListener('change', e => {
        try { localStorage.setItem('tradeOrderNotify', e.target.checked ? '1' : '0'); } catch (err) {}
        if (e.target.checked && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
        if (e.target.checked) beep();
    });
    renderGuard(); renderBadge(); loadMTF(); setInterval(loadMTF, 90000);
}

/* ---------- текстове ---------- */
Object.assign(I18N.bg, { orders: 'Поръчки', ordersT: 'Моите поръчки', tabPos: 'Позиции', tabPend: 'Чакащи', tabDone: 'Изпълнени', autoFee: 'Такса за автоматични поръчки (%)', typeMarket: 'Сега', typeLimit: 'При цена', limitPrice: 'Цена на изпълнение (€)',
 guard: 'Защита на позицията', gStop: 'Стоп загуба (€)', gTp: 'Вземи печалба (€)', gAuto: 'Препоръчани', gSet: 'Постави', notify: 'Известия', sensor: 'Сигнал', sigBuy: 'ВЛИЗАЙ · КУПИ', sigSell: 'ИЗЛИЗАЙ · ПРОДАЙ', sigWait: 'ИЗЧАКАЙ', pillBuy: 'КУПИ', pillSell: 'ПРОДАЙ', pillWait: 'ЧАКАЙ',
 score: 'Резултат', agree: 'съгласие', strong: 'силен', loadingSig: 'Анализирам свещите на няколко периода…', sellAll: 'Продай всичко', cancel: 'Откажи', trigger: 'Цена на задействане', toFill: 'До изпълнение', rPL: 'Печалба / загуба', autoW: 'авто', filled: 'Изпълнена поръчка', placed: 'Поръчката е поставена',
 noOrders: 'Няма чакащи поръчки. Избери „При цена“ в Нова сделка или постави защита на позиция.', noPosAll: 'Нямаш отворени позиции.', noDone: 'Още няма изпълнени сделки.',
 lvStop: 'Препоръчан стоп', lvTarget: 'Препоръчана цел', lvRR: 'Риск / печалба',
 k_buylimit: 'Купи при цена', k_selllimit: 'Продай при цена', k_sellstop: 'Стоп загуба', k_selltp: 'Вземи печалба',
 rBuy: 'Повечето периоди сочат нагоре. Добър момент за влизане, ако приемеш риска.', rSell: 'Повечето периоди сочат надолу. Не купувай сега; ако държиш монета – помисли за излизане.', rWait: 'Периодите не са съгласни. Изчакай по-ясна картина.',
 disc: 'Статистически сигнал от индикаторите на графиката – не е гарантирана прогноза и не е финансов съвет.', btNone: 'Недостатъчно история, за да проверя как е работил сигналът в миналото.',
 btText: (b, tf, c) => `Проверка в миналото (${c}, свещи ${tf}): ${b.buy.n ? `${b.buy.n} сигнала КУПИ → след ${b.H} свещи цената е била над +0,5% в ${Math.round(b.buy.w / b.buy.n * 100)}% от случаите (средно ${(b.buy.s / b.buy.n).toFixed(2).replace('.', ',')}%)` : 'няма сигнали КУПИ'}; ${b.sell.n ? `${b.sell.n} сигнала ПРОДАЙ → цената е падала под −0,5% в ${Math.round(b.sell.w / b.sell.n * 100)}%` : 'няма сигнали ПРОДАЙ'}. За сравнение: във всички моменти цената е била по-висока след ${b.H} свещи в ${Math.round(b.base)}%. Малко случаи = слаба увереност.`,
 e_limitBuy: 'Цената за покупка трябва да е под текущата.', e_limitSell: 'Цената за продажба трябва да е над текущата.', e_guard: 'Въведи стоп или цел.', e_stop: 'Стопът трябва да е под текущата цена.', e_tp: 'Целта трябва да е над текущата цена.',
 t_orders: 'Отваря панел с отворените ти позиции (как се движат на живо) и чакащите поръчки.', t_autoFee: 'Таксата, която се взема от автоматичните поръчки (лимит, стоп, цел). Въведи твоя процент от Kraken (напр. 0,25 или 0,40).',
 t_type: 'Купува или продава веднага по текущата цена.', t_limit: 'Поръчка, която се изпълнява сама, когато цената стигне до зададена от теб – като лимитна поръчка в Kraken.', t_limitPrice: 'Купуваш, когато цената падне до това ниво, или продаваш, когато стигне до него.',
 t_guard: 'Автоматични поръчки за продажба: стоп загуба ограничава загубата ти, „вземи печалба“ продава при целта. Когато едната се изпълни, позицията е затворена.', t_gAuto: 'Попълва стоп и цел по волатилността (ATR) на 1-часовите свещи.',
 t_notify: 'Звук и съобщение, когато сигналът стане КУПИ или ПРОДАЙ. Браузърът може да поиска разрешение.', t_pill: 'Общ сигнал от свещите на няколко периода.', t_score: 'От −100 (силно продавай) до +100 (силно купувай). Между −30 и +30 е „изчакай“.',
 t_tf: 'Резултат за този период от свещите му. Зелено = нагоре, червено = надолу.', t_levels: 'Ориентир по волатилността: стопът е на 1,5 ATR под цената, целта на 2,5 ATR над нея. Не е гаранция.',
 t_sensor: 'Комбинира тренд, RSI, MACD, ценови коридор, обем, свещни формации и поддръжка/съпротива от 15м, 1ч, 4ч и 1д свещи.' });
Object.assign(I18N.en, { orders: 'Orders', ordersT: 'My orders', tabPos: 'Positions', tabPend: 'Pending', tabDone: 'Filled', autoFee: 'Fee for automatic orders (%)', typeMarket: 'Now', typeLimit: 'At price', limitPrice: 'Trigger price (€)',
 guard: 'Position protection', gStop: 'Stop loss (€)', gTp: 'Take profit (€)', gAuto: 'Suggested', gSet: 'Set', notify: 'Alerts', sensor: 'Signal', sigBuy: 'ENTER · BUY', sigSell: 'EXIT · SELL', sigWait: 'WAIT', pillBuy: 'BUY', pillSell: 'SELL', pillWait: 'WAIT',
 score: 'Score', agree: 'agreement', strong: 'strong', loadingSig: 'Analysing candles on several timeframes…', sellAll: 'Sell all', cancel: 'Cancel', trigger: 'Trigger price', toFill: 'To fill', rPL: 'Profit / loss', autoW: 'auto', filled: 'Order filled', placed: 'Order placed',
 noOrders: 'No pending orders. Choose "At price" in New trade or protect a position.', noPosAll: 'No open positions.', noDone: 'No filled trades yet.',
 lvStop: 'Suggested stop', lvTarget: 'Suggested target', lvRR: 'Risk / reward',
 k_buylimit: 'Buy at price', k_selllimit: 'Sell at price', k_sellstop: 'Stop loss', k_selltp: 'Take profit',
 rBuy: 'Most timeframes point up. A good moment to enter if you accept the risk.', rSell: 'Most timeframes point down. Do not buy now; if you hold, consider exiting.', rWait: 'Timeframes disagree. Wait for a clearer picture.',
 disc: 'A statistical signal from chart indicators – not a guaranteed forecast and not financial advice.', btNone: 'Not enough history to check how the signal worked in the past.',
 btText: (b, tf, c) => `Past check (${c}, ${tf} candles): ${b.buy.n ? `${b.buy.n} BUY signals → after ${b.H} candles price was above +0.5% in ${Math.round(b.buy.w / b.buy.n * 100)}% of cases (avg ${(b.buy.s / b.buy.n).toFixed(2)}%)` : 'no BUY signals'}; ${b.sell.n ? `${b.sell.n} SELL signals → price fell below −0.5% in ${Math.round(b.sell.w / b.sell.n * 100)}%` : 'no SELL signals'}. For comparison: across all moments price was higher after ${b.H} candles ${Math.round(b.base)}% of the time. Few cases = low confidence.`,
 e_limitBuy: 'The buy price must be below the current price.', e_limitSell: 'The sell price must be above the current price.', e_guard: 'Enter a stop or a target.', e_stop: 'The stop must be below the current price.', e_tp: 'The target must be above the current price.',
 t_orders: 'Opens a panel with your open positions (moving live) and pending orders.', t_autoFee: 'The fee taken by automatic orders (limit, stop, target). Enter your Kraken rate (e.g. 0.25 or 0.40).',
 t_type: 'Buys or sells immediately at the current price.', t_limit: 'An order that fills by itself when the price reaches the level you set – like a limit order on Kraken.', t_limitPrice: 'You buy when the price drops to this level, or sell when it rises to it.',
 t_guard: 'Automatic sell orders: stop loss limits your loss, take profit sells at the target. When one fills, the position is closed.', t_gAuto: 'Fills stop and target from the volatility (ATR) of 1-hour candles.',
 t_notify: 'Sound and message when the signal turns BUY or SELL. The browser may ask for permission.', t_pill: 'Overall signal from candles on several timeframes.', t_score: 'From −100 (strong sell) to +100 (strong buy). Between −30 and +30 is "wait".',
 t_tf: 'Score for this timeframe from its candles. Green = up, red = down.', t_levels: 'A volatility guide: stop 1.5 ATR below price, target 2.5 ATR above. Not a guarantee.',
 t_sensor: 'Combines trend, RSI, MACD, price corridor, volume, candle patterns and support/resistance from 15m, 1h, 4h and 1d candles.' });

/* ======================================================================
   СЕЛЕКТИРАНЕ НА ДИАПАЗОН: влачиш по графиката, избираш свещи и получаваш
   описание на пазара в тях и оценка дали е ок да купиш сега.
   ====================================================================== */
let mtfRows = null, sel = null, selMode = false, selDrag = null;
//#RANGE-START
function rangeStats(c, nowPrice) {
    const n = c.length, first = c[0], last = c[n - 1];
    const hi = Math.max(...c.map(x => x.high)), lo = Math.min(...c.map(x => x.low)), chg = (last.close / first.open - 1) * 100;
    const green = Math.round(c.filter(x => x.close >= x.open).length / n * 100);
    const avgRange = c.reduce((s, x) => s + (x.high - x.low) / x.close, 0) / n * 100;
    let peak = -Infinity, mdd = 0; c.forEach(x => { peak = Math.max(peak, x.high); mdd = Math.min(mdd, (x.low / peak - 1) * 100); });
    const totV = c.reduce((s, x) => s + x.vol, 0) || 1, upV = c.filter(x => x.close >= x.open).reduce((s, x) => s + x.vol, 0) / totV * 100;
    const h = Math.floor(n / 2), v1 = c.slice(0, h).reduce((s, x) => s + x.vol, 0) / (h || 1), v2 = c.slice(h).reduce((s, x) => s + x.vol, 0) / ((n - h) || 1);
    const snr = chg / ((avgRange * Math.sqrt(n)) || 1), trend = snr > 1 ? 'up' : snr < -1 ? 'down' : 'side';
    const pos = hi > lo ? (nowPrice - lo) / (hi - lo) * 100 : 50;
    let eng = 0; for (let i = 1; i < n; i++) if (engulfing(c[i - 1], c[i])) eng++;
    return { n, first, last, hi, lo, chg, green, avgRange, mdd, upV, volTrend: v2 > v1 * 1.25 ? 'up' : v2 < v1 * .75 ? 'down' : 'flat', trend, pos, eng };
}
function rangeScore(S, score) {
    let pts = Math.max(-2.5, Math.min(2.5, score / 20)); const why = [];
    if (S.trend === 'down' && S.pos < 30) { pts -= .5; why.push('fallKnife'); }
    if (S.trend === 'up' && S.pos > 85) { pts -= .5; why.push('chase'); }
    if (S.pos < 35 && S.trend !== 'down') { pts += .5; why.push('lowZone'); }
    if (S.chg < 0 && S.upV < 45) { pts -= .5; why.push('sellersVol'); }
    if (S.chg > 0 && S.upV > 55) { pts += .5; why.push('buyersVol'); }
    return { pts, why, level: pts >= 1 ? 'ok' : pts <= -1 ? 'no' : 'maybe' };
}
function forward(c, b, atr) {
    const avail = c.length - 1 - b; if (avail < 3) return null;
    const cl = c[b].close, H = Math.min(avail, Math.max(5, Math.round(c.length / 20))), stop = cl - 1.5 * atr, tgt = cl + 2.5 * atr;
    let hi = -Infinity, lo = Infinity, sh = null, th = null;
    for (let j = b + 1; j <= b + H; j++) { hi = Math.max(hi, c[j].high); lo = Math.min(lo, c[j].low); if (sh == null && c[j].low <= stop) sh = j; if (th == null && c[j].high >= tgt) th = j; }
    return { H, ret: (c[b + H].close / cl - 1) * 100, up: (hi / cl - 1) * 100, down: (lo / cl - 1) * 100, first: sh == null && th == null ? 'none' : (th != null && (sh == null || th < sh)) ? 'target' : 'stop' };
}
//#RANGE-END
function drawSel(x0, x1) { const b = $('selBox'); b.hidden = false; b.style.left = Math.min(x0, x1) + 'px'; b.style.width = Math.max(2, Math.abs(x1 - x0)) + 'px'; }
function placeSel() {
    if (!sel || !chart) return; const ts = chart.timeScale(), x0 = ts.logicalToCoordinate(sel.a - .5), x1 = ts.logicalToCoordinate(sel.b + .5);
    if (x0 == null || x1 == null) { $('selBox').hidden = true; return; } drawSel(x0, x1);
}
function clearSel() { sel = null; if ($('selBox')) { $('selBox').hidden = true; $('rangeCard').hidden = true; } }
const idxAtX = x => { const lg = chart.timeScale().coordinateToLogical(x); return lg == null ? null : Math.max(0, Math.min(candlesData.length - 1, Math.round(lg))); };
function showRange(a, b) {
    const L = I18N[currentLang], c = candlesData.slice(a, b + 1); if (c.length < 3) return;
    const isNow = b >= candlesData.length - 2, V = mtfRes || buildVerdict();
    const closed = candlesData.slice(0, -1), P = closed.length > 70 ? prep(closed) : null, bi = Math.min(b, closed.length - 1);
    const ev = P ? evalAt(P, bi) : { score: 0, f: [] }, score = isNow && V ? V.combined : ev.score;
    const endPrice = isNow ? (price() || c[c.length - 1].close) : c[c.length - 1].close;
    const S = rangeStats(c, endPrice), R = rangeScore(S, score), fw = (!isNow && P) ? forward(candlesData, b, P.atr[bi]) : null;
    const t = ms => sofia(ms, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }), tf = KMIN_LABEL[currentInterval] || currentInterval;
    const dir = S.trend === 'up' ? L.rgUp : S.trend === 'down' ? L.rgDown : L.rgSide, cls = x => x >= 0 ? 'up' : 'down';
    const top = ev.f.slice().sort((x, y) => Math.abs(y.p) - Math.abs(x.p)).slice(0, 3), ind = top.length ? `<p>${L.rgInd} ${top.map(x => FX[currentLang][x.k]).join('; ')}.</p>` : '';
    const feeBE = (2 * W.feePct).toFixed(2).replace('.', ','), lv = P ? { stop: endPrice - 1.5 * P.atr[bi], target: endPrice + 2.5 * P.atr[bi] } : (V && V.levels), good = k => ['lowZone', 'buyersVol'].includes(k);
    $('rangeBody').innerHTML = `<h4>${L.rgT}</h4>
    <div class="rg-grid"><div><span>${L.rgChange}</span><b class="${cls(S.chg)}">${pctf(S.chg)}</b></div><div><span>${L.rgHigh}</span><b>${eur.format(S.hi)}</b></div><div><span>${L.rgLow}</span><b>${eur.format(S.lo)}</b></div><div><span>${L.rgGreen}</span><b>${S.green}%</b></div></div>
    <p>${L.rgDesc(t(S.first.time * 1000), t(S.last.time * 1000), S.n, tf, S, eur, pctf)}</p>
    <p>${dir} ${L.rgCandles(S)} ${L.rgVol(S)}</p>
    <p>${L.rgVolat(S)} ${L.rgPos(S, eur, isNow)}</p>${ind}
    <div class="rg-verdict ${R.level}"><span>${isNow ? L.rgQ : L.rgQHist}</span><b>${L['rg_' + R.level]}</b></div>
    <ul class="why"><li class="${score >= 0 ? 'up' : 'down'}"><i>${score >= 0 ? '▲' : '▼'}</i><span>${isNow ? L.rgSig : L.rgAt(t(S.last.time * 1000))} ${score > 0 ? '+' : ''}${score}</span></li>${R.why.map(k => `<li class="${good(k) ? 'up' : 'down'}"><i>${good(k) ? '▲' : '▼'}</i><span>${L['rw_' + k]}</span></li>`).join('')}</ul>
    ${fw ? `<div class="rg-fwd"><b>${L.rgFwdT}</b><p>${L.rgFwd(fw, pctf)}</p></div>` : ''}
    ${lv ? `<p class="rg-note">${L.rgLv(eur.format(lv.stop), eur.format(lv.target))}</p>` : ''}<p class="rg-note">${L.rgFee(feeBE)}</p><p class="disc">${L.disc}</p>`;
    $('rangeCard').hidden = false;
}
function setupSelect() {
    const cont = $('chartContainer'), xOf = e => e.clientX - cont.getBoundingClientRect().left;
    cont.addEventListener('mousedown', e => { if (e.button !== 0 || !(selMode || e.shiftKey)) return; e.stopPropagation(); e.preventDefault(); const x = xOf(e); selDrag = { x0: x, x1: x }; $('rangeCard').hidden = true; drawSel(x, x); }, true);
    addEventListener('mousemove', e => { if (selDrag) { selDrag.x1 = xOf(e); drawSel(selDrag.x0, selDrag.x1); } });
    addEventListener('mouseup', () => {
        if (!selDrag) return; const d = selDrag; selDrag = null;
        const a = idxAtX(Math.min(d.x0, d.x1)), b = idxAtX(Math.max(d.x0, d.x1));
        if (a == null || b == null || b - a < 2) { clearSel(); return; } sel = { a, b }; placeSel(); showRange(a, b);
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange(placeSel);
    $('selToggle').onclick = () => { selMode = !selMode; $('selToggle').classList.toggle('on', selMode); cont.classList.toggle('selmode', selMode); };
    $('rangeClose').onclick = clearSel;
}
Object.assign(I18N.bg, { selBtn: 'Избери диапазон', t_select: 'Включи, после задръж левия бутон и влачи по графиката, за да избереш свещи. Или просто задръж Shift и влачи. Ще опиша пазара в избраните свещи и ще кажа дали е ок да купиш сега.',
 rgT: 'Анализ на избрания диапазон', rgChange: 'Промяна', rgHigh: 'Най-висока', rgLow: 'Най-ниска', rgGreen: 'Зелени свещи', rgUp: 'Движението е ясно нагоре.', rgDown: 'Движението е ясно надолу.', rgSide: 'Няма ясна посока – цената се движи настрани.',
 rgInd: 'В края на диапазона индикаторите показват:', rgQ: 'Ок ли е да купя сега?', rg_ok: 'Условията са благоприятни', rg_maybe: 'Неутрално – по-добре изчакай потвърждение', rg_no: 'Не е добър момент за покупка',
 rgSig: 'Общият сигнал в момента:', rw_fallKnife: 'Падащ диапазон и цената е до дъното – риск да „хванеш падащ нож“.', rw_chase: 'Цената е до върха след покачване – гониш движението.', rw_lowZone: 'Цената е в долната част на диапазона без силен спад.',
 rw_sellersVol: 'Падането е с повече обем – продавачите са по-силни.', rw_buyersVol: 'Покачването е с повече обем – купувачите са по-силни.',
 rgDesc: (a, b, n, tf, S, e, pc) => `В избрания диапазон (${a} – ${b}, ${n} свещи по ${tf}) цената е ${S.chg >= 0 ? 'вдигнала' : 'паднала'} с ${pc(S.chg).replace('+', '')} – от ${e.format(S.first.open)} до ${e.format(S.last.close)}.`,
 rgCandles: S => `${S.green}% от свещите са зелени и ${100 - S.green}% червени – ${S.green >= 58 ? 'купувачите водят.' : S.green <= 42 ? 'продавачите водят.' : 'силите са изравнени.'}`,
 rgVol: S => `Обемът е по-голям при ${S.upV >= 55 ? 'зелените' : S.upV <= 45 ? 'червените' : 'двата вида'} свещи${S.volTrend === 'up' ? ', а към края расте – интересът се усилва.' : S.volTrend === 'down' ? ', а към края намалява – движението губи сила.' : '.'}`,
 rgVolat: S => `Средната свещ се движи ${S.avgRange.toFixed(2).replace('.', ',')}% (${S.avgRange < .15 ? 'ниска' : S.avgRange < .5 ? 'умерена' : 'висока'} волатилност); най-големият спад вътре е ${S.mdd.toFixed(2).replace('.', ',')}%.`,
 rgPos: (S, e) => `Сега цената е на ${Math.round(S.pos)}% от височината на диапазона (${S.pos < 25 ? 'близо до дъното' : S.pos > 75 ? 'близо до върха' : 'по средата'}); дъно ${e.format(S.lo)}, връх ${e.format(S.hi)}.`,
 rgLv: (s, t) => `Ако решиш да купиш, ориентир по волатилността: стоп ${s}, цел ${t}.`, rgFee: f => `С твоите такси цената трябва да мине около +${f}% само за да излезеш на нулата.`,
 t_score: 'От −100 (силно продавай) до +100 (силно купувай). Между −25 и +25 е „изчакай“.' });
Object.assign(I18N.en, { selBtn: 'Select range', t_select: 'Turn on, then hold the left button and drag across the chart to pick candles. Or just hold Shift and drag. I will describe the market in the selected candles and say whether it is OK to buy now.',
 rgT: 'Selected range analysis', rgChange: 'Change', rgHigh: 'Highest', rgLow: 'Lowest', rgGreen: 'Green candles', rgUp: 'The move is clearly up.', rgDown: 'The move is clearly down.', rgSide: 'No clear direction – price moves sideways.',
 rgInd: 'At the end of the range the indicators show:', rgQ: 'Is it OK to buy now?', rg_ok: 'Conditions look favourable', rg_maybe: 'Neutral – better wait for confirmation', rg_no: 'Not a good moment to buy',
 rgSig: 'Overall signal right now:', rw_fallKnife: 'Falling range and price near the bottom – risk of catching a falling knife.', rw_chase: 'Price is near the top after a rise – you would be chasing the move.', rw_lowZone: 'Price is in the lower part of the range without a strong fall.',
 rw_sellersVol: 'The fall came on more volume – sellers are stronger.', rw_buyersVol: 'The rise came on more volume – buyers are stronger.',
 rgDesc: (a, b, n, tf, S, e, pc) => `In the selected range (${a} – ${b}, ${n} candles of ${tf}) price ${S.chg >= 0 ? 'rose' : 'fell'} by ${pc(S.chg).replace('+', '')} – from ${e.format(S.first.open)} to ${e.format(S.last.close)}.`,
 rgCandles: S => `${S.green}% of candles are green and ${100 - S.green}% red – ${S.green >= 58 ? 'buyers lead.' : S.green <= 42 ? 'sellers lead.' : 'forces are balanced.'}`,
 rgVol: S => `Volume is higher on ${S.upV >= 55 ? 'green' : S.upV <= 45 ? 'red' : 'both kinds of'} candles${S.volTrend === 'up' ? ', and rising towards the end – interest is growing.' : S.volTrend === 'down' ? ', and fading towards the end – the move is losing strength.' : '.'}`,
 rgVolat: S => `The average candle moves ${S.avgRange.toFixed(2)}% (${S.avgRange < .15 ? 'low' : S.avgRange < .5 ? 'moderate' : 'high'} volatility); the biggest drop inside is ${S.mdd.toFixed(2)}%.`,
 rgPos: (S, e) => `Price is now at ${Math.round(S.pos)}% of the range height (${S.pos < 25 ? 'near the bottom' : S.pos > 75 ? 'near the top' : 'in the middle'}); low ${e.format(S.lo)}, high ${e.format(S.hi)}.`,
 rgLv: (s, t) => `If you decide to buy, a volatility guide: stop ${s}, target ${t}.`, rgFee: f => `With your fees the price must rise about +${f}% just to break even.`,
 t_score: 'From −100 (strong sell) to +100 (strong buy). Between −25 and +25 is "wait".' });

/* ======================================================================
   В реално време: цената се опреснява сама на всеки 3 сек. (при нужда се
   създава нова свещ), таймерът до края на свещта и всички панели тиктакат
   всяка секунда, връзката се възстановява сама.
   ====================================================================== */
let lastWsMsg = Date.now(), retryT = null, liveState = null;
function feedTick(sym, p) {
    if (sym !== currentSymbol || !p || !candlesData.length) return;
    const last = candlesData[candlesData.length - 1], iv = IV[currentInterval], nowS = Math.floor(Date.now() / 1000); let c;
    if (nowS >= last.time + iv) { const t = last.time + Math.floor((nowS - last.time) / iv) * iv; c = { time: t, open: last.close, high: Math.max(last.close, p), low: Math.min(last.close, p), close: p, vol: 0 }; candlesData.push(c); }
    else if (p !== last.close) { c = { ...last, close: p, high: Math.max(last.high, p), low: Math.min(last.low, p) }; candlesData[candlesData.length - 1] = c; }
    else return;
    candleSeries.update(c); volSeries.update(volPoint(c)); redraw(true);
}
function updateTimer() {
    const el = $('candleTimer'); if (!el || !candlesData.length) return;
    const left = Math.max(0, candlesData[candlesData.length - 1].time + IV[currentInterval] - Math.floor(Date.now() / 1000));
    const d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600), m = Math.floor(left % 3600 / 60), s = left % 60, p = n => String(n).padStart(2, '0');
    el.innerText = '⏱ ' + (d ? `${d}д ` : '') + (h || d ? `${p(h)}:` : '') + `${p(m)}:${p(s)}`;
}
function setLive(ok) {
    if (ok === liveState) return; liveState = ok; const el = $('liveBadge'); el.classList.toggle('off', !ok); el.querySelector('span').innerText = I18N[currentLang][ok ? 'live' : 'offline'];
}
function tickLoop() {
    updateTimer(); renderSignal(); renderWallet(); renderPos(); renderBadge(); renderDrawer(); checkOrders();
    const alive = Date.now() - lastWsMsg < 20000; setLive(alive);
    if (!alive && ws && ws.readyState === 1) { try { ws.close(); } catch (e) {} }
}
function setupTabs() {
    const bar = $('sideTabs'), show = v => {
        bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
        document.querySelectorAll('.pane').forEach(p => { p.hidden = p.dataset.pane !== v; });
        try { localStorage.setItem('tradeOrderTab', v); } catch (e) {}
    };
    bar.querySelectorAll('button').forEach(b => b.onclick = () => show(b.dataset.v));
    let v = 'signal'; try { v = localStorage.getItem('tradeOrderTab') || 'signal'; } catch (e) {} show(v);
    /* не пренаписвай HTML, ако не се е променил – без премигване и без губене на подсказките */
    const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    ['tfRow', 'sigWhy', 'sigLevels', 'ordBody', 'history', 'pos'].forEach(id => { const el = $(id); Object.defineProperty(el, 'innerHTML', { configurable: true, get() { return d.get.call(this); }, set(x) { if (this._h !== x) { this._h = x; d.set.call(this, x); } } }); });
    $('btnReset').onclick = resetAll; $('btnReset2').onclick = resetAll;
    $('depAll').onclick = () => { $('depIn').value = (Math.floor(Math.max(0, availCash()) * 100 + 1e-6) / 100).toFixed(2); };
    setInterval(tickLoop, 1000); tickLoop();
}
Object.assign(I18N.bg, { tabSig: 'Сигнал', tabTrade: 'Търговия', tabHist: 'История', tabDone: 'История', allCash: 'Всичко налично', resetShort: 'Ресет', resetAll: 'Нулирай портфейла', delAll: 'Изтрий всички чакащи',
 confirmReset: 'Да изтрия ли всичко – депозити, сделки и чакащи поръчки? Това не може да се върне.', resetDone: 'Портфейлът е нулиран.', offline: 'ВРЪЗКА…', offlineMsg: 'Няма връзка с Kraken – опитвам отново.',
 e_wd: 'Недостатъчно налични EUR. Налични:', t_timer: 'Време до затваряне на текущата свещ. Когато стигне 00:00, започва нова.', del: 'Изтрий' });
Object.assign(I18N.en, { tabSig: 'Signal', tabTrade: 'Trade', tabHist: 'History', tabDone: 'History', allCash: 'All cash', resetShort: 'Reset', resetAll: 'Reset portfolio', delAll: 'Delete all pending',
 confirmReset: 'Delete everything – deposits, trades and pending orders? This cannot be undone.', resetDone: 'Portfolio reset.', offline: 'CONNECTING…', offlineMsg: 'No connection to Kraken – retrying.',
 e_wd: 'Not enough cash EUR. Available:', t_timer: 'Time until the current candle closes. At 00:00 a new one starts.', del: 'Delete' });

Object.assign(I18N.bg, { sigsChip: 'Сигнали КУПИ/ПРОДАЙ', mkBuy: 'КУПИ', mkSell: 'ПРОДАЙ',
 t_sigs: 'Показва на графиката къде алгоритъмът щеше да даде сигнал КУПИ или ПРОДАЙ според свещите до тогава. Така виждаш къде е работил и къде не.',
 rgQHist: 'Беше ли ок да се купи в края на диапазона?', rgAt: t => `Сигналът в края на диапазона (${t}):`, rgSig: 'Общият сигнал в момента:',
 rgPos: (S, e, now) => `${now ? 'Сега' : 'В края на диапазона'} цената е на ${Math.round(S.pos)}% от височината му (${S.pos < 25 ? 'близо до дъното' : S.pos > 75 ? 'близо до върха' : 'по средата'}); дъно ${e.format(S.lo)}, връх ${e.format(S.hi)}.`,
 rgFwdT: 'Какво се е случило след това', rgFwd: (f, pc) => `През следващите ${f.H} свещи цената е ${f.ret >= 0 ? 'вдигнала' : 'паднала'} с ${pc(f.ret).replace('+', '')} (най-високо ${pc(f.up)}, най-ниско ${pc(f.down)}). ${f.first === 'target' ? 'Целта щеше да бъде достигната преди стопа.' : f.first === 'stop' ? 'Стопът щеше да бъде достигнат първи.' : 'Нито стопът, нито целта бяха достигнати.'}` });
Object.assign(I18N.en, { sigsChip: 'BUY/SELL signals', mkBuy: 'BUY', mkSell: 'SELL',
 t_sigs: 'Shows on the chart where the algorithm would have given a BUY or SELL signal based on the candles up to that point. So you can see where it worked and where it did not.',
 rgQHist: 'Was it OK to buy at the end of the range?', rgAt: t => `Signal at the end of the range (${t}):`, rgSig: 'Overall signal right now:',
 rgPos: (S, e, now) => `${now ? 'Now' : 'At the end of the range'} price is at ${Math.round(S.pos)}% of its height (${S.pos < 25 ? 'near the bottom' : S.pos > 75 ? 'near the top' : 'in the middle'}); low ${e.format(S.lo)}, high ${e.format(S.hi)}.`,
 rgFwdT: 'What happened next', rgFwd: (f, pc) => `Over the next ${f.H} candles price ${f.ret >= 0 ? 'rose' : 'fell'} by ${pc(f.ret).replace('+', '')} (high ${pc(f.up)}, low ${pc(f.down)}). ${f.first === 'target' ? 'The target would have been hit before the stop.' : f.first === 'stop' ? 'The stop would have been hit first.' : 'Neither the stop nor the target was hit.'}` });
