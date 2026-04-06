import { Text, truncateToWidth } from "@mariozechner/pi-tui";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const SPINNER_INTERVAL_MS = 120;
export function createWidgetFactory(todos, firstActive, running, onStartSpinner) {
    return (tui, theme) => {
        const content = new Text("", 0, 0);
        if (running && firstActive) {
            onStartSpinner(setInterval(() => tui.requestRender(), SPINNER_INTERVAL_MS));
        }
        return {
            render(width) {
                const w = Math.max(8, width);
                const frame = Math.floor(Date.now() / SPINNER_INTERVAL_MS) % SPINNER_FRAMES.length;
                const spinner = SPINNER_FRAMES[frame] ?? "•";
                const lines = todos.map((t) => {
                    if (t.done) {
                        return theme.fg("dim", theme.strikethrough(truncateToWidth(`● #${t.id} ${t.text}`, w)));
                    }
                    if (t === firstActive && running) {
                        return theme.bold(theme.fg("accent", truncateToWidth(`${spinner} #${t.id} ${t.text}`, w)));
                    }
                    if (t === firstActive) {
                        return theme.fg("accent", truncateToWidth(`→ #${t.id} ${t.text}`, w));
                    }
                    return theme.fg("toolOutput", truncateToWidth(`○ #${t.id} ${t.text}`, w));
                });
                content.setText(lines.join("\n"));
                return content.render(width);
            },
            invalidate() {
                content.invalidate();
            },
        };
    };
}
