const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "xiaohongshu-comments.html"), "utf8");
for (const name of "ABCDEFGH") assert.ok(fixture.includes(`data-case="${name}"`));

function value(innerText = "") {
  return {innerText, textContent: innerText, querySelectorAll: () => [], cloneNode() { return value(innerText); }};
}

function avatar(src) {
  return {src, currentSrc: src, alt: "", getAttribute: name => name === "src" ? src : ""};
}

function comment({author, content, time = "", location = "", like = "", avatarUrl = "", authorTag = "", sub = false, replies = []}) {
  const fields = {
    ".author-wrapper .name": value(author),
    ".content": value(content),
    ".info .date": value(time),
    ".info .location": value(location),
    ".like-wrapper .count": value(like),
    ".author-wrapper .tag": value(authorTag),
    ".avatar img": avatarUrl ? avatar(avatarUrl) : null,
  };
  const inner = {
    querySelector: selector => fields[selector] || null,
  };
  const parentComment = {querySelectorAll: selector => selector.includes("reply-container") ? replies : []};
  return {
    classList: {contains: name => sub && name === "comment-item-sub"},
    parentElement: {closest: () => sub ? {} : null},
    closest: selector => selector === ".parent-comment" && !sub ? parentComment : null,
    querySelector: selector => selector === ":scope > .comment-inner-container" ? inner : null,
  };
}

const reply = comment({
  author: "回复者",
  content: "这是一级回复。",
  time: "08-09北京",
  location: "北京",
  authorTag: "作者",
  avatarUrl: "https://sns-avatar-qc.xhscdn.com/reply.jpg",
  sub: true,
});
const firstComment = comment({
  author: "林间读者",
  content: "普通单条评论。",
  time: "08-08上海",
  location: "上海",
  like: "12",
  avatarUrl: "https://sns-avatar-qc.xhscdn.com/avatar.jpg",
  replies: [reply],
});
const multiline = comment({author: "多行用户", content: "第一行\n😊第二行"});

const noteImage = avatar("https://sns-img-qc.xhscdn.com/note.jpg");
noteImage.naturalWidth = 1080;
noteImage.naturalHeight = 1440;
noteImage.closest = () => null;
const media = {querySelectorAll: selector => selector === "img" ? [noteImage] : []};
const title = value("脱敏笔记");
const description = value("用于测试结构化评论的脱敏正文。");
const noteRoot = {
  innerText: `${title.innerText} ${description.innerText}`,
  querySelector: selector => selector.includes("note-slider") ? media : selector === ".note-title" ? title : selector === ".note-content" ? description : null,
  querySelectorAll: selector => selector === "img" ? [noteImage] : [],
};
const created = tagName => ({
  tagName,
  children: [],
  attributes: {},
  appendChild(child) { this.children.push(child); return child; },
  append(...children) { this.children.push(...children); },
  setAttribute(name, text) { this.attributes[name] = text; },
  cloneNode() { return this; },
  querySelectorAll() { return []; },
});
const document = {
  title: "脱敏笔记",
  images: [noteImage],
  documentElement: {lang: "zh-CN"},
  createElement: created,
  querySelector: selector => selector.startsWith("#noteContainer") ? noteRoot : null,
  querySelectorAll: selector => selector.includes("comment-item") ? [firstComment, reply, multiline] : [],
};
let adapter;
const context = vm.createContext({
  URL,
  location: {hostname: "www.xiaohongshu.com", pathname: "/explore/note", href: "https://www.xiaohongshu.com/explore/note"},
  document,
  HermesExtractorCore: {
    POSITION_ATTR: "data-hermes-image-id",
    addTextElement(parent, tag, text, kind) { const child = created(tag); child.innerText = text; child.setAttribute("data-hermes-kind", kind); parent.appendChild(child); return child; },
    markImagePosition: () => "image-1",
    metadata: () => "",
    resolveImage: image => image.src || "",
    waitForContent: predicate => Promise.resolve(predicate() || predicate()),
  },
  HermesAdapters: {register: value => { adapter = value; }},
});
vm.runInContext(fs.readFileSync(path.join(root, "extension", "adapters", "xiaohongshu.js"), "utf8"), context);

(async () => {
  const result = await adapter.extract();
  assert.equal(result.comments.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.comments[0])), {
    author: "林间读者",
    avatar_url: "https://sns-avatar-qc.xhscdn.com/avatar.jpg",
    avatar_data_url: "",
    content: "普通单条评论。",
    time: "08-08",
    location: "上海",
    like_count: "12",
    is_author: false,
    replies: [{
      author: "回复者",
      avatar_url: "https://sns-avatar-qc.xhscdn.com/reply.jpg",
      avatar_data_url: "",
      content: "这是一级回复。",
      time: "08-09",
      location: "北京",
      like_count: "",
      is_author: true,
      replies: [],
    }],
  });
  assert.equal(result.comments[1].content, "第一行\n😊第二行");
  assert.equal(result.comments[1].avatar_url, "");
  assert.equal(result.element.children.some(child => child.attributes["data-hermes-kind"] === "xhs-comments"), false);
  console.log("xiaohongshu structured comments passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
