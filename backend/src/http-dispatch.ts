import type { IncomingMessage, ServerResponse, RequestListener } from "node:http";

type Handler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;

/** Route before either framework consumes the body stream. */
export function createHttpDispatcher(api: Handler, web: Handler, onWebError: () => void = () => {}): RequestListener {
  return (request, response) => {
    let pathname: string;
    try { pathname = new URL(request.url ?? "/", "http://apms.invalid").pathname; }
    catch { response.writeHead(400); response.end("Bad request"); return; }
    const isApi = pathname === "/api" || pathname.startsWith("/api/") ||
      pathname === "/internal" || pathname.startsWith("/internal/");
    if (isApi) { void api(request, response); return; }
    try {
      Promise.resolve(web(request, response)).catch(() => {
        onWebError();
        if (!response.headersSent) { response.writeHead(500); response.end("Internal server error"); }
        else response.destroy();
      });
    } catch {
      onWebError();
      if (!response.headersSent) { response.writeHead(500); response.end("Internal server error"); }
      else response.destroy();
    }
  };
}
