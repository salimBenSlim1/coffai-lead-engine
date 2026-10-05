const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_RETRIES = 2;

// Only retry on things that are plausibly transient: no response at all (network
// blip), explicit "slow down" signals, or the server's own fault (5xx). A 4xx like
// 401/404/422 means retrying is pointless — the request itself is wrong.
function isRetryable(error) {
  const status = error.response?.status;
  return !status || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function requestWithRetry(fn, retries = MAX_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryable(error)) throw error;

      const retryAfter = Number(error.response?.headers?.["retry-after"]);
      const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw lastError;
}

module.exports = { sleep, isRetryable, requestWithRetry };
