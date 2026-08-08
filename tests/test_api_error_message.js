const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../extension/popup.js"), "utf8");
const start = source.indexOf("function apiErrorMessage");
const end = source.indexOf("function showResult", start);
const context = {};
vm.runInNewContext(`${source.slice(start, end)}\nthis.apiErrorMessage = apiErrorMessage;`, context);

assert.equal(context.apiErrorMessage([{msg: "Input should be valid"}], "fallback"), "Input should be valid");
assert.equal(context.apiErrorMessage({message: "服务端错误"}, "fallback"), "服务端错误");
assert.equal(context.apiErrorMessage("令牌错误", "fallback"), "令牌错误");
console.log("structured API error formatting passed");
