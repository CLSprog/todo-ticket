import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// "base" muss exakt dem Repository-Namen entsprechen, da GitHub Pages die App
// unter https://<user>.github.io/<repo>/ ausliefert, nicht unter der Domain-Wurzel.
// Derselbe Wert steuert ueber import.meta.env.BASE_URL auch die MSAL-Redirect-URI
// in src/storage/auth.ts - wird der Repo-Name geaendert, muss die neue URI
// zusaetzlich in der Azure-App-Registrierung eingetragen werden.
export default defineConfig({
  base: "/todo-ticket/",
  plugins: [react()],
});
