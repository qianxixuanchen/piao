const request = require('request');
const fs = require('fs');

// 断点续传配置
const PROGRESS_FILE = './yahoo_progress.json';
const LIST_FILE = './yahoo_NSDK.json';
const KLINES_FILE = './yahoo_klines.json';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const BATCH_SIZE = 5; // 每批处理的股票数量

const args = process.argv.slice(2);

// 常用美股代码列表
const DEFAULT_SYMBOLS = [
    // 科技股
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'INTC', 'NFLX',
    'ADBE', 'CRM', 'ORCL', 'CSCO', 'IBM', 'QCOM', 'TXN', 'AVGO', 'NOW', 'SNOW',
    // 金融股
    'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'AXP', 'V', 'MA', 'PYPL',
    // 消费股
    'WMT', 'COST', 'HD', 'NKE', 'SBUX', 'MCD', 'KO', 'PEP', 'PG', 'JNJ',
    // 医药股
    'UNH', 'PFE', 'MRK', 'ABBV', 'LLY', 'TMO', 'ABT', 'BMY', 'GILD', 'AMGN',
    // 能源股
    'XOM', 'CVX', 'COP', 'SLB', 'EOG',
    // 其他
    'DIS', 'BA', 'CAT', 'GE', 'MMM', 'UPS', 'FDX', 'LMT', 'RTX', 'HON'
];

// 延迟函数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 加载断点进度
function loadProgress(type) {
    const progressFile = type === 'list' ? PROGRESS_FILE : './yahoo_kline_progress.json';
    try {
        if (fs.existsSync(progressFile)) {
            const progress = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
            console.log(`检测到上次中断的进度，从第 ${progress.index + 1} 个股票继续...`);
            return progress;
        }
    } catch (e) {
        console.log('读取进度文件失败，从头开始');
    }
    return { index: 0, list: [] };
}

// 保存断点进度
function saveProgress(type, index, list) {
    const progressFile = type === 'list' ? PROGRESS_FILE : './yahoo_kline_progress.json';
    try {
        fs.writeFileSync(progressFile, JSON.stringify({ index, list }, null, 2), 'utf-8');
    } catch (e) {
        console.error('保存进度失败:', e.message);
    }
}

// 清除断点进度
function clearProgress(type) {
    const progressFile = type === 'list' ? PROGRESS_FILE : './yahoo_kline_progress.json';
    try {
        if (fs.existsSync(progressFile)) {
            fs.unlinkSync(progressFile);
            console.log('进度文件已清除');
        }
    } catch (e) {
        console.error('清除进度文件失败:', e.message);
    }
}

// 通用请求头（模拟浏览器）
const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
};

// Promise 化的请求函数，带重试机制
function requestWithRetry(url, options = {}, retries = MAX_RETRIES) {
    return new Promise((resolve, reject) => {
        const attemptRequest = async (attemptNum) => {
            request(url, { ...options, headers }, async (err, res, body) => {
                if (err || (res && res.statusCode >= 400)) {
                    if (attemptNum < retries) {
                        console.log(`请求失败，${RETRY_DELAY}ms 后重试 (${attemptNum + 1}/${retries})...`);
                        await delay(RETRY_DELAY);
                        attemptRequest(attemptNum + 1);
                    } else {
                        reject(err || new Error(`HTTP ${res.statusCode}`));
                    }
                } else {
                    resolve(body);
                }
            });
        };
        attemptRequest(0);
    });
}

// 使用 Yahoo Finance Query API v8 获取实时报价
async function getQuote(symbol) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const body = await requestWithRetry(url, { json: true });
    
    if (body && body.chart && body.chart.result && body.chart.result[0]) {
        const result = body.chart.result[0];
        const meta = result.meta;
        const quote = result.indicators?.quote?.[0] || {};
        
        return {
            symbol: meta.symbol,
            name: meta.shortName || meta.longName || symbol,
            price: meta.regularMarketPrice,
            previousClose: meta.previousClose,
            change: meta.regularMarketPrice - meta.previousClose,
            changePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2),
            open: quote.open?.[0],
            high: quote.high?.[0],
            low: quote.low?.[0],
            volume: quote.volume?.[0],
            exchange: meta.exchangeName
        };
    }
    return null;
}

// 获取K线历史数据
async function getHistorical(symbol, days = 60) {
    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - days * 24 * 60 * 60;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;
    
    const body = await requestWithRetry(url, { json: true });
    
    if (body && body.chart && body.chart.result && body.chart.result[0]) {
        const result = body.chart.result[0];
        const timestamps = result.timestamp || [];
        const quote = result.indicators?.quote?.[0] || {};
        const adjClose = result.indicators?.adjclose?.[0]?.adjclose || [];
        
        return timestamps.map((ts, i) => {
            const date = new Date(ts * 1000);
            const open = quote.open?.[i];
            const close = quote.close?.[i];
            return {
                date: date.toISOString().split('T')[0],
                open: open,
                close: close,
                high: quote.high?.[i],
                low: quote.low?.[i],
                volume: quote.volume?.[i],
                adjClose: adjClose[i],
                increase: open && close ? ((close - open) / open * 100).toFixed(2) : 0
            };
        }).filter(d => d.open != null);
    }
    return [];
}

// 获取股票列表及实时报价
async function getList() {
    let { index, list } = loadProgress('list');
    const symbols = DEFAULT_SYMBOLS;
    
    console.log(`开始获取美股数据，共 ${symbols.length} 只股票`);
    
    try {
        for (let i = index; i < symbols.length; i++) {
            const symbol = symbols[i];
            console.log(`正在获取 ${symbol} (${i + 1}/${symbols.length})...`);
            
            try {
                const quote = await getQuote(symbol);
                if (quote) {
                    list.push(quote);
                    console.log(`  ${symbol}: $${quote.price} (${quote.changePercent}%)`);
                }
            } catch (err) {
                console.log(`  获取 ${symbol} 失败: ${err.message}`);
            }
            
            // 保存进度
            saveProgress('list', i + 1, list);
            
            // 避免请求过快
            await delay(500);
        }
        
        // 涨幅排序：由大到小
        list = list.sort((a, b) => {
            const end = parseFloat(b.changePercent) || 0;
            const start = parseFloat(a.changePercent) || 0;
            return end - start;
        });
        
        // 过滤条件：成交量 > 100000，涨跌幅 >= 0，现价 >= 10
        const res = list.filter(item => {
            const open = parseFloat(item.open);
            const close = parseFloat(item.price);
            const low = parseFloat(item.low);
            if (Number.isNaN(open) || Number.isNaN(close) || Number.isNaN(low)) return false;
            return (item.volume > 100000 && parseFloat(item.changePercent) >= 0 && item.price >= 10);
        });
        
        // 确保目录存在
        if (!fs.existsSync('./hello-word/src/assets')) {
            fs.mkdirSync('./hello-word/src/assets', { recursive: true });
        }
        
        // 保存结果
        fs.writeFileSync('./hello-word/src/assets/yahoo_NSDK.json', JSON.stringify(res, null, 2), 'utf-8');
        fs.writeFileSync(LIST_FILE, JSON.stringify(list.map(item => ({ symbol: item.symbol, name: item.name })), null, 2), 'utf-8');
        
        clearProgress('list');
        console.log(`\n数据获取完成！共 ${list.length} 只股票，其中 ${res.length} 只符合条件`);
        
    } catch (err) {
        console.error(`请求失败，进度已保存。下次执行将从此处继续。`);
        console.error('错误信息:', err.message);
    }
}

// 获取K线数据
async function getLine() {
    let allList;
    try {
        allList = JSON.parse(fs.readFileSync(LIST_FILE, 'utf-8'));
    } catch (e) {
        console.log('请先运行 list 命令获取股票列表');
        return;
    }
    
    let { index, list: dataList } = loadProgress('line');
    const nodataList = [];
    
    console.log(`开始获取K线数据，共 ${allList.length} 只股票，从第 ${index + 1} 只开始`);
    
    try {
        for (let i = index; i < allList.length; i++) {
            const item = allList[i];
            console.log(`正在获取 ${item.symbol} K线 (${i + 1}/${allList.length})...`);
            
            try {
                const historical = await getHistorical(item.symbol, 60);
                
                if (historical && historical.length) {
                    dataList.push({
                        symbol: item.symbol,
                        name: item.name,
                        data: historical
                    });
                    console.log(`  获取到 ${historical.length} 条K线数据`);
                } else {
                    nodataList.push({ symbol: item.symbol, name: item.name });
                    console.log(`  无K线数据`);
                }
                
            } catch (err) {
                console.log(`  获取 ${item.symbol} K线失败: ${err.message}`);
                nodataList.push({ symbol: item.symbol, name: item.name });
            }
            
            // 保存进度
            saveProgress('line', i + 1, dataList);
            
            // 避免请求过快
            await delay(500);
        }
        
        // 保存结果
        fs.writeFileSync(KLINES_FILE, JSON.stringify(dataList, null, 2), 'utf-8');
        fs.writeFileSync('./yahoo_error.json', JSON.stringify(nodataList, null, 2), 'utf-8');
        
        clearProgress('line');
        console.log(`\nK线数据获取完成！成功 ${dataList.length} 只，失败 ${nodataList.length} 只`);
        
    } catch (err) {
        console.error(`请求失败，进度已保存。下次执行将从此处继续。`);
        console.error('错误信息:', err.message);
    }
}

// 计算均线
function getMA(num, list) {
    if (list.length >= num) {
        const len = list.length;
        let all = 0;
        for (let i = 1; i <= num; i++) {
            all += list[len - i];
        }
        return all / num;
    }
    return null;
}

// 格式化均线数据
function formatMA() {
    let _data;
    try {
        _data = JSON.parse(fs.readFileSync(KLINES_FILE, 'utf-8'));
    } catch (e) {
        console.log('请先运行 line 命令获取K线数据');
        return;
    }
    
    _data.forEach(item => {
        const list = item.data;
        const closeList = list.map(day => day.close).filter(v => v != null);
        item.MA5 = getMA(5, closeList);
        item.MA10 = getMA(10, closeList);
        item.MA30 = getMA(30, closeList);
    });
    
    fs.writeFileSync(KLINES_FILE, JSON.stringify(_data, null, 2), 'utf-8');
    console.log('均线数据计算完成！');
}

// 筛选上涨趋势股票
function trendup() {
    let _data;
    try {
        _data = JSON.parse(fs.readFileSync(KLINES_FILE, 'utf-8'));
    } catch (e) {
        console.log('请先运行 line 和 ma 命令');
        return;
    }
    
    const result = _data
        .filter(item => item.data && item.data.length > 0)
        .sort((a, b) => {
            const aIncrease = parseFloat(a.data[a.data.length - 1].increase) || 0;
            const bIncrease = parseFloat(b.data[b.data.length - 1].increase) || 0;
            return bIncrease - aIncrease;
        })
        .filter(item => {
            if (item.data.length > 0) {
                if (item.MA30 && item.MA10 && item.MA5) {
                    // MA5 > MA10 > MA30 表示上涨趋势
                    return item.MA5 >= item.MA10 && item.MA10 >= item.MA30;
                }
                return true;
            }
            return false;
        });
    
    // 确保目录存在
    if (!fs.existsSync('./hello-word/src/assets')) {
        fs.mkdirSync('./hello-word/src/assets', { recursive: true });
    }
    
    fs.writeFileSync('./hello-word/src/assets/yahoo_trendup.json', JSON.stringify(result, null, 2), 'utf-8');
    console.log(`筛选完成！共 ${result.length} 只上涨趋势股票`);
}

// 主入口
console.log('=================================');
console.log('Yahoo Finance 美股数据工具');
console.log('=================================');
console.log('用法: node yahoo_stock.js <命令>');
console.log('命令:');
console.log('  list  - 获取股票列表及实时报价');
console.log('  line  - 获取K线历史数据');
console.log('  ma    - 计算均线 (MA5, MA10, MA30)');
console.log('  up    - 筛选上涨趋势股票');
console.log('=================================\n');

if (args[0] === 'list') {
    getList();
} else if (args[0] === 'line') {
    getLine();
} else if (args[0] === 'ma') {
    formatMA();
} else if (args[0] === 'up') {
    trendup();
} else {
    console.log('请指定有效的命令: list | line | ma | up');
}
