import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { validateConfig, defaultConfig } from "../core/config";
import { emailSignature } from "../core/emailSignature";
import { buildIcs, icsFileName } from "../core/ics";
import { formatInterviewTime, parseInterviewTime } from "../core/interviewTime";
import { isRegression, isSameStatus } from "../core/statusFlow";
import type { Config } from "../core/types";
import { call } from "../shared/client";
import { AppError } from "../shared/errors";
import { loadConfig, onConfigChanged } from "../shared/storage";
import { Candidates } from "./components/Candidates";
import { EmailForm } from "./components/EmailForm";
import { StatusStep } from "./components/StatusStep";
import { initialState, reducer } from "./state";
import type { FieldName, Phase } from "./state";
import { downloadTextFile } from "./download";
import { useGmailEmail } from "./useGmailEmail";

const BUSY_PHASES: readonly Phase[] = ["PARSING", "SEARCHING", "LOADING_OPTIONS", "WRITING"];

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [armed, setArmed] = useState<FieldName | null>(null);

  const parseSeq = useRef(0);

  useEffect(() => {
    void loadConfig().then(setConfig);
    return onConfigChanged(setConfig);
  }, []);

  // Text selected in the email goes into whichever field the user last focused.
  const onSelection = useCallback(
    (text: string) => {
      if (armed) dispatch({ t: "edit", field: armed, value: text });
    },
    [armed],
  );
  const feed = useGmailEmail(onSelection);

  // Re-parse whenever a different email is opened.
  const signature = emailSignature(feed.email);
  useEffect(() => {
    const email = feed.email;
    const seq = ++parseSeq.current;
    dispatch({ t: "email", hasEmail: !!email });
    if (!email) return;

    call("email:parse", { email })
      .then((res) => seq === parseSeq.current && dispatch({ t: "parsed", res }))
      .catch(
        (err: unknown) =>
          seq === parseSeq.current &&
          dispatch({ t: "fail", message: messageOf(err), back: "PARSED" }),
      );
    // `signature` captures the identity of feed.email.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const { form, phase, candidates } = state;
  const candidate = candidates[state.selected];
  const configProblems = validateConfig(config);
  const busy = BUSY_PHASES.includes(phase);

  const search = () => {
    dispatch({ t: "searchStart" });
    call("match:search", { company: form.company.trim(), role: form.role.trim() })
      .then((res) => dispatch({ t: "searchDone", candidates: res.candidates }))
      .catch((err: unknown) => dispatch({ t: "fail", message: messageOf(err), back: "PARSED" }));
  };

  const startUpdate = () => {
    if (!candidate) return;
    const back: Phase = candidates.length === 1 ? "FOUND_ONE" : "FOUND_MULTI";
    dispatch({ t: "optionsStart" });
    call("status:options", { candidate, type: form.type })
      .then((res) => {
        const sheet = config.sheets.find((s) => s.sheetTitle === candidate.sheetTitle);
        const hasTime = form.type === "interview" && form.interviewTime.trim() !== "";
        const schedulable = hasTime && parseInterviewTime(form.interviewTime) !== null;
        dispatch({
          t: "optionsDone",
          options: res.options,
          source: res.source,
          suggested: res.suggested,
          canNote: hasTime && !!sheet?.noteCol,
          canEvent: schedulable && !!config.enableCalendar,
          canIcs: schedulable,
        });
      })
      .catch((err: unknown) => dispatch({ t: "fail", message: messageOf(err), back }));
  };

  const confirm = async () => {
    const step = state.step;
    if (!candidate || !step) return;
    dispatch({ t: "writeStart" });
    const time = form.interviewTime.trim();

    try {
      await call("status:apply", {
        candidate,
        newStatus: step.chosen.trim(),
        ...(step.writeNote && time ? { note: `面试时间:${formatInterviewTime(time)}` } : {}),
      });
    } catch (err) {
      const stale = err instanceof AppError && err.code === "ROW_CHANGED";
      dispatch({ t: "fail", message: messageOf(err), back: stale ? "PARSED" : "CHOOSING_STATUS" });
      return;
    }

    let message = `已将第 ${candidate.rowIndex} 行更新为「${step.chosen.trim()}」`;
    if (step.createEvent && time) {
      try {
        await call("calendar:create", {
          company: form.company,
          role: form.role,
          interviewTime: time,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        message += ",并已创建日历事件";
      } catch (err) {
        message += `;但日历事件创建失败:${messageOf(err)}`;
      }
    }
    if (step.createIcs && time) {
      const ics = buildIcs({
        company: form.company,
        role: form.role,
        interviewTime: time,
        uid: `${crypto.randomUUID()}@job-tracker-sync`,
        now: new Date(),
      });
      if (ics) {
        downloadTextFile(icsFileName(form.company), ics, "text/calendar");
        message += ",已下载 .ics 文件(双击导入 Mac 日历)";
      }
    }
    dispatch({ t: "writeDone", message });
  };

  const step = state.step;
  const showStep = (phase === "CHOOSING_STATUS" || phase === "WRITING") && step && candidate;

  return (
    <main>
      <h1>求职邮件标记</h1>

      {configProblems.length > 0 && (
        <div className="banner">
          <span className="warn">{configProblems[0]}。</span>{" "}
          <button onClick={() => void chrome.runtime.openOptionsPage()}>打开设置</button>
        </div>
      )}
      {feed.problem && <div className="banner muted">{feed.problem}</div>}
      {phase === "PARSING" && <div className="banner muted">正在解析邮件…</div>}

      <EmailForm
        form={form}
        source={state.source}
        ai={state.ai}
        aiMessage={state.aiMessage}
        armed={armed}
        busy={busy}
        onEdit={(field, value) => dispatch({ t: "edit", field, value })}
        onArm={setArmed}
        onSearch={search}
      />

      {phase === "SEARCHING" && <p className="muted">查找中…</p>}

      {phase === "NOT_FOUND" && (
        <div className="card">
          <p className="warn">
            未找到匹配的行。请在邮件中拖选正确的公司名 / 职位名填入对应输入框,然后再次查找。
          </p>
        </div>
      )}

      {(phase === "FOUND_ONE" || phase === "FOUND_MULTI" || phase === "LOADING_OPTIONS") && (
        <Candidates
          candidates={candidates}
          selected={state.selected}
          busy={busy}
          onSelect={(index) => dispatch({ t: "select", index })}
          onUpdate={startUpdate}
        />
      )}

      {showStep && (
        <StatusStep
          candidate={candidate}
          step={step}
          regression={isRegression(candidate.currentStatus, step.chosen, config.statusOrder)}
          sameStatus={isSameStatus(candidate.currentStatus, step.chosen)}
          interviewTimeLabel={formatInterviewTime(form.interviewTime)}
          noteColumn={config.sheets.find((s) => s.sheetTitle === candidate.sheetTitle)?.noteCol}
          busy={busy}
          onChange={(patch) => dispatch({ t: "step", patch })}
          onConfirm={() => void confirm()}
          onCancel={() =>
            dispatch({
              t: "fail",
              message: "",
              back: candidates.length === 1 ? "FOUND_ONE" : "FOUND_MULTI",
            })
          }
        />
      )}

      {phase === "DONE" && <div className="card ok">✅ {state.doneMessage}</div>}
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
    </main>
  );
}
