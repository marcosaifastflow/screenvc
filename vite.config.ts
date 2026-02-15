import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseUrl = env.VITE_SUPABASE_URL || 'https://ajibfxngnoaekihanook.supabase.co'

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      proxy: {
        '/api/functions': {
          target: `${supabaseUrl}/functions/v1`,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/functions/, ''),
        },
      },
    },
  }
})
