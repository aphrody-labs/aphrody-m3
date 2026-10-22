// Video player: formatting, rates and the M3 player rendered through the happy-dom harness.
import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { M3VideoPlayer, PLAYBACK_RATES, formatClock } from "../video/index.js";

describe("formatClock", () => {
  test.each([
    [0, "0:00"],
    [59.4, "0:59"],
    [61, "1:01"],
    [3725, "1:02:05"],
    [Number.NaN, "0:00"],
    [-3, "0:00"],
  ] as const)("%f → %s", (seconds, text) => {
    expect(formatClock(seconds)).toBe(text);
  });

  test("playback rates ascend and include normal speed", () => {
    expect([...PLAYBACK_RATES]).toEqual([...PLAYBACK_RATES].sort((a, b) => a - b));
    expect(PLAYBACK_RATES).toContain(1);
  });
});

describe("M3VideoPlayer", () => {
  let root: Root | undefined;
  let host: HTMLElement | undefined;
  afterEach(() => {
    flushSync(() => root?.unmount());
    host?.remove();
  });

  // Lit applies reactive properties on its own update cycle, so settle every element after each change.
  const settle = async (scope: Element) => {
    await Promise.resolve();
    await Promise.all(
      Array.from(scope.querySelectorAll("*")).map(
        node => (node as unknown as { updateComplete?: Promise<unknown> }).updateComplete,
      ),
    );
  };
  async function mount(element: React.ReactElement) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    flushSync(() => root!.render(element));
    await settle(host);
    return host;
  }
  async function press(view: Element, target: Element, init: KeyboardEventInit) {
    flushSync(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true }));
    });
    await settle(view);
  }
  // The wrapper sets Lit properties on its own cycle; data-pressed mirrors them for assertions.
  const selected = (element: Element) => element.getAttribute("data-pressed") === "true";
  const track = { src: "/a.vtt", srcLang: "fr", label: "Français" };

  test("renders a labelled, focusable group with a titled video and M3 controls", async () => {
    const view = await mount(<M3VideoPlayer src="/clip.mp4" title="Orbital" />);
    const group = view.querySelector("[role=group]")!;
    expect(group.getAttribute("aria-label")).toBe("Lecteur : Orbital");
    expect(group.getAttribute("tabindex")).toBe("0");
    expect(view.querySelector("video")!.getAttribute("aria-label")).toBe("Orbital");
    expect(view.querySelectorAll("md-icon-button").length).toBeGreaterThanOrEqual(6);
    expect(view.querySelectorAll("md-slider").length).toBe(2);
    expect(view.querySelector("md-menu")).not.toBeNull();
  });

  test("offers captions only when a track is supplied", async () => {
    const without = await mount(<M3VideoPlayer src="/clip.mp4" title="A" />);
    expect(without.querySelector("[aria-label^='Sous-titres']")).toBeNull();
    flushSync(() => root!.unmount());
    host!.remove();
    const withTrack = await mount(<M3VideoPlayer src="/clip.mp4" title="A" captions={track} />);
    expect(withTrack.querySelector("[aria-label^='Sous-titres']")).not.toBeNull();
    expect(withTrack.querySelector("track")!.getAttribute("srclang")).toBe("fr");
  });

  test("keys toggle captions and mute through the selected state, and ignore modified keys", async () => {
    const view = await mount(<M3VideoPlayer src="/clip.mp4" title="A" captions={track} />);
    const group = view.querySelector("[role=group]")!;
    const captions = view.querySelector("[aria-label^='Sous-titres']")!;
    const mute = view.querySelector("[aria-label$='le son (M)']")!;
    expect(selected(captions)).toBe(true);
    await press(view, group, { key: "c" });
    expect(selected(captions)).toBe(false);
    expect(selected(mute)).toBe(false);
    await press(view, group, { key: "m" });
    expect(selected(mute)).toBe(true);
    await press(view, group, { key: "m", ctrlKey: true });
    expect(selected(mute)).toBe(true);
  });

  test("speed keys step through the rates and announce the change", async () => {
    const view = await mount(<M3VideoPlayer src="/clip.mp4" title="A" />);
    const group = view.querySelector("[role=group]")!;
    const label = () => view.querySelector("[aria-label^='Vitesse de lecture']")!.getAttribute("aria-label");
    await press(view, group, { key: ">" });
    expect(label()).toBe("Vitesse de lecture : 1.25×");
    expect(view.querySelector("[role=status]")!.textContent).toBe("Vitesse 1.25×");
    await press(view, group, { key: "<" });
    await press(view, group, { key: "<" });
    expect(label()).toBe("Vitesse de lecture : 0.75×");
  });
});
