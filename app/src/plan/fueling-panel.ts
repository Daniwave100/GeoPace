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

const NOTHING_YET = "Nothing yet. Add what you mean to take, and where, and this will check it against the stations.";
const NO_STATIONS = "This course has no published list of refreshment points, so there is nothing to check a plan against.";
const ALL_CLEAR = "Nothing to flag: every gel has water near it, and every station has what you are counting on.";

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
    const after = plan.length === 0 ? FIRST_ITEM_KM : Math.min(Math.max(...plan.map((item) => item.km)) + NEXT_ITEM_KM, planner.lengthKm);
    onChange([...plan, { id: newFuelItemId(), km: Math.min(after, planner.lengthKm), kind: "gel" }]);
  });

  function edit(id: string, changes: Partial<FuelItem>): void {
    if (!planner) return;
    onChange(planner.plan.fueling.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  function remove(id: string): void {
    if (!planner) return;
    onChange(planner.plan.fueling.filter((item) => item.id !== id));
  }

  function itemRow(item: FuelItem): HTMLLIElement {
    const kind = html("select", { "aria-label": "What" });
    for (const [value, name] of Object.entries(FUEL_NAME)) {
      const option = html("option", { value, text: name });
      if (value === item.kind) option.selected = true;
      kind.append(option);
    }
    kind.addEventListener("change", () => edit(item.id, { kind: kind.value as FuelKind }));

    const km = html("input", {
      type: "number",
      inputmode: "decimal",
      step: "0.1",
      min: 0,
      max: distanceNumber(planner?.lengthKm ?? 0, units),
      value: distanceNumber(item.km, units),
      "aria-label": `Where, in ${unitName(units, "many")}`,
      class: "fuel-km",
    });
    const commit = () => {
      const typed = Number(km.value);
      // An empty or impossible box leaves the item where it is rather than moving it to zero.
      if (km.value.trim() === "" || !Number.isFinite(typed)) return refresh();
      edit(item.id, { km: Math.min(Math.max(typed * unitKm(units), 0), planner?.lengthKm ?? typed) });
    };
    km.addEventListener("change", commit);

    const drop = html("button", { type: "button", class: "fuel-remove", text: "Remove", "aria-label": `Remove ${FUEL_NAME[item.kind]}` });
    drop.addEventListener("click", () => remove(item.id));

    return html("li", { class: "fuel-item" }, kind, km, html("span", { class: "fuel-unit", text: units }), drop);
  }

  function refresh(): void {
    if (!planner) return;
    const stations = aidStations(planner.edition);
    const plan = [...planner.plan.fueling].sort((a, b) => a.km - b.km);
    items.replaceChildren(...plan.map(itemRow));
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
