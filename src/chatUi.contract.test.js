import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

assert.match(source, /className="chat-shell/);
assert.match(source, /className="conversation-sidebar/);
assert.match(source, /className="chat-composer/);
assert.doesNotMatch(source, /<PromiseSection\b/);
assert.doesNotMatch(source, /className="protocol-stage/);
assert.doesNotMatch(source, /id="materials"|id="jobs"|id="resume"|id="interview"/);
assert.doesNotMatch(source, /role="button"/);
assert.match(source, /className="history-delete"/);
assert.doesNotMatch(styles, /\.header-new-chat,\s*\.mobile-menu-button,\s*\.sidebar-close\s*\{/);

console.log("chat UI contract tests passed");
