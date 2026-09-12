import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "./database.js";

function tempDir() {
  return mkdtempSync(path.join(os.tmpdir(), "resume-protocol-db-"));
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = tempDir();
  const filename = path.join(dir, "state.sqlite");
  let db;
  try {
    db = createDatabase({ filename });
    const alice = db.createUser({ email: "ALICE@example.com", name: "Alice", passwordHash: "hash-a" });
    const bob = db.createUser({ email: "bob@example.com", name: "Bob", passwordHash: "hash-b" });

    assert.equal(db.getUserByEmail("alice@EXAMPLE.com").id, alice.id);
    assert.equal(db.getUserById(bob.id).email, "bob@example.com");

    const conversation = {
      id: "conv-1",
      title: "Resume targeting",
      messages: [{ role: "user", content: "hello" }],
      context: { role: "frontend" },
      createdAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:01:00.000Z"
    };
    db.saveConversation(alice.id, conversation);
    db.saveUserState(alice.id, { profile: { name: "Alice" }, memory: ["one"] });
    db.saveDocument(alice.id, { id: "doc-1", name: "resume.txt", text: "source text", mimeType: "text/plain", parsedAt: "now" });

    db.createSession(alice.id, "token-hash", Date.now() + 60_000);
    assert.equal(db.getSession("token-hash").user.id, alice.id);
    db.close();

    db = createDatabase({ filename });
    assert.equal(indexExists(db, "idx_conversations_user_updated"), true);
    assert.equal(indexExists(db, "idx_documents_user_updated"), true);
    assert.equal(db.getConversation(alice.id, "conv-1").title, "Resume targeting");
    assert.equal(db.listConversations(alice.id).length, 1);
    assert.equal(db.getUserState(alice.id).profile.name, "Alice");
    assert.equal(db.listDocuments(alice.id)[0].text, "source text");
    assert.equal(db.getConversation(bob.id, "conv-1"), null);
    assert.equal(db.listConversations(bob.id).length, 0);
    assert.equal(db.listDocuments(bob.id).length, 0);

    assert.throws(() => db.saveConversation(bob.id, { ...conversation, title: "stolen" }), /另一个用户/);
    assert.throws(() => db.saveDocument(bob.id, { id: "doc-1", name: "copy.txt", text: "x", mimeType: "text/plain" }), /另一个用户/);

    db.deleteConversation(alice.id, "conv-1");
    db.deleteDocument(alice.id, "doc-1");
    db.deleteSession("token-hash");
    assert.equal(db.getConversation(alice.id, "conv-1"), null);
    assert.equal(db.listDocuments(alice.id).length, 0);
    assert.equal(db.getSession("token-hash"), null);
    db.close();
    db = null;
  } finally {
    db?.close();
    cleanup(dir);
  }
}

{
  const dir = tempDir();
  const filename = path.join(dir, "state.sqlite");
  let db;
  try {
    db = createDatabase({ filename });
    const user = db.createUser({ email: "expired@example.com", name: "Expired", passwordHash: "hash" });
    db.createSession(user.id, "expired-token", Date.now() - 1);
    assert.equal(db.getSession("expired-token"), null);
    db.close();
    db = null;
  } finally {
    db?.close();
    cleanup(dir);
  }
}

console.log("database tests passed");

function indexExists(database, name) {
  const row = database.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(name);
  return Boolean(row);
}
