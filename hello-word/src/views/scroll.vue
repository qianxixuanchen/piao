<template>
  <div class="home" style="padding: 200px">
    <div class="carousel">
      <div
        v-for="index in 10"
        :key="index"
      >
        {{ index }}
      </div>
    </div>
  </div>
</template>

<script setup>

</script>

<style>
.carousel {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  padding: 0 200px;
}

.carousel div {
  scroll-snap-align: center;
  width: 200px;
  border: 1px solid red;
  aspect-ratio: 1;
}


.carousel::scroll-button(*) {
  position: fixed;
  position-anchor: --carousel;
  font-family: "Material Symbols Outlined";
}

.carousel::scroll-button(right) {
  position-area: inline-end center;
  content: 'arrow_forward' / 'Next';
}
  
.carousel::scroll-button(left) {
  position-area: inline-start center;
  content: 'arrow_back' / 'Previous';
}
</style>
