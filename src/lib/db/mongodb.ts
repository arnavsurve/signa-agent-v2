import { MongoClient, Db } from "mongodb";

const DB_NAMES = {
  /** Primary database for profiles */
  primary: process.env.MONGODB_PRIMARY_DB ?? "signa-v2",
  /** Agent conversations and messages */
  agent: process.env.MONGODB_AGENT_DB ?? process.env.MONGODB_DB ?? "signa-agent",
} as const;

type DbName = keyof typeof DB_NAMES;

/**
 * Global MongoDB client singleton for serverless environments.
 * In development, we store on globalThis to persist across hot reloads.
 * In production, the module-level variable is used.
 */
const globalForMongo = globalThis as unknown as {
  mongoClient: MongoClient | undefined;
  mongoClientPromise: Promise<MongoClient> | undefined;
};

let client: MongoClient | undefined = globalForMongo.mongoClient;
let clientPromise: Promise<MongoClient> | undefined =
  globalForMongo.mongoClientPromise;

/**
 * Get or create a MongoDB client connection.
 * Uses a singleton pattern optimized for serverless environments.
 */
export async function getMongoClient(): Promise<MongoClient> {
  if (client) {
    return client;
  }

  if (!clientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI environment variable is not set");
    }

    const mongoClient = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 10000, // Close idle connections after 10s (good for serverless)
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });

    clientPromise = mongoClient.connect();

    if (process.env.NODE_ENV === "development") {
      globalForMongo.mongoClientPromise = clientPromise;
    }
  }

  client = await clientPromise;

  if (process.env.NODE_ENV === "development") {
    globalForMongo.mongoClient = client;
  }

  return client;
}

/**
 * Get a database instance by name.
 * @param name - The database name key (primary, signals, or agent)
 */
export async function getDb(name: DbName = "agent"): Promise<Db> {
  const mongoClient = await getMongoClient();
  return mongoClient.db(DB_NAMES[name]);
}

/**
 * Get the agent database (conversations, messages, metrics)
 */
export async function getAgentDb(): Promise<Db> {
  return getDb("agent");
}

/**
 * Get the primary database (profiles)
 */
export async function getPrimaryDb(): Promise<Db> {
  return getDb("primary");
}
