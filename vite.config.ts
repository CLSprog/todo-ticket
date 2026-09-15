import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/todo-ticket/', // GitHub-Pages-Unterpfad: clsprog.github.io/todo-ticket/
  plugins: [react()],
})
