import { judge } from "./judge.mjs";

// AWS Lambda entry point. Called two ways:
// - through the function URL (production): an HTTP-shaped event whose body is
//   the job; the URL only accepts requests signed by the Worker's IAM user
// - invoked directly (local Docker, `aws lambda invoke`): the event is the job
//
// Job: { submissionId, language, code, problem: { code, timeLimitMs, memoryLimitMb } }
// Logs only ids, verdicts and timings, never the source code.
export const handler = async event => {
  const http = event?.requestContext?.http;
  let job = event;
  if (http) {
    try {
      const body = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body;
      job = JSON.parse(body || "{}");
    } catch (_) {
      return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Invalid JSON." }) };
    }
  }

  // Health check from the web app: answers without judging anything
  if (job?.ping) return reply(http, { verdict: "PONG" });

  const started = Date.now();
  let result;
  try {
    result = await judge(job);
  } catch (error) {
    console.error("judge failed", { submissionId: job?.submissionId, error: error.message });
    result = { verdict: "IE", failedTest: null, timeMs: 0, memoryKb: 0, compileOutput: "", checkerMsg: "Internal judge error.", tests: [] };
  }
  console.log(JSON.stringify({
    submissionId: job?.submissionId,
    problem: job?.problem?.code,
    verdict: result.verdict,
    failedTest: result.failedTest,
    timeMs: result.timeMs,
    tookMs: Date.now() - started
  }));

  return reply(http, result);
};

function reply(http, result) {
  return http
    ? { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(result) }
    : result;
}
