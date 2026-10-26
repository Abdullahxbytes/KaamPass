import { createApp } from './app.js'
import { loadEnvironment } from './config/env.js'

const env = loadEnvironment()
const app = createApp(env)

app.listen(env.PORT, () => {
  console.log(`KaamPass API listening on http://localhost:${env.PORT}`)
})
