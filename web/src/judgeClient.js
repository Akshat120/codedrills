import { AwsClient } from "aws4fetch";

// Sends one submission to the judge and returns its verdicts, through
// Lambda's Invoke API (POST .../2015-03-31/functions/<name>/invocations).
//
// - Locally: the judge container (docker compose), whose Lambda emulator
//   answers the same API at LOCAL_JUDGE_URL. No signing.
// - On AWS: JUDGE_URL is the function's Invoke URL, e.g.
//   https://lambda.ap-south-1.amazonaws.com/2015-03-31/functions/codedrills-judge/invocations
//   Requests are signed (SigV4) with JUDGE_AWS_ACCESS_KEY_ID /
//   JUDGE_AWS_SECRET_ACCESS_KEY, the keys of an IAM user allowed only to
//   invoke that one function; JUDGE_AWS_REGION is its region.
const LOCAL_JUDGE_URL = "http://127.0.0.1:9001/2015-03-31/functions/function/invocations";
const TIMEOUT_MS = 150 * 1000; // the function's own timeout is 120 s

export function judgeConfigError() {
  if (process.env.CF_WORKER) {
    if (!process.env.JUDGE_URL) return "JUDGE_URL is not set.";
    if (!process.env.JUDGE_AWS_ACCESS_KEY_ID || !process.env.JUDGE_AWS_SECRET_ACCESS_KEY) {
      return "The judge's AWS credentials (JUDGE_AWS_ACCESS_KEY_ID / JUDGE_AWS_SECRET_ACCESS_KEY) are not set.";
    }
  }
  return null;
}

let signer = null;
function awsClient() {
  signer ??= new AwsClient({
    accessKeyId: process.env.JUDGE_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.JUDGE_AWS_SECRET_ACCESS_KEY,
    region: process.env.JUDGE_AWS_REGION || "ap-south-1",
    service: "lambda"
  });
  return signer;
}

export async function callJudge(job, { timeoutMs = TIMEOUT_MS } = {}) {
  const configError = judgeConfigError();
  if (configError) throw new Error(configError);

  const url = process.env.JUDGE_URL || LOCAL_JUDGE_URL;
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(job),
    signal: AbortSignal.timeout(timeoutMs)
  };
  const res = process.env.JUDGE_AWS_ACCESS_KEY_ID ? await awsClient().fetch(url, init) : await fetch(url, init);
  if (!res.ok) throw new Error(`The judge answered ${res.status}.`);
  // The function itself failed (crashed, timed out): Lambda answers 200 with
  // this header and the error as the body
  if (res.headers.get("x-amz-function-error")) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`The judge failed: ${body.errorType || "error"} ${body.errorMessage || ""}`.trim());
  }
  const result = await res.json();
  if (!result || typeof result.verdict !== "string") throw new Error("The judge sent an unexpected reply.");
  return result;
}

// Whether the judge answers (header signal, "Pay attention"). Remembered for a
// minute, so page views don't each wake the function.
let lastCheck = { at: 0, online: false };
export async function judgeOnline() {
  if (judgeConfigError()) return false;
  if (Date.now() - lastCheck.at < 60 * 1000) return lastCheck.online;
  let online = false;
  try {
    online = (await callJudge({ ping: true }, { timeoutMs: 8000 })).verdict === "PONG";
  } catch (_) {}
  lastCheck = { at: Date.now(), online };
  return online;
}
