<template>
  <div class="home" style="padding: 20px">
    <p @click="add">import 测试</p>
    <div class="container"></div>
  </div>
</template>

<script setup>
import $ from 'jquery'
function add() {
    $('.container').append('<p>Coco</p>')
}
function add1() {
    $('.container-size').append('<p>Coco</p>')
}
</script>

<style>

</style>
