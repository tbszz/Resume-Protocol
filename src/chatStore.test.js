import assert from "node:assert/strict";
import {
  appendMessage,
  createChatState,
  createConversation,
  deleteConversation,
  loadChatState,
  saveChatState,
  updateConversationContext
} from "./chatStore.js";

const fixedNow = "2026-09-07T03:00:00.000Z";

{
  const conversation = createConversation({ id: "chat-1", now: fixedNow });
  assert.equal(conversation.title, "新对话");
  assert.equal(conversation.messages.length, 1);
  assert.equal(conversation.messages[0].role, "assistant");
}

{
  const state = createChatState({ id: "chat-1", now: fixedNow });
  const next = appendMessage(state, "chat-1", {
    id: "message-1",
    role: "user",
    content: "帮我针对这个前端岗位优化简历，并准备项目追问",
    createdAt: fixedNow
  });
  assert.equal(next.conversations[0].title, "帮我针对这个前端岗位优化简历");
  assert.equal(next.conversations[0].messages.at(-1).content, "帮我针对这个前端岗位优化简历，并准备项目追问");
}

{
  const state = createChatState({ id: "chat-1", now: fixedNow });
  const next = updateConversationContext(state, "chat-1", { profile: { name: "张三" }, selectedJob: { title: "前端工程师" } });
  assert.equal(next.conversations[0].context.profile.name, "张三");
  assert.equal(next.conversations[0].context.selectedJob.title, "前端工程师");
}

{
  const state = createChatState({ id: "chat-1", now: fixedNow });
  const second = createConversation({ id: "chat-2", now: "2026-09-07T04:00:00.000Z" });
  const withSecond = { ...state, activeConversationId: second.id, conversations: [second, ...state.conversations] };
  const next = deleteConversation(withSecond, "chat-2", { id: "chat-3", now: fixedNow });
  assert.equal(next.activeConversationId, "chat-1");
  assert.deepEqual(next.conversations.map((item) => item.id), ["chat-1"]);
}

{
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value)
  };
  const state = createChatState({ id: "chat-1", now: fixedNow });
  saveChatState(storage, state);
  assert.equal(loadChatState(storage).activeConversationId, "chat-1");
  memory.set("resume-protocol.chat.v1", "{broken");
  assert.equal(loadChatState(storage, { id: "fallback", now: fixedNow }).activeConversationId, "fallback");
}

console.log("chatStore tests passed");
