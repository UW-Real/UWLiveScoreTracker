import AxiosInstance from "@/utils/axiosInstance";


async function getScore({ signal, onDebug, sport = "football" } = {}) {
  const paths = { football: "/score", baseball: "/score/baseball", "mens-basketball": "/score/mens-basketball", "womens-basketball": "/score/womens-basketball" };
  const path = paths[sport];
  if (!path) throw new Error("Unsupported sport");
  const started = Date.now();
  const requestedAt = new Date(started).toISOString();

  function logRequest(response, error) {
    if (process.env.NODE_ENV !== "development" || error?.code === "ERR_CANCELED") return;
    // Log only score payloads and selected response headers. Axios configs and
    // request headers contain the user's Bearer token and must stay out of logs.
    const entry = {
      requestedAt,
      method: "GET",
      url: AxiosInstance.getUri({ url: path }),
      status: response?.status ?? null,
      durationMs: Date.now() - started,
      requestId: response?.headers?.["x-score-request-id"] ?? null,
      response: response?.data ?? null,
      error: error ? response?.data?.error?.reason || "Score request failed." : null,
    };
    console.info("[Score API]", entry);
    onDebug?.(entry);
  }

  let response;
  try {
    response = await AxiosInstance.get(path, { signal });
  } catch (error) {
    logRequest(error.response, error);
    throw error;
  }
  logRequest(response);

  return response.data;
}

export { getScore };
