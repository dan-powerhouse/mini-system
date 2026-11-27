import { recipes } from "@/components/kit";
import { messageOf, whenFull } from "@/lib/format";
import type { ImportPreview } from "@/lib/model";

/** A dry-run import result in plain words: counts, then each problem by file and row. */
export function ImportReport({ report }: { report: ImportPreview }) {
  const errors = report.errors ?? [];
  const total = (report.entityRows ?? 0) + (report.relationRows ?? 0);
  return (
    <div className="mt-4 grid gap-3" aria-label="Import preview">
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Records", report.entityRows ?? 0],
          ["Relations", report.relationRows ?? 0],
          ["Rows ready", `${report.validRows ?? 0} / ${total}`],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl bg-secondary/70 px-3 py-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tracking-tight">{value}</dd>
          </div>
        ))}
      </dl>
      {errors.length === 0 ? (
        <p className="text-sm">
          Nothing to fix. Committing adds these rows in one transaction; nothing is overwritten.
          {report.expiresAt && <span className="text-muted-foreground"> This preview expires {whenFull(report.expiresAt)}.</span>}
        </p>
      ) : (
        <>
          <p className={recipes.notice.error}>
            {errors.length} problem{errors.length === 1 ? "" : "s"} to fix in the file before it can be imported. Nothing has been written.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">File</th>
                  <th className="py-2 pr-3 font-medium">Row</th>
                  <th className="py-2 pr-3 font-medium">Field</th>
                  <th className="py-2 font-medium">Problem</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((error, index) => (
                  <tr key={index} className="border-t border-border/70 align-top">
                    <td className="py-2 pr-3 font-mono text-xs">{error.file ?? "—"}</td>
                    <td className="py-2 pr-3">{error.row ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{error.field ?? "—"}</td>
                    <td className="py-2">{messageOf(error.message ?? error.code ?? "Invalid row")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
