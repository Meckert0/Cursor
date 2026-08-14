import { afterEach, describe, expect, it, vi } from "vitest";
import {
  archiveLibraryComponent,
  createRevisionExport,
  extractApiErrorMessage,
  ingestLibraryComponents,
  listContactWireCompat,
  listLibraryReviewQueue,
  listLibraryComponents,
  updateLibraryComponent,
  updateLibraryTablePreferences,
  upsertContactWireCompat,
  deleteContactWireCompat,
  toActionableApiErrorMessage,
  transitionHarnessState
} from "./api";

describe("api client flows", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds query string for catalog list filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] })
    });
    vi.stubGlobal("fetch", fetchMock);

    await listLibraryComponents({
      q: "micro",
      category: "contact",
      family: "Micro-D",
      awg: "20",
      color: "white",
      isActive: true,
      stockStatus: "in_stock"
    });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/v1/library/components?");
    expect(url).toContain("q=micro");
    expect(url).toContain("category=contact");
    expect(url).toContain("family=Micro-D");
    expect(url).toContain("awg=20");
    expect(url).toContain("color=white");
    expect(url).toContain("isActive=true");
    expect(url).toContain("stockStatus=in_stock");
  });

  it("builds query string for review queue filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] })
    });
    vi.stubGlobal("fetch", fetchMock);

    await listLibraryReviewQueue({
      category: "contact",
      family: "Micro-D",
      enteredByUserId: "author-a"
    });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/v1/library/components/review-queue?");
    expect(url).toContain("category=contact");
    expect(url).toContain("family=Micro-D");
    expect(url).toContain("enteredByUserId=author-a");
  });

  it("surfaces API error text for workflow actions", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => "Validation pass is required before moving to submitted."
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transitionHarnessState({
        harnessId: "harness-1",
        targetState: "submitted",
        expectedCurrentState: "draft"
      })
    ).rejects.toThrow("API 409: Validation pass is required before moving to submitted.");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/v1/harnesses/harness-1/state-transitions");
  });

  it("sends export create payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "exp-1", revisionId: "rev-1", format: "json", status: "queued", createdAt: "", updatedAt: "" })
    });
    vi.stubGlobal("fetch", fetchMock);

    await createRevisionExport({ revisionId: "rev-1", format: "json" });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe("POST");
    expect(String(options.body)).toContain('"format":"json"');
  });

  it("extracts core message from API error prefix", () => {
    expect(extractApiErrorMessage("API 403: forbidden")).toBe("forbidden");
    expect(extractApiErrorMessage("plain error")).toBe("plain error");
  });

  it("maps API messages to actionable guidance", () => {
    const actionable = toActionableApiErrorMessage("API 409: Latest validation pass is required before submission.", {
      "Latest validation pass is required before submission.": "Run validation first, then submit for quote."
    });
    expect(actionable).toBe("Run validation first, then submit for quote.");
  });

  it("sends archive request for a library component", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "cmp-1" })
    });
    vi.stubGlobal("fetch", fetchMock);

    await archiveLibraryComponent("cmp-1");
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/v1/library/components/cmp-1/archive");
    expect(options.method).toBe("POST");
  });

  it("sends ingest request for quick-add wire", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: "job-1", dryRun: false, summary: { received: 1, accepted: 1, rejected: 0, committed: 1 }, results: [] })
    });
    vi.stubGlobal("fetch", fetchMock);

    await ingestLibraryComponents({
      items: [
        {
          category: "wire",
          family: "MIL-W-22759",
          partNumber: "M22759/16-22",
          description: "Quick add wire",
          isActive: true,
          stockStatus: "in_stock",
          isReviewed: false,
          attributes: { awg: "22", color: "white" }
        }
      ]
    });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/v1/library/components/ingest");
    expect(options.method).toBe("POST");
    expect(String(options.body)).toContain('"category":"wire"');
    expect(String(options.body)).toContain('"attributes":{"awg":"22","color":"white"}');
  });

  it("sends keepalive option for table-preferences save", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ scope: "admin_item_database_wire", columnOrder: ["partNumber"], columnWidths: {}, updatedAt: "" })
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateLibraryTablePreferences({
      scope: "admin_item_database_wire",
      columnOrder: ["partNumber"],
      columnWidths: {},
      keepalive: true
    });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/v1/library/table-preferences/admin_item_database_wire");
    expect(options.method).toBe("PUT");
    expect(options.keepalive).toBe(true);
  });

  it("calls contact-wire compat list/upsert/delete endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ contactPartId: "c1", wirePartId: "w1", status: "allowed" })
      })
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await listContactWireCompat();
    await upsertContactWireCompat({ contactPartId: "c1", wirePartId: "w1", status: "allowed" });
    await deleteContactWireCompat({ contactPartId: "c1", wirePartId: "w1" });

    expect(String(fetchMock.mock.calls[0][0])).toContain("/v1/library/compat/contact-wire");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/v1/library/compat/contact-wire");
    expect(String(fetchMock.mock.calls[2][0])).toContain("/v1/library/compat/contact-wire?");
    expect(String(fetchMock.mock.calls[2][0])).toContain("contactPartId=c1");
  });

  it("sends attributes in component updates", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "cmp-1" })
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateLibraryComponent({
      componentId: "cmp-1",
      attributes: { insulationMaterial: "PTFE" }
    });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(options.body)).toContain('"attributes":{"insulationMaterial":"PTFE"}');
  });
});
