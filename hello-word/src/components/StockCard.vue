<template>
  <div :class="['stock-card', { 'pullback-card': stock.isPullback, 'big-gainer-card': stock.isBigGainer }]">
    <div class="stock-header">
      <div class="stock-info">
        <!-- 大涨股票标签 -->
        <span v-if="stock.isBigGainer" class="big-gainer-badge">
          🔥 大涨
        </span>
        
        <!-- 回调买入标签 -->
        <span v-else-if="stock.isPullback" class="pullback-badge">
          🎯 回调买入
        </span>
        
        <!-- 趋势评分标签（大涨股票不显示评分） -->
        <span v-else-if="hasTrendScore" :class="['trend-badge', trendClass]">
          {{ trendIcon }} {{ stock.trendScore }}分
        </span>
        
        <span class="label">涨跌幅：</span>
        <span class="increase" :class="increaseClass">{{ formattedIncrease }}</span>
        
        <span class="label ml-20">股票代码：</span>
        <span class="symbol">{{ stock.symbol }}</span>
        <span class="name ml-12">{{ stock.name }}</span>
      </div>
      
      <div class="favorite-action">
        <template v-if="isFavorite">
          <span class="favorite-date">⭐ 收藏于 {{ favoriteDate }}</span>
          <button class="btn btn-unfavorite" @click="handleRemove" :disabled="loading">取消收藏</button>
        </template>
        <template v-else>
          <button class="btn btn-favorite" @click="handleAdd" :disabled="loading">⭐ 收藏</button>
        </template>
      </div>
    </div>

    <!-- 技术指标详情 -->
    <div v-if="hasMA" class="indicators-row">
      <span class="indicator-item">
        <span class="indicator-label">MA5:</span>
        <span class="indicator-value">{{ stock.MA5 }}</span>
      </span>
      <span class="indicator-item">
        <span class="indicator-label">MA10:</span>
        <span class="indicator-value">{{ stock.MA10 }}</span>
      </span>
      <span class="indicator-item">
        <span class="indicator-label">MA30:</span>
        <span class="indicator-value">{{ stock.MA30 }}</span>
      </span>
      <span v-if="stock.RSI && !stock.isBigGainer" class="indicator-item">
        <span class="indicator-label">RSI:</span>
        <span class="indicator-value" :class="rsiClass">{{ stock.RSI }}</span>
      </span>
      <span v-if="stock.MACD && !stock.isBigGainer" class="indicator-item">
        <span class="indicator-label">MACD:</span>
        <span class="indicator-value" :class="macdClass">{{ macdSignalText }}</span>
      </span>
    </div>

    <!-- 趋势信号标签 -->
    <div v-if="hasTrendSignals" class="signals-row">
      <span 
        v-for="(signal, index) in displaySignals" 
        :key="index" 
        class="signal-tag"
      >
        {{ signal }}
      </span>
    </div>

    <!-- 历史上涨阶段展示 -->
    <div v-if="hasUpPhases" class="up-phases-section">
      <div class="up-phases-header">
        <span class="up-phases-title">📈 历史上涨阶段</span>
        <span class="up-phases-count">共 {{ stock.upPhases.length }} 个阶段</span>
      </div>
      <div class="up-phases-list">
        <div 
          v-for="(phase, index) in displayPhases" 
          :key="index" 
          class="up-phase-item"
        >
          <div class="phase-timeline">
            <span class="phase-dot phase-start"></span>
            <span class="phase-line"></span>
            <span class="phase-dot phase-end"></span>
          </div>
          <div class="phase-info">
            <div class="phase-dates">
              <span class="phase-date">{{ phase.startDate }}</span>
              <span class="phase-arrow">→</span>
              <span class="phase-date">{{ phase.endDate }}</span>
              <span class="phase-duration">{{ phase.totalDays }}天</span>
              <span v-if="phase.downDays > 0" class="phase-adjust">(调整{{ phase.downDays }}天)</span>
            </div>
            <div class="phase-prices">
              <span class="phase-price">${{ phase.startPrice.toFixed(2) }}</span>
              <span class="phase-arrow">→</span>
              <span class="phase-price phase-price-end">${{ phase.endPrice.toFixed(2) }}</span>
              <span class="phase-gain">+{{ phase.totalGain }}%</span>
            </div>
          </div>
        </div>
      </div>
      <div v-if="stock.upPhases.length > 3" class="up-phases-more" @click="showAllPhases = !showAllPhases">
        {{ showAllPhases ? '收起' : `查看全部 ${stock.upPhases.length} 个阶段` }}
      </div>
    </div>

    <img
      :src="chartUrl"
      :alt="`${stock.symbol} K线图`"
      class="stock-chart"
      loading="lazy"
      @click="$emit('click-chart', stock.symbol)"
      @error="onImageError"
    >
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  stock: { type: Object, required: true },
  isFavorite: { type: Boolean, default: false },
  favoriteDate: { type: String, default: '' },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['add-favorite', 'remove-favorite', 'click-chart'])

const imageError = ref(false)
const showAllPhases = ref(false)

// 趋势等级配置
const TREND_CONFIG = {
  big_gainer: { icon: '🔥', class: 'big-gainer' },
  strong_up: { icon: '🚀', class: 'strong-up' },
  up: { icon: '📈', class: 'up-trend' },
  weak_up: { icon: '📊', class: 'weak-up' },
  neutral: { icon: '➖', class: 'neutral' },
  down: { icon: '📉', class: 'down-trend' },
}

// 计算涨跌幅
const increase = computed(() => {
  const data = props.stock.data
  if (data && data.length > 0) {
    return parseFloat(data[data.length - 1].increase) || 0
  }
  return 0
})

const formattedIncrease = computed(() => `${increase.value}%`)

const increaseClass = computed(() => ({
  'up': increase.value > 0,
  'down': increase.value < 0,
}))

// 趋势相关计算属性
const hasTrendScore = computed(() => props.stock.trendScore !== undefined)

const trendIcon = computed(() => {
  const config = TREND_CONFIG[props.stock.trendLevel]
  return config?.icon || '📊'
})

const trendClass = computed(() => {
  const config = TREND_CONFIG[props.stock.trendLevel]
  return config?.class || 'neutral'
})

// 是否有均线数据
const hasMA = computed(() => Boolean(props.stock.MA5))

// 趋势信号
const hasTrendSignals = computed(() => {
  return props.stock.trendSignals && props.stock.trendSignals.length > 0
})

const displaySignals = computed(() => {
  return (props.stock.trendSignals || []).slice(0, 5)
})

// RSI 样式
const rsiClass = computed(() => {
  const rsi = props.stock.RSI
  if (!rsi) return ''
  if (rsi >= 70) return 'rsi-overbought'
  if (rsi >= 50) return 'rsi-strong'
  if (rsi >= 30) return 'rsi-neutral'
  return 'rsi-oversold'
})

// MACD 信号文本
const macdSignalText = computed(() => {
  const macd = props.stock.MACD
  if (!macd) return '-'
  return macd.signal === 'golden' ? '金叉' : '死叉'
})

const macdClass = computed(() => {
  const macd = props.stock.MACD
  if (!macd) return ''
  return macd.signal === 'golden' ? 'macd-golden' : 'macd-dead'
})

// K线图 URL
const chartUrl = computed(() => {
  const symbol = props.stock.symbol.toLowerCase()
  return `https://image.sinajs.cn/newchart/usstock/daily/${symbol}.gif?t=${Date.now()}`
})

// 历史上涨阶段
const hasUpPhases = computed(() => {
  return props.stock.upPhases && props.stock.upPhases.length > 0
})

const displayPhases = computed(() => {
  const phases = props.stock.upPhases || []
  // 按涨幅降序排列
  const sorted = [...phases].sort((a, b) => b.totalGain - a.totalGain)
  return showAllPhases.value ? sorted : sorted.slice(0, 3)
})

function handleAdd() {
  emit('add-favorite', props.stock.symbol)
}

function handleRemove() {
  emit('remove-favorite', props.stock.symbol)
}

function onImageError(e) {
  imageError.value = true
  e.target.style.display = 'none'
}
</script>

<style scoped>
.stock-card {
  margin-top: 20px;
  padding: 15px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid #f0f0f0;
}

/* 回调买入卡片特殊样式 */
.stock-card.pullback-card {
  background: linear-gradient(135deg, #fffbe6 0%, #fff7cc 100%);
  border: 2px solid #fadb14;
  box-shadow: 0 4px 12px rgba(250, 219, 20, 0.2);
}

/* 大涨股票卡片特殊样式 */
.stock-card.big-gainer-card {
  background: linear-gradient(135deg, #fff1f0 0%, #ffccc7 100%);
  border: 2px solid #ff4d4f;
  box-shadow: 0 4px 12px rgba(255, 77, 79, 0.25);
  animation: glow 2s ease-in-out infinite alternate;
}

@keyframes glow {
  from {
    box-shadow: 0 4px 12px rgba(255, 77, 79, 0.25);
  }
  to {
    box-shadow: 0 6px 20px rgba(255, 77, 79, 0.4);
  }
}

.stock-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.stock-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

/* 回调买入标签 */
.pullback-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  margin-right: 8px;
  background: linear-gradient(135deg, #722ed1 0%, #b37feb 100%);
  color: #fff;
  animation: pulse 2s infinite;
}

/* 大涨股票标签 */
.big-gainer-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  margin-right: 8px;
  background: linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%);
  color: #fff;
  animation: fire 1s ease-in-out infinite alternate;
}

@keyframes fire {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.05);
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

/* 趋势评分标签 */
.trend-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  margin-right: 10px;
}

.trend-badge.strong-up {
  background: linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%);
  color: #fff;
}

.trend-badge.up-trend {
  background: linear-gradient(135deg, #fa8c16 0%, #ffc53d 100%);
  color: #fff;
}

.trend-badge.weak-up {
  background: linear-gradient(135deg, #1890ff 0%, #69c0ff 100%);
  color: #fff;
}

.trend-badge.neutral {
  background: linear-gradient(135deg, #8c8c8c 0%, #bfbfbf 100%);
  color: #fff;
}

.trend-badge.down-trend {
  background: linear-gradient(135deg, #52c41a 0%, #95de64 100%);
  color: #fff;
}

.label {
  color: #666;
  font-size: 13px;
}

.increase {
  font-weight: 600;
  font-size: 15px;
}

.increase.up {
  color: #f5222d;
}

.increase.down {
  color: #52c41a;
}

.symbol {
  font-weight: 600;
  font-size: 15px;
  color: #1890ff;
}

.name {
  color: #333;
}

.ml-12 {
  margin-left: 12px;
}

.ml-20 {
  margin-left: 20px;
}

/* 技术指标行 */
.indicators-row {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  margin-top: 10px;
  padding: 8px 12px;
  background: #fafafa;
  border-radius: 6px;
}

.indicator-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.indicator-label {
  color: #8c8c8c;
}

.indicator-value {
  font-weight: 500;
  color: #333;
}

.indicator-value.rsi-strong {
  color: #fa8c16;
}

.indicator-value.rsi-overbought {
  color: #f5222d;
}

.indicator-value.rsi-neutral {
  color: #1890ff;
}

.indicator-value.rsi-oversold {
  color: #52c41a;
}

.indicator-value.macd-golden {
  color: #f5222d;
  font-weight: 600;
}

.indicator-value.macd-dead {
  color: #52c41a;
}

/* 趋势信号标签 */
.signals-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.signal-tag {
  padding: 3px 10px;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 4px;
  font-size: 12px;
  color: #1890ff;
}

/* 收藏操作 */
.favorite-action {
  display: flex;
  align-items: center;
  gap: 10px;
}

.favorite-date {
  color: #faad14;
  font-size: 13px;
}

.btn {
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-favorite {
  border: 1px solid #faad14;
  background: #fffbe6;
  color: #d48806;
}

.btn-favorite:hover:not(:disabled) {
  background: #faad14;
  color: #fff;
}

.btn-unfavorite {
  border: 1px solid #ff4d4f;
  background: #fff1f0;
  color: #cf1322;
}

.btn-unfavorite:hover:not(:disabled) {
  background: #ff4d4f;
  color: #fff;
}

/* K线图 */
.stock-chart {
  max-width: 600px;
  cursor: pointer;
  border: 1px solid #eee;
  border-radius: 4px;
  margin-top: 12px;
  transition: transform 0.2s;
}

.stock-chart:hover {
  transform: scale(1.02);
}

/* ==================== 历史上涨阶段样式 ==================== */
.up-phases-section {
  margin-top: 12px;
  padding: 12px;
  background: linear-gradient(135deg, #f6ffed 0%, #e6fffb 100%);
  border: 1px solid #b7eb8f;
  border-radius: 8px;
}

.up-phases-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.up-phases-title {
  font-size: 14px;
  font-weight: 600;
  color: #389e0d;
}

.up-phases-count {
  font-size: 12px;
  color: #8c8c8c;
  background: #fff;
  padding: 2px 8px;
  border-radius: 10px;
}

.up-phases-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.up-phase-item {
  display: flex;
  align-items: stretch;
  gap: 10px;
  padding: 8px 10px;
  background: #fff;
  border-radius: 6px;
  border-left: 3px solid #52c41a;
  transition: all 0.2s;
}

.up-phase-item:hover {
  box-shadow: 0 2px 8px rgba(82, 196, 26, 0.15);
  transform: translateX(2px);
}

.phase-timeline {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 2px 0;
  min-width: 12px;
}

.phase-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.phase-dot.phase-start {
  background: #1890ff;
  box-shadow: 0 0 4px rgba(24, 144, 255, 0.4);
}

.phase-dot.phase-end {
  background: #f5222d;
  box-shadow: 0 0 4px rgba(245, 34, 45, 0.4);
}

.phase-line {
  flex: 1;
  width: 2px;
  min-height: 12px;
  background: linear-gradient(to bottom, #1890ff, #f5222d);
}

.phase-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.phase-dates {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.phase-date {
  color: #595959;
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 11px;
}

.phase-arrow {
  color: #bfbfbf;
  font-size: 11px;
}

.phase-duration {
  color: #1890ff;
  font-weight: 500;
  font-size: 12px;
}

.phase-adjust {
  color: #faad14;
  font-size: 11px;
}

.phase-prices {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.phase-price {
  color: #8c8c8c;
}

.phase-price-end {
  color: #333;
  font-weight: 500;
}

.phase-gain {
  color: #f5222d;
  font-weight: 600;
  font-size: 13px;
  padding: 1px 6px;
  background: #fff1f0;
  border-radius: 4px;
}

.up-phases-more {
  text-align: center;
  color: #1890ff;
  font-size: 12px;
  cursor: pointer;
  padding: 6px 0 0;
  margin-top: 6px;
  border-top: 1px dashed #d9d9d9;
}

.up-phases-more:hover {
  color: #40a9ff;
  text-decoration: underline;
}

/* 响应式 */
@media (max-width: 768px) {
  .stock-card {
    padding: 12px;
  }
  
  .indicators-row {
    gap: 10px;
  }
  
  .trend-badge {
    margin-right: 5px;
  }
}
</style>
