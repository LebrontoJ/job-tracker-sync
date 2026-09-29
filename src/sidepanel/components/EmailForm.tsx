import { EMAIL_TYPES } from "../../core/types";
import type { EmailType, ParseSource } from "../../core/types";
import { SOURCE_LABELS, TYPE_LABELS } from "../../shared/labels";
import type { AiState } from "../../shared/messages";
import type { FieldName, FormState } from "../state";

interface Props {
  form: FormState;
  source: ParseSource;
  ai: AiState;
  aiMessage: string | null;
  armed: FieldName | null;
  busy: boolean;
  onEdit: (field: keyof FormState, value: string) => void;
  onArm: (field: FieldName) => void;
  onSearch: () => void;
}

export function EmailForm({
  form,
  source,
  ai,
  aiMessage,
  armed,
  busy,
  onEdit,
  onArm,
  onSearch,
}: Props) {
  const text = (field: FieldName, label: string, placeholder = "") => (
    <div className={`field${armed === field ? " armed" : ""}`}>
      <label htmlFor={field}>{label}</label>
      <input
        id={field}
        value={form[field]}
        placeholder={placeholder}
        onFocus={() => onArm(field)}
        onChange={(e) => onEdit(field, e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !busy && onSearch()}
      />
    </div>
  );

  return (
    <section className="card" aria-label="邮件解析结果">
      <div className="field">
        <label htmlFor="type">类型</label>
        <select
          id="type"
          value={form.type}
          onChange={(e) => onEdit("type", e.target.value as EmailType)}
        >
          {EMAIL_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        {form.type === "other" && (
          <p className="muted">这封邮件看起来不是拒信 / 面试 / OA / Offer,你仍可手动操作。</p>
        )}
      </div>

      {text("company", "公司名")}
      {text("role", "职位名", "可留空,仅按公司名匹配")}
      {form.type === "interview" && text("interviewTime", "面试时间", "2026-10-08T14:00:00-04:00")}

      <p className="muted">
        解析来源:{SOURCE_LABELS[source]}
        {ai === "no_key" && "(未配置 Gemini Key,缺失字段请手动填写)"}
        {ai === "unavailable" && `(${aiMessage ?? "AI 暂不可用"})`}
      </p>
      <p className="muted">点击输入框后,在邮件里拖选文字即可自动填入。</p>

      <div className="actions">
        <button className="primary" disabled={busy || !form.company.trim()} onClick={onSearch}>
          查 找
        </button>
      </div>
    </section>
  );
}
