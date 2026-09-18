// PROTOTYPE — throwaway. Three structurally different answers to "what is the first screen?".
// Each builds its own layout from the shared pieces; none shares a layout with another.
import { formatElapsed } from "../format";
import { html } from "../svg";
import { type Player, everythingLink, layerChips, layerLine, model, photorealButton, playButton, seekStrip, sentenceNode } from "./shared";

export interface Variant {
  key: string;
  name: string;
  pitch: string;
  mount(stage: HTMLElement, player: Player): void;
}

function live(player: Player, paint: () => void): void {
  player.onChange(paint);
  paint();
}

/** A — the model is the whole screen; everything else is laid over its edges like a film's titles. */
const cinema: Variant = {
  key: "A",
  name: "Cinema",
  pitch: "The street fills the screen. Kilometre top left, clock top right, one sentence as a subtitle, and the course as the seek bar.",
  mount(stage, player) {
    const km = html("div", { class: "ppa-km" });
    const clock = html("div", { class: "ppa-clock" });
    const subtitle = html("div", { class: "ppa-subtitle" });
    stage.append(
      html(
        "div",
        { class: "ppa" },
        html("div", { class: "ppa-stage" }, model(player, { acrossM: 150, aheadM: 190, behindM: 70 }), km, clock, subtitle, html("div", { class: "ppa-corner" }, photorealButton())),
        html("div", { class: "ppa-bar" }, playButton(player), html("div", { class: "ppa-bar__strip" }, seekStrip(player)), html("div", { class: "ppa-bar__side" }, everythingLink(player))),
        html("div", { class: "ppa-layers" }, layerChips(player), layerLine(player)),
      ),
    );
    live(player, () => {
      const readout = player.story.at(player.km);
      km.replaceChildren(html("b", { text: readout.km.toFixed(1) }), html("span", { text: " km" }));
      clock.replaceChildren(html("b", { text: readout.clock }), html("span", { text: ` ${readout.zoneLabel} · ${formatElapsed(readout.elapsedSeconds)} in` }));
      subtitle.replaceChildren(sentenceNode(player.story, readout));
    });
  },
};

/** B — the poster, cut down: the giant numeral and a chapter list on the left, the street on the right. */
const split: Variant = {
  key: "B",
  name: "Poster, cut down",
  pitch: "Keeps the poster's giant numeral and grid, but only three things beside it: the time, one sentence, and the list of places that matter.",
  mount(stage, player) {
    const numeral = html("div", { class: "ppb-numeral" });
    const clock = html("div", { class: "ppb-clock" });
    const say = html("div", { class: "ppb-say" });
    const list = html("ol", { class: "ppb-chapters" });
    const items = player.chapters.map((chapter) => {
      const button = html("button", { type: "button" }, html("b", { text: chapter.title }), html("span", { text: `km ${chapter.km.toFixed(1)}` }));
      button.addEventListener("click", () => player.seek(chapter.km));
      const item = html("li", {}, button);
      list.append(item);
      return item;
    });
    stage.append(
      html(
        "div",
        { class: "ppb" },
        html("header", { class: "ppb-banner" }, html("h1", { text: player.story.course.name }), photorealButton(), everythingLink(player)),
        html("div", { class: "ppb-left" }, numeral, clock, say, html("h2", { text: "The places that matter" }), list),
        html("div", { class: "ppb-right" }, model(player), html("div", { class: "ppb-transport" }, playButton(player), seekStrip(player)), layerChips(player), layerLine(player)),
      ),
    );
    live(player, () => {
      const readout = player.story.at(player.km);
      const [whole, part] = readout.km.toFixed(1).split(".");
      numeral.replaceChildren(html("b", { text: whole }), html("span", { text: `.${part}` }), html("i", { text: "km" }));
      clock.replaceChildren(html("b", { text: readout.clock }), ` ${readout.zoneLabel}, ${formatElapsed(readout.elapsedSeconds)} into your race`);
      say.replaceChildren(sentenceNode(player.story, readout));
      const current = player.chapterIndex();
      items.forEach((item, index) => item.toggleAttribute("data-current", index === current));
      if (player.playing) items[current]?.scrollIntoView({ block: "nearest" });
    });
  },
};

/** C — no free scrubbing up front: the course as a dozen stops, with big Back and Next buttons. */
const tour: Variant = {
  key: "C",
  name: "Guided tour",
  pitch: "The course as a series of stops. Next rides you to the following one and pauses. Nothing to learn; the full strip is there but small.",
  mount(stage, player) {
    const count = html("p", { class: "ppc-count" });
    const title = html("h1", { class: "ppc-title" });
    const facts = html("p", { class: "ppc-facts" });
    const say = html("div", { class: "ppc-say" });
    const back = html("button", { class: "ppc-nav", type: "button", text: "Back" });
    const next = html("button", { class: "ppc-nav ppc-nav--next", type: "button", text: "Ride to the next stop" });
    back.addEventListener("click", () => player.seek(player.chapters[Math.max(0, player.chapterIndex() - (atStop() ? 1 : 0))].km));
    next.addEventListener("click", () => player.rideToNext());
    const atStop = () => Math.abs(player.chapters[player.chapterIndex()].km - player.km) < 0.06;

    stage.append(
      html(
        "div",
        { class: "ppc" },
        html("div", { class: "ppc-text" }, count, title, facts, say, html("div", { class: "ppc-navrow" }, back, next), layerChips(player), layerLine(player)),
        html("div", { class: "ppc-view" }, model(player), html("div", { class: "ppc-corner" }, photorealButton(), everythingLink(player))),
        html("div", { class: "ppc-strip" }, seekStrip(player, { numbered: true })),
      ),
    );
    live(player, () => {
      const readout = player.story.at(player.km);
      const index = player.chapterIndex();
      const upcoming = player.chapters[index + 1];
      count.textContent = atStop() ? `Stop ${index + 1} of ${player.chapters.length}` : upcoming ? `On the way to stop ${index + 2} of ${player.chapters.length}` : "To the finish";
      title.textContent = atStop() ? player.chapters[index].title : (upcoming?.title ?? "Finish");
      facts.replaceChildren(html("b", { text: `km ${readout.km.toFixed(1)}` }), ` · ${readout.clock} ${readout.zoneLabel} · ${formatElapsed(readout.elapsedSeconds)} into your race`);
      say.replaceChildren(sentenceNode(player.story, readout));
      next.disabled = !upcoming && atStop();
      next.textContent = player.playing ? "Riding…" : "Ride to the next stop";
    });
  },
};

export const VARIANTS: Variant[] = [cinema, split, tour];
