<template>
  <div class="home">
    <div>
      <p>计算器</p>
      <div>
        <span>交易量</span>
        <span><input type="number" v-model="num"></span>
        <span>价格</span>
        <span><input type="number" v-model="price"></span>
        {{ all }}
      </div>
    </div>
    <div>
      <p>涨幅：1% 利润：{{ num * price * 0.01 - all }}</p>
      <p>涨幅：2% 利润：{{ num * price * 0.02 - all }}</p>
      <p>涨幅：3% 利润：{{ num * price * 0.03 - all }}</p>
    </div>
    <div v-for="item in continuousRise" :key="item" style="margin-top: 20px">
      <div>
        <span>涨跌幅：</span>
        <span :style="{color: item.data[item.data.length - 1].increase > 0 ? 'red' : 'green'}">{{ item.data[item.data.length - 1].increase + '%' }}</span>
        <span style="margin-left: 24px">股票代码：</span>
        <span>{{ item.f12 }}</span>
      </div>
      <img
        :src="`https://webquoteklinepic.eastmoney.com/GetPic.aspx?nid=${item.f13}.${item.f12}&ef=&formula=RSI&imageType=KXL&timespan=1737791650`"
        @click="jump(item.f12)"
      >
    </div>
  </div>
</template>

0.0049000
0.0050000
0.0030000
0.0000278
0.0001660
0.0100000
1000000
<script setup>
import { ref, watch } from 'vue'

const list = require('../assets/NSDK.json')
const continuousRise = require('../assets/trendup.json')

const num = ref(0)
const price = ref(0)
const change = ref(0)
const up = ref(0)

const all = ref(0)

watch([num, price], ([newNum, newPrice]) => {
  console.log(newNum)
  console.log(newPrice)

  const sell = 278 * newNum * newPrice > 100000 ? 278 * newNum * newPrice :  100000;
  const _sell = 1660 * newNum > 100000 ? 1660 * newNum :  100000;
  all.value =  ((49000 + 50000 + 30000) * newNum * 2 + sell + _sell) / 10000000;
})

function jump(str) {
  window.open(`https://quote.eastmoney.com/us/${str}.html`)
}
</script>
