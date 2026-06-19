// 在 capacitor sync 之后自动将 AppBindingPlugin 注入 capacitor.plugins.json
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginsJsonPath = join(__dirname, "..", "android", "app", "src", "main", "assets", "capacitor.plugins.json");

const CUSTOM_PLUGIN = {
  pkg: "com.cike.app",
  classpath: "com.cike.app.AppBindingPlugin",
};

try {
  const raw = readFileSync(pluginsJsonPath, "utf-8");
  const plugins = JSON.parse(raw);

  // 检查是否已存在，避免重复添加
  const exists = plugins.some((p) => p.classpath === CUSTOM_PLUGIN.classpath);
  if (!exists) {
    plugins.push(CUSTOM_PLUGIN);
    writeFileSync(pluginsJsonPath, JSON.stringify(plugins, null, "\t"), "utf-8");
    console.log("✅ AppBindingPlugin 已注入 capacitor.plugins.json");
  } else {
    console.log("✅ AppBindingPlugin 已存在于 capacitor.plugins.json");
  }
} catch (err) {
  console.warn("⚠️ 无法更新 capacitor.plugins.json:", err.message);
}
