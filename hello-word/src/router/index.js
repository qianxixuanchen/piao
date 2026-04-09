import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'high',
    component: function () {
      return import(/* webpackChunkName: "high" */ '../views/high.vue')
    }
  },
  {
    path: '/favorites',
    name: 'favorites',
    component: function () {
      return import(/* webpackChunkName: "favorites" */ '../views/favorites.vue')
    }
  },
  {
    path: '/scroll',
    name: 'scroll',
    component: function () {
      return import(/* webpackChunkName: "about" */ '../views/scroll.vue')
    }
  },
  {
    path: '/colormix',
    name: 'colormix',
    component: function () {
      return import(/* webpackChunkName: "about" */ '../views/colormix.vue')
    }
  },
  {
    path: '/scrollbar',
    name: 'scrollbar',
    component: function () {
      return import(/* webpackChunkName: "about" */ '../views/scrollbar.vue')
    }
  },
  {
    path: '/sizeStretch',
    name: 'sizeStretch',
    component: function () {
      return import(/* webpackChunkName: "about" */ '../views/sizeStretch.vue')
    }
  },
  {
    path: '/aspectRatio',
    name: 'aspectRatio',
    component: function () {
      return import(/* webpackChunkName: "about" */ '../views/aspectRatio.vue')
    }
  },
  {
    path: '/container',
    name: 'container',
    component: function () {
      return import(/* webpackChunkName: "about" */ '../views/container.vue')
    }
  },
  {
    path: '/containerEx',
    name: 'containerEx',
    component: function () {
      return import(/* webpackChunkName: "about" */ '../views/containerEx.vue')
    }
  },
  {
    path: '/contain',
    name: 'contain',
    component: function () {
      return import(/* webpackChunkName: "about" */ '../views/contain.vue')
    }
  },
  {
    path: '/import',
    name: 'import',
    component: function () {
      return import(/* webpackChunkName: "about" */ '../views/import.vue')
    }
  }
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

export default router
