<template>
  <div class="home" style="padding: 20px">
    <p>is选择器</p>
    <article>
        <h2>:is()-styled 链接</h2>
        <section class="is-styling">
            <a href="https://mozilla.org">contains link</a>.
        </section>

        <aside id="blue-link" class="is-styling">
            <a href="https://developer.mozilla.org">id is is-styling contains link</a>.
        </aside>

        <footer class="is-styling">
            <a href="https://github.com/mdn">link</a>.
        </footer>
    </article>

    <article>
        <h2>:where()-styled 链接</h2>
        <section class="where-styling">
            <a href="https://mozilla.org">contains link</a>.
        </section>

        <aside class="where-styling">
            <a href="https://developer.mozilla.org">contains link</a>.
        </aside>

        <footer class="where-styling">
            <a href="https://github.com/mdn">a link</a>.
        </footer> 
    </article>
    <p>not选择器：</p>
    <div style="border: 1px solid red">
        <p>我是一个段落。</p>
        <p class="fancy">我非常非常喜欢！</p>
    </div>
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
:is(section.is-styling, aside#blue-link, footer.is-styling) a {
  color: red;
}

section.is-styling a {
    color: blue;
}

:where(section.where-styling, aside.where-styling, footer.where-styling) a {
  color: orange;
}

p:not(.fancy) {
  color: green;
}
</style>
