import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_LIBRARY_COMPONENTS,
  STARTER_LIBRARY_ACTIVE_CATEGORIES,
  listActiveReviewedStarterComponents
} from "./library.js";
import { MemoryStore } from "../infra/store/memory-store.js";

describe("starter library catalog", () => {
  it("covers every active starter category with reviewed parts", () => {
    const active = listActiveReviewedStarterComponents();
    for (const category of STARTER_LIBRARY_ACTIVE_CATEGORIES) {
      assert.ok(
        active.some((component) => component.category === category),
        `expected an active reviewed starter part in category ${category}`
      );
    }
  });

  it("seeds modules with real pin counts and pin ids", () => {
    const modules = DEFAULT_LIBRARY_COMPONENTS.filter((component) => component.category === "module");
    assert.ok(modules.length >= 2);
    for (const module of modules) {
      assert.ok(typeof module.pinCount === "number" && module.pinCount > 0);
      assert.equal(module.pinIds?.length, module.pinCount);
      assert.equal(module.customFieldValues.pins?.split(",").length, module.pinCount);
    }
  });

  it("keeps the deprecated backshell inactive while providing active replacements", () => {
    const deprecated = DEFAULT_LIBRARY_COMPONENTS.find((component) => component.id === "cmp-backshell-001");
    assert.ok(deprecated);
    assert.equal(deprecated.isActive, false);
    assert.ok(
      listActiveReviewedStarterComponents().some((component) => component.category === "backshell")
    );
  });

  it("loads the starter catalog into a fresh memory store", async () => {
    const store = new MemoryStore();
    await store.ensureDefaultLibrarySeeded();
    const components = await store.listLibraryComponents({
      requestingUserId: "user-a",
      canViewAllUnreviewed: false,
      canViewInactive: false
    });
    for (const category of STARTER_LIBRARY_ACTIVE_CATEGORIES) {
      assert.ok(
        components.some((component) => component.category === category && component.isActive && component.isReviewed),
        `memory store missing active reviewed ${category}`
      );
    }
  });

  it("backfills missing starter parts into an existing memory store state", async () => {
    const empty = new MemoryStore();
    const state = empty.exportState();
    state.libraryComponents = state.libraryComponents.filter((component) => component.id === "cmp-backshell-001");
    const restored = MemoryStore.fromState(state);
    await restored.ensureDefaultLibrarySeeded();
    const components = await restored.listLibraryComponents({
      requestingUserId: "user-a",
      canViewAllUnreviewed: false,
      canViewInactive: false
    });
    assert.ok(components.some((component) => component.id === "cmp-module-001"));
    assert.ok(components.some((component) => component.id === "cmp-wire-001"));
    assert.ok(components.some((component) => component.id === "cmp-sr-15"));
  });
});
