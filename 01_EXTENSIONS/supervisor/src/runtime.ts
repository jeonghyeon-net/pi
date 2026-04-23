export default async function (pi: { [key: string]: unknown }): Promise<void> {
  const specifier = "@jeonghyeon.net/pi-supervisor/src/index";
  const mod = await import(specifier);
  if (typeof mod.default === "function") await mod.default(pi);
}
