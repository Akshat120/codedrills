import { AsyncLocalStorage } from "node:async_hooks";
import { MongoClient } from "mongodb";

// MongoDB connection, set up like CodeReflections. MONGODB_URI points at the
// server (MongoDB Atlas in production); locally it defaults to the Docker
// Compose mongod on port 27018 (`npm run db:up`), so it doesn't clash with
// CodeReflections' on 27017. MONGODB_DB picks the database.
const DEFAULT_LOCAL_URI = "mongodb://127.0.0.1:27018";
const DEFAULT_DB_NAME = "codedrills";

const clientOptions = {
  serverSelectionTimeoutMS: 5000,
  appName: "codedrills"
};

function databaseUri() {
  const uri = (process.env.MONGODB_URI || "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  if (uri) return { uri };
  if (process.env.CF_WORKER) {
    return { uri: DEFAULT_LOCAL_URI, error: "MONGODB_URI is not set. Add it as a Worker secret." };
  }
  return { uri: DEFAULT_LOCAL_URI };
}

function createClient() {
  const { uri, error } = databaseUri();
  try {
    return { client: new MongoClient(uri, clientOptions), uri, configError: error ?? null };
  } catch (parseError) {
    return {
      client: new MongoClient(DEFAULT_LOCAL_URI, clientOptions),
      configError: `MONGODB_URI is not a valid connection string (${parseError.message}).`
    };
  }
}

const cached = globalThis.__codeDrillsMongo ??= createClient();
const { configError } = cached;
const dbName = process.env.MONGODB_DB || DEFAULT_DB_NAME;

// Cloudflare Workers only let a connection be used by the request that opened
// it, so there each request gets its own client (runWithRequestClient, called
// by src/entry.cloudflare.js). Everywhere else one shared client is used.
const onWorkers = Boolean(process.env.CF_WORKER);
const requestScope = new AsyncLocalStorage();
const currentClient = () => (onWorkers ? requestScope.getStore()?.client : null) ?? cached.client;

function perRequest(resolve) {
  return new Proxy({}, {
    get(_target, prop) {
      const target = resolve();
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

export const client = onWorkers ? perRequest(currentClient) : cached.client;
export const db = onWorkers ? perRequest(() => currentClient().db(dbName)) : client.db(dbName);

const collection = name =>
  onWorkers ? perRequest(() => currentClient().db(dbName).collection(name)) : db.collection(name);

export const collections = {
  problems: collection("problems"),
  submissions: collection("submissions"),
  counters: collection("counters")
};

export function runWithRequestClient(res, handle) {
  if (configError) return handle();
  const requestClient = new MongoClient(cached.uri, clientOptions);
  const close = () => requestClient.close().catch(() => {});
  res.once("finish", close);
  res.once("close", close);
  return requestScope.run({ client: requestClient, ready: undefined }, handle);
}

// Every index is chosen for a query in src/repositories (see the comments
// there); `npm run db:explain` shows the plans they produce.
//
// problems (_id is the code, e.g. CD0017): listed by `number`, filtered by
// published (equality), tag or source platform (equality) and difficulty
// (range). Key order follows Equality → Sort → Range, so the sort comes from
// the index (no in-memory SORT) and the difficulty range is checked on index
// keys.
export const INDEXES = {
  problems: [
    { key: { published: 1, number: 1, difficulty: 1 }, name: "list" },
    { key: { published: 1, tags: 1, number: 1, difficulty: 1 }, name: "list_by_tag" },
    { key: { published: 1, sourcePlatform: 1, number: 1, difficulty: 1 }, name: "list_by_source" },
    { key: { published: 1, titleWords: 1 }, name: "title_word_prefix" },
    { key: { "source.id": 1 }, name: "source_id", sparse: true }
  ],
  submissions: [
    { key: { id: 1 }, name: "id", unique: true },
    { key: { createdAt: -1 }, name: "newest" },
    { key: { problemCode: 1, createdAt: -1 }, name: "by_problem_newest" }
  ]
  // counters: one document per sequence (_id "submissions"); no extra index
};

function ensureIndexes() {
  return Promise.all(Object.entries(INDEXES).map(([name, specs]) => collections[name].createIndexes(specs)));
}

// The app doesn't wait for the indexes (they exist after the first run); the
// seed script does, with { waitForIndexes: true }.
let indexesRequested = false;
export async function initDb({ waitForIndexes = false } = {}) {
  await currentClient().connect();
  if (indexesRequested && !waitForIndexes) return;
  indexesRequested = true;
  const indexes = ensureIndexes();
  if (waitForIndexes) await indexes;
  else indexes.catch(error => console.error("Could not create MongoDB indexes:", error.message));
}

function explainError(error) {
  const message = (error?.message || String(error)).replace(/\.+$/, "");
  if (/ECONNREFUSED/i.test(message) && cached.uri === DEFAULT_LOCAL_URI) {
    return `${message}. No MongoDB is running for CodeDrills: start one with \`npm run db:up\` (needs Docker), or set MONGODB_URI.`;
  }
  if (/bad auth|authentication failed/i.test(message)) {
    return `${message}. Check the username and password in MONGODB_URI.`;
  }
  if (/Server selection timed out|ETIMEDOUT|ECONNRESET|SSL|TLS/i.test(message)) {
    return `${message}. The database can't be reached; check MONGODB_URI and Atlas → Network Access.`;
  }
  return message;
}

let ready;
export function dbReady() {
  if (configError) return Promise.reject(new Error(configError));
  if (onWorkers) {
    const scope = requestScope.getStore();
    if (!scope) return Promise.reject(new Error("No database client for this request."));
    return scope.ready ??= initDb().catch(error => {
      scope.ready = undefined;
      throw new Error(explainError(error));
    });
  }
  ready ??= initDb().catch(error => {
    ready = undefined;
    throw new Error(explainError(error));
  });
  return ready;
}

// Start connecting as soon as the local server loads (not on Workers: they
// forbid network I/O outside a request).
if (!configError && !onWorkers) dbReady().catch(() => {});
