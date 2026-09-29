import type { MatchCandidate } from "../../core/types";

interface Props {
  candidates: MatchCandidate[];
  selected: number;
  busy: boolean;
  onSelect: (index: number) => void;
  onUpdate: () => void;
}

export function Candidates({ candidates, selected, busy, onSelect, onUpdate }: Props) {
  return (
    <section className="card" aria-label="匹配结果">
      <h2 className="ok">
        ✅ 找到 {candidates.length} 条
        {candidates.length === 1 && ` (Sheet: ${candidates[0]?.sheetTitle})`}
      </h2>
      <div role="radiogroup">
        {candidates.map((c, i) => (
          <button
            key={`${c.sheetTitle}:${c.rowIndex}`}
            className="candidate"
            role="radio"
            aria-checked={i === selected}
            onClick={() => onSelect(i)}
          >
            <div>
              <strong>{c.company}</strong> · {c.role || "(无职位)"}
              {candidates.length > 1 && <span className="muted"> — {c.sheetTitle}</span>}
            </div>
            <div className="muted">
              第 {c.rowIndex} 行 · 当前状态:{c.currentStatus || "(空)"} · 匹配度{" "}
              {Math.round(c.score * 100)}%
            </div>
            {c.roleMismatch && <div className="warn">职位不太一致</div>}
            {c.rowValues.length > 0 && <div className="cells">{c.rowValues.join(" | ")}</div>}
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="primary" disabled={busy} onClick={onUpdate}>
          更 新
        </button>
      </div>
    </section>
  );
}
