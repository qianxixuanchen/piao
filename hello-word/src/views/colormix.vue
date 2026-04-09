<template>
  <div class="home" style="padding: 20px">
    <p>color-mix(in srgb, red, blue)</p>
    <div class="mix-red-blue">
    </div>
    <p>color-mix(in srgb, red 30%, blue)</p>
    <div class="mix-red20-blue">
    </div>
    <div class="mix-blue">
    </div>
    <p>color-mix(in oklab, red, blue)</p>

    <div class="oklab-red-blue">
    </div>
  </div>
</template>

<script setup>

</script>

<style>
.mix-red-blue {
    width: 100px;
    height: 100px;
    background-color: color-mix(in srgb, red, blue)
}
.mix-red20-blue {
    width: 100px;
    height: 100px;
    background-color: color-mix(in srgb, red 30%, blue);
    display: inline-block;
}
.mix-blue {
    width: 100px;
    height: 100px;
    background-color: blue;
    display: inline-block;
    margin-left: 20px;
}
.oklab-red-blue {
    width: 100px;
    height: 100px;
    background-color: color-mix(in oklab, red, blue)
}
</style>
