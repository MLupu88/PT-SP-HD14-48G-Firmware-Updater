/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_REAL_FLASHING: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
