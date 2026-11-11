import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDatabaseLocation, readDatabaseLocation, subscribeDatabaseLocation, updateDatabaseLocation } from "./database-location";

describe("shared database location", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("restores the search, family and selected tab from a shared URL", () => {
    expect(parseDatabaseLocation("?q=00123&family=%20CoAX%20&databaseTab=media")).toEqual({ q: "00123", family: "coax", tab: "media" });
    expect(parseDatabaseLocation("?databaseTab=unknown")).toEqual({ q: "", family: "", tab: "items" });
  });

  it("notifies every subscriber when typing changes the shared search", () => {
    window.history.replaceState(null, "", "/admin?databaseTab=compatibility");
    const first = vi.fn(), second = vi.fn();
    const stopFirst = subscribeDatabaseLocation(first), stopSecond = subscribeDatabaseLocation(second);
    try {
      updateDatabaseLocation({ q: "00123", family: "coax", tab: "compatibility" });
      expect(parseDatabaseLocation(readDatabaseLocation())).toEqual({ q: "00123", family: "coax", tab: "compatibility" });
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      updateDatabaseLocation({ q: "00123", family: "coax", tab: "media" });
      expect(parseDatabaseLocation(readDatabaseLocation())).toEqual({ q: "00123", family: "coax", tab: "media" });
    } finally { stopFirst(); stopSecond(); }
  });

  it("clears both filters while keeping the selected tab", () => {
    window.history.replaceState(null, "", "/admin?q=old&family=old&databaseTab=media");
    updateDatabaseLocation({ q: "", family: "", tab: "media" });
    expect(readDatabaseLocation()).toBe("?databaseTab=media");
  });

  it("subscribes to back/forward navigation and removes listeners on cleanup", () => {
    const listener = vi.fn();
    const stop = subscribeDatabaseLocation(listener);
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
