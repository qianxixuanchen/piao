<template>
  <div class="home" style="padding: 20px">
    <p>container 基本用法</p>
    <button @click="addwidth">增加宽度</button>
    <button style="margin-left: 20px" @click="reducewidth">减少宽度</button>

    <button style="margin-left: 20px" @click="addheight">增加高度</button>
    <button style="margin-left: 20px" @click="reduceheight">减少高度</button>
    <div class="parent" :style="{ 'width': width + 'px', 'height': height + 'px' }">
        <p>文案</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import $ from 'jquery'

const width = ref(200)
const height = ref(200)
function addwidth() {
    width.value += 100
}
function reducewidth() {
    if(width.value > 200) {
        width.value -= 100
    }
}
function addheight() {
    height.value += 100
}
function reduceheight() {
    if(height.value > 200) {
        height.value -= 100
    }
}
</script>

<style>
@container sidebar (min-width: 400px) or (min-height: 300px) {
  p {
    font-size: 1.5em;
    color: green
  }
}

.parent {
    border: 1px solid red;
    height: 200px;
    margin-top: 20px;
    container-name: sidebar;
    container-type: inline-size;
}


</style>
