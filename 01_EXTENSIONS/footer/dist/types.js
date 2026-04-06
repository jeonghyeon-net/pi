export const BAR_WIDTH = 10;
export const DIRTY_CHECK_INTERVAL_MS = 3000;
export const NAME_STATUS_KEY = "session-name";
export const STATUS_STYLE_MAP = {
    [NAME_STATUS_KEY]: (theme, text) => {
        const chip = ` ${theme.fg("text", text)} `;
        return theme.bg("selectedBg", chip);
    },
};
