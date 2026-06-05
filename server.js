import http from "node:http";
import {handleFetch} from "./app";

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

function requestUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const hostHeader = req.headers["x-forwarded-host"] || req.headers.host || `${host}:${port}`;
  return `${proto}://${hostHeader}${req.url || "/"}`;
}

function requestBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  return req;
}

function writeResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  return response.arrayBuffer().then(buffer => {
    res.end(Buffer.from(buffer));
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const request = new Request(requestUrl(req), {
      method: req.method,
      headers: req.headers,
      body: requestBody(req)
    });
    const response = await handleFetch(request);
    await writeResponse(res, response);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
});

server.listen(port, host, () => {
  console.log(`PT-Gen server listening on http://${host}:${port}`);
});
