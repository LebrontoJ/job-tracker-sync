import type { MatchCandidate } from "../../core/types";
import type { StatusStep as Step } from "../state";

interface Props {
  candidate: MatchCandidate;
  step: Step;
  regression: boolean;
  sameStatus: boolean;
  interviewTimeLabel: string;
  noteColumn: string | undefined;
  busy: boolean;
  onChange: (patch: Partial<Step>) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function StatusStep(props: Props) {
  const { candidate, step, regression, sameStatus, busy } = props;
  const { chosen } = step;
  const needsAck = regression && !step.regressionAck;

  return (
    <section className="card" aria-label="选择新状态">
      <div className="field">
        <label htmlFor="status">新状态(当前:{candidate.currentStatus || "空"})</label>
        {step.options.length > 0 ? (
          <select
            id="status"
            value={chosen}
            onChange={(e) => props.onChange({ chosen: e.target.value })}
          >
            <option value="" disabled>
              请选择…
            </option>
            {step.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            id="status"
            value={chosen}
            onChange={(e) => props.onChange({ chosen: e.target.value })}
          />
        )}
        {step.optionsSource === "column" && (
          <p className="muted">该单元格没有下拉选项,以下为本列已出现的值;也可手动输入。</p>
        )}
      </div>

      {sameStatus && <p className="warn">已是该状态,无需更新。</p>}
      {regression && !sameStatus && (
        <p className="warn">
          当前已是 {candidate.currentStatus},确认改回 {chosen}?
        </p>
      )}

      {step.canNote && (
        <label className="row">
          <input
            type="checkbox"
            checked={step.writeNote}
            onChange={(e) => props.onChange({ writeNote: e.target.checked })}
          />
          同时写入面试时间({props.interviewTimeLabel})到备注列 {props.noteColumn}
        </label>
      )}
      {step.canEvent && (
        <label className="row">
          <input
            type="checkbox"
            checked={step.createEvent}
            onChange={(e) => props.onChange({ createEvent: e.target.checked })}
          />
          同时创建 Google Calendar 事件
        </label>
      )}

      <div className="actions">
        <button disabled={busy} onClick={props.onCancel}>
          取消
        </button>
        <button
          className="primary"
          disabled={busy || !chosen.trim() || sameStatus}
          onClick={() => (needsAck ? props.onChange({ regressionAck: true }) : props.onConfirm())}
        >
          {needsAck ? "仍然改为此状态" : "确 认"}
        </button>
      </div>
    </section>
  );
}
