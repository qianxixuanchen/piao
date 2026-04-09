<template>
  <div class="home">
    <!-- 收藏管理栏 -->
    <div class="favorites-bar">
      <span class="favorites-count">⭐ 已收藏 {{ favorites.length }} 只股票</span>
      <div class="favorites-actions">
        <router-link to="/favorites" class="btn btn-view">📋 查看收藏</router-link>
        <button class="btn btn-download" @click="downloadFavorites" :disabled="!hasFavorites">
          📥 下载收藏列表
        </button>
        <button class="btn btn-clear" @click="clearFavorites" :disabled="!hasFavorites">
          🗑️ 清空收藏
        </button>
      </div>
    </div>

    <!-- 趋势分组标签页 -->
    <div class="trend-tabs">
      <button
        v-for="tab in trendTabs"
        :key="tab.level"
        :class="['trend-tab', { active: currentTab === tab.level }]"
        @click="switchTab(tab.level)"
      >
        <span class="tab-icon">{{ tab.icon }}</span>
        <span class="tab-label">{{ tab.label }}</span>
        <span class="tab-count">{{ tab.count }}</span>
      </button>
    </div>

    <!-- 分页控制（顶部） -->
    <PaginationBar
      :current-page="currentPage"
      :total-pages="totalPages"
      :total-items="totalItems"
      :page-size="pageSize"
      :show-page-size="true"
      @prev="prevPage"
      @next="nextPage"
      @goto="goToPage"
      @page-size-change="handlePageSizeChange"
    />

    <!-- 当前分组标题 -->
    <div class="current-group-header">
      <span class="group-icon">{{ currentTabInfo.icon }}</span>
      <span class="group-title">{{ currentTabInfo.label }}</span>
      <span class="group-desc">{{ currentTabInfo.desc }}</span>
    </div>

    <!-- 股票列表 -->
    <div class="stock-list">
      <StockCard
        v-for="item in paginatedList"
        :key="item.symbol"
        :stock="item"
        :is-favorite="isFavorite(item.symbol)"
        :favorite-date="getFavoriteDate(item.symbol)"
        :loading="loading"
        @add-favorite="addFavorite"
        @remove-favorite="removeFavorite"
        @click-chart="openStockDetail"
      />
      
      <!-- 空状态 -->
      <div v-if="paginatedList.length === 0" class="empty-state">
        <span class="empty-icon">📭</span>
        <span class="empty-text">该分组暂无股票数据</span>
      </div>
    </div>

    <!-- 分页控制（底部） -->
    <PaginationBar
      v-if="paginatedList.length > 0"
      :current-page="currentPage"
      :total-pages="totalPages"
      :show-page-size="false"
      class="bottom"
      @prev="prevPage"
      @next="nextPage"
      @goto="goToPage"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import PaginationBar from '../components/PaginationBar.vue'
import StockCard from '../components/StockCard.vue'

// ==================== 配置常量 ====================
const CONFIG = {
  apiBase: 'http://localhost:3000',
  storageKeys: {
    favorites: 'us_stock_favorites',
    currentPage: 'us_stock_currentPage',
    pageSize: 'us_stock_pageSize',
    currentTab: 'us_stock_currentTab',
  },
  defaultPageSize: 20,
}

// 趋势等级配置
const TREND_LEVELS = {
  all: { 
    icon: '📊', 
    label: '全部', 
    desc: '所有筛选出的股票（按涨幅排序）',
    filter: () => true,
    // 按涨幅降序排序
    sort: (a, b) => {
      const aInc = parseFloat(a.data?.[a.data.length - 1]?.increase) || 0
      const bInc = parseFloat(b.data?.[b.data.length - 1]?.increase) || 0
      return bInc - aInc
    }
  },
  big_gainer: {
    icon: '🔥',
    label: '大涨股票',
    desc: '涨幅≥10%，不参与评分系统（按涨幅排序）',
    filter: item => item.isBigGainer === true,
    // 按涨幅降序
    sort: (a, b) => {
      const aInc = parseFloat(a.data?.[a.data.length - 1]?.increase) || 0
      const bInc = parseFloat(b.data?.[b.data.length - 1]?.increase) || 0
      return bInc - aInc
    }
  },
  pullback: {
    icon: '🎯',
    label: '回调买入',
    desc: 'MA5>MA30 且 MA10>MA30，但当日下跌（按跌幅+评分排序）',
    filter: item => item.isPullback === true,
    // 排序规则：先按跌幅排序（跌幅小的优先，即更接近0），同跌幅按评分降序
    sort: (a, b) => {
      const aInc = parseFloat(a.data?.[a.data.length - 1]?.increase) || 0
      const bInc = parseFloat(b.data?.[b.data.length - 1]?.increase) || 0
      // 跌幅：值越大越靠前（-1% 比 -5% 跌幅小，-1% 排前面）
      if (aInc !== bInc) {
        return bInc - aInc  // 跌幅小的排前面
      }
      // 同跌幅按评分降序
      return (b.trendScore || 0) - (a.trendScore || 0)
    }
  },
  up_phase: {
    icon: '📈',
    label: '历史上涨',
    desc: '100个交易日内存在≥5天连续上涨阶段（按最强阶段涨幅排序）',
    filter: item => item.hasUpPhase === true,
    // 按最强上涨阶段涨幅排序
    sort: (a, b) => {
      return (b.bestUpPhase?.totalGain || 0) - (a.bestUpPhase?.totalGain || 0)
    }
  },
  strong_up: { 
    icon: '🚀', 
    label: '强势上涨', 
    desc: '评分≥80，均线多头排列，技术指标全面看涨',
    filter: item => item.trendLevel === 'strong_up',
    sort: null
  },
  up: { 
    icon: '📈', 
    label: '上涨趋势', 
    desc: '评分60-79，处于上升通道，可重点关注',
    filter: item => item.trendLevel === 'up',
    sort: null
  },
  weak_up: { 
    icon: '📊', 
    label: '弱势上涨', 
    desc: '评分40-59，有上涨迹象但动能不足',
    filter: item => item.trendLevel === 'weak_up',
    sort: null
  },
  neutral: { 
    icon: '➖', 
    label: '震荡整理', 
    desc: '评分25-39，处于横盘震荡阶段',
    filter: item => item.trendLevel === 'neutral',
    sort: null
  },
  down: { 
    icon: '📉', 
    label: '下跌趋势', 
    desc: '评分<25，但当日涨幅≥5%可能存在反弹',
    filter: item => item.trendLevel === 'down' || !item.trendLevel,
    sort: null
  },
}

// ==================== 数据加载 ====================
const allData = require('../assets/us_trendup.json')

// ==================== 趋势分组 ====================
const currentTab = ref(loadFromStorage(CONFIG.storageKeys.currentTab, 'all'))

// 计算各分组数量
const trendTabs = computed(() => {
  return Object.entries(TREND_LEVELS).map(([level, config]) => ({
    level,
    icon: config.icon,
    label: config.label,
    desc: config.desc,
    count: allData.filter(config.filter).length,
  }))
})

// 当前选中的分组信息
const currentTabInfo = computed(() => {
  const tab = trendTabs.value.find(t => t.level === currentTab.value)
  return tab || trendTabs.value[0]
})

// 当前分组的股票数据（带排序）
const filteredData = computed(() => {
  const config = TREND_LEVELS[currentTab.value]
  if (!config) return allData
  
  let result = allData.filter(config.filter)
  
  // 如果有自定义排序规则则应用
  if (config.sort) {
    result = [...result].sort(config.sort)
  } else {
    // 默认按评分降序
    result = [...result].sort((a, b) => (b.trendScore || 0) - (a.trendScore || 0))
  }
  
  return result
})

// 切换分组
function switchTab(level) {
  if (currentTab.value !== level) {
    currentTab.value = level
    currentPage.value = 1
    saveToStorage(CONFIG.storageKeys.currentTab, level)
    savePageState()
    scrollToTop()
  }
}

// ==================== 收藏功能 ====================
const favorites = ref([])
const loading = ref(false)

const hasFavorites = computed(() => favorites.value.length > 0)

/**
 * 从服务器获取收藏数据
 */
async function fetchFavorites() {
  try {
    const res = await fetch(`${CONFIG.apiBase}/api/favorites`)
    const data = await res.json()
    if (data.success) {
      favorites.value = data.data
      saveToStorage(CONFIG.storageKeys.favorites, data.data)
    }
  } catch (e) {
    console.warn('获取收藏失败，使用本地缓存:', e.message)
    favorites.value = loadFromStorage(CONFIG.storageKeys.favorites, [])
  }
}

/**
 * 判断是否已收藏
 */
function isFavorite(symbol) {
  return favorites.value.some(item => item.symbol === symbol)
}

/**
 * 获取收藏日期
 */
function getFavoriteDate(symbol) {
  const item = favorites.value.find(item => item.symbol === symbol)
  return item?.date || ''
}

/**
 * 添加收藏
 */
async function addFavorite(symbol) {
  if (isFavorite(symbol) || loading.value) return

  loading.value = true
  try {
    const res = await fetch(`${CONFIG.apiBase}/api/favorites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    })
    const data = await res.json()
    
    if (data.success) {
      favorites.value.push(data.data)
      saveToStorage(CONFIG.storageKeys.favorites, favorites.value)
    } else {
      showError(data.message || '收藏失败')
    }
  } catch (e) {
    showError('服务未启动，请先运行: node us_stock.js server')
  } finally {
    loading.value = false
  }
}

/**
 * 取消收藏
 */
async function removeFavorite(symbol) {
  if (loading.value) return

  loading.value = true
  try {
    const res = await fetch(`${CONFIG.apiBase}/api/favorites/${encodeURIComponent(symbol)}`, {
      method: 'DELETE',
    })
    const data = await res.json()
    
    if (data.success) {
      const index = favorites.value.findIndex(item => item.symbol === symbol)
      if (index !== -1) {
        favorites.value.splice(index, 1)
        saveToStorage(CONFIG.storageKeys.favorites, favorites.value)
      }
    } else {
      showError(data.message || '取消收藏失败')
    }
  } catch (e) {
    showError('服务未启动，请先运行: node us_stock.js server')
  } finally {
    loading.value = false
  }
}

/**
 * 下载收藏列表
 */
function downloadFavorites() {
  if (!hasFavorites.value) return
  
  const blob = new Blob([JSON.stringify(favorites.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `favorites_${formatDate(new Date())}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 清空收藏
 */
async function clearFavorites() {
  if (!hasFavorites.value || !confirm('确定要清空所有收藏吗？')) return

  loading.value = true
  try {
    const res = await fetch(`${CONFIG.apiBase}/api/favorites/clear`, { method: 'DELETE' })
    const data = await res.json()
    
    if (data.success) {
      favorites.value = []
      saveToStorage(CONFIG.storageKeys.favorites, [])
    } else {
      showError(data.message || '清空失败')
    }
  } catch (e) {
    showError('服务未启动，请先运行: node us_stock.js server')
  } finally {
    loading.value = false
  }
}

// ==================== 分页功能 ====================
const currentPage = ref(loadFromStorage(CONFIG.storageKeys.currentPage, 1, parseInt))
const pageSize = ref(loadFromStorage(CONFIG.storageKeys.pageSize, CONFIG.defaultPageSize, parseInt))

const totalItems = computed(() => filteredData.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pageSize.value)))

// 确保恢复的页码有效
if (currentPage.value > totalPages.value) {
  currentPage.value = Math.max(1, totalPages.value)
}

const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredData.value.slice(start, start + pageSize.value)
})

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--
    savePageState()
    scrollToTop()
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    savePageState()
    scrollToTop()
  }
}

function goToPage(page) {
  const targetPage = Math.max(1, Math.min(page, totalPages.value))
  if (targetPage !== currentPage.value) {
    currentPage.value = targetPage
    savePageState()
    scrollToTop()
  }
}

function handlePageSizeChange(newSize) {
  pageSize.value = newSize
  currentPage.value = 1
  savePageState()
}

function savePageState() {
  saveToStorage(CONFIG.storageKeys.currentPage, currentPage.value)
  saveToStorage(CONFIG.storageKeys.pageSize, pageSize.value)
}

// ==================== 工具函数 ====================
function saveToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function loadFromStorage(key, defaultValue, parser = JSON.parse) {
  try {
    const value = localStorage.getItem(key)
    return value !== null ? parser(value) : defaultValue
  } catch {
    return defaultValue
  }
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function showError(message) {
  alert(message)
}

function formatDate(date) {
  return date.toISOString().split('T')[0]
}

function openStockDetail(symbol) {
  window.open(`https://stock.finance.sina.com.cn/usstock/quotes/${symbol}.html`)
}

// ==================== 生命周期 ====================
onMounted(() => {
  fetchFavorites()
})
</script>

<style scoped>
/* CSS 变量 */
.home {
  --primary-color: #1890ff;
  --warning-color: #faad14;
  --danger-color: #ff4d4f;
  --success-color: #52c41a;
  --text-color: #333;
  --text-secondary: #666;
  --border-color: #ddd;
  --bg-light: #f5f5f5;
  --radius: 8px;
  --radius-sm: 4px;
  
  padding: 20px;
}

/* 收藏管理栏 */
.favorites-bar {
  margin: 15px 0;
  padding: 12px 15px;
  background: linear-gradient(135deg, #fffbe6 0%, #fff7cc 100%);
  border: 1px solid #fadb14;
  border-radius: var(--radius);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.favorites-count {
  font-size: 14px;
  font-weight: 500;
  color: #d48806;
}

.favorites-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* 趋势分组标签页 */
.trend-tabs {
  display: flex;
  gap: 8px;
  margin: 20px 0;
  padding: 10px;
  background: var(--bg-light);
  border-radius: var(--radius);
  overflow-x: auto;
  flex-wrap: wrap;
}

.trend-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: 2px solid transparent;
  border-radius: var(--radius);
  background: #fff;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 14px;
  white-space: nowrap;
}

.trend-tab:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.15);
}

.trend-tab.active {
  background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.3);
}

.tab-icon {
  font-size: 18px;
}

.tab-label {
  font-weight: 500;
}

.tab-count {
  padding: 2px 8px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.trend-tab.active .tab-count {
  background: rgba(255, 255, 255, 0.25);
}

/* 当前分组标题 */
.current-group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 15px 0;
  padding: 15px 20px;
  background: linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%);
  border-radius: var(--radius);
  border-left: 4px solid var(--primary-color);
}

.group-icon {
  font-size: 28px;
}

.group-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
}

.group-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-left: auto;
}

/* 通用按钮样式 */
.btn {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  text-decoration: none;
  display: inline-block;
}

.btn:disabled {
  border-color: #d9d9d9;
  background: var(--bg-light);
  color: #bfbfbf;
  cursor: not-allowed;
}

.btn-view {
  border: 1px solid var(--warning-color);
  background: #fffbe6;
  color: #d48806;
}

.btn-view:hover {
  background: var(--warning-color);
  color: #fff;
}

.btn-download {
  border: 1px solid var(--primary-color);
  background: #e6f7ff;
  color: var(--primary-color);
}

.btn-download:hover:not(:disabled) {
  background: var(--primary-color);
  color: #fff;
}

.btn-clear {
  border: 1px solid var(--danger-color);
  background: #fff1f0;
  color: var(--danger-color);
}

.btn-clear:hover:not(:disabled) {
  background: var(--danger-color);
  color: #fff;
}

/* 股票列表 */
.stock-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  background: var(--bg-light);
  border-radius: var(--radius);
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 15px;
}

.empty-text {
  font-size: 16px;
}

/* 底部分页 */
.bottom {
  margin-top: 30px;
  display: flex;
  justify-content: flex-end;
}

/* 响应式 */
@media (max-width: 768px) {
  .trend-tabs {
    gap: 6px;
    padding: 8px;
  }
  
  .trend-tab {
    padding: 8px 12px;
    font-size: 13px;
  }
  
  .tab-icon {
    font-size: 16px;
  }
  
  .current-group-header {
    flex-wrap: wrap;
    padding: 12px 15px;
  }
  
  .group-desc {
    width: 100%;
    margin-left: 0;
    margin-top: 5px;
  }
}
</style>
