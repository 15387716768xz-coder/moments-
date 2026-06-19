import { useState, useEffect, useRef } from "react";
import { C, baseStyle } from "./theme";

const mono = { fontFamily: "monospace", fontSize: 11 };

export default function DebugPanel({ onBack }) {
  const [debug, setDebug] = useState(null);
  const [simPkg, setSimPkg] = useState("");
  const [expanded, setExpanded] = useState(false);
  const tRef = useRef(null);

  const refresh = () => {
    try {
      const json = window._NativeBridge?.getDebugInfo?.();
      if (json) setDebug(JSON.parse(json));
    } catch (e) {}
  };

  useEffect(() => {
    refresh();
    tRef.current = setInterval(refresh, 1000);
    return () => clearInterval(tRef.current);
  }, []);

  const simulate = () => {
    if (!simPkg.trim()) return;
    window._NativeBridge?.simulateTrigger?.(simPkg.trim());
    setSimPkg("");
    setTimeout(refresh, 300);
  };

  const clearAll = () => {
    window._NativeBridge?.clearAllAllowances?.();
    setTimeout(refresh, 300);
  };

  const openAppSettings = () => {
    window._NativeBridge?.openAppSettings?.();
  };

  const events = debug?.events || [];
  const boundApps = (() => { try { return JSON.parse(debug?.boundApps || "[]"); } catch { return []; } })();

  return (
    <div style={{ ...baseStyle, animation: "fi .3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 0 8px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 14, fontFamily: "inherit" }}>
          ← 返回
        </button>
        <button onClick={refresh} style={{ background: "none", border: "none", cursor: "pointer", color: C.accent, fontSize: 13, fontFamily: "inherit" }}>
          刷新
        </button>
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: "4px 0 16px" }}>🔧 调试面板</h2>

      {/* 状态概览 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        <StatusCard label="无障碍服务" ok={debug?.serviceEnabled} />
        <StatusCard label="绑定 App" text={(boundApps.length || 0) + " 个"} />
      </div>

      {/* 放行标记 */}
      <div style={{ background: C.card, borderRadius: 10, padding: "10px 14px", marginBottom: 14, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
          放行标记 {expanded ? "▾" : "▸"}
          <button onClick={clearAll} style={{ marginLeft: 10, background: C.red, color: "#fff", border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>清除全部</button>
        </div>
        {expanded && (
          <div style={mono}>
            {Object.keys(debug?.allowances || {}).length === 0 ? (
              <span style={{ color: C.muted }}>无</span>
            ) : (
              Object.entries(debug?.allowances || {}).map(([k, v]) => (
                <div key={k} style={{ color: String(v).includes("✅") ? C.green : C.muted, marginBottom: 2 }}>
                  {k}: {v}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 模拟触发 */}
      <div style={{ background: C.card, borderRadius: 10, padding: "10px 14px", marginBottom: 14, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>模拟触发（输入包名）</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={simPkg} onChange={e => setSimPkg(e.target.value)}
            placeholder="com.ss.android.ugc.aweme"
            style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", color: C.text, fontSize: 13, outline: "none", fontFamily: "monospace" }} />
          <button onClick={simulate} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
            触发
          </button>
        </div>
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {boundApps.map(pkg => (
            <button key={pkg} onClick={() => { setSimPkg(pkg); }}
              style={{ background: C.border, color: C.muted, border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer", fontFamily: "monospace" }}>
              {pkg.split(".").pop()}
            </button>
          ))}
        </div>
      </div>

      {/* 快捷入口 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={openAppSettings} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", color: C.muted, fontSize: 12, fontFamily: "inherit" }}>
          App 详情
        </button>
        <button onClick={() => window._NativeBridge?.openAccessibilitySettings()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", color: C.muted, fontSize: 12, fontFamily: "inherit" }}>
          无障碍设置
        </button>
      </div>

      {/* 事件日志 */}
      <div style={{ background: C.card, borderRadius: 10, padding: "10px 14px", border: `1px solid ${C.border}`, maxHeight: "calc(100vh - 560px)", overflowY: "auto" }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          事件日志（{events.length}）
        </div>
        {events.length === 0 ? (
          <span style={{ color: C.muted, ...mono }}>等待事件...</span>
        ) : (
          events.map((e, i) => {
            const isTrigger = e.includes("TRIGGER") || e.includes("SIMULATE");
            return (
              <div key={i} style={{ ...mono, color: isTrigger ? C.accent : C.muted, marginBottom: 2, wordBreak: "break-all" }}>
                {e}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatusCard({ label, ok, text }) {
  const color = ok === undefined ? C.muted : ok ? C.green : C.amber;
  const icon = ok === undefined ? "·" : ok ? "✅" : "⚠️";
  return (
    <div style={{ background: C.card, borderRadius: 10, padding: "10px 12px", border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color }}>{icon} {text || (ok ? "已开启" : "未开启")}</div>
    </div>
  );
}
