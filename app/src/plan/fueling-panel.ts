// The fueling plan, inside the Race Plan: what the runner means to take and where, and what the
// organizer's refreshment points make of it (issue #12).
//
// It is a short list and a shorter one under it. The list is the plan — a kind and a kilometre per
// line, added, edited and removed — and under it are the warnings, each with the one button that
// answers it: **Move it**. That button is the whole feature. A warning a runner has to act on by
// retyping a number is a warning they will read once and stop reading.
//
// Nothing here judges a plan. A runner carrying their own bottle has already answered every
// warning this can give, so each one says what the organizer's list makes of the plan and offers
// somewhere else to put it, and none of them is an error.
//
// Distances are typed and shown in the runner's own units (D42); the plan keeps kilometres, so
// switching units never moves an item.
//
// **Every row is built once and then only updated**, which is the rule the form around it already
// keeps (plan/plan-panel.ts). Every edit here goes all the way out to the plan and comes back as a
// whole new list, so rebuilding the rows from it would throw away the element the runner is
// standing on: arrowing from Gel to Chews would fire the change, destroy the select, drop focus on
// the body, and the next arrow key would do nothing. So rows are kept by their item's id, moved
// into course order rather than replaced, and a box the runner is typing in is left alone.
import { aidStations } from "../core/aid";
import { checkFueling, FUEL_NAME, type FuelItem, type FuelKind, newFuelItemId } from "../core/fueling";
import type { Planner } from "../core/planner";
import { distanceNumber, formatDistance, type Units, unitKm, unitName } from "../core/units";
import { html } from "../dom";

export interface FuelingPanel {
  show(planner: Planner, units: Units): void;
}

/** Where a new item goes when there is nothing to put it after. */
const FIRST_ITEM_KM = 5;
/** And how far past the last one, when there is. */
const NEXT_ITEM_KM = 5;
/** Two items nearer than this to each other are one row the runner can't tell from another. */
const APART_KM = 0.05;

const NOTHING_YET = "Nothing yet. Add what you mean to take, and where, and this will check it against the stations.";
const NO_STATIONS = "This course has no published list of refreshment points, so there is nothing to check a plan against.";
const ALL_CLEAR = "Nothing to flag: every gel has water near it, and every station has what you are counting on.";

/**
 * Where to put a new item: five kilometres past the last one, and where that is taken or past the
 * finish, the middle of the longest clear stretch. Never on top of an item that is already there —
 * a stack of rows at exactly the finish is a plan the runner can't take apart again.
 */
export function somewhereFree(plan: FuelItem[], lengthKm: number): number {
  const taken = plan.map((item) => item.km).sort((a, b) => a - b);
  const clear = (km: number) => km <= lengthKm && !taken.some((at) => Math.abs(at - km) < APART_KM);
  const after = taken.length === 0 ? FIRST_ITEM_KM : taken[taken.length - 1] + NEXT_ITEM_KM;
  if (clear(after)) return after;
  // The longest stretch with nothing in it, the start and the finish counting as ends of one.
  const edges = [0, ...taken, lengthKm];
  const widest = edges.slice(1).reduce((best, km, i) => (km - edges[i] > best.width ? { at: (km + edges[i]) / 2, width: km - edges[i] } : best), { at: lengthKm, width: 0 });
  return clear(widest.at) ? widest.at : lengthKm;
}

/** `onChange` gets the whole fueling plan every time the runner changes anything. */
export function createFuelingPanel(container: HTMLElement, onChange: (fueling: FuelItem[]) => void): FuelingPanel {
  let planner: Planner | undefined;
  let units: Units = "km";

  const items = html("ul", { class: "fuel-items" });
  const add = html("button", { type: "button", class: "fuel-add", text: "Add an item" });
  const empty = html("p", { class: "plan-note" });
  const warnings = html("ul", { class: "fuel-warnings" });
  const box = html("fieldset", { class: "fueling" }, html("legend", { text: "Fueling" }), items, empty, add, warnings);
  container.replaceChildren(box);

  add.addEventListener("click", () => {
    if (!planner) return;
    const plan = planner.plan.fueling;
    onChange([...plan, { id: newFuelItemId(), km: somewhereFree(plan, planner.lengthKm), kind: "gel" }]);
  });

  function edit(id: string, changes: Partial<FuelItem>): void {
    if (!planner) return;
    onChange(planner.plan.fueling.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  function remove(id: string): void {
    if (!planner) return;
    onChange(planner.plan.fueling.filter((item) => item.id !== id));
  }

  /** One row's elements, kept between refreshes so the runner never loses their place. */
  interface Row {
    li: HTMLLIElement;
    kind: HTMLSelectElement;
    km: HTMLInputElement;
    unit: HTMLSpanElement;
    drop: HTMLButtonElement;
  }
  const rows = new Map<string, Row>();

  function buildRow(item: FuelItem): Row {
    const kind = html("select", { "aria-label": "What" });
    for (const [value, name] of Object.entries(FUEL_NAME)) kind.append(html("option", { value, text: name }));
    kind.addEventListener("change", () => edit(item.id, { kind: kind.value as FuelKind }));

    const km = html("input", { type: "number", inputmode: "decimal", step: "0.1", min: 0, class: "fuel-km" });
    km.addEventListener("change", () => {
      const typed = Number(km.value);
      // An empty or impossible box leaves the item where it is rather than moving it to zero.
      if (km.value.trim() === "" || !Number.isFinite(typed)) return refresh();
      edit(item.id, { km: Math.min(Math.max(typed * unitKm(units), 0), planner?.lengthKm ?? typed) });
    });

    const unit = html("span", { class: "fuel-unit" });
    const drop = html("button", { type: "button", class: "fuel-remove", text: "Remove" });
    drop.addEventListener("click", () => remove(item.id));

    return { li: html("li", { class: "fuel-item" }, kind, km, unit, drop), kind, km, unit, drop };
  }

  /** The row for this item, made if it is new, and brought up to date either way. */
  function rowFor(item: FuelItem): Row {
    let row = rows.get(item.id);
    if (!row) {
      row = buildRow(item);
      rows.set(item.id, row);
    }
    row.kind.value = item.kind;
    // Never while the runner is in the box: they are part way through typing a number.
    if (document.activeElement !== row.km) row.km.value = distanceNumber(item.km, units);
    row.km.max = distanceNumber(planner?.lengthKm ?? 0, units);
    row.km.setAttribute("aria-label", `Where, in ${unitName(units, "many")}`);
    row.unit.textContent = units;
    row.drop.setAttribute("aria-label", `Remove ${FUEL_NAME[item.kind]}`);
    return row;
  }

  /**
   * The rows in course order, moved rather than replaced. `replaceChildren` would take every row
   * out of the document and put it back, which blurs whatever was focused; `insertBefore` moves a
   * node that stays connected, and focus goes with it.
   */
  function order(wanted: Row[]): void {
    wanted.forEach((row, at) => {
      if (items.children[at] !== row.li) items.insertBefore(row.li, items.children[at] ?? null);
    });
    while (items.children.length > wanted.length) items.lastElementChild?.remove();
  }

  function refresh(): void {
    if (!planner) return;
    const stations = aidStations(planner.edition);
    const plan = [...planner.plan.fueling].sort((a, b) => a.km - b.km);
    const live = new Set(plan.map((item) => item.id));
    for (const id of [...rows.keys()]) if (!live.has(id)) rows.delete(id);
    order(plan.map(rowFor));
    empty.textContent = plan.length === 0 ? NOTHING_YET : "";

    if (stations.length === 0) {
      warnings.replaceChildren(html("li", { class: "fuel-clear", text: NO_STATIONS }));
      return;
    }
    const found = checkFueling(plan, stations, planner.lengthKm);
    if (plan.length === 0) {
      warnings.replaceChildren();
      return;
    }
    if (found.length === 0) {
      warnings.replaceChildren(html("li", { class: "fuel-clear", text: ALL_CLEAR }));
      return;
    }
    warnings.replaceChildren(
      ...found.map((warning) => {
        const row = html("li", { class: "fuel-warning" }, html("span", { text: warning.text(units) }));
        if (warning.suggestedKm !== null) {
          const move = html("button", { type: "button", class: "fuel-move", text: `Move it to ${formatDistance(warning.suggestedKm, units)}` });
          move.addEventListener("click", () => edit(warning.itemId, { km: warning.suggestedKm as number }));
          row.append(move);
        }
        return row;
      }),
    );
  }

  return {
    show(nextPlanner, nextUnits) {
      planner = nextPlanner;
      units = nextUnits;
      refresh();
    },
  };
}
