<template>
  <div class="pagination">
    <span v-if="showPageSize" class="total-info">
      共 {{ totalItems }} 条数据，第 {{ currentPage }} / {{ totalPages }} 页
    </span>
    
    <div class="page-controls">
      <button @click="$emit('goto', 1)" :disabled="isFirstPage">首页</button>
      <button @click="$emit('prev')" :disabled="isFirstPage">上一页</button>
      
      <span v-if="showPageSize" class="page-input">
        跳转到
        <input
          type="number"
          v-model.number="jumpPage"
          min="1"
          :max="totalPages"
          @keyup.enter="handleJump"
        >
        页
        <button @click="handleJump">确定</button>
      </span>
      
      <span v-else class="page-info">第 {{ currentPage }} / {{ totalPages }} 页</span>
      
      <button @click="$emit('next')" :disabled="isLastPage">下一页</button>
      <button @click="$emit('goto', totalPages)" :disabled="isLastPage">末页</button>
      
      <span v-if="showPageSize" class="page-size-control">
        每页
        <select :value="pageSize" @change="handlePageSizeChange">
          <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
        </select>
        条
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  currentPage: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  totalItems: { type: Number, default: 0 },
  pageSize: { type: Number, default: 20 },
  showPageSize: { type: Boolean, default: true },
  pageSizeOptions: { type: Array, default: () => [10, 20, 50, 100] },
})

const emit = defineEmits(['prev', 'next', 'goto', 'page-size-change'])

const jumpPage = ref(props.currentPage)

const isFirstPage = computed(() => props.currentPage === 1)
const isLastPage = computed(() => props.currentPage === props.totalPages)

// 同步外部 currentPage 变化
watch(() => props.currentPage, (val) => {
  jumpPage.value = val
})

function handleJump() {
  const page = Math.max(1, Math.min(jumpPage.value, props.totalPages))
  emit('goto', page)
}

function handlePageSizeChange(e) {
  emit('page-size-change', parseInt(e.target.value))
}
</script>

<style scoped>
.pagination {
  margin: 20px 0;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 8px;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.total-info {
  font-size: 14px;
  color: #666;
}

.page-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.page-controls button {
  padding: 6px 12px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.page-controls button:hover:not(:disabled) {
  background: #e6f7ff;
  border-color: #1890ff;
  color: #1890ff;
}

.page-controls button:disabled {
  background: #f5f5f5;
  color: #ccc;
  cursor: not-allowed;
}

.page-input {
  display: flex;
  align-items: center;
  gap: 4px;
}

.page-input input {
  width: 60px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  text-align: center;
}

.page-info {
  padding: 0 10px;
  color: #666;
}

.page-size-control {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 10px;
}

.page-size-control select {
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
}
</style>
