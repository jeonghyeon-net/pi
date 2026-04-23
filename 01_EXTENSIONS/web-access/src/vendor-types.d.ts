declare module "@jeonghyeon.net/pi-web-access/index.ts" {
  const extension: (pi: { [key: string]: unknown }) => void | Promise<void>;
  export default extension;
}
