import type { Theme } from "@mariozechner/pi-coding-agent";
import { Container, Key, matchesKey, Spacer, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { COMMAND_TASK_PREVIEW_CHARS } from "../core/constants.js";
import type { CommandRunState } from "../core/types.js";

// ─── SubagentHistoryOverlay ───────────────────────────────────────────────────

/**
 * TUI overlay that lists all subagent runs (including removed) and lets the
 * user select one to switch into via sub:trans.
 *
 * Keys: ↑↓ / j k  navigate · Enter  switch session · q / Esc  close
 */
export class SubagentHistoryOverlay {
  private selectedIndex = 0;
  private scrollOffset = 0;

  constructor(
    private runs: CommandRunState[],
    private onSelect: (run: CommandRunState) => void,
    private onDone: () => void,
  ) {}

  private getViewport(): number {
    const rows = Math.max(
      10,
      ("rows" in process.stdout ? (process.stdout as { rows: number }).rows : 24) || 24,
    );
    return Math.max(4, rows - 8);
  }

  private ensureVisible(): void {
    const vp = this.getViewport();
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.scrollOffset + vp) {
      this.scrollOffset = this.selectedIndex - vp + 1;
    }
  }

  handleInput(data: string, tui: { requestRender(): void }): void {
    if (matchesKey(data, Key.up) || data === "k") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.ensureVisible();
    } else if (matchesKey(data, Key.down) || data === "j") {
      this.selectedIndex = Math.min(this.runs.length - 1, this.selectedIndex + 1);
      this.ensureVisible();
    } else if (matchesKey(data, Key.enter)) {
      const run = this.runs[this.selectedIndex];
      if (run) this.onSelect(run);
      return; // onSelect will close overlay
    } else if (matchesKey(data, Key.escape) || data === "q" || data === "Q") {
      this.onDone();
      return;
    }
    tui.requestRender();
  }

  render(width: number, _height: number, theme: Theme): string[] {
    const container = new Container();
    const pad = "  ";
    const innerWidth = Math.max(20, width - 6);
    const viewport = this.getViewport();
    const total = this.runs.length;

    this.ensureVisible();

    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        pad + theme.bold("Subagent Run History") + theme.fg("dim", `  (${total} total)`),
        0,
        0,
      ),
    );
    container.addChild(
      new Text(pad + theme.fg("muted", "─".repeat(Math.max(10, innerWidth))), 0, 0),
    );

    for (let row = 0; row < viewport; row++) {
      const idx = this.scrollOffset + row;
      const run = this.runs[idx];
      if (!run) {
        container.addChild(new Text("", 0, 0));
        continue;
      }

      const isSelected = idx === this.selectedIndex;
      const marker = isSelected ? "▸" : " ";

      // Status color
      let statusColor: "success" | "error" | "warning" | "dim" = "dim";
      if (run.status === "done") statusColor = "success";
      else if (run.status === "error") statusColor = "error";
      else if (run.status === "running") statusColor = "warning";

      const timeLabel = new Date(run.startedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const removedBadge = run.removed ? theme.fg("dim", " [removed]") : "";
      const statusStr = theme.fg(statusColor, `[${run.status}]`);
      const agentStr = theme.fg("accent", run.agent);
      const taskPreview = run.task
        .replace(/\s*\n+\s*/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim()
        .slice(0, COMMAND_TASK_PREVIEW_CHARS);

      let line =
        `${marker} #${run.id} ${statusStr}${removedBadge} ${agentStr}  ` +
        `${theme.fg("dim", timeLabel)}  ${theme.fg("muted", taskPreview)}`;

      line = truncateToWidth(line, innerWidth);
      if (run.removed) line = theme.fg("dim", line);
      if (isSelected) line = theme.bg("selectedBg", line);

      container.addChild(new Text(pad + line, 0, 0));
    }

    container.addChild(
      new Text(pad + theme.fg("muted", "─".repeat(Math.max(10, innerWidth))), 0, 0),
    );

    const listStart = total === 0 ? 0 : this.scrollOffset + 1;
    const listEnd = Math.min(total, this.scrollOffset + viewport);
    const range = `${listStart}-${listEnd}/${total}`;
    container.addChild(
      new Text(
        pad +
          truncateToWidth(
            `${theme.fg("dim", "↑↓/jk navigate · Enter switch session · q/Esc close")}  ${theme.fg("accent", range)}`,
            innerWidth,
          ),
        0,
        0,
      ),
    );
    container.addChild(new Spacer(1));

    return container.render(width);
  }
}
