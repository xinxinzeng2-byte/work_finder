/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: 'local' | 'cloud';
  readonly VITE_API_KEY_MODE?: 'local' | 'cloud';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
