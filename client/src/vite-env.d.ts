/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: 'local' | 'cloud';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
