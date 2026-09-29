import { useEffect, useState } from "react";
import { guessColumns } from "../core/columns";
import { defaultConfig, validateConfig } from "../core/config";
import { extractSpreadsheetId } from "../core/sheetUrl";
import { DEFAULT_GEMINI_MODEL, EMAIL_TYPES } from "../core/types";
import type { Config, SheetMapping } from "../core/types";
import { call } from "../shared/client";
import { TYPE_LABELS } from "../shared/labels";
import { loadConfig, saveConfig } from "../shared/storage";
import { SheetCard } from "./SheetCard";

const CALENDAR_ORIGIN = "https://www.googleapis.com/*";

type Notice = { kind: "ok" | "error"; text: string } | null;

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function App() {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [loaded, setLoaded] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [headers, setHeaders] = useState<Record<string, string[]>>({});
  const [orderText, setOrderText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    void loadConfig().then((c) => {
      setConfig(c);
      setOrderText(c.statusOrder.join("\n"));
      setSheetUrl(
        c.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${c.spreadsheetId}` : "",
      );
      setLoaded(true);
      // Show header names for sheets configured earlier.
      for (const s of c.sheets) void loadHeaders(c.spreadsheetId, s.sheetTitle, s.headerRow);
    });
  }, []);

  async function loadHeaders(spreadsheetId: string, sheetTitle: string, headerRow: number) {
    try {
      const res = await call("sheets:headers", { spreadsheetId, sheetTitle, headerRow });
      setHeaders((prev) => ({ ...prev, [sheetTitle]: res.headers }));
      return res.headers;
    } catch {
      return [];
    }
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setNotice({ kind: "error", text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  };

  const authorize = () =>
    run(async () => {
      await call("auth:signIn", { calendar: !!config.enableCalendar });
      setNotice({ kind: "ok", text: "已授权 Google 账号" });
    });

  const resetAuth = () =>
    run(async () => {
      await call("auth:signOut", undefined);
      setNotice({ kind: "ok", text: "已重置授权,请重新点击「授权 Google 账号」" });
    });

  const loadSheets = () =>
    run(async () => {
      const spreadsheetId = extractSpreadsheetId(sheetUrl);
      if (!spreadsheetId) throw new Error("无法从输入中识别表格 ID,请粘贴完整的 Google 表格链接");

      const { title, sheets } = await call("sheets:list", { spreadsheetId });
      const mappings: SheetMapping[] = [];
      for (const { title: sheetTitle } of sheets) {
        const previous =
          config.spreadsheetId === spreadsheetId
            ? config.sheets.find((s) => s.sheetTitle === sheetTitle)
            : undefined;
        const headerRow = previous?.headerRow ?? 1;
        const row = await loadHeaders(spreadsheetId, sheetTitle, headerRow);
        if (previous) {
          mappings.push(previous);
          continue;
        }
        const guess = guessColumns(row);
        mappings.push({
          sheetTitle,
          // Only turn on sheets where company/role/status could all be guessed.
          enabled: !!(guess.companyCol && guess.roleCol && guess.statusCol),
          headerRow,
          companyCol: guess.companyCol ?? "",
          roleCol: guess.roleCol ?? "",
          statusCol: guess.statusCol ?? "",
          ...(guess.noteCol ? { noteCol: guess.noteCol } : {}),
        });
      }
      setConfig((c) => ({ ...c, spreadsheetId, sheets: mappings }));
      setNotice({
        kind: "ok",
        text: `已读取「${title}」的 ${sheets.length} 张子表,请确认列映射后保存`,
      });
    });

  const updateSheet = (index: number, next: SheetMapping) =>
    setConfig((c) => ({ ...c, sheets: c.sheets.map((s, i) => (i === index ? next : s)) }));

  const changeHeaderRow = (index: number, headerRow: number) => {
    const sheet = config.sheets[index];
    if (!sheet) return;
    updateSheet(index, { ...sheet, headerRow });
    void loadHeaders(config.spreadsheetId, sheet.sheetTitle, headerRow);
  };

  const toggleCalendar = (enabled: boolean) =>
    run(async () => {
      if (enabled) {
        // Both prompts need a user gesture, which this click handler provides.
        const granted = await chrome.permissions.request({ origins: [CALENDAR_ORIGIN] });
        if (!granted) throw new Error("需要允许访问 Google Calendar 才能启用此功能");
        await call("auth:signIn", { calendar: true });
      }
      setConfig((c) => ({ ...c, enableCalendar: enabled }));
    });

  const save = () =>
    run(async () => {
      const statusOrder = orderText
        .split(/[\n,>→]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const next: Config = { ...config, statusOrder };
      const problems = validateConfig(next);
      if (problems.length) throw new Error(problems.join(";"));
      await saveConfig(next);
      setConfig(next);
      setNotice({ kind: "ok", text: "已保存" });
    });

  if (!loaded) return null;

  return (
    <main>
      <h1>Job Tracker Sync 设置</h1>

      <section className="card">
        <h2>1. 绑定 Google 表格</h2>
        <div className="field">
          <label htmlFor="url">表格链接</label>
          <input
            id="url"
            value={sheetUrl}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            onChange={(e) => setSheetUrl(e.target.value)}
          />
        </div>
        <div className="actions" style={{ justifyContent: "flex-start" }}>
          <button disabled={busy} onClick={() => void authorize()}>
            授权 Google 账号
          </button>
          <button disabled={busy} onClick={() => void resetAuth()}>
            重置授权
          </button>
          <button
            className="primary"
            disabled={busy || !sheetUrl.trim()}
            onClick={() => void loadSheets()}
          >
            读取子表
          </button>
        </div>
      </section>

      {config.sheets.length > 0 && (
        <>
          <h2>2. 列映射</h2>
          {config.sheets.map((sheet, i) => (
            <SheetCard
              key={sheet.sheetTitle}
              sheet={sheet}
              headers={headers[sheet.sheetTitle] ?? []}
              onChange={(next) => updateSheet(i, next)}
              onHeaderRowChange={(row) => changeHeaderRow(i, row)}
            />
          ))}
        </>
      )}

      <section className="card">
        <h2>3. 邮件类型 → 状态</h2>
        {EMAIL_TYPES.map((type) => (
          <div className="status-row" key={type}>
            <label htmlFor={`map-${type}`}>{TYPE_LABELS[type]}</label>
            <input
              id={`map-${type}`}
              value={config.statusMapping[type] ?? ""}
              placeholder="(不预选)"
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  statusMapping: { ...c.statusMapping, [type]: e.target.value.trim() || null },
                }))
              }
            />
          </div>
        ))}
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="order">状态先后顺序(每行一个,用于回退保护;Rejected 等终态不必列出)</label>
          <textarea
            id="order"
            rows={5}
            value={orderText}
            onChange={(e) => setOrderText(e.target.value)}
          />
        </div>
      </section>

      <section className="card">
        <h2>4. AI 兜底(Gemini)</h2>
        <div className="field">
          <label htmlFor="key">API Key(仅保存在本机)</label>
          <input
            id="key"
            type="password"
            autoComplete="off"
            value={config.geminiApiKey}
            onChange={(e) => setConfig((c) => ({ ...c, geminiApiKey: e.target.value.trim() }))}
          />
          <p className="muted hint">
            规则无法解析时,仅会发送邮件主题与正文前 1500 字。留空则只使用规则解析。
          </p>
        </div>
        <div className="field">
          <label htmlFor="model">模型</label>
          <input
            id="model"
            value={config.geminiModel ?? ""}
            placeholder={DEFAULT_GEMINI_MODEL}
            onChange={(e) => setConfig((c) => ({ ...c, geminiModel: e.target.value.trim() }))}
          />
        </div>
      </section>

      <section className="card">
        <h2>5. Google Calendar(可选)</h2>
        <label className="row">
          <input
            type="checkbox"
            checked={!!config.enableCalendar}
            disabled={busy}
            onChange={(e) => void toggleCalendar(e.target.checked)}
          />
          约面试时,允许创建日历事件(创建前需在侧边栏确认)
        </label>
      </section>

      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="primary" disabled={busy} onClick={() => void save()}>
          保存
        </button>
        {notice && (
          <span role="status" className={notice.kind === "ok" ? "ok" : "error"}>
            {notice.text}
          </span>
        )}
      </div>
    </main>
  );
}
