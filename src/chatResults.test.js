import assert from "node:assert/strict";
import { normalizeResultItems } from "./chatResults.js";

assert.deepEqual(
  normalizeResultItems([
    "已有量化指标",
    { id: "target", label: "求职目标", prompt: "请补充目标岗位和城市。", complete: false },
    null
  ]),
  ["已有量化指标", "求职目标：请补充目标岗位和城市。"]
);

console.log("chatResults tests passed");
