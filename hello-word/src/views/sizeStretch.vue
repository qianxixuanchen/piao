<template>
  <div class="home" style="padding: 20px">
    <p>针对一个子元素设置stretch</p>
    <div class="parent">
        <div class="child">文本</div>
    </div>
    <p>stretch添加max-width限制</p>
    <div class="parent">
        <div class="child" style="max-width: 200px;">文本</div>
    </div>
    <p>fit-content属性</p>
    <div class="parent">
        <div class="fit-child" style="background-color: red">文本11</div>
        <div class="fit-child" style="background-color: green">文本22222222222</div>
        <div class="fit-child" style="background-color: blue">文本3333333333333333333333333333333</div>
    </div>
  </div>
</template>

<script setup>

</script>

<style>
.parent {
    height: 200px;
    border: 1px solid black;
}
.child {
    height: stretch;
    margin: 10px;
}
.fit-child {
    width: fit-content;
    margin-top: 6px;
    color: aquamarine;
}
</style>
