// 共享主题 — App.jsx 和 DebugPanel.jsx 共用
export const C = {
  bg: "#15192A", card: "#252C40", border: "#313B55",
  text: "#EDE9E0", muted: "#7B8299", accent: "#9E7ECC",
  green: "#72B49A", amber: "#E89060", red: "#E06060",
};

export const baseStyle = {
  fontFamily: "system-ui,-apple-system,PingFang SC,Microsoft YaHei,sans-serif",
  maxWidth: 420, margin: "0 auto", minHeight: "100vh",
  background: C.bg, color: C.text, padding: "0 22px 56px", boxSizing: "border-box",
};
