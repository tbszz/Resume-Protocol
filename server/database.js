import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

export function createDatabase({ filename } = {}) {
  const resolvedFilename = filename || path.join(process.env.RESUME_PROTOCOL_DATA_DIR || path.join(root, "data"), "resume-protocol.sqlite");
  mkdirSync(path.dirname(resolvedFilename), { recursive: true });

  const db = new DatabaseSync(resolvedFilename);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);

  return {
    raw: db,

    createUser({ email, name, passwordHash }) {
      const user = {
        id: randomUUID(),
        email: normalizeEmail(email),
        name: normalizeName(name),
        passwordHash: requireString(passwordHash, "passwordHash"),
        createdAt: nowIso()
      };
      db.prepare(`
        INSERT INTO users (id, email, name, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(user.id, user.email, user.name, user.passwordHash, user.createdAt);
      return publicUser(user);
    },

    getUserByEmail(email) {
      const row = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email));
      return row ? userFromRow(row) : null;
    },

    getUserById(id) {
      const row = db.prepare("SELECT * FROM users WHERE id = ?").get(requireString(id, "userId"));
      return row ? userFromRow(row) : null;
    },

    createSession(userId, tokenHash, expiresAt) {
      const session = {
        id: randomUUID(),
        userId: requireString(userId, "userId"),
        tokenHash: requireString(tokenHash, "tokenHash"),
        expiresAt: toMillis(expiresAt, "expiresAt"),
        createdAt: Date.now()
      };
      db.prepare(`
        INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(session.id, session.userId, session.tokenHash, session.expiresAt, session.createdAt);
      return session;
    },

    getSession(tokenHash) {
      const hash = requireString(tokenHash, "tokenHash");
      const row = db.prepare(`
        SELECT
          sessions.id AS session_id,
          sessions.user_id,
          sessions.token_hash,
          sessions.expires_at,
          sessions.created_at AS session_created_at,
          users.email,
          users.name,
          users.created_at AS user_created_at
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ?
      `).get(hash);
      if (!row) return null;
      if (Number(row.expires_at) <= Date.now()) {
        db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash);
        return null;
      }
      return {
        id: row.session_id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        expiresAt: Number(row.expires_at),
        createdAt: Number(row.session_created_at),
        user: publicUser({
          id: row.user_id,
          email: row.email,
          name: row.name,
          createdAt: row.user_created_at
        })
      };
    },

    deleteSession(tokenHash) {
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(requireString(tokenHash, "tokenHash"));
    },

    listConversations(userId) {
      return db.prepare(`
        SELECT data FROM conversations
        WHERE user_id = ?
        ORDER BY updated_at DESC
      `).all(requireString(userId, "userId")).map((row) => parseJson(row.data, null)).filter(Boolean);
    },

    listProjects(userId) {
      return db.prepare('SELECT id, name, created_at AS createdAt FROM projects WHERE user_id = ? ORDER BY created_at DESC').all(requireString(userId, 'userId'));
    },

    saveProject(userId, project) {
      const owner = requireString(userId, 'userId');
      const id = project.id || randomUUID();
      assertGlobalOwner(db, 'projects', id, owner);
      db.prepare('INSERT INTO projects (id, user_id, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name').run(id, owner, requireString(project.name, 'project.name').slice(0, 100), project.createdAt || nowIso());
      return this.listProjects(owner).find(p => p.id === id);
    },

    deleteProject(userId, id) {
      db.prepare('DELETE FROM projects WHERE user_id = ? AND id = ?').run(userId, id);
    },

    getConversation(userId, id) {
      const row = db.prepare("SELECT data FROM conversations WHERE user_id = ? AND id = ?").get(requireString(userId, "userId"), requireString(id, "conversationId"));
      return row ? parseJson(row.data, null) : null;
    },

    saveConversation(userId, conversation) {
      const ownerId = requireString(userId, "userId");
      const saved = normalizeConversation(conversation);
      assertGlobalOwner(db, "conversations", saved.id, ownerId);
      db.prepare(`
        INSERT INTO conversations (id, user_id, title, data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, id) DO UPDATE SET
          title = excluded.title,
          data = excluded.data,
          updated_at = excluded.updated_at
      `).run(saved.id, ownerId, saved.title, JSON.stringify(saved), Date.parse(saved.createdAt), Date.parse(saved.updatedAt));
      return saved;
    },

    deleteConversation(userId, id) {
      db.prepare("DELETE FROM conversations WHERE user_id = ? AND id = ?").run(requireString(userId, "userId"), requireString(id, "conversationId"));
    },

    getUserState(userId) {
      const row = db.prepare("SELECT data FROM user_states WHERE user_id = ?").get(requireString(userId, "userId"));
      return row ? parseJson(row.data, {}) : {};
    },

    saveUserState(userId, state) {
      const ownerId = requireString(userId, "userId");
      const data = state && typeof state === "object" ? state : {};
      const updatedAt = Date.now();
      db.prepare(`
        INSERT INTO user_states (user_id, data, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          data = excluded.data,
          updated_at = excluded.updated_at
      `).run(ownerId, JSON.stringify(data), updatedAt);
      return data;
    },

    listDocuments(userId) {
      return db.prepare(`
        SELECT data FROM documents
        WHERE user_id = ?
        ORDER BY updated_at DESC
      `).all(requireString(userId, "userId")).map((row) => parseJson(row.data, null)).filter(Boolean);
    },

    saveDocument(userId, document) {
      const ownerId = requireString(userId, "userId");
      const saved = normalizeDocument(document);
      assertGlobalOwner(db, "documents", saved.id, ownerId);
      db.prepare(`
        INSERT INTO documents (id, user_id, name, mime_type, text, data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, id) DO UPDATE SET
          name = excluded.name,
          mime_type = excluded.mime_type,
          text = excluded.text,
          data = excluded.data,
          updated_at = excluded.updated_at
      `).run(saved.id, ownerId, saved.name, saved.mimeType, saved.text, JSON.stringify(saved), Date.parse(saved.createdAt), Date.parse(saved.updatedAt));
      return saved;
    },

    deleteDocument(userId, id) {
      db.prepare("DELETE FROM documents WHERE user_id = ? AND id = ?").run(requireString(userId, "userId"), requireString(id, "documentId"));
    },

    close() {
      db.close();
    }
  };
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, id)
    );

    CREATE TABLE IF NOT EXISTS user_states (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      text TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, id)
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
      ON conversations (user_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_documents_user_updated
      ON documents (user_id, updated_at DESC);
  `);
}

function normalizeConversation(conversation) {
  if (!conversation || typeof conversation !== "object") throw new Error("conversation must be an object");
  const timestamp = nowIso();
  return {
    id: requireString(conversation.id || randomUUID(), "conversation.id"),
    title: String(conversation.title || "Untitled conversation").slice(0, 200),
    projectId: typeof conversation.projectId === 'string' ? conversation.projectId : null,
    messages: Array.isArray(conversation.messages) ? conversation.messages : [],
    context: conversation.context && typeof conversation.context === "object" ? conversation.context : {},
    createdAt: normalizeIso(conversation.createdAt, timestamp),
    updatedAt: normalizeIso(conversation.updatedAt, timestamp)
  };
}

function normalizeDocument(document) {
  if (!document || typeof document !== "object") throw new Error("document must be an object");
  const timestamp = nowIso();
  return {
    ...document,
    id: requireString(document.id || randomUUID(), "document.id"),
    name: String(document.name || "Untitled document").slice(0, 240),
    text: String(document.text || ""),
    mimeType: String(document.mimeType || "text/plain").slice(0, 120),
    createdAt: normalizeIso(document.createdAt, timestamp),
    updatedAt: normalizeIso(document.updatedAt, timestamp)
  };
}

function assertGlobalOwner(db, table, id, userId) {
  const row = db.prepare(`SELECT user_id FROM ${table} WHERE id = ?`).get(id);
  if (row && row.user_id !== userId) {
    throw new Error("这个记录属于另一个用户。");
  }
}

function normalizeEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) throw new Error("请填写邮箱。");
  return normalized;
}

function normalizeName(name) {
  const normalized = String(name || "").trim();
  if (!normalized) throw new Error("请填写姓名。");
  return normalized.slice(0, 120);
}

function requireString(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} 不能为空。`);
  return text;
}

function normalizeIso(value, fallback) {
  const date = value ? new Date(value) : new Date(fallback);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function toMillis(value, field) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;
  throw new Error(`${field} is required`);
}

function nowIso() {
  return new Date().toISOString();
}

function userFromRow(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    createdAt: row.created_at
  };
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt
  };
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
