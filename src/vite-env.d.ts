/// <reference types="vite/client" />

// واردات الملفات الخام كروابط (vite-plugin-singlefile يحوّلها base64 data-URIs)
declare module '*.woff2?url' {
  const src: string;
  export default src;
}
declare module '*.woff?url' {
  const src: string;
  export default src;
}
declare module '*.png?url' {
  const src: string;
  export default src;
}
