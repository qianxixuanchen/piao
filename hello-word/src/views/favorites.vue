<template>
  <div class="favorites-page">
    <!-- 页面头部 -->
    <div class="page-header">
      <h1>⭐ 我的收藏</h1>
      <div class="header-actions">
        <router-link to="/" class="btn btn-back">← 返回列表</router-link>
        <button class="btn btn-download" @click="downloadFavorites" :disabled="!hasFavorites">
          📥 下载收藏
        </button>
        <button class="btn btn-clear" @click="clearFavorites" :disabled="!hasFavorites">
          🗑️ 清空收藏
        </button>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!hasFavorites" class="empty-state">
      <p>📭 暂无收藏的股票</p>
      <router-link to="/" class="btn btn-primary">去添加收藏</router-link>
    </div>

    <!-- 收藏列表 -->
    <template v-else>
      <div class="stats-bar">
        <span>共收藏 {{ favorites.length }} 只股票</span>
      </div>

      <div class="stock-list">
        <StockCard
          v-for="item in favoriteStocks"
          :key="item.symbol"
          :stock="item"
          :is-favorite="true"
          :favorite-date="item.favoriteDate"
          :loading="loading"
          @remove-favorite="removeFavorite"
          @click-chart="openStockDetail"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import StockCard from '../components/StockCard.vue'

// ==================== 配置常量 ====================
const CONFIG = {
  apiBase: 'http://localhost:3000',
  storageKey: 'us_stock_favorites',
}

// ==================== 数据加载 ====================
let allStockData = []
try {
  allStockData = require('../assets/us_trendup.json')
} catch (e) {
  console.warn('未找到股票数据文件')
}

// ==================== 响应式数据 ====================
const favorites = ref([])
const loading = ref(false)

const hasFavorites = computed(() => favorites.value.length > 0)

// 获取收藏股票的详细信息
const favoriteStocks = computed(() => {
  return favorites.value.map(fav => {
    const stockDetail = allStockData.find(s => s.symbol === fav.symbol)
    return stockDetail
      ? { ...stockDetail, favoriteDate: fav.date }
      : { symbol: fav.symbol, name: '', favoriteDate: fav.date, data: [] }
  })
})

// ==================== API 操作 ====================
/**
 * 从服务器获取收藏数据
 */
async function fetchFavorites() {
  try {
    const res = await fetch(`${CONFIG.apiBase}/api/favorites`)
    const data = await res.json()
    if (data.success) {
      favorites.value = data.data
      saveToStorage(data.data)
    }
  } catch (e) {
    console.warn('获取收藏失败，使用本地缓存:', e.message)
    favorites.value = loadFromStorage()
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
        saveToStorage(favorites.value)
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
      saveToStorage([])
    } else {
      showError(data.message || '清空失败')
    }
  } catch (e) {
    showError('服务未启动，请先运行: node us_stock.js server')
  } finally {
    loading.value = false
  }
}

// ==================== 工具函数 ====================
function saveToStorage(data) {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(data))
}

function loadFromStorage() {
  try {
    const cached = localStorage.getItem(CONFIG.storageKey)
    return cached ? JSON.parse(cached) : []
  } catch {
    return []
  }
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
.favorites-page {
  --primary-color: #1890ff;
  --success-color: #52c41a;
  --warning-color: #faad14;
  --danger-color: #ff4d4f;
  --text-color: #333;
  --text-secondary: #666;
  --border-color: #eee;
  --bg-light: #f5f5f5;
  --radius: 8px;
  --radius-sm: 4px;

  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

/* 页面头部 */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid #fadb14;
}

.page-header h1 {
  margin: 0;
  font-size: 24px;
  color: #d48806;
}

.header-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* 通用按钮样式 */
.btn {
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  text-decoration: none;
  display: inline-block;
}

.btn:disabled {
  border-color: #d9d9d9;
  background: var(--bg-light);
  color: #bfbfbf;
  cursor: not-allowed;
}

.btn-back {
  border: 1px solid var(--primary-color);
  background: #e6f7ff;
  color: var(--primary-color);
}

.btn-back:hover {
  background: var(--primary-color);
  color: #fff;
}

.btn-download {
  border: 1px solid var(--success-color);
  background: #f6ffed;
  color: var(--success-color);
}

.btn-download:hover:not(:disabled) {
  background: var(--success-color);
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

.btn-primary {
  background: var(--primary-color);
  color: #fff;
  border: none;
}

.btn-primary:hover {
  background: #40a9ff;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: #fafafa;
  border-radius: var(--radius);
  margin-top: 20px;
}

.empty-state p {
  font-size: 18px;
  color: #999;
  margin-bottom: 20px;
}

/* 统计栏 */
.stats-bar {
  padding: 12px 15px;
  background: linear-gradient(135deg, #fffbe6 0%, #fff7cc 100%);
  border: 1px solid #fadb14;
  border-radius: var(--radius);
  margin-bottom: 20px;
  font-weight: 500;
  color: #d48806;
}

/* 股票列表 */
.stock-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
</style>
