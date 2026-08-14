import { copyForwardableHeaders, resolveApiProxyUrl } from "@/lib/api-proxy";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function proxyV1(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
): Promise<Response> {
  const { path } = await context.params;
  const target = resolveApiProxyUrl(path, request.nextUrl.search);
  const headers = copyForwardableHeaders(request.headers);
  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const upstream = await fetch(target, {
    method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
    cache: "no-store",
    redirect: "manual"
  });

  const responseHeaders = copyForwardableHeaders(upstream.headers);
  responseHeaders.delete("content-encoding");
  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders
  });
}

export const GET = proxyV1;
export const HEAD = proxyV1;
export const POST = proxyV1;
export const PUT = proxyV1;
export const PATCH = proxyV1;
export const DELETE = proxyV1;
