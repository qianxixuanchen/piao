const request = require('request');
const fs = require('fs')
const NSDKlist = fs.readFileSync('./hello-word/src/assets/NSDK.json')
const klines = fs.readFileSync('./klines.json')

// 断点续传配置
const PROGRESS_FILE = './getList_progress.json';
const MAX_RETRIES = 3;  // 最大重试次数
const RETRY_DELAY = 1000;  // 重试延迟(ms)
let TEST_LIMIT = 0;  // 测试模式：限制请求数量（设为 0 表示不限制）

const args = process.argv.slice(2)

// 加载断点进度
function loadProgress() {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
            console.log(`检测到上次中断的进度，从第 ${progress.pn} 页继续...`);
            return progress;
        }
    } catch (e) {
        console.log('读取进度文件失败，从头开始');
    }
    return { pn: 1, total: 258, list: [] };
}

// 保存断点进度
function saveProgress(pn, total, list) {
    try {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ pn, total, list }, null, 2), 'utf-8');
    } catch (e) {
        console.error('保存进度失败:', e.message);
    }
}

// 清除断点进度
function clearProgress() {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            fs.unlinkSync(PROGRESS_FILE);
            console.log('进度文件已清除');
        }
    } catch (e) {
        console.error('清除进度文件失败:', e.message);
    }
}

// 延迟函数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Promise 化的请求函数，带重试机制
function requestWithRetry(url, options, retries = MAX_RETRIES) {
    return new Promise((resolve, reject) => {
        const attemptRequest = (attemptNum) => {
            request(url, options, async (err, res, body) => {
                if (err) {
                    if (attemptNum < retries) {
                        console.log(`请求失败，${RETRY_DELAY}ms 后重试 (${attemptNum + 1}/${retries})...`);
                        await delay(RETRY_DELAY);
                        attemptRequest(attemptNum + 1);
                    } else {
                        reject(err);
                    }
                } else {
                    resolve(body);
                }
            });
        };
        attemptRequest(0);
    });
}

async function getList() {
    // 加载断点进度
    let { pn, total, list } = loadProgress();

    try {
        while (total >= pn) {
            // 测试模式：检查是否达到限制
            if (TEST_LIMIT > 0 && list.length >= TEST_LIMIT) {
                console.log(`[测试模式] 已达到 ${TEST_LIMIT} 条限制，停止请求`);
                break;
            }

            const url = `https://push2.eastmoney.com/api/qt/clist/get?np=1&fltt=1&invt=2&fs=m%3A105,m%3A106,m%3A107&fields=f12,f13,f14,f1,f2,f3,f152,f5,f17,f28,f15,f16&fid=f3&pn=${pn}&pz=50&po=1&dect=1&ut=fa5fd1943c7b386f172d6893dbfba10b&wbp2u=%7C0%7C0%7C0%7Cweb`;
            
            const body = await requestWithRetry(url, { json: true });

            // f2: 现价 f3: 涨跌幅  f17: 开盘  f16: 最低  f15: 最高  f12: 代码 f13: 代码前缀  f5: 成交量
            const { diff } = body.data;
            list.push(...diff);
            total = body.data.total / 20;
            const totalPages = Math.ceil(total);
            const progress = ((pn / totalPages) * 100).toFixed(1);
            console.log(`已获取 ${list.length} 条数据 (第 ${pn}/${totalPages} 页, 进度: ${progress}%)`);

            // 每页请求后保存进度
            pn++;
            saveProgress(pn, total, list);

            // 全量模式下检查是否完成
            if (TEST_LIMIT === 0 && list.length >= (total - 1) * 20) {
                break;
            }
        }

        // 数据获取完成，执行筛选和保存
        console.log(`开始筛选数据，原始数据 ${list.length} 条...`);
        
        // 涨幅排序：由大到小
        list = list.sort((a, b) => {
            const end = parseFloat(b.f3) || 0;
            const start = parseFloat(a.f3) || 0;
            return end - start;
        });
        
        // 过滤：成交量 > 10000，涨幅 > 0，价格 > 1
        // 注意：f2 价格字段放大了 100 倍，所以 price > 1 对应 f2 > 100
        const res = list.filter(item => {
            const volume = parseFloat(item.f5);   // 成交量
            const increase = parseFloat(item.f3); // 涨跌幅（放大100倍，如 7743 表示 77.43%）
            const price = parseFloat(item.f2);    // 现价（放大1000倍，如 113750 表示 113.750）
            // 排除无效数据
            if (Number.isNaN(volume) || Number.isNaN(increase) || Number.isNaN(price)) return false;
            // 筛选条件：成交量 > 10000，涨幅 > 0，价格 > 1（即 f2 > 1000）
            return (volume > 10000 && increase > 0 && price > 1000);
        });
        
        console.log(`筛选完成，符合条件 ${res.length} 条`);
        fs.writeFileSync('./hello-word/src/assets/NSDK.json', JSON.stringify(res, null, 2), 'utf-8');
        
        // 任务完成，清除进度文件
        clearProgress();
        console.log('✅ 数据获取完成！');
    } catch (err) {
        console.error(`请求在第 ${pn} 页失败，进度已保存。下次执行将从此处继续。`);
        console.error('错误信息:', err.message);
        // 进度已在循环中保存，无需额外操作
    }
}
console.log(args)
if (args[0] === 'list') {
    getList()
}
else if (args[0] === 'test') {
    // 测试模式：限制请求数量，默认500条
    TEST_LIMIT = parseInt(args[1]) || 500;
    console.log(`🧪 测试模式启动，限制请求 ${TEST_LIMIT} 条数据`);
    getList()
}
else if (args[0] === 'line') {
    getLine()
}
else if (args[0] === 'up') {
    trendup()
}
else if (args[0] === 'ma') {
    formatMA()
}
else if (args[0] === 'clear') {
    // 清除进度文件和测试数据
    clearProgress();
    
    // 清除测试数据文件
    const filesToClear = [
        './NSDK.json',
        './hello-word/src/assets/NSDK.json'
    ];
    
    filesToClear.forEach(file => {
        try {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
                console.log(`✅ 已清除: ${file}`);
            }
        } catch (e) {
            console.error(`❌ 清除 ${file} 失败:`, e.message);
        }
    });
    
    console.log('✅ 所有进度和测试数据已清除！');
}
else if (args[0] === 'help' || args[0] === '-h') {
    console.log(`
📋 可用命令:
  node index.js list          - 获取全部股票列表数据（支持断点续传）
  node index.js test [n]      - 测试模式，只获取 n 条数据（默认500条）
  node index.js line          - 获取K线数据
  node index.js up            - 筛选上涨趋势股票
  node index.js ma            - 计算移动平均线
  node index.js clear         - 清除进度文件和测试数据
  node index.js help          - 显示帮助信息
    `)
}

function format(list) {
    return list.map(item => {
        const oneday = item.split(',');
        if(oneday && oneday.length) {
            const open = parseFloat(oneday[1]);
            const close = parseFloat(oneday[2]);
            const high = parseFloat(oneday[3]);
            const low = parseFloat(oneday[4]);
            const increase = parseFloat(oneday[8]);
            return {
                open,
                close,
                high,
                low,
                increase
            }
        }
        else {
            return null
        }
    })
}

function getMA(num, list) {
    if (list.length >= num) {
        const len = list.length;
        let all = 0;
        for(let i = 1; i <= num; i++) {
            all += list[len - i]
        }
        return all / num
    }
}

function formatMA() {
    const _data = JSON.parse(klines)
    _data.map(item => {
        const list = item.data
        const closeList = list.map(item => item.close)
        item.MA5 = getMA(5, closeList)
        item.MA10 = getMA(10, closeList)
        item.MA30 = getMA(30, closeList)
    })
    fs.writeFileSync('./klines.json', JSON.stringify(_data, null, 2), 'utf-8')
}

function getLine() {
    const allList = JSON.parse(NSDKlist);
    console.log(`allList.length: ${allList.length}`)
    const dataList = []
    const nodataList = []
    allList.map(async item => {
        await request(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${item.f13}.${item.f12}&ut=fa5fd1943c7b386f172d6893dbfba10b&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=30&_=1742540240424`, {}, (err, res, body) => {
            if(body) {
                const klines = JSON.parse(body)?.data?.klines
                if(klines && klines.length) {
                    const data = format(klines)
                    dataList.push({
                        f12: item.f12,
                        f13: item.f13,
                        data
                    })
                }
                else {
                    nodataList.push({
                        f12: item.f12,
                        f13: item.f13,
                    })
                }

                // dataList.map(item => {});
                (dataList.length && dataList.length % 10 == 0) && console.log(dataList.length);
            }
            else {
                nodataList.push({
                    f12: item.f12,
                    f13: item.f13,
                })
                console.log('item.f12+item.f233 ')
                console.log(item.f13 + '' +item.f12);
            }
            if(nodataList.length + dataList.length === allList.length) {
                fs.writeFileSync('./klines.json', JSON.stringify(dataList, null, 2), 'utf-8')
                fs.writeFileSync('./error.json', JSON.stringify(nodataList, null, 2), 'utf-8')
            }
        })
    });
}

function trendup() {
    fs.writeFileSync('./hello-word/src/assets/trendup.json', JSON.stringify(trendup(JSON.parse(klines)), null, 2), 'utf-8')
    function trendup(list) {
        return list.filter(item => item.data.length > 0).sort((a,b) => {
            return b.data[b.data.length -1].increase - a.data[a.data.length -1].increase
        }).filter(item => {
            const len = item.data.length;
            const last = list[len - 1]
            
            if (last === 'true') {
                console.log(last)
            }
            if(len > 0) {
                // if (item.MA30) {
                //     return item.MA30 <= item.MA10 && item.MA30 <= item.MA5
                // }
                return true
            }
            else {
                console.log(item.f12)
            }
        })
    }
}
