/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly VITE_IDENTITY_ADAPTER?: string;
  readonly VITE_REALTIME_ADAPTER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
