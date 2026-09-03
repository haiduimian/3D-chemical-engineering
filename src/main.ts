import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)
app.config.errorHandler = (err, _inst, info) => {
  console.error('[APP ERROR]', info, err)
}
app.mount('#app')
