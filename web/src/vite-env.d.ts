/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base origin for the backend API, e.g. "https://accela-media-api.onrender.com". Empty in dev (Vite proxy). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
