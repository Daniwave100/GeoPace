// A strip row drawn the instrument's way (PLAN.md D31): a thin trace with a light fill. This
// module only works out the shapes, as SVG path strings; strip/strip.ts puts them on the page.
//
// Stretches whose value is measured are a solid line with a fill hanging from the row's baseline. Stretches that
// are not measured here get a dashed grey line and no fill, joined up to the solid line either
// side. Where the row has no value at all (a grade outside the effort model), there is no line,
// only a grey block: nothing is ever drawn through a hole.
import type { Encoding } from "./encoding";
import type { HowMuch, RowBin, StripRow } from "./layers";
import { linearScale, measuredRuns, type Scale } from "./layout";

export interface TraceBox {
  /** km -> x in pixels. */
  x: Scale;
  top: number;
  height: number;
}

export interface TracePaths {
  measured: { line: string; area: string }[];
  notMeasured: string[];
  /** Stretches with no value at all, as blocks the full height of the row. */
  noValue: { x: number; width: number }[];
  /** Where the baseline sits, for rows that hang from a value rather than from the bottom. */
  baselineY: number;
  /** For a row that says how much as well as where: a block from the baseline to the value, for each marked, measured bin, drawn as the kind of claim that slice makes. */
  howMuchBlocks: { x: number; y: number; width: number; height: number; howMuch: HowMuch; encoding: Encoding }[];
}

/** Room left above and below the trace, so a line at the top of its scale isn't cut in half. */
const PAD = 3;

export function tracePaths(row: Pick<StripRow, "domain" | "baseline" | "stepped">, bins: RowBin[], box: TraceBox, howMuch: HowMuch[] = []): TracePaths {
  const bottom = box.top + box.height;
  const y = linearScale(row.domain, [bottom - PAD, box.top + PAD]);
  const baselineY = row.baseline === "bottom" ? bottom : row.baseline === "middle" ? (box.top + bottom) / 2 : y(row.baseline);
  const paths: TracePaths = { measured: [], notMeasured: [], noValue: [], baselineY, howMuchBlocks: [] };

  bins.forEach((bin, i) => {
    const x = box.x(bin.startKm);
    const width = box.x(bin.endKm) - x;
    if (bin.value === null) paths.noValue.push({ x, width });
    // Only what is measured is marked: a filled-in stretch keeps its dashes and nothing else.
    const amount = howMuch[i] ?? 0;
    if (bin.value !== null && bin.encoding !== "not-measured" && amount !== 0) {
      const at = y(bin.value);
      paths.howMuchBlocks.push({ x, width, y: Math.min(at, baselineY), height: Math.abs(at - baselineY), howMuch: amount, encoding: bin.encoding });
    }
  });

  for (const run of measuredRuns(bins, { bridgeGaps: true, isMeasured: (bin) => bin.encoding !== "not-measured" })) {
    // A hole in the values ends one piece of line and starts another.
    for (const piece of splitAtHoles(run.bins)) {
      const points = row.stepped
        ? piece.flatMap((bin) => [point(box.x(bin.startKm), y(bin.value)), point(box.x(bin.endKm), y(bin.value))])
        : piece.map((bin) => point(box.x(bin.midKm), y(bin.value)));
      if (points.length < 2) continue;
      const line = `M${points.join("L")}`;
      if (!run.measured) {
        paths.notMeasured.push(line);
        continue;
      }
      const first = row.stepped ? box.x(piece[0].startKm) : box.x(piece[0].midKm);
      const last = row.stepped ? box.x(piece[piece.length - 1].endKm) : box.x(piece[piece.length - 1].midKm);
      paths.measured.push({ line, area: `${line}L${point(last, baselineY)}L${point(first, baselineY)}Z` });
    }
  }
  return paths;
}

type ValuedBin = RowBin & { value: number };

function splitAtHoles(bins: RowBin[]): ValuedBin[][] {
  const pieces: ValuedBin[][] = [[]];
  for (const bin of bins) {
    if (bin.value === null) pieces.push([]);
    else pieces[pieces.length - 1].push(bin as ValuedBin);
  }
  return pieces.filter((piece) => piece.length > 0);
}

function point(x: number, y: number): string {
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}
