// Access DOM elements
const chartContainer = document.getElementById('chart');
const symbolInput = document.getElementById('symbol');
const timeframeSelect = document.getElementById('timeframe');
const watchlistInput = document.getElementById('watchlist-input');
const watchlistItems = document.getElementById('watchlist-items');
const watchlistPanel = document.querySelector('.watchlist');
const chartWrapper = document.querySelector('.chart-wrapper');
const deleteSelectedDiv = document.querySelector('.delete-selected');

// Create chart
const chart = LightweightCharts.createChart(chartContainer, {
    width: chartWrapper.clientWidth,
    height: chartWrapper.clientHeight,
    layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
    },
    grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
    },
    timeScale: {
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 200,
        fixRightEdge: false,
        lockVisibleTimeRange: false,
        borderVisible: true,
        bottomMargin: 10,
    },
    priceScale: {
        autoScale: true,
        borderVisible: true,
        visible: true,
        scaleMargins: {
            top: 0.1,
            bottom: 0.1,
        },
    },
    rightPriceScale: {
        visible: true,
    },
});

// Add candlestick series
const candlestickSeries = chart.addCandlestickSeries({
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderVisible: false,
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
    priceFormat: {
        precision: 5,
        minMove: 0.00001,
    },
});

// Variables
let currentCandle = null;
let currentCandleTime = null;
let currentSymbol = localStorage.getItem('currentSymbol') || symbolInput.value;
let currentTimeframe = localStorage.getItem('currentTimeframe') || timeframeSelect.value;
let livePriceInterval = null;
let isInitialLoad = true;
let watchlist = JSON.parse(localStorage.getItem('watchlist')) || [];
let watchlistPrices = {};
let isWatchlistOpen = false;
let isEditMode = false;

// Set initial values from localStorage
symbolInput.value = currentSymbol;
timeframeSelect.value = currentTimeframe;

// Icon mapping based on base currency
const currencyIcons = {
    'EUR': 'https://api.iconify.design/mdi:currency-eur.svg',
    'GBP': 'https://api.iconify.design/mdi:currency-gbp.svg',
    'USD': 'https://api.iconify.design/mdi:currency-usd.svg',
    'JPY': 'https://api.iconify.design/mdi:currency-jpy.svg',
    'AUD': 'https://api.iconify.design/mdi:currency-aud.svg',
    'CAD': 'https://api.iconify.design/mdi:currency-cad.svg',
    'CHF': 'https://api.iconify.design/mdi:currency-chf.svg',
    'NZD': 'https://api.iconify.design/mdi:currency-nzd.svg',
    'XAU': 'https://api.iconify.design/mdi:gold.svg',
    'XAG': 'https://api.iconify.design/mdi:silver.svg',
    'BTC': 'https://api.iconify.design/mdi:bitcoin.svg',
    'ETH': 'https://api.iconify.design/mdi:ethereum.svg',
    'default': 'https://api.iconify.design/mdi:currency-sign.svg'
};

// Function to get icon based on base currency
function getSymbolIcon(symbol) {
    const baseCurrency = symbol.split('_')[0];
    return currencyIcons[baseCurrency] || currencyIcons['default'];
}

// Function to normalize symbol (e.g., "eurusd" to "EUR_USD")
function normalizeSymbol(input) {
    input = input.trim().toLowerCase().replace('/', '');
    const parts = input.match(/^([a-z]{3})([a-z]{3})$/);
    if (parts) {
        const base = parts[1].toUpperCase();
        const quote = parts[2].toUpperCase();
        return `${base}_${quote}`;
    }
    const partsWithUnderscore = input.match(/^([a-z]{3})[_/]([a-z]{3})$/);
    if (partsWithUnderscore) {
        const base = partsWithUnderscore[1].toUpperCase();
        const quote = partsWithUnderscore[2].toUpperCase();
        return `${base}_${quote}`;
    }
    return input.toUpperCase();
}

// Setup autocomplete for both inputs
let cachedSymbols = [];
fetch('http://localhost:3000/symbols')
    .then(response => response.json())
    .then(symbols => {
        cachedSymbols = symbols; // ذخیره نمادها برای استفاده در هر دو اتوکامپلیت

        // اتوکامپلیت برای هدر
        autocomplete({
            input: symbolInput,
            className: 'autocomplete', // برای استایل
            fetch: function (text, update) {
                text = text.toLowerCase();
                const suggestions = cachedSymbols.filter(s =>
                    s.toLowerCase().startsWith(text) // فقط نمادهای شروع‌شده
                );
                update(suggestions.map(s => ({ label: s, value: s })));
            },
            onSelect: function (item) {
                symbolInput.value = item.value;
                updateChart();
            },
            render: function (item, currentValue) {
                const li = document.createElement('li');
                li.textContent = item.label;
                return li;
            },
            customize: function (input, inputRect, container) {
                // فیکس موقعیت dropdown زیر input
                container.style.top = `${inputRect.bottom - inputRect.top + 2}px`;
                container.style.left = '0';
                container.style.width = `${inputRect.width}px`;
            }
        });

        // اتوکامپلیت برای واچ‌لیست
        autocomplete({
            input: watchlistInput,
            className: 'autocomplete',
            fetch: function (text, update) {
                text = text.toLowerCase();
                const suggestions = cachedSymbols.filter(s =>
                    s.toLowerCase().startsWith(text)
                );
                update(suggestions.map(s => ({ label: s, value: s })));
            },
            onSelect: function (item) {
                watchlistInput.value = item.value;
                addToWatchlist(); // اضافه کردن به واچ‌لیست
                watchlistInput.value = ''; // خالی کردن input
            },
            render: function (item, currentValue) {
                const li = document.createElement('li');
                li.textContent = item.label;
                return li;
            },
            customize: function (input, inputRect, container) {
                container.style.top = `${inputRect.bottom - inputRect.top + 2}px`;
                container.style.left = '0';
                container.style.width = `${inputRect.width}px`;
            }
        });
    })
    .catch(error => console.error('Error loading symbols:', error));

// Function to fetch historical data
async function fetchHistoricalData() {
    const url = `http://localhost:3000/historical?symbol=${currentSymbol}&granularity=${currentTimeframe}&count=5000`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        console.log(`Historical data for ${currentSymbol} (${currentTimeframe}) received:`, data.candles.length, 'candles');

        const candles = data.candles.map(candle => ({
            time: Math.floor(new Date(candle.time).getTime() / 1000),
            open: parseFloat(candle.mid.o),
            high: parseFloat(candle.mid.h),
            low: parseFloat(candle.mid.l),
            close: parseFloat(candle.mid.c),
        }));

        if (candles.length === 0) {
            console.warn('No historical data received');
            return;
        }

        candlestickSeries.setData(candles);
        chart.timeScale().fitContent();

        const lastCandle = candles[candles.length - 1];
        currentCandle = { ...lastCandle };
        currentCandleTime = lastCandle.time;
        console.log('Last historical candle:', lastCandle);

        if (isInitialLoad) {
            chart.timeScale().scrollToPosition(0, false);
            isInitialLoad = false;
        }
    } catch (error) {
        console.error('Error fetching historical data:', error);
        alert('Invalid symbol or an error occurred: ' + error.message);
    }
}

// Function to fetch live price
async function fetchLivePrice(symbol, isWatchlist = false) {
    const url = `http://localhost:3000/live-price?symbol=${symbol}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        console.log(`Live data for ${symbol} received:`, {
            time: data.time,
            bid: data.bids[0].price,
            ask: data.asks[0].price,
        });

        const priceTime = new Date(data.time).getTime() / 1000;
        const bid = parseFloat(data.bids[0].price);
        const ask = parseFloat(data.asks[0].price);
        const mid = (bid + ask) / 2;

        if (!isWatchlist && symbol === currentSymbol) {
            const timeframeSeconds = {
                'S5': 5, 'S10': 10, 'S30': 30, 'M1': 60, 'M2': 120, 'M3': 180, 'M4': 240,
                'M5': 300, 'M10': 600, 'M15': 900, 'M30': 1800, 'H1': 3600, 'H2': 7200,
                'H3': 10800, 'H4': 14400, 'H6': 21600, 'H8': 28800, 'H12': 43200,
                'D': 86400, 'W': 604800, 'M': 2592000,
            }[currentTimeframe];
            const candleTime = Math.floor(priceTime / timeframeSeconds) * timeframeSeconds;

            if (!currentCandle || candleTime > currentCandleTime) {
                if (currentCandle) {
                    console.log('Saving previous candle:', currentCandle);
                    candlestickSeries.update(currentCandle);
                }
                currentCandle = {
                    time: candleTime,
                    open: mid,
                    high: mid,
                    low: mid,
                    close: mid,
                };
                currentCandleTime = candleTime;
                console.log('Starting new candle:', currentCandle);
            } else {
                currentCandle.high = Math.max(currentCandle.high, mid);
                currentCandle.low = Math.min(currentCandle.low, mid);
                currentCandle.close = mid;
                console.log('Updating candle:', currentCandle);
            }
            candlestickSeries.update(currentCandle);
        } else if (isWatchlist) {
            const prevPrice = watchlistPrices[symbol]?.mid || mid;
            watchlistPrices[symbol] = { mid, time: priceTime };
            updateWatchlistItem(symbol, mid, prevPrice);
        }
    } catch (error) {
        console.error('Error fetching live price for', symbol, ':', error);
    }
}

// Function to update watchlist items
function updateWatchlistItem(symbol, price, prevPrice) {
    const item = document.querySelector(`#watchlist-items li[data-symbol="${symbol}"]`);
    if (item) {
        const change = ((price - prevPrice) / prevPrice * 100).toFixed(2);
        const className = price >= prevPrice ? 'price-up' : 'price-down';
        const icon = getSymbolIcon(symbol);
        const checked = item.querySelector('.checkbox')?.checked ? 'checked' : '';
        item.innerHTML = `
            <input type="checkbox" class="checkbox" ${checked}>
            <div class="symbol-container">
                <img src="${icon}" class="symbol-icon" alt="${symbol}" onerror="this.src='${currencyIcons['default']}'">
                <div>
                    <span class="symbol">${symbol}</span>
                    <div class="broker">Oanda</div>
                </div>
            </div>
            <span class="price ${className}">${price.toFixed(5)} (${change}%)</span>
        `;
        item.querySelector('.symbol-container').addEventListener('click', () => loadSymbol(symbol));
        if (isEditMode) {
            item.classList.add('edit-mode');
        }
    }
}

// Function to add to watchlist
function addToWatchlist() {
    let symbol = watchlistInput.value.trim();
    symbol = normalizeSymbol(symbol);
    if (!symbol || watchlist.includes(symbol)) {
        watchlistInput.value = '';
        return;
    }

    watchlist.push(symbol);
    watchlistPrices[symbol] = { mid: 0, time: 0 };
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
    const li = document.createElement('li');
    li.setAttribute('data-symbol', symbol);
    li.innerHTML = `
        <input type="checkbox" class="checkbox">
        <div class="symbol-container">
            <img src="${getSymbolIcon(symbol)}" class="symbol-icon" alt="${symbol}" onerror="this.src='${currencyIcons['default']}'">
            <div>
                <span class="symbol">${symbol}</span>
                <div class="broker">Oanda</div>
            </div>
        </div>
        <span class="price">Loading...</span>
    `;
    li.querySelector('.symbol-container').addEventListener('click', () => loadSymbol(symbol));
    watchlistItems.appendChild(li);

    fetchLivePrice(symbol, true);
    watchlistInput.value = '';
}

// Function to remove from watchlist
function removeFromWatchlist(symbol) {
    watchlist = watchlist.filter(s => s !== symbol);
    delete watchlistPrices[symbol];
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
    const item = document.querySelector(`#watchlist-items li[data-symbol="${symbol}"]`);
    if (item) item.remove();
}

// Function to toggle edit mode
function toggleEditMode() {
    isEditMode = !isEditMode;
    const editBtn = document.querySelector('.edit-btn');
    editBtn.textContent = isEditMode ? 'Done' : 'Edit';
    deleteSelectedDiv.style.display = isEditMode ? 'block' : 'none';
    const items = document.querySelectorAll('#watchlist-items li');
    items.forEach(item => {
        item.classList.toggle('edit-mode', isEditMode);
        const checkbox = item.querySelector('.checkbox');
        if (!isEditMode) checkbox.checked = false;
    });
}

// Function to delete selected items
function deleteSelected() {
    const items = document.querySelectorAll('#watchlist-items li');
    const symbolsToDelete = [];
    items.forEach(item => {
        const checkbox = item.querySelector('.checkbox');
        if (checkbox.checked) {
            const symbol = item.getAttribute('data-symbol');
            symbolsToDelete.push(symbol);
        }
    });
    symbolsToDelete.forEach(symbol => removeFromWatchlist(symbol));
    if (watchlist.length === 0) {
        toggleEditMode();
    }
}

// Function to load symbol from watchlist
function loadSymbol(symbol) {
    if (isEditMode) return;
    symbolInput.value = symbol;
    updateChart();
}

// Function to toggle watchlist
function toggleWatchlist() {
    console.log('Toggling watchlist, current state:', isWatchlistOpen);
    isWatchlistOpen = !isWatchlistOpen;
    watchlistPanel.classList.toggle('collapsed', !isWatchlistOpen);
    setTimeout(() => {
        console.log('Resizing chart, wrapper width:', chartWrapper.clientWidth);
        chart.resize(chartWrapper.clientWidth, chartWrapper.clientHeight);
    }, 300);
}

// Function to update chart
function updateChart() {
    if (livePriceInterval) clearInterval(livePriceInterval);

    currentCandle = null;
    currentCandleTime = null;
    currentSymbol = symbolInput.value.trim();
    currentSymbol = normalizeSymbol(currentSymbol);
    currentTimeframe = timeframeSelect.value;

    localStorage.setItem('currentSymbol', currentSymbol);
    localStorage.setItem('currentTimeframe', currentTimeframe);

    candlestickSeries.setData([]);
    fetchHistoricalData().then(() => {
        livePriceInterval = setInterval(() => {
            fetchLivePrice(currentSymbol);
            watchlist.forEach(symbol => fetchLivePrice(symbol, true));
        }, 250);
    });
}

// Function to load saved watchlist
function loadSavedWatchlist() {
    watchlist.forEach(symbol => {
        watchlistPrices[symbol] = { mid: 0, time: 0 };
        const li = document.createElement('li');
        li.setAttribute('data-symbol', symbol);
        li.innerHTML = `
            <input type="checkbox" class="checkbox">
            <div class="symbol-container">
                <img src="${getSymbolIcon(symbol)}" class="symbol-icon" alt="${symbol}" onerror="this.src='${currencyIcons['default']}'">
                <div>
                    <span class="symbol">${symbol}</span>
                    <div class="broker">Oanda</div>
                </div>
            </div>
            <span class="price">Loading...</span>
        `;
        li.querySelector('.symbol-container').addEventListener('click', () => loadSymbol(symbol));
        watchlistItems.appendChild(li);
        fetchLivePrice(symbol, true);
    });
}

// Event listeners
timeframeSelect.addEventListener('change', updateChart);

// Global functions
window.updateChart = updateChart;
window.addToWatchlist = addToWatchlist;
window.loadSymbol = loadSymbol;
window.removeFromWatchlist = removeFromWatchlist;
window.toggleWatchlist = toggleWatchlist;
window.toggleEditMode = toggleEditMode;
window.deleteSelected = deleteSelected;

// Resize chart on window resize
window.addEventListener('resize', () => {
    console.log('Window resized, new width:', chartWrapper.clientWidth, 'new height:', chartWrapper.clientHeight);
    chart.resize(chartWrapper.clientWidth, chartWrapper.clientHeight);
});

// Initial execution
watchlistPanel.classList.add('collapsed');
loadSavedWatchlist();
updateChart();