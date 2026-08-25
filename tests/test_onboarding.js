const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "extension/core/onboarding.js"), "utf8");
const welcomeSource = fs.readFileSync(path.join(root, "extension/welcome.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension/manifest.json"), "utf8"));
const context = vm.createContext({URL});
context.globalThis = context;
vm.runInContext(source, context, {filename: "core/onboarding.js"});
const onboarding = context.PageNestOnboarding;

assert.equal(
  onboarding.COMPANION_DOWNLOAD_URL,
  "https://github.com/WYuHuai/PageNest/releases/latest/download/PageNest-Setup.exe",
);
const download = new URL(onboarding.COMPANION_DOWNLOAD_URL);
assert.equal(download.protocol, "https:");
assert.equal(download.hostname, "github.com");
assert.equal(/1\.10\.\d/.test(download.href), false);
assert.equal(download.search, "");
assert.equal(/token|key|config/i.test(download.href), false);
assert.throws(
  () => onboarding.assertSafeDownloadUrl("https://example.com/PageNest-Setup.exe"),
  /Unsafe/,
);

assert.equal(onboarding.classify({meta: {service_version: "1.10.1"}}), "connected");
assert.equal(onboarding.classify({incompatible: true}), "incompatible");
assert.equal(onboarding.classify(null, "service-unreachable"), "missing");
assert.equal(onboarding.classify(null, "untrusted-extension"), "error");
assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage", "clipboardWrite"]);
for (const forbidden of ["downloads", "nativeMessaging", "management", "tabs"]) {
  assert.equal(manifest.permissions.includes(forbidden), false);
}

function welcomeElement() {
  return {
    className: "",
    textContent: "",
    onclick: null,
    classList: {
      hidden: false,
      toggle(name, enabled) {
        if (name === "hidden") this.hidden = enabled;
      },
    },
  };
}

async function renderWelcome(state) {
  const elements = new Proxy({}, {get(target, key) { return target[key] ||= welcomeElement(); }});
  const messages = {
    onboardingChecking: "checking",
    usuallyMoments: "moment",
    pageNestConnected: "connected",
    onboardingConnectedDescription: "ready",
    onboardingAlmostReady: "almost",
    onboardingMissingDescription: "install once",
    onboardingUpdateRequired: "update",
    onboardingUpdateDescription: "old",
    onboardingConnectionError: "repair",
    onboardingConnectionErrorDescription: "repair settings",
    installPageNest: "install",
    updatePageNest: "update PageNest",
  };
  const welcomeContext = vm.createContext({
    chrome: {runtime: {}},
    document: {getElementById: id => elements[id]},
    close() {},
    PageNestI18n: {
      message: key => messages[key] || key,
      localizeDocument() {},
    },
    PageNestOnboarding: {
      check: async () => ({state, diagnostic: ""}),
      openInstaller: async () => {},
    },
  });
  welcomeContext.globalThis = welcomeContext;
  vm.runInContext(welcomeSource, welcomeContext, {filename: "welcome.js"});
  await new Promise(resolve => setImmediate(resolve));
  return elements;
}

(async () => {
  const opened = [];
  await onboarding.openInstaller({create: async options => opened.push(options)});
  assert.deepEqual(
    JSON.parse(JSON.stringify(opened)),
    [{url: onboarding.COMPANION_DOWNLOAD_URL}],
  );

  const missing = await onboarding.check({
    connect: async () => null,
    diagnostic: () => "service-unreachable",
  });
  assert.equal(missing.state, "missing");
  const connected = await onboarding.check({
    connect: async () => ({meta: {service_version: "1.10.1"}}),
    diagnostic: () => "",
  });
  assert.equal(connected.state, "connected");

  const missingWelcome = await renderWelcome("missing");
  assert.equal(missingWelcome.welcomeStateTitle.textContent, "almost");
  assert.equal(missingWelcome.welcomeInstall.classList.hidden, false);
  assert.equal(missingWelcome.welcomeRecheck.classList.hidden, false);
  assert.equal(missingWelcome.welcomeStart.classList.hidden, true);

  const connectedWelcome = await renderWelcome("connected");
  assert.equal(connectedWelcome.welcomeStateTitle.textContent, "connected");
  assert.equal(connectedWelcome.welcomeInstall.classList.hidden, true);
  assert.equal(connectedWelcome.welcomeRecheck.classList.hidden, true);
  assert.equal(connectedWelcome.welcomeStart.classList.hidden, false);

  const popup = fs.readFileSync(path.join(root, "extension/popup.html"), "utf8");
  const welcome = fs.readFileSync(path.join(root, "extension/welcome.html"), "utf8");
  for (const id of ["serviceOnboarding", "installPageNest", "recheckOnboarding", "saveWorkspace"]) {
    assert.ok(popup.includes(`id="${id}"`));
  }
  for (const id of ["welcomeState", "welcomeInstall", "welcomeRecheck", "welcomeStart"]) {
    assert.ok(welcome.includes(`id="${id}"`));
  }
  console.log("first-run onboarding contracts passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
