let focused = true;

export function isFocused(): boolean {
  return focused;
}

export function startFocusTracking(): void {
  process.stdout.write("\x1b[?1004h");

  process.stdin.on("data", (data: Buffer) => {
    const str = data.toString();
    if (str.includes("\x1b[I")) {
      focused = true;
    } else if (str.includes("\x1b[O")) {
      focused = false;
    }
  });
}

export function stopFocusTracking(): void {
  process.stdout.write("\x1b[?1004l");
}
