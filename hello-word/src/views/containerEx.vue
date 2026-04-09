<template>
  <div class="home" style="padding: 20px">
    <p>container 一个实用案例</p>
    <div class="parent">
        <div class="line">
            <span>一个文案</span>
        </div>
        <div class="line">
            <span>一个很长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长的文案</span>
        </div>
        <div class="line">
            <span> 一个很长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长的文案</span>
        </div>
    </div>
  </div>
</template>

<script setup>

</script>

<style>
.parent {
    border: 1px solid red;
    height: 200px;
    margin-top: 20px;
}

.line {
    margin: 5px;
    white-space: nowrap;
    position: relative;
    height: 24px;
    overflow: hidden;
    container-type: inline-size;
}

@keyframes marquee {
	to {
		transform: translateX(min(100cqw - 100%, 0px));
	}
}

.line span {
    animation: 3s linear infinite both alternate marquee;
    position: absolute;
}

</style>
