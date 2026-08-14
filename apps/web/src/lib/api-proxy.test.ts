import { describe, expect, it } from "vitest";
import { copyForwardableHeaders, resolveApiProxyUrl } from "./api-proxy";

describe("api proxy helpers", () => {
  it("builds the upstream URL from path segments and search", () => {
    expect(resolveApiProxyUrl(["library", "components"], "?q=micro", { API_BASE_URL: "https://api.example.com/" })).toBe(
      "https://api.example.com/v1/library/components?q=micro"
    );
  });

  it("defaults to localhost and supports the /v1 root", () => {
    expect(resolveApiProxyUrl(undefined, "", {})).toBe("http://localhost:3000/v1");
  });

  it("drops hop-by-hop headers", () => {
    const incoming = new Headers({
      cookie: "cdt_session=abc",
      host: "web.example.com",
      connection: "keep-alive",
      "content-type": "application/json"
    });
    const forwarded = copyForwardableHeaders(incoming);
    expect(forwarded.get("cookie")).toBe("cdt_session=abc");
    expect(forwarded.get("content-type")).toBe("application/json");
    expect(forwarded.get("host")).toBeNull();
    expect(forwarded.get("connection")).toBeNull();
  });
});
