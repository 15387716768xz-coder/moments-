import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Preferences } from "@capacitor/preferences";
import { App as CapApp } from "@capacitor/app";
import { API_KEY, API_URL, AI_MODEL } from "./config";
import { AppBinding } from "./plugins/app-binding";
import DebugPanel from "./DebugPanel";
import { C, baseStyle } from "./theme";
import {
  openAccessibilitySettings as nativeOpenSettings,
  getInstalledApps as nativeGetInstalledApps,
  getBoundApps as nativeGetBoundApps,
  setBoundApps as nativeSetBoundApps,
  isAccessibilityServiceEnabled as nativeIsServiceEnabled,
  exitStop,
  exitScroll,
  exitHome,
} from "./plugins/app-binding/native";

const MOODS = [
  { id: "relaxed",  emoji: "😌", label: "轻松" },
  { id: "okay",     emoji: "🙂", label: "还好" },
  { id: "tired",    emoji: "😴", label: "有点累" },
  { id: "restless", emoji: "😤", label: "烦躁" },
  { id: "drained",  emoji: "😞", label: "很低落" },
];

const FALLBACK_REPLIES = [
  "停下来本身就是一种勇气。你愿意在此刻看见自己，这已经很好了。刷视频之前，你想先做点什么？",
  "我感受到了你的犹豫——这说明你心里有一个声音在照顾自己。那个声音想说什么？",
  "暂停三秒和滑走是两种完全不同的选择。你选择了前者。此刻的你，需要什么样的陪伴？",
  "没有什么比意识到「我可以选择」更有力量。你做到了。想聊聊为什么打开这个 app 吗？",
  "那些让你想刷视频的东西，也许只是需要一个出口。我在这里听你说，不用急着走。",
  "每一个停下来看向自己的瞬间，都是在练习对自己好一点。今天是什么让你感到疲惫？",
  "你打开「此刻」而不是直接滑走，说明你已经不一样了。我能为你做点什么？",
  "刷视频有时候是给自己的一个缓冲。没关系，缓冲多久都可以。你现在最需要的是什么？",
];

const AI_TONES = ["像朋友一样轻松", "带一点诗意的温柔", "简短但有力量的", "像姐姐/哥哥一样的语气"];

/* ══════════════════════════════════════════════════════════
   存储层 — 使用 Capacitor Preferences 替代 window.storage
   ══════════════════════════════════════════════════════════ */

const STORAGE_KEY = "cike_v1";

async function dbGet() {
  try {
    const r = await Preferences.get({ key: STORAGE_KEY });
    return r.value ? JSON.parse(r.value) : [];
  } catch {
    return [];
  }
}

async function dbSet(arr) {
  try {
    await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(arr.slice(0, 100)) });
  } catch (e) {
    console.warn("storage:", e);
  }
}

/* ══════════════════════════════════════════════════════════
   工具函数
   ══════════════════════════════════════════════════════════ */

function rel(ts) {
  const d = new Date(ts), now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return diff === 0 ? `今天 ${hm}` : diff === 1 ? `昨天 ${hm}` : `${d.getMonth() + 1}月${d.getDate()}日`;
}

/* ══════════════════════════════════════════════════════════
   小组件
   ══════════════════════════════════════════════════════════ */

function Ring({ s, total }) {
  const r = 70, circ = 2 * Math.PI * r;
  const pct = total > 0 ? s / total : 0;
  const m = Math.floor(s / 60), ss = s % 60;
  return (
    <svg width="185" height="185" viewBox="0 0 185 185">
      <circle cx="92" cy="92" r={r} fill="none" stroke={C.border} strokeWidth="5" />
      <circle cx="92" cy="92" r={r} fill="none" stroke={C.accent} strokeWidth="5"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" transform="rotate(-90 92 92)"
        style={{ transition: "stroke-dashoffset 0.9s linear" }} />
      <text x="92" y="99" textAnchor="middle"
        fill={C.text} fontSize="26" fontWeight="600"
        fontFamily="system-ui,-apple-system,sans-serif">
        {String(m).padStart(2, "0")}:{String(ss).padStart(2, "0")}
      </text>
    </svg>
  );
}

function Dots() {
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center", padding: "32px 0" }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 9, height: 9, borderRadius: "50%", background: C.accent,
          animation: `dk 1.4s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}

function Back({ fn, label }) {
  return (
    <button onClick={fn} style={{
      background: "none", border: "none", cursor: "pointer",
      color: C.muted, fontSize: 14, padding: 0, fontFamily: "inherit",
    }}>
      ← {label || "返回"}
    </button>
  );
}

function PBtn({ onClick, children, style: extraStyle }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "14px 20px", borderRadius: 12,
      border: "none", cursor: "pointer", fontSize: 15, fontWeight: 500,
      background: C.accent, color: "#fff", fontFamily: "inherit",
      ...extraStyle,
    }}>{children}</button>
  );
}

function SBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "14px 20px", borderRadius: 12,
      border: `1px solid ${C.border}`, cursor: "pointer", fontSize: 15, fontWeight: 400,
      background: "transparent", color: C.muted, fontFamily: "inherit",
    }}>{children}</button>
  );
}

function MoodGrid({ onSelect, selected }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {MOODS.map((m) => (
        <button key={m.id} onClick={() => onSelect(m)} style={{
          background: selected?.id === m.id ? `${C.accent}22` : C.card,
          border: `1px solid ${selected?.id === m.id ? C.accent : C.border}`,
          borderRadius: 14, padding: "20px 12px", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          fontFamily: "inherit", transition: "border-color 0.2s, background 0.2s",
        }}>
          <span style={{ fontSize: 26 }}>{m.emoji}</span>
          <span style={{ color: C.text, fontSize: 14, fontWeight: 500 }}>{m.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   主 App 组件
   ══════════════════════════════════════════════════════════ */

export default function App() {
  const [view,       setView]       = useState("home");
  const [step,       setStep]       = useState("mood");
  const [mood,       setMood]       = useState(null);
  const [trig,       setTrig]       = useState("");
  const [aiTxt,      setAiTxt]      = useState("");
  const [aiLoad,     setAiLoad]     = useState(false);
  const [entry,      setEntry]      = useState(null);
  const [timerS,     setTimerS]     = useState(0);
  const [totalS,     setTotalS]     = useState(0);
  const [tRun,       setTRun]       = useState(false);
  const [postMood,   setPostMood]   = useState(null);
  const [hist,       setHist]       = useState([]);
  const [expId,      setExpId]      = useState(null);

  // ── 设置 / App 绑定 ──────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [installedApps, setInstalledApps] = useState([]);
  const [boundApps,     setBoundApps]     = useState([]);
  const [serviceEnabled, setServiceEnabled] = useState(false);
  const [settingsSearch, setSettingsSearch] = useState("");
  const [triggerSource, setTriggerSource] = useState(null); // 哪个 app 触发跳转过来的

  const tRef = useRef(null);

  /* ── 初始化 ─────────────────────────────────────────── */
  useEffect(() => {
    dbGet().then((h) => setHist(h));
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // 清除上次遗留的放行标记（避免旧计时器数据干扰新 session）
      window._NativeBridge?.clearAllAllowances?.();
      const pkgs = await nativeGetBoundApps();
      setBoundApps(Array.isArray(pkgs) ? pkgs : (pkgs.packages || []));
      const svc = await nativeIsServiceEnabled();
      setServiceEnabled(typeof svc === "boolean" ? svc : svc.enabled);
    } catch {
      // 在浏览器环境或无插件时静默失败
    }
  };

  /* ── 监听来自绑定 app 的跳转 ───────────────────────── */
  useEffect(() => {
    let listenerHandle;
    const setupListener = async () => {
      try {
        listenerHandle = await AppBinding.addListener("boundAppOpened", (data) => {
          setTriggerSource(data.packageName);
          startCheckin();
        });
      } catch {
        // 无插件时静默
      }
    };
    setupListener();
    return () => {
      if (listenerHandle?.remove) listenerHandle.remove();
    };
  }, []);

  // 处理 Android 返回键
  // 用 ref 持有最新状态，避免返回键监听器因依赖变化反复注销/重建
  const viewRef = useRef(view); viewRef.current = view;
  const stepRef = useRef(step); stepRef.current = step;
  const showSettingsRef = useRef(showSettings); showSettingsRef.current = showSettings;
  const entryRef = useRef(entry); entryRef.current = entry;
  const triggerSourceRef = useRef(triggerSource); triggerSourceRef.current = triggerSource;

  useEffect(() => {
    const setup = async () => {
      const h = await CapApp.addListener("backButton", () => {
        const v = viewRef.current;
        const s = stepRef.current;
        if (showSettingsRef.current) {
          setShowSettings(false);
        } else if (v === "checkin") {
          if (s === "mood") goHome();
          else if (s === "trigger") setStep("mood");
          else if (s === "ai") setStep("trigger");
          else if (s === "timer-pick") setStep("ai");
          else if (s === "done-stop") {
            exitStop(entryRef.current?.triggerApp || triggerSourceRef.current);
            goHome();
          }
          else if (s === "done-scroll") { exitHome(); goHome(); }
          else goHome();
        } else if (v === "history" || v === "debug") {
          goHome();
        }
      });
      return () => h.remove();
    };
    let cleanup;
    setup().then(cb => { cleanup = cb; });
    return () => { if (cleanup) cleanup(); };
  }, []);

  /* ── 计时器 ────────────────────────────────────────── */
  useEffect(() => {
    if (tRun && timerS > 0) {
      tRef.current = setInterval(() => {
        setTimerS((s) => {
          if (s <= 1) {
            clearInterval(tRef.current);
            setTRun(false);
            setStep("postmood");
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(tRef.current);
  }, [tRun]);

  /* ══════════════════════════════════════════════════════
     业务逻辑
     ══════════════════════════════════════════════════════ */

  const goHome = () => {
    setView("home");
    setTRun(false);
    clearInterval(tRef.current);
    setShowSettings(false);
  };

  const startCheckin = useCallback(() => {
    setMood(null); setTrig(""); setAiTxt(""); setEntry(null);
    setPostMood(null); setTRun(false); clearInterval(tRef.current);
    setStep("mood"); setView("checkin");
  }, []);

  // 轮询 NativeBridge 检查是否有待处理的触发
  useEffect(() => {
    const t = setInterval(() => {
      try {
        const pkg = window._NativeBridge && window._NativeBridge.getTrigger && window._NativeBridge.getTrigger();
        if (pkg) { setTriggerSource(pkg); startCheckin(); }
      } catch (e) {}
    }, 500);
    return () => clearInterval(t);
  }, []);

  const fbIdxRef = useRef(Math.floor(Math.random() * FALLBACK_REPLIES.length));

  const askAI = async (m, t) => {
    setStep("ai"); setAiLoad(true);
    const now = new Date();
    const hour = now.getHours();
    const timeCtx = hour < 6 ? "凌晨" : hour < 9 ? "清晨" : hour < 12 ? "上午" : hour < 14 ? "中午" : hour < 18 ? "下午" : hour < 22 ? "晚上" : "深夜";
    const e = {
      id: Date.now(), timestamp: now.toISOString(),
      mood: m.id, moodLabel: m.label, moodEmoji: m.emoji,
      trigger: t.trim() || null, triggerApp: triggerSource || null,
    };
    setEntry(e);

    const tone = AI_TONES[Math.floor(Math.random() * AI_TONES.length)];

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: AI_MODEL, max_tokens: 2000,
          system: `你是"此刻"的陪伴者。此刻是${timeCtx}，用户感到${m.label}${t ? "，因为" + t : ""}。他们想刷短视频但主动暂停来找你。

用${tone}陪伴他们——4-6句话，像一个了解他们的朋友在说话。可以说说你对他们感受的理解，给他们一点肯定或陪伴感。
从来不说教、不给建议清单、不用"你应该"，只是接纳和陪伴。
可以用一个温柔的问题结尾——但每次换着方式问，不要套路化。

重要：每次回复都要不同。根据他们的感受和原因来回应，不是模板。用中文。`,
          messages: [{
            role: "user",
            content: `${timeCtx}好。此刻感觉：${m.label}${t ? "\n可能因为：" + t : ""}\n（随机种子：${Math.random().toString(36).slice(2, 8)}）`,
          }],
        }),
      });
      const data = await res.json();

      // 检查是否为错误响应
      if (data.error) {
        console.warn("API error:", data.error);
        throw new Error(data.error.message || "API error");
      }

      const txt = data.content?.[0]?.text;
      if (txt && txt.length > 5) {
        setAiTxt(txt);
        setEntry((prev) => ({ ...prev, aiResponse: txt }));
      } else {
        throw new Error("Empty response");
      }
    } catch (err) {
      console.warn("AI fallback:", err.message);
      // 轮换回退文案
      const fb = FALLBACK_REPLIES[fbIdxRef.current % FALLBACK_REPLIES.length];
      fbIdxRef.current++;
      setAiTxt(fb);
      setEntry((prev) => ({ ...prev, aiResponse: fb }));
    }
    setAiLoad(false);
  };

  const decide = async (d) => {
    if (d === "stop") {
      const fe = { ...entry, decision: "stop" };
      const nh = [fe, ...hist];
      setHist(nh);
      await dbSet(nh);
      setStep("done-stop");
    } else {
      setStep("timer-pick");
    }
  };

  const startTimer = async (mins) => {
    const pkg = entry?.triggerApp || triggerSource;

    const fe = { ...entry, decision: "scroll", timerMinutes: mins };
    const nh = [fe, ...hist];
    setHist(nh);
    dbSet(nh); // fire-and-forget，不等持久化完成就启动目标 app
    setEntry(fe);
    const s = mins * 60;
    setTotalS(s);
    setTimerS(s);
    setTRun(true);
    setStep("timer");

    // "刷一会儿"出口：计时器放行 + 短暂放行 + 启动目标 App
    if (pkg) exitScroll(pkg, mins);
  };

  const doPostMood = async (m) => {
    setPostMood(m);
    const nh = hist.map((e) =>
      e.id === entry?.id
        ? { ...e, postMood: m.id, postMoodLabel: m.label, postMoodEmoji: m.emoji }
        : e
    );
    setHist(nh);
    await dbSet(nh);
    setStep("done-scroll");
  };

  const WEEK_MS = 7 * 86400000;
  const weekCount = useMemo(() => hist.filter((e) => Date.now() - new Date(e.timestamp) < WEEK_MS).length, [hist]);

  /* ── App 绑定相关 ──────────────────────────────────── */
  const openSettings = async () => {
    setShowSettings(true);
    try {
      const apps = await nativeGetInstalledApps();
      setInstalledApps(Array.isArray(apps) ? apps : (apps.apps || []));
    } catch {
      // 浏览器环境
    }
  };

  const toggleBoundApp = async (pkg) => {
    const next = boundApps.includes(pkg)
      ? boundApps.filter((p) => p !== pkg)
      : [...boundApps, pkg];
    setBoundApps(next);
    await nativeSetBoundApps(next);
  };

  const openAccessibilitySettings = async () => {
    try {
      await nativeOpenSettings();
    } catch (e) {
      alert(
        "请按以下步骤手动开启：\n\n" +
        "1. 打开系统「设置」\n" +
        "2. 搜索「无障碍」或「辅助功能」\n" +
        "3. 找到「已安装的服务」或「更多设置」\n" +
        "4. 找到「此刻」并开启"
      );
    }
  };

  // 过滤后的 app 列表
  const filteredApps = installedApps.filter((a) => {
    if (!settingsSearch) return true;
    const s = settingsSearch.toLowerCase();
    return a.name.toLowerCase().includes(s) || a.packageName.toLowerCase().includes(s);
  });

  /* ══════════════════════════════════════════════════════
     视图: 设置页
     ══════════════════════════════════════════════════════ */
  if (showSettings) {
    return (
      <div style={{ ...baseStyle, animation: "fi .3s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 0 8px" }}>
          <Back fn={() => setShowSettings(false)} />
          <span style={{ color: C.muted, fontSize: 12 }}>{boundApps.length} 个绑定</span>
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 600, margin: "4px 0 6px" }}>设置</h2>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
          选择你想要绑定的 app。当你打开这些 app 时，「此刻」会自动弹出。
        </p>

        {/* 无障碍服务状态 */}
        <div style={{
          background: serviceEnabled ? `${C.green}18` : `${C.amber}18`,
          border: `1px solid ${serviceEnabled ? C.green : C.amber}`,
          borderRadius: 12, padding: "14px 16px", marginBottom: 12,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: serviceEnabled ? C.green : C.amber }}>
              {serviceEnabled ? "✅ 无障碍服务已开启" : "⚠️ 无障碍服务未开启"}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              {serviceEnabled ? "正在监听 app 切换..." : "需开启才能检测 app 打开"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={async () => {
              try { const svc = await nativeIsServiceEnabled(); setServiceEnabled(typeof svc === "boolean" ? svc : svc.enabled); } catch {}
            }} style={{
              background: "transparent", color: C.muted, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "8px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}>
              刷新
            </button>
            {!serviceEnabled && (
              <button onClick={openAccessibilitySettings} style={{
                background: C.amber, color: "#fff", border: "none",
                borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              }}>
                去开启
              </button>
            )}
          </div>
        </div>

        {/* ⚠️ 保活指引 — 国产 ROM 必读 */}
        <div style={{
          background: `${C.amber}10`, border: `1px solid ${C.amber}33`,
          borderRadius: 12, padding: "14px 16px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.amber, marginBottom: 8 }}>
            ⚠️ 服务经常被关闭？请逐项检查：
          </div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.9 }}>
            <div>❶ <b>电池优化</b>：系统设置 → 搜索"电池优化" → 找到「此刻」→ 设为「<span style={{color:C.green}}>不优化</span>」</div>
            <div>❷ <b>自启动</b>：系统设置 → 搜索"自启动" → 允许「此刻」自启动</div>
            <div>❸ <b>后台运行</b>：多任务界面 → 长按「此刻」→ 锁定/加锁（不要上滑清除）</div>
            <div>❹ <b>通知权限</b>：确保「此刻」的通知已开启（前台服务依赖通知栏）</div>
            <div style={{marginTop:6}}>💡 不同手机路径不同：<b>小米</b>(设置→应用设置→授权管理) <b>华为</b>(设置→应用→应用启动管理) <b>OPPO/vivo</b>(设置→电池→高耗电/后台管理)</div>
          </div>
        </div>

        {/* 搜索 */}
        <input
          type="text"
          value={settingsSearch}
          onChange={(e) => setSettingsSearch(e.target.value)}
          placeholder="搜索 app 名称..."
          style={{
            width: "100%", boxSizing: "border-box", background: C.card,
            border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px",
            color: C.text, fontSize: 14, outline: "none", fontFamily: "inherit",
            marginBottom: 14,
          }}
        />

        {/* App 列表 */}
        <div style={{ maxHeight: "calc(100vh - 560px)", overflowY: "auto" }}>
          {filteredApps.length === 0 ? (
            <p style={{ color: C.muted, textAlign: "center", padding: "30px 0" }}>
              {installedApps.length === 0 ? "正在加载已安装的 app..." : "无匹配结果"}
            </p>
          ) : (
            filteredApps.map((app) => {
              const bound = boundApps.includes(app.packageName);
              return (
                <div key={app.packageName} onClick={() => toggleBoundApp(app.packageName)} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px", marginBottom: 6, cursor: "pointer",
                  background: bound ? `${C.accent}18` : C.card,
                  border: `1px solid ${bound ? C.accent : C.border}`,
                  borderRadius: 10, transition: "border-color 0.15s, background 0.15s",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: bound ? C.accent : C.border,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, flexShrink: 0,
                    color: bound ? "#fff" : C.muted,
                  }}>
                    {app.name?.charAt(0) || "?"}
                  </div>
                  <span style={{ flex: 1, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {app.name || app.packageName}
                  </span>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6,
                    border: `2px solid ${bound ? C.accent : C.border}`,
                    background: bound ? C.accent : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s", flexShrink: 0,
                  }}>
                    {bound && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     视图: 调试面板
     ══════════════════════════════════════════════════════ */
  if (view === "debug") return <DebugPanel onBack={() => setView("home")} />;

  /* ══════════════════════════════════════════════════════
     视图: 历史记录
     ══════════════════════════════════════════════════════ */
  if (view === "history")
    return (
      <div style={{ ...baseStyle, animation: "fi .3s ease" }}>
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "22px 0 8px",
          }}
        >
          <Back fn={goHome} />
          <span style={{ color: C.muted, fontSize: 12 }}>{hist.length} 条记录</span>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: "4px 0 20px" }}>记录</h2>
        {hist.length === 0 ? (
          <p style={{ color: C.muted, textAlign: "center", marginTop: 60, lineHeight: 1.9 }}>
            还没有记录<br />从主页开始第一次暂停
          </p>
        ) : (
          hist.map((e) => (
            <div
              key={e.id}
              onClick={() => setExpId(expId === e.id ? null : e.id)}
              style={{
                background: C.card, borderRadius: 12, padding: "14px 16px", marginBottom: 10,
                cursor: "pointer", border: `1px solid ${C.border}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 18 }}>{e.moodEmoji}</span>
                <span style={{ color: C.muted, fontSize: 12 }}>{rel(e.timestamp)}</span>
                <span style={{
                  fontSize: 11, padding: "2px 9px", borderRadius: 6,
                  background: e.decision === "stop" ? `${C.green}22` : `${C.amber}22`,
                  color: e.decision === "stop" ? C.green : C.amber,
                }}>
                  {e.decision === "stop" ? "选择暂停" : `刷了${e.timerMinutes}分钟`}
                </span>
              </div>
              {expId === e.id && (
                <div style={{
                  marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12,
                  animation: "fi .2s ease",
                }}>
                  {e.triggerApp && (
                    <p style={{ color: C.muted, fontSize: 12, margin: "0 0 4px" }}>
                      触发 app：{e.triggerApp}
                    </p>
                  )}
                  {e.trigger && (
                    <p style={{ color: C.muted, fontSize: 13, margin: "0 0 8px" }}>
                      触发：{e.trigger}
                    </p>
                  )}
                  {e.aiResponse && (
                    <p style={{ color: C.text, fontSize: 13, lineHeight: 1.7, margin: "0 0 8px" }}>
                      {e.aiResponse}
                    </p>
                  )}
                  {e.postMoodEmoji && (
                    <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
                      刷后：{e.postMoodEmoji} {e.postMoodLabel}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    );

  /* ══════════════════════════════════════════════════════
     视图: 主页
     ══════════════════════════════════════════════════════ */
  if (view === "home") {
    const h = new Date().getHours();
    const gr =
      h < 6 ? "深夜了" : h < 12 ? "早上好" : h < 14 ? "中午好" : h < 18 ? "下午好" : h < 22 ? "晚上好" : "夜深了";
    return (
      <div style={{ ...baseStyle, animation: "fi .3s ease" }}>
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "22px 0",
          }}
        >
          <span style={{ color: C.accent, fontSize: 17, fontWeight: 600, letterSpacing: 1.2 }}>
            此刻
          </span>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <button onClick={openSettings} style={{
              background: "none", border: "none", cursor: "pointer",
              color: C.muted, fontSize: 13, padding: 0, fontFamily: "inherit",
            }}>
              设置
            </button>
            <button onClick={() => setView("history")} style={{
              background: "none", border: "none", cursor: "pointer",
              color: C.muted, fontSize: 13, padding: 0, fontFamily: "inherit",
            }}>
              历史
            </button>
            <button onClick={() => setView("debug")} style={{
              background: "none", border: "none", cursor: "pointer",
              color: `${C.muted}88`, fontSize: 12, padding: 0, fontFamily: "inherit",
            }}>
              🔧
            </button>
          </div>
        </div>
        <div style={{ paddingTop: 36, paddingBottom: 48 }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ color: C.muted, fontSize: 16, margin: "0 0 8px" }}>{gr}</p>
            {weekCount > 0 && (
              <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
                这周你来了 <span style={{ color: C.accent, fontWeight: 500 }}>{weekCount}</span> 次
              </p>
            )}
          </div>
          <button onClick={startCheckin} style={{
            width: "100%", padding: "22px 20px", borderRadius: 16, border: "none", cursor: "pointer",
            background: `linear-gradient(150deg,${C.accent}EE 0%,${C.accent}88 100%)`,
            color: "#fff", fontSize: 17, fontWeight: 600, fontFamily: "inherit",
            boxShadow: `0 6px 28px ${C.accent}28`, letterSpacing: 0.3,
          }}>
            我想刷视频了
          </button>

          {/* 绑定状态提示 */}
          {boundApps.length > 0 && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <span style={{ color: C.muted, fontSize: 11 }}>
                {serviceEnabled
                  ? `🔗 已绑定 ${boundApps.length} 个 app`
                  : `⚠️ 已绑定 ${boundApps.length} 个 app，但无障碍服务未开启`}
              </span>
            </div>
          )}

          {hist.length > 0 && (
            <div style={{ marginTop: 44 }}>
              <p style={{ color: C.muted, fontSize: 11, marginBottom: 14, letterSpacing: 0.9 }}>
                最近
              </p>
              {hist.slice(0, 3).map((e) => (
                <div
                  key={e.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "11px 0", borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{e.moodEmoji}</span>
                  <span style={{ flex: 1, color: C.muted, fontSize: 13 }}>
                    {rel(e.timestamp)}
                  </span>
                  <span style={{ fontSize: 12, color: e.decision === "stop" ? C.green : C.amber }}>
                    {e.decision === "stop" ? "暂停了" : `${e.timerMinutes}分钟`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     视图: Checkin 流程
     ══════════════════════════════════════════════════════ */

  if (view === "checkin") {
    // ── Step: 心情选择 ─────────────────────────────────
    if (step === "mood")
      return (
        <div style={{ ...baseStyle, animation: "fi .25s ease" }}>
          <div style={{ padding: "22px 0 8px" }}>
            <Back fn={goHome} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.45, margin: "20px 0 36px" }}>
            此刻，<br />你感觉...
          </h2>
          <MoodGrid onSelect={(m) => { setMood(m); setStep("trigger"); }} />
        </div>
      );

    // ── Step: 触发原因 ─────────────────────────────────
    if (step === "trigger")
      return (
        <div style={{ ...baseStyle, animation: "fi .25s ease" }}>
          <div style={{ padding: "22px 0 8px" }}>
            <Back fn={() => setStep("mood")} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: "20px 0 4px", lineHeight: 1.5 }}>
            {mood?.emoji} 是什么让你<br />想刷视频？
          </h2>
          <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
            可以说，也可以直接跳过
          </p>
          <textarea
            value={trig}
            onChange={(e) => setTrig(e.target.value)}
            placeholder="无聊、逃避某件事、太累了..."
            style={{
              width: "100%", boxSizing: "border-box", background: C.card,
              border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px",
              color: C.text, fontSize: 15, lineHeight: 1.6, resize: "none", height: 100,
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "14px 0 32px" }}>
            {["无聊", "逃避什么", "太累了", "焦虑", "就是习惯"].map((t) => (
              <button
                key={t}
                onClick={() => setTrig((p) => (p ? `${p}、${t}` : t))}
                style={{
                  background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: 20, padding: "6px 14px", cursor: "pointer",
                  color: C.muted, fontSize: 13, fontFamily: "inherit",
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <PBtn onClick={() => askAI(mood, trig)}>
            {trig ? "好，就这些" : "跳过，直接聊聊"}
          </PBtn>
        </div>
      );

    // ── Step: AI 陪伴 ──────────────────────────────────
    if (step === "ai")
      return (
        <div style={{ ...baseStyle, animation: "fi .25s ease" }}>
          <div style={{ padding: "22px 0 8px" }}>
            <Back fn={() => setStep("trigger")} />
          </div>
          <div style={{
            display: "flex", gap: 8, alignItems: "center", margin: "16px 0 22px",
            overflow: "hidden",
          }}>
            <span style={{ fontSize: 16 }}>{mood?.emoji}</span>
            <span style={{ color: C.muted, fontSize: 13 }}>{mood?.label}</span>
            {entry?.trigger && (
              <>
                <span style={{ color: C.border }}>·</span>
                <span style={{
                  color: C.muted, fontSize: 13, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                }}>
                  {entry.trigger}
                </span>
              </>
            )}
          </div>
          <div style={{
            background: C.card, borderRadius: 14, padding: "22px 20px",
            minHeight: 120, marginBottom: 28, border: `1px solid ${C.border}`,
          }}>
            {aiLoad ? (
              <Dots />
            ) : (
              <p style={{
                color: C.text, fontSize: 15, lineHeight: 1.85, margin: 0,
                animation: "fi .4s ease",
              }}>
                {aiTxt}
              </p>
            )}
          </div>
          {!aiLoad && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "fi .3s ease" }}>
              <PBtn onClick={() => decide("stop")}>好，先做别的事</PBtn>
              <SBtn onClick={() => decide("scroll")}>刷一会儿</SBtn>
            </div>
          )}
        </div>
      );

    // ── Step: 选择时长 ────────────────────────────────
    if (step === "timer-pick")
      return (
        <div style={{ ...baseStyle, animation: "fi .25s ease" }}>
          <div style={{ padding: "22px 0 8px" }}>
            <Back fn={() => setStep("ai")} />
          </div>
          <div style={{ textAlign: "center", paddingTop: 44 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>刷多久？</h2>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 44 }}>时间到了我来找你</p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
              {[10, 20, 30].map((m) => (
                <button
                  key={m}
                  onClick={() => startTimer(m)}
                  style={{
                    width: 90, height: 90, borderRadius: 16, background: C.card,
                    border: `1px solid ${C.border}`, cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", gap: 4, fontFamily: "inherit",
                  }}
                >
                  <span style={{ color: C.accent, fontSize: 24, fontWeight: 700 }}>{m}</span>
                  <span style={{ color: C.muted, fontSize: 12 }}>分钟</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      );

    // ── Step: 倒计时 ──────────────────────────────────
    if (step === "timer")
      return (
        <div style={{
          ...baseStyle, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", animation: "fi .25s ease",
        }}>
          <Ring s={timerS} total={totalS} />
          <p style={{
            color: C.muted, fontSize: 14, textAlign: "center",
            lineHeight: 1.9, margin: "24px 0 36px",
          }}>
            去刷吧<br />时间到了我在这里等你
          </p>
          <button
            onClick={() => {
              clearInterval(tRef.current);
              setTRun(false);
              setStep("postmood");
            }}
            style={{
              background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "10px 28px", cursor: "pointer",
              color: C.muted, fontSize: 13, fontFamily: "inherit",
            }}
          >
            刷完了
          </button>
        </div>
      );

    // ── Step: 刷后心情 ────────────────────────────────
    if (step === "postmood")
      return (
        <div style={{ ...baseStyle, animation: "fi .25s ease" }}>
          <div style={{ padding: "22px 0 8px" }} />
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: "20px 0 6px" }}>时间到了</h2>
          <p style={{ color: C.muted, fontSize: 14, marginBottom: 32 }}>现在感觉怎样？</p>
          <MoodGrid onSelect={doPostMood} />
        </div>
      );

    // ── Step: 完成 — 暂停 ─────────────────────────────
    if (step === "done-stop")
      return (
        <div style={{
          ...baseStyle, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", animation: "fi .3s ease",
        }}>
          <div style={{ fontSize: 52, marginBottom: 22 }}>🌿</div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 10, textAlign: "center" }}>
            你选择了暂停
          </h2>
          <p style={{
            color: C.muted, fontSize: 14, lineHeight: 1.85, textAlign: "center",
            maxWidth: 240, marginBottom: 44,
          }}>
            这个选择，是属于此刻的你的。
          </p>
          <button onClick={() => {
            exitStop(entry?.triggerApp || triggerSource);
            goHome();
          }} style={{
            padding: "13px 44px", borderRadius: 12, border: "none",
            cursor: "pointer", background: C.accent, color: "#fff",
            fontSize: 15, fontWeight: 500, fontFamily: "inherit",
          }}>
            回主页
          </button>
        </div>
      );

    // ── Step: 完成 — 刷后对比 ─────────────────────────
    if (step === "done-scroll") {
      const preIdx = MOODS.findIndex((m) => m.id === entry?.mood);
      const postIdx = MOODS.findIndex((m) => m.id === postMood?.id);
      const better = postIdx >= 0 && preIdx >= 0 && postIdx < preIdx;
      return (
        <div style={{
          ...baseStyle, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "0 28px 56px", animation: "fi .3s ease",
        }}>
          <div style={{
            background: C.card, borderRadius: 16, padding: "24px 36px",
            marginBottom: 28, border: `1px solid ${C.border}`,
            textAlign: "center", width: "100%", boxSizing: "border-box",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24, justifyContent: "center" }}>
              <div>
                <div style={{ fontSize: 28 }}>{MOODS[preIdx]?.emoji}</div>
                <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>刷前</div>
              </div>
              <span style={{ color: C.border, fontSize: 18 }}>→</span>
              <div>
                <div style={{ fontSize: 28 }}>{postMood?.emoji}</div>
                <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>刷后</div>
              </div>
            </div>
          </div>
          <p style={{
            color: C.muted, fontSize: 14, lineHeight: 1.85, textAlign: "center",
            maxWidth: 260, marginBottom: 44,
          }}>
            {better ? "感觉好了一些。" : "感觉没有更好。这个数据，是你自己的。"}
          </p>
          <button onClick={() => {
            exitHome();
            goHome();
          }} style={{
            padding: "13px 44px", borderRadius: 12, border: "none",
            cursor: "pointer", background: C.accent, color: "#fff",
            fontSize: 15, fontWeight: 500, fontFamily: "inherit",
          }}>
            回主页
          </button>
        </div>
      );
    }
  }

  return null;
}
