const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

/**
 * 美股数据获取工具 (新浪财经 API)
 * 
 * 数据源: 新浪财经 - 国内访问友好，无需 API Key
 * 可获取全部美股数据（约 16000+ 只）
 */

// ==================== 配置常量 ====================
const CONFIG = {
    // 文件路径
    files: {
        progress: './us_progress.json',
        klineProgress: './us_kline_progress.json',
        list: './us_NSDK.json',
        klines: './us_klines.json',
        favorites: './favorites.json',
        allStocks: './us_all_stocks.json',
        error: './us_error.json',
        assetsDir: './hello-word/src/assets',
    },
    // 请求配置
    request: {
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 20000,
        pageSize: 20,          // 新浪 API 每页最多返回 20 条
        requestDelay: 50,      // 请求间隔 50ms
        concurrentLimit: 5,    // K线并发请求数
    },
    // API 地址
    api: {
        stockList: 'https://stock.finance.sina.com.cn/usstock/api/jsonp.php/IO.XSRV2.CallbackList/US_CategoryService.getList',
        kline: 'https://stock.finance.sina.com.cn/usstock/api/jsonp_v2.php',
        quote: 'https://hq.sinajs.cn/list=gb_',
    },
    // 请求头
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://finance.sina.com.cn/',
        'Accept': '*/*',
    },
};

// ==================== 工具函数 ====================
const utils = {
    /**
     * 延迟函数
     */
    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    /**
     * 确保目录存在
     */
    ensureDir: (dirPath) => {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    },

    /**
     * 安全读取 JSON 文件
     */
    readJSON: (filePath, defaultValue = null) => {
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        } catch (e) {
            console.error(`读取文件失败 [${filePath}]:`, e.message);
        }
        return defaultValue;
    },

    /**
     * 安全写入 JSON 文件
     */
    writeJSON: (filePath, data) => {
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
            return true;
        } catch (e) {
            console.error(`写入文件失败 [${filePath}]:`, e.message);
            return false;
        }
    },

    /**
     * 安全删除文件
     */
    deleteFile: (filePath) => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                return true;
            }
        } catch (e) {
            console.error(`删除文件失败 [${filePath}]:`, e.message);
        }
        return false;
    },

    /**
     * 格式化数字（保留指定小数位）
     */
    formatNumber: (num, decimals = 2) => {
        const n = parseFloat(num);
        return isNaN(n) ? 0 : n.toFixed(decimals);
    },

    /**
     * 格式化百分比显示
     */
    formatPercent: (num) => {
        const n = parseFloat(num) || 0;
        const sign = n >= 0 ? '+' : '';
        return `${sign}${n.toFixed(2)}%`;
    },

    /**
     * 计算均线
     */
    calculateMA: (period, priceList) => {
        if (priceList.length < period) return null;
        const sum = priceList.slice(-period).reduce((acc, val) => acc + val, 0);
        return (sum / period).toFixed(2);
    },

    /**
     * 计算均线数组（用于分析趋势变化）
     */
    calculateMAArray: (period, priceList) => {
        if (priceList.length < period) return [];
        const result = [];
        for (let i = period - 1; i < priceList.length; i++) {
            const sum = priceList.slice(i - period + 1, i + 1).reduce((acc, val) => acc + val, 0);
            result.push(parseFloat((sum / period).toFixed(2)));
        }
        return result;
    },

    /**
     * 计算 RSI 指标
     * RSI > 70 超买，RSI < 30 超卖，50-70 强势
     */
    calculateRSI: (period, priceList) => {
        if (priceList.length < period + 1) return null;
        
        const changes = [];
        for (let i = 1; i < priceList.length; i++) {
            changes.push(priceList[i] - priceList[i - 1]);
        }
        
        const recentChanges = changes.slice(-period);
        let gains = 0, losses = 0;
        
        recentChanges.forEach(change => {
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        });
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        
        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return parseFloat((100 - (100 / (1 + rs))).toFixed(2));
    },

    /**
     * 计算 MACD 指标
     */
    calculateMACD: (priceList, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
        if (priceList.length < slowPeriod + signalPeriod) return null;

        // 计算 EMA
        const calcEMA = (data, period) => {
            const k = 2 / (period + 1);
            let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
            const result = [ema];
            for (let i = period; i < data.length; i++) {
                ema = data[i] * k + ema * (1 - k);
                result.push(ema);
            }
            return result;
        };

        const emaFast = calcEMA(priceList, fastPeriod);
        const emaSlowRaw = calcEMA(priceList, slowPeriod);
        
        // 对齐 EMA 数组
        const offset = slowPeriod - fastPeriod;
        const dif = [];
        for (let i = 0; i < emaSlowRaw.length; i++) {
            dif.push(emaFast[i + offset] - emaSlowRaw[i]);
        }

        const dea = calcEMA(dif, signalPeriod);
        const lastDIF = dif[dif.length - 1];
        const lastDEA = dea[dea.length - 1];
        const macd = 2 * (lastDIF - lastDEA);

        return {
            DIF: parseFloat(lastDIF.toFixed(4)),
            DEA: parseFloat(lastDEA.toFixed(4)),
            MACD: parseFloat(macd.toFixed(4)),
            // 金叉: DIF > DEA; 死叉: DIF < DEA
            signal: lastDIF > lastDEA ? 'golden' : 'dead',
        };
    },

    /**
     * 分析上涨趋势
     * 返回趋势评分和各项指标
     */
    analyzeTrend: (klineData) => {
        if (!klineData || klineData.length < 30) {
            return { score: 0, level: 'insufficient', reason: '数据不足' };
        }

        const closes = klineData.map(k => k.close);
        const volumes = klineData.map(k => k.volume);
        const lastDay = klineData[klineData.length - 1];
        const prevDay = klineData[klineData.length - 2];
        
        let score = 0;
        const signals = [];

        // 1. 均线多头排列检测 (MA5 > MA10 > MA30) - 权重 25分
        const ma5 = parseFloat(utils.calculateMA(5, closes));
        const ma10 = parseFloat(utils.calculateMA(10, closes));
        const ma30 = parseFloat(utils.calculateMA(30, closes));
        
        if (ma5 > ma10 && ma10 > ma30) {
            score += 25;
            signals.push('均线多头排列');
        } else if (ma5 > ma30 && ma10 > ma30) {
            score += 15;
            signals.push('均线向上');
        } else if (ma5 > ma30) {
            score += 8;
            signals.push('短期均线向上');
        }

        // 2. 价格站上均线检测 - 权重 20分
        const price = lastDay.close;
        if (price > ma5 && price > ma10 && price > ma30) {
            score += 20;
            signals.push('价格站上所有均线');
        } else if (price > ma10 && price > ma30) {
            score += 12;
            signals.push('价格站上中长期均线');
        } else if (price > ma30) {
            score += 6;
            signals.push('价格站上MA30');
        }

        // 3. 均线斜率检测（MA5/MA10 是否上升）- 权重 15分
        const ma5Array = utils.calculateMAArray(5, closes);
        const ma10Array = utils.calculateMAArray(10, closes);
        if (ma5Array.length >= 3 && ma10Array.length >= 3) {
            const ma5Trend = ma5Array[ma5Array.length - 1] - ma5Array[ma5Array.length - 3];
            const ma10Trend = ma10Array[ma10Array.length - 1] - ma10Array[ma10Array.length - 3];
            
            if (ma5Trend > 0 && ma10Trend > 0) {
                score += 15;
                signals.push('均线向上发散');
            } else if (ma5Trend > 0) {
                score += 8;
                signals.push('MA5向上');
            }
        }

        // 4. RSI 指标检测 - 权重 15分
        const rsi = utils.calculateRSI(14, closes);
        if (rsi !== null) {
            if (rsi >= 50 && rsi <= 70) {
                score += 15;
                signals.push(`RSI强势区(${rsi})`);
            } else if (rsi >= 40 && rsi < 50) {
                score += 8;
                signals.push(`RSI中性偏强(${rsi})`);
            } else if (rsi > 70) {
                score += 5;
                signals.push(`RSI超买(${rsi})`);
            } else if (rsi >= 30 && rsi < 40) {
                score += 3;
                signals.push(`RSI偏弱(${rsi})`);
            }
        }

        // 5. MACD 指标检测 - 权重 15分
        const macd = utils.calculateMACD(closes);
        if (macd) {
            if (macd.signal === 'golden' && macd.MACD > 0) {
                score += 15;
                signals.push('MACD金叉+红柱');
            } else if (macd.signal === 'golden') {
                score += 10;
                signals.push('MACD金叉');
            } else if (macd.DIF > 0 && macd.DEA > 0) {
                score += 5;
                signals.push('MACD零轴上方');
            }
        }

        // 6. 成交量分析 - 权重 10分
        const avgVolume5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
        const avgVolume20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        
        if (lastDay.volume > avgVolume5 * 1.5 && parseFloat(lastDay.increase) > 0) {
            score += 10;
            signals.push('放量上涨');
        } else if (avgVolume5 > avgVolume20) {
            score += 5;
            signals.push('近期成交活跃');
        }

        // 7. 连续上涨检测 - 额外加分
        let consecutiveUp = 0;
        for (let i = klineData.length - 1; i >= 0 && i >= klineData.length - 5; i--) {
            if (parseFloat(klineData[i].increase) > 0) consecutiveUp++;
            else break;
        }
        if (consecutiveUp >= 3) {
            score += 5;
            signals.push(`连续${consecutiveUp}日上涨`);
        }

        // 8. 突破新高检测 - 额外加分
        const recent20High = Math.max(...closes.slice(-20));
        const recent60High = Math.max(...closes.slice(-60));
        if (price >= recent60High) {
            score += 8;
            signals.push('突破60日新高');
        } else if (price >= recent20High) {
            score += 4;
            signals.push('突破20日新高');
        }

        // 确定趋势等级
        let level, levelDesc;
        if (score >= 80) {
            level = 'strong_up';
            levelDesc = '强势上涨';
        } else if (score >= 60) {
            level = 'up';
            levelDesc = '上涨趋势';
        } else if (score >= 40) {
            level = 'weak_up';
            levelDesc = '弱势上涨';
        } else if (score >= 25) {
            level = 'neutral';
            levelDesc = '震荡整理';
        } else {
            level = 'down';
            levelDesc = '下跌趋势';
        }

        return {
            score,
            level,
            levelDesc,
            signals,
            indicators: {
                MA5: ma5,
                MA10: ma10,
                MA30: ma30,
                RSI: rsi,
                MACD: macd,
            },
        };
    },

    /**
     * 日志输出（带时间戳）
     */
    log: {
        info: (msg) => console.log(`[INFO] ${msg}`),
        success: (msg) => console.log(`✅ ${msg}`),
        error: (msg) => console.error(`❌ ${msg}`),
        warn: (msg) => console.warn(`⚠️ ${msg}`),
        progress: (current, total, extra = '') => {
            const percent = ((current / total) * 100).toFixed(1);
            console.log(`[${current}/${total}] ${percent}% ${extra}`);
        },
    },
};

// ==================== HTTP 请求模块 ====================
const httpClient = {
    /**
     * HTTPS GET 请求
     */
    get: (url, options = {}) => {
        return new Promise((resolve, reject) => {
            const req = https.get(url, {
                headers: { ...CONFIG.headers, ...options.headers },
                timeout: CONFIG.request.timeout,
            }, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    // 尝试 UTF-8 解码，如包含乱码则使用 GBK
                    let data = iconv.decode(buffer, 'utf-8');
                    resolve(data);
                });
            });
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        });
    },

    /**
     * 带重试的请求
     */
    getWithRetry: async (url, retries = CONFIG.request.maxRetries) => {
        for (let i = 0; i < retries; i++) {
            try {
                return await httpClient.get(url);
            } catch (err) {
                if (i < retries - 1) {
                    const waitTime = CONFIG.request.retryDelay * (i + 1);
                    console.log(`  请求失败(${err.message})，${waitTime}ms 后重试 (${i + 1}/${retries})...`);
                    await utils.delay(waitTime);
                } else {
                    throw err;
                }
            }
        }
    },
};

// ==================== 数据解析模块 ====================
const parser = {
    /**
     * 解析新浪美股列表 JSONP 响应
     */
    stockList: (text) => {
        try {
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
                const json = JSON.parse(match[0]);
                return {
                    total: parseInt(json.count) || 0,
                    data: (json.data || []).map(item => ({
                        symbol: item.symbol,
                        name: item.name,
                        cname: item.cname,
                        category: item.category,
                        market: item.market,
                        price: parseFloat(item.price) || 0,
                        change: parseFloat(item.diff) || 0,
                        changePercent: parseFloat(item.chg) || 0,
                        prevClose: parseFloat(item.preclose) || 0,
                        open: parseFloat(item.open) || 0,
                        high: parseFloat(item.high) || 0,
                        low: parseFloat(item.low) || 0,
                        volume: parseFloat(item.volume) || 0,
                        marketCap: parseFloat(item.mktcap) || 0,
                        pe: parseFloat(item.pe) || 0,
                    })),
                };
            }
        } catch (e) {
            console.error('解析股票列表数据失败:', e.message);
        }
        return { total: 0, data: [] };
    },

    /**
     * 解析新浪实时行情数据
     */
    quote: (text) => {
        const results = [];
        const lines = text.split('\n').filter(line => line.includes('hq_str_gb_'));

        for (const line of lines) {
            const match = line.match(/hq_str_gb_(\w+)="(.*)"/);
            if (match) {
                const symbol = match[1].toUpperCase();
                const data = match[2].split(',');

                if (data.length >= 12 && data[1] && data[1] !== '0') {
                    results.push({
                        symbol,
                        name: data[0],
                        price: parseFloat(data[1]) || 0,
                        changePercent: parseFloat(data[2]) || 0,
                        change: parseFloat(data[4]) || 0,
                        open: parseFloat(data[5]) || 0,
                        high: parseFloat(data[6]) || 0,
                        low: parseFloat(data[7]) || 0,
                        volume: parseFloat(data[10]) || 0,
                        time: data[3],
                    });
                }
            }
        }
        return results;
    },

    /**
     * 解析K线数据
     */
    kline: (text, maxCount = 50) => {
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) return null;

        let klines = JSON.parse(match[0]);
        if (!klines || !klines.length) return null;

        // 只取最近 maxCount 条记录
        if (klines.length > maxCount) {
            klines = klines.slice(-maxCount);
        }

        // 转换K线数据，并计算涨跌幅（相对于前一天收盘价）
        return klines.map((k, index, arr) => {
            const close = parseFloat(k.c);
            const open = parseFloat(k.o);
            const prevClose = index > 0 ? parseFloat(arr[index - 1].c) : open;
            
            // 涨跌幅 = (今日收盘价 - 昨日收盘价) / 昨日收盘价 * 100
            const increase = prevClose ? ((close - prevClose) / prevClose * 100).toFixed(2) : '0';
            
            return {
                date: k.d,
                open,
                close,
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                volume: parseFloat(k.v),
                increase,
            };
        });
    },
};

// ==================== 进度管理模块 ====================
const progress = {
    getFilePath: (type) => type === 'list' ? CONFIG.files.progress : CONFIG.files.klineProgress,

    load: (type) => {
        const filePath = progress.getFilePath(type);
        const data = utils.readJSON(filePath);
        if (data) {
            console.log(`检测到上次中断的进度，从第 ${data.page || data.index + 1} 页/个继续...`);
            return data;
        }
        return type === 'list' ? { page: 1, total: 0, list: [] } : { index: 0, list: [] };
    },

    save: (type, data) => {
        utils.writeJSON(progress.getFilePath(type), data);
    },

    clear: (type) => {
        const filePath = progress.getFilePath(type);
        if (utils.deleteFile(filePath)) {
            console.log('进度文件已清除');
        }
    },
};

// ==================== 收藏服务模块 ====================
const favoriteService = {
    load: () => utils.readJSON(CONFIG.files.favorites, []),

    save: (data) => utils.writeJSON(CONFIG.files.favorites, data),

    add: (symbol) => {
        const favorites = favoriteService.load();
        if (favorites.some(item => item.symbol === symbol)) {
            return { success: false, message: '该股票已收藏' };
        }

        const today = new Date().toISOString().split('T')[0];
        favorites.push({ symbol, date: today });

        if (favoriteService.save(favorites)) {
            console.log(`✅ 收藏成功: ${symbol}`);
            return { success: true, data: { symbol, date: today } };
        }
        return { success: false, message: '保存失败' };
    },

    remove: (symbol) => {
        const favorites = favoriteService.load();
        const index = favorites.findIndex(item => item.symbol === symbol);

        if (index === -1) {
            return { success: false, message: '未找到该收藏' };
        }

        favorites.splice(index, 1);

        if (favoriteService.save(favorites)) {
            console.log(`❌ 取消收藏: ${symbol}`);
            return { success: true, message: '取消收藏成功' };
        }
        return { success: false, message: '保存失败' };
    },

    clear: () => {
        if (favoriteService.save([])) {
            console.log('🗑️ 已清空所有收藏');
            return { success: true, message: '清空成功' };
        }
        return { success: false, message: '清空失败' };
    },
};

// ==================== HTTP 服务模块 ====================
const server = {
    /**
     * 发送 JSON 响应
     */
    sendJSON: (res, statusCode, data) => {
        res.writeHead(statusCode);
        res.end(JSON.stringify(data));
    },

    /**
     * 路由处理器
     */
    routes: {
        // GET /api/favorites - 获取所有收藏
        'GET /api/favorites': (req, res) => {
            const favorites = favoriteService.load();
            server.sendJSON(res, 200, { success: true, data: favorites });
        },

        // POST /api/favorites - 添加收藏
        'POST /api/favorites': (req, res) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { symbol } = JSON.parse(body);
                    if (!symbol) {
                        server.sendJSON(res, 400, { success: false, message: '缺少 symbol 参数' });
                        return;
                    }

                    const result = favoriteService.add(symbol);
                    server.sendJSON(res, result.success ? 200 : 400, result);
                } catch (e) {
                    server.sendJSON(res, 400, { success: false, message: '请求数据格式错误' });
                }
            });
        },

        // DELETE /api/favorites/clear - 清空收藏
        'DELETE /api/favorites/clear': (req, res) => {
            const result = favoriteService.clear();
            server.sendJSON(res, result.success ? 200 : 500, result);
        },

        // DELETE /api/favorites/:symbol - 取消收藏
        'DELETE /api/favorites/:symbol': (req, res, params) => {
            const { symbol } = params;
            if (!symbol) {
                server.sendJSON(res, 400, { success: false, message: '缺少 symbol 参数' });
                return;
            }

            const result = favoriteService.remove(symbol);
            server.sendJSON(res, result.success ? 200 : 404, result);
        },
    },

    /**
     * 匹配路由
     */
    matchRoute: (method, pathname) => {
        const routeKey = `${method} ${pathname}`;

        // 精确匹配
        if (server.routes[routeKey]) {
            return { handler: server.routes[routeKey], params: {} };
        }

        // 参数路由匹配
        if (method === 'DELETE' && pathname.startsWith('/api/favorites/')) {
            const symbol = decodeURIComponent(pathname.split('/api/favorites/')[1]);
            if (symbol && symbol !== 'clear') {
                return {
                    handler: server.routes['DELETE /api/favorites/:symbol'],
                    params: { symbol },
                };
            }
        }

        return null;
    },

    /**
     * 启动服务器
     */
    start: (port = 3000) => {
        const httpServer = http.createServer((req, res) => {
            // 设置 CORS 头
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.setHeader('Content-Type', 'application/json; charset=utf-8');

            // 处理预检请求
            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            const url = new URL(req.url, `http://localhost:${port}`);
            const route = server.matchRoute(req.method, url.pathname);

            if (route) {
                route.handler(req, res, route.params);
            } else {
                server.sendJSON(res, 404, { success: false, message: 'Not Found' });
            }
        });

        httpServer.listen(port, () => {
            console.log('=============================================');
            console.log('⭐ 美股收藏服务已启动');
            console.log(`📡 服务地址: http://localhost:${port}`);
            console.log('');
            console.log('API 接口:');
            console.log('  GET    /api/favorites          - 获取所有收藏');
            console.log('  POST   /api/favorites          - 添加收藏 (body: { symbol: "AAPL" })');
            console.log('  DELETE /api/favorites/:symbol  - 取消收藏');
            console.log('  DELETE /api/favorites/clear    - 清空所有收藏');
            console.log('=============================================');
        });
    },
};

// ==================== 业务逻辑模块 ====================
const stockService = {
    /**
     * 获取全部美股列表及实时报价
     */
    getList: async () => {
        let { page, total, list } = progress.load('list');

        console.log('开始获取全部美股数据（新浪财经 API）...\n');

        try {
            // 首次请求或恢复时都获取最新总数
            const firstUrl = `${CONFIG.api.stockList}?page=1&num=1&sort=&asc=0&market=&id=`;
            const firstData = await httpClient.getWithRetry(firstUrl);
            const firstResult = parser.stockList(firstData);
            const latestTotal = firstResult.total;

            if (total === 0 || total !== latestTotal) {
                total = latestTotal;
                console.log(`共发现 ${total} 只美股\n`);
            }

            const totalPages = Math.ceil(total / CONFIG.request.pageSize);
            console.log(`总共 ${totalPages} 页，当前从第 ${page} 页开始\n`);

            while (page <= totalPages) {
                const url = `${CONFIG.api.stockList}?page=${page}&num=${CONFIG.request.pageSize}&sort=&asc=0&market=&id=`;
                const data = await httpClient.getWithRetry(url);
                const result = parser.stockList(data);

                if (result.data.length > 0) {
                    list.push(...result.data);
                    // 每 50 页显示一次进度
                    if (page % 50 === 0 || page === totalPages) {
                        console.log(`已获取第 ${page}/${totalPages} 页，累计 ${list.length}/${total} 条`);
                    }
                }

                page++;
                // 保存进度（每 20 页保存一次）
                if (page % 20 === 0 || page > totalPages) {
                    progress.save('list', { page, total, list });
                }

                await utils.delay(CONFIG.request.requestDelay);
            }

            // 处理并保存结果
            stockService.processAndSaveList(list);
            progress.clear('list');

        } catch (err) {
            console.error('\n请求失败，进度已保存。下次执行将从此处继续。');
            console.error('错误信息:', err.message);
        }
    },

    /**
     * 处理并保存股票列表
     */
    processAndSaveList: (list) => {
        console.log(`\n共获取 ${list.length} 只美股数据`);

        // 涨幅排序
        list.sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));

        // 过滤条件：成交量 > 50000，现价 > 1 美元
        const filtered = list.filter(item => item.price > 1 && item.volume > 50000);

        // 统计信息
        const stats = {
            up: filtered.filter(item => item.changePercent > 0).length,
            down: filtered.filter(item => item.changePercent < 0).length,
            flat: filtered.filter(item => item.changePercent === 0).length,
            nasdaq: filtered.filter(item => item.market === 'NASDAQ').length,
            nyse: filtered.filter(item => item.market === 'NYSE').length,
            amex: filtered.filter(item => item.market === 'AMEX').length,
        };

        console.log(`\n过滤后: ${filtered.length} 只 (价格>$1 且 成交量>5万)`);
        console.log(`统计: 上涨 ${stats.up} 只, 下跌 ${stats.down} 只, 平盘 ${stats.flat} 只`);
        console.log(`交易所: NASDAQ ${stats.nasdaq} 只, NYSE ${stats.nyse} 只, AMEX ${stats.amex} 只`);

        // 确保目录存在
        utils.ensureDir(CONFIG.files.assetsDir);

        // 保存文件
        utils.writeJSON(`${CONFIG.files.assetsDir}/us_NSDK.json`, filtered);
        utils.writeJSON(CONFIG.files.list, filtered.map(item => ({
            symbol: item.symbol,
            name: item.cname || item.name,
            market: item.market,
        })));
        utils.writeJSON(CONFIG.files.allStocks, list);

        console.log('\n数据获取完成！');
        console.log(`- 全量数据: ${CONFIG.files.allStocks} (${list.length} 只)`);
        console.log(`- 过滤后: ${CONFIG.files.list} (${filtered.length} 只)`);

        // 显示榜单
        stockService.displayRankings(filtered);
    },

    /**
     * 显示涨跌榜
     */
    displayRankings: (stocks) => {
        const formatStock = (item, index) => {
            const sign = item.changePercent >= 0 ? '+' : '';
            const name = (item.cname || item.name || '').substring(0, 10).padEnd(12);
            return `${(index + 1).toString().padStart(2)}. ${item.symbol.padEnd(6)} ${name} $${item.price.toFixed(2).padStart(10)} ${sign}${item.changePercent.toFixed(2)}%`;
        };

        console.log('\n===== 涨幅榜 TOP 10 =====');
        stocks.slice(0, 10).forEach((item, i) => console.log(formatStock(item, i)));

        console.log('\n===== 跌幅榜 TOP 10 =====');
        stocks.slice(-10).reverse().forEach((item, i) => console.log(formatStock(item, i)));
    },

    /**
     * 获取单只股票K线数据
     */
    fetchSingleKline: async (item) => {
        const symbol = item.symbol.toLowerCase();
        const url = `${CONFIG.api.kline}/var%20_${symbol}=/US_MinKService.getDailyK?symbol=${symbol}&_=${Date.now()}`;

        try {
            const data = await httpClient.getWithRetry(url);
            const klines = parser.kline(data);

            if (klines) {
                return {
                    success: true,
                    data: { symbol: item.symbol, name: item.name, data: klines },
                };
            }
        } catch (err) {
            // 静默处理失败
        }
        return { success: false, item };
    },

    /**
     * 获取K线历史数据
     */
    getKlines: async () => {
        const allList = utils.readJSON(CONFIG.files.list);
        if (!allList) {
            console.log('请先运行 list 命令获取股票列表');
            return;
        }

        let { index, list: dataList } = progress.load('line');
        const nodataList = [];
        const { concurrentLimit, requestDelay } = CONFIG.request;

        console.log(`开始获取K线数据，共 ${allList.length} 只股票`);
        console.log(`⚡ 优化模式：并发 ${concurrentLimit} 个请求，只保留最近 100 条K线\n`);

        if (index > 0) {
            console.log(`从第 ${index + 1} 只股票继续...\n`);
        }

        const startTime = Date.now();

        try {
            for (let i = index; i < allList.length; i += concurrentLimit) {
                const batch = allList.slice(i, Math.min(i + concurrentLimit, allList.length));

                // 并发请求
                const results = await Promise.all(batch.map(item => stockService.fetchSingleKline(item)));

                // 处理结果
                results.forEach(result => {
                    if (result.success) {
                        dataList.push(result.data);
                    } else {
                        nodataList.push(result.item);
                    }
                });

                const processed = Math.min(i + concurrentLimit, allList.length);
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
                const speed = (processed / elapsed).toFixed(1);
                const progressPercent = (processed / allList.length * 100).toFixed(1);

                // 每处理 100 条输出进度
                if (processed % 100 < concurrentLimit || processed === allList.length) {
                    console.log(`已处理 ${processed}/${allList.length} (${progressPercent}%) - 耗时 ${elapsed}s - 速度 ${speed}/s`);
                    progress.save('line', { index: processed, list: dataList });
                }

                await utils.delay(requestDelay);
            }

            // 保存结果
            utils.writeJSON(CONFIG.files.klines, dataList);
            if (nodataList.length > 0) {
                utils.writeJSON(CONFIG.files.error, nodataList);
            }

            const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
            progress.clear('line');

            console.log('\n✅ K线数据获取完成！');
            console.log(`   成功: ${dataList.length} 只，失败: ${nodataList.length} 只`);
            console.log(`   总耗时: ${totalTime}s`);

        } catch (err) {
            console.error('\n请求失败，进度已保存。下次执行将从此处继续。');
            console.error('错误信息:', err.message);
        }
    },

    /**
     * 分析数据：计算均线 + 综合趋势分析 + 筛选上涨趋势股票
     */
    analyze: () => {
        const data = utils.readJSON(CONFIG.files.klines);
        if (!data) {
            console.log('请先运行 line 命令获取K线数据');
            return;
        }

        console.log(`开始分析 ${data.length} 只股票数据...\n`);

        // 步骤1: 计算均线和趋势指标
        console.log('📊 步骤1: 计算技术指标 (MA, RSI, MACD)...');
        
        let analyzedCount = 0;
        let bigGainerCount = 0;
        
        data.forEach(item => {
            const closeList = item.data.map(day => day.close).filter(v => v != null);
            const lastDay = item.data[item.data.length - 1];
            const increase = parseFloat(lastDay?.increase) || 0;
            
            // 检查是否为大涨股票（涨幅>=10%）
            if (increase >= 10) {
                item.isBigGainer = true;
                item.bigGainerReason = `当日涨幅 ${increase}%，超过10%阈值`;
                // 大涨股票不参与评分系统，设置特殊标记
                item.trendScore = null;
                item.trendLevel = 'big_gainer';
                item.trendLevelDesc = '🔥 大涨';
                item.trendSignals = [`涨幅${increase}%`];
                bigGainerCount++;
            } else {
                item.isBigGainer = false;
                
                // 正常股票进入评分系统
                // 计算均线
                item.MA5 = utils.calculateMA(5, closeList);
                item.MA10 = utils.calculateMA(10, closeList);
                item.MA30 = utils.calculateMA(30, closeList);
                
                // 计算 RSI
                item.RSI = utils.calculateRSI(14, closeList);
                
                // 计算 MACD
                const macd = utils.calculateMACD(closeList);
                if (macd) {
                    item.MACD = macd;
                }
                
                // 综合趋势分析
                const trend = utils.analyzeTrend(item.data);
                item.trendScore = trend.score;
                item.trendLevel = trend.level;
                item.trendLevelDesc = trend.levelDesc;
                item.trendSignals = trend.signals;
            }
            
            // 均线数据（大涨股票也需要）
            if (!item.MA5) item.MA5 = utils.calculateMA(5, closeList);
            if (!item.MA10) item.MA10 = utils.calculateMA(10, closeList);
            if (!item.MA30) item.MA30 = utils.calculateMA(30, closeList);
            
            analyzedCount++;
        });

        utils.writeJSON(CONFIG.files.klines, data);
        console.log(`   ✅ 技术指标计算完成，已分析 ${analyzedCount} 只股票`);
        console.log(`   🔥 其中大涨股票（涨幅>=10%）: ${bigGainerCount} 只，不参与评分\n`);

        // 步骤2: 筛选股票（基于趋势评分）
        console.log('📈 步骤2: 筛选上涨趋势股票...');
        console.log('   规则: 趋势评分 >= 25 或 当日涨幅 >= 5%');
        console.log('   评分标准: 均线排列(25分) + 价格位置(20分) + 均线斜率(15分) + RSI(15分) + MACD(15分) + 成交量(10分) + 额外加分');

        const result = data
            .filter(item => item.data && item.data.length > 0)
            .filter(item => {
                const lastDay = item.data[item.data.length - 1];
                const increase = parseFloat(lastDay.increase) || 0;
                const score = item.trendScore || 0;

                // 筛选条件：
                // 1. 大涨股票（涨幅>=10%）直接入选
                // 2. 趋势评分 >= 25（震荡整理及以上）
                // 3. 或者当日涨幅 >= 5%（捕捉突破股）
                return item.isBigGainer || score >= 25 || increase >= 5;
            })
            .sort((a, b) => {
                // 大涨股票排最前面
                if (a.isBigGainer && !b.isBigGainer) return -1;
                if (!a.isBigGainer && b.isBigGainer) return 1;
                if (a.isBigGainer && b.isBigGainer) {
                    // 大涨股票按涨幅排序
                    const aInc = parseFloat(a.data[a.data.length - 1].increase) || 0;
                    const bInc = parseFloat(b.data[b.data.length - 1].increase) || 0;
                    return bInc - aInc;
                }
                // 普通股票按趋势评分排序
                if (b.trendScore !== a.trendScore) {
                    return b.trendScore - a.trendScore;
                }
                const aIncrease = parseFloat(a.data[a.data.length - 1].increase) || 0;
                const bIncrease = parseFloat(b.data[b.data.length - 1].increase) || 0;
                return bIncrease - aIncrease;
            });

        // 步骤3: 标记"回调买入"专项列表
        // 条件：MA5 > MA30 且 MA10 > MA30（均线多头），但当日下跌（回调机会）
        console.log('\n📉 步骤3: 筛选"回调买入"专项列表...');
        console.log('   规则: MA5 > MA30 且 MA10 > MA30，但当日为跌幅（均线多头回调）');

        result.forEach(item => {
            const lastDay = item.data[item.data.length - 1];
            const increase = parseFloat(lastDay.increase) || 0;
            const ma5 = parseFloat(item.MA5) || 0;
            const ma10 = parseFloat(item.MA10) || 0;
            const ma30 = parseFloat(item.MA30) || 0;

            // 标记回调买入机会
            if (ma5 > ma30 && ma10 > ma30 && increase < 0) {
                item.isPullback = true;
                item.pullbackReason = `MA5(${item.MA5}) > MA30(${item.MA30}), MA10(${item.MA10}) > MA30, 当日跌${increase}%`;
            } else {
                item.isPullback = false;
            }
        });

        const pullbackList = result.filter(item => item.isPullback);
        console.log(`   ✅ 找到 ${pullbackList.length} 只回调买入机会\n`);

        utils.ensureDir(CONFIG.files.assetsDir);
        utils.writeJSON(`${CONFIG.files.assetsDir}/us_trendup.json`, result);

        // 统计信息
        const validKlines = data.filter(item => item.data && item.data.length > 0).length;
        const bigGainerList = result.filter(item => item.isBigGainer);
        const strongUp = result.filter(item => item.trendLevel === 'strong_up').length;
        const up = result.filter(item => item.trendLevel === 'up').length;
        const weakUp = result.filter(item => item.trendLevel === 'weak_up').length;
        const neutral = result.filter(item => item.trendLevel === 'neutral').length;
        const down = result.filter(item => item.trendLevel === 'down').length;

        console.log('===== 分析结果 =====');
        console.log(`总数据: ${data.length} 只`);
        console.log(`有效K线: ${validKlines} 只`);
        console.log(`筛选结果: ${result.length} 只`);
        console.log('');
        console.log('===== 趋势分布 =====');
        console.log(`🔥 大涨股票 (>=10%):   ${bigGainerList.length} 只 [不参与评分]`);
        console.log(`🚀 强势上涨 (>=80分): ${strongUp} 只`);
        console.log(`📈 上涨趋势 (60-79分): ${up} 只`);
        console.log(`📊 弱势上涨 (40-59分): ${weakUp} 只`);
        console.log(`➖ 震荡整理 (25-39分): ${neutral} 只`);
        console.log(`📉 下跌趋势 (<25分):   ${down} 只`);
        console.log(`🎯 回调买入机会:       ${pullbackList.length} 只`);
        console.log(`\n结果已保存到: ${CONFIG.files.assetsDir}/us_trendup.json`);

        // 显示大涨股票 TOP 20
        if (bigGainerList.length > 0) {
            const sortedBigGainers = [...bigGainerList].sort((a, b) => {
                const aInc = parseFloat(a.data[a.data.length - 1].increase) || 0;
                const bInc = parseFloat(b.data[b.data.length - 1].increase) || 0;
                return bInc - aInc;
            });
            console.log('\n===== 🔥 大涨股票 TOP 20 (涨幅>=10%) =====');
            console.log('（不参与评分系统，按涨幅排序）');
            sortedBigGainers.slice(0, 20).forEach((item, i) => {
                const lastDay = item.data[item.data.length - 1];
                const increase = lastDay ? lastDay.increase : 0;
                const name = (item.name || '').substring(0, 10).padEnd(12);
                console.log(`${(i + 1).toString().padStart(2)}. ${item.symbol.padEnd(6)} ${name} +${increase}%  MA5:${item.MA5} MA10:${item.MA10} MA30:${item.MA30}`);
            });
        }

        // 显示强势上涨前20
        const strongStocks = result.filter(item => !item.isBigGainer && item.trendScore >= 60);
        if (strongStocks.length > 0) {
            console.log('\n===== 强势上涨股票 TOP 20 =====');
            strongStocks.slice(0, 20).forEach((item, i) => {
                const lastDay = item.data[item.data.length - 1];
                const increase = lastDay ? lastDay.increase : 0;
                const sign = increase >= 0 ? '+' : '';
                const name = (item.name || '').substring(0, 10).padEnd(12);
                const signals = (item.trendSignals || []).slice(0, 3).join(', ');
                console.log(`${(i + 1).toString().padStart(2)}. ${item.symbol.padEnd(6)} ${name} ${sign}${increase}%  评分:${item.trendScore}  ${item.trendLevelDesc}  [${signals}]`);
            });
        }

        // 显示今日涨幅前10（排除大涨股票）
        const topGainers = [...result].filter(item => !item.isBigGainer).sort((a, b) => {
            const aInc = parseFloat(a.data[a.data.length - 1].increase) || 0;
            const bInc = parseFloat(b.data[b.data.length - 1].increase) || 0;
            return bInc - aInc;
        });
        
        if (topGainers.length > 0) {
            console.log('\n===== 今日涨幅 TOP 10 =====');
            topGainers.slice(0, 10).forEach((item, i) => {
                const lastDay = item.data[item.data.length - 1];
                const increase = lastDay ? lastDay.increase : 0;
                const sign = increase >= 0 ? '+' : '';
                const name = (item.name || '').substring(0, 10).padEnd(12);
                console.log(`${(i + 1).toString().padStart(2)}. ${item.symbol.padEnd(6)} ${name} ${sign}${increase}%  评分:${item.trendScore}  ${item.trendLevelDesc}`);
            });
        }

        // 显示回调买入机会 TOP 20
        if (pullbackList.length > 0) {
            // 按跌幅和评分排序：跌幅小的优先，同跌幅按评分降序
            const sortedPullback = [...pullbackList].sort((a, b) => {
                const aInc = parseFloat(a.data[a.data.length - 1].increase) || 0;
                const bInc = parseFloat(b.data[b.data.length - 1].increase) || 0;
                // 跌幅小的排前面（-1% 比 -5% 跌幅小）
                if (aInc !== bInc) {
                    return bInc - aInc;
                }
                // 同跌幅按评分降序
                return b.trendScore - a.trendScore;
            });
            console.log('\n===== 🎯 回调买入机会 TOP 20 =====');
            console.log('（均线多头排列但当日下跌，按跌幅+评分排序）');
            sortedPullback.slice(0, 20).forEach((item, i) => {
                const lastDay = item.data[item.data.length - 1];
                const increase = lastDay ? lastDay.increase : 0;
                const name = (item.name || '').substring(0, 10).padEnd(12);
                console.log(`${(i + 1).toString().padStart(2)}. ${item.symbol.padEnd(6)} ${name} ${increase}%  评分:${item.trendScore}  MA5:${item.MA5} MA10:${item.MA10} MA30:${item.MA30}`);
            });
        }
    },

    /**
     * 搜索/查看单只股票
     */
    search: async (keyword) => {
        const symbol = keyword.toLowerCase();
        const url = `${CONFIG.api.quote}${symbol}`;

        try {
            const data = await httpClient.getWithRetry(url);
            const decoded = iconv.decode(Buffer.from(data), 'gbk');
            const quotes = parser.quote(decoded);

            if (quotes.length > 0) {
                const q = quotes[0];
                console.log('\n===== 股票信息 =====');
                console.log(`代码: ${q.symbol}`);
                console.log(`名称: ${q.name}`);
                console.log(`现价: $${q.price.toFixed(2)}`);
                console.log(`涨跌: ${q.change >= 0 ? '+' : ''}${q.change.toFixed(2)} (${utils.formatPercent(q.changePercent)})`);
                console.log(`开盘: $${q.open.toFixed(2)}`);
                console.log(`最高: $${q.high.toFixed(2)}`);
                console.log(`最低: $${q.low.toFixed(2)}`);
                console.log(`成交量: ${(q.volume / 10000).toFixed(2)} 万`);
                console.log(`更新时间: ${q.time}`);
            } else {
                console.log(`未找到股票: ${keyword.toUpperCase()}`);
                console.log('提示: 请输入美股代码，如 AAPL, MSFT, TSLA 等');
            }
        } catch (err) {
            console.error('查询失败:', err.message);
        }
    },

    /**
     * 清除所有进度和数据文件
     */
    clear: () => {
        progress.clear('list');
        progress.clear('line');

        const filesToClear = [
            CONFIG.files.list,
            CONFIG.files.klines,
            CONFIG.files.allStocks,
            CONFIG.files.error,
            `${CONFIG.files.assetsDir}/us_NSDK.json`,
            `${CONFIG.files.assetsDir}/us_trendup.json`,
        ];

        filesToClear.forEach(file => {
            if (utils.deleteFile(file)) {
                console.log(`✅ 已清除: ${file}`);
            }
        });

        console.log('\n✅ 所有进度和数据已清除！');
    },

    /**
     * 更新数据（合并 line + analyze）
     * 获取K线数据后自动进行技术分析
     */
    update: async () => {
        console.log('==========================================');
        console.log('📊 开始更新数据 (K线获取 + 技术分析)');
        console.log('==========================================\n');

        // 步骤1: 获取K线数据
        console.log('【阶段1/2】获取K线数据...\n');
        await stockService.getKlines();

        // 步骤2: 技术分析
        console.log('\n【阶段2/2】开始技术分析...\n');
        stockService.analyze();

        console.log('\n==========================================');
        console.log('✅ 数据更新完成！');
        console.log('==========================================');
    },
};

// ==================== CLI 入口 ====================
const cli = {
    showHelp: () => {
        console.log('=============================================');
        console.log('美股数据获取工具 (新浪财经 API)');
        console.log('支持获取全部美股数据 (约 16000+ 只)');
        console.log('=============================================');
        console.log('用法: node us_stock.js <命令> [参数]');
        console.log('');
        console.log('命令:');
        console.log('  server [port]  启动收藏服务（默认端口 3000）');
        console.log('  list           获取全部美股列表及实时报价');
        console.log('  update         🚀 更新数据（K线获取 + 技术分析，推荐使用）');
        console.log('  line           仅获取K线历史数据');
        console.log('  analyze        仅运行技术分析（MA + RSI + MACD + 趋势评分）');
        console.log('  search <代码>  查询单只股票');
        console.log('  clear          清除进度文件和数据');
        console.log('');
        console.log('推荐流程:');
        console.log('  1. node us_stock.js list     # 首次获取股票列表');
        console.log('  2. node us_stock.js update   # 更新K线并分析（日常使用）');
        console.log('');
        console.log('示例:');
        console.log('  node us_stock.js server');
        console.log('  node us_stock.js update');
        console.log('  node us_stock.js search aapl');
        console.log('=============================================\n');
    },

    commands: {
        server: (args) => server.start(parseInt(args[0]) || 3000),
        list: () => stockService.getList(),
        update: () => stockService.update(),  // 新命令：line + analyze
        line: () => stockService.getKlines(),
        analyze: () => stockService.analyze(),
        ma: () => stockService.analyze(),  // 兼容旧命令
        up: () => stockService.analyze(),  // 兼容旧命令
        search: (args) => args[0] ? stockService.search(args[0]) : console.log('请提供股票代码'),
        clear: () => stockService.clear(),
    },

    run: () => {
        const args = process.argv.slice(2);
        const command = args[0];
        const commandArgs = args.slice(1);

        cli.showHelp();

        if (command && cli.commands[command]) {
            cli.commands[command](commandArgs);
        } else if (command) {
            console.log(`未知命令: ${command}`);
        }
    },
};

// 执行 CLI
cli.run();
