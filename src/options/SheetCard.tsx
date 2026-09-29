import { colToIndex, indexToCol } from "../core/columns";
import type { SheetMapping } from "../core/types";

interface Props {
  sheet: SheetMapping;
  headers: string[];
  onChange: (next: SheetMapping) => void;
  onHeaderRowChange: (headerRow: number) => void;
}

function ColumnSelect(props: {
  id: string;
  label: string;
  value: string;
  headers: string[];
  optional?: boolean;
  onChange: (value: string) => void;
}) {
  const { value, headers } = props;
  // Offer every header column, plus the current value if it lies beyond them.
  const count = Math.max(headers.length, value ? colToIndex(value) + 1 : 0);
  const letters = Array.from({ length: count }, (_, i) => indexToCol(i));

  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <select id={props.id} value={value} onChange={(e) => props.onChange(e.target.value)}>
        {props.optional && <option value="">(不使用)</option>}
        {!props.optional && !value && (
          <option value="" disabled>
            请选择…
          </option>
        )}
        {letters.map((letter, i) => (
          <option key={letter} value={letter}>
            {letter} — {headers[i] || "(空)"}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SheetCard({ sheet, headers, onChange, onHeaderRowChange }: Props) {
  const set = (patch: Partial<SheetMapping>) => onChange({ ...sheet, ...patch });
  const id = (name: string) => `${sheet.sheetTitle}-${name}`;

  return (
    <section className="card" aria-label={`子表 ${sheet.sheetTitle}`}>
      <div className="sheet-head">
        <label>
          <input
            type="checkbox"
            checked={sheet.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          <strong>{sheet.sheetTitle}</strong>
        </label>
        <div className="row">
          <label htmlFor={id("header")}>表头行</label>
          <input
            id={id("header")}
            type="number"
            min={1}
            style={{ width: 64 }}
            value={sheet.headerRow}
            onChange={(e) => onHeaderRowChange(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
      </div>

      {sheet.enabled && (
        <>
          <div className="grid">
            <ColumnSelect
              id={id("company")}
              label="公司列"
              value={sheet.companyCol}
              headers={headers}
              onChange={(v) => set({ companyCol: v })}
            />
            <ColumnSelect
              id={id("role")}
              label="职位列"
              value={sheet.roleCol}
              headers={headers}
              onChange={(v) => set({ roleCol: v })}
            />
            <ColumnSelect
              id={id("status")}
              label="状态列"
              value={sheet.statusCol}
              headers={headers}
              onChange={(v) => set({ statusCol: v })}
            />
            <ColumnSelect
              id={id("note")}
              label="备注列(写入面试时间)"
              value={sheet.noteCol ?? ""}
              headers={headers}
              optional
              onChange={(v) => set({ noteCol: v || undefined })}
            />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label className="row" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={!!sheet.fillColor}
                onChange={(e) => set({ fillColor: e.target.checked ? "#fff2cc" : undefined })}
              />
              更新后给整行上色
            </label>
            {sheet.fillColor && (
              <input
                type="color"
                aria-label="底色"
                style={{ width: 48 }}
                value={sheet.fillColor}
                onChange={(e) => set({ fillColor: e.target.value })}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}
