/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_REAL_FLASHING: string;
  readonly VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION: string;
  readonly VITE_ENABLE_HARDWARE_VALIDATION_MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
