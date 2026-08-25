(function(root) {
  "use strict";

  const t = (key, substitutions) => root.PageNestI18n.message(key, substitutions);
  const element = (documentRef, id) => documentRef.getElementById(id);

  function renderState(documentRef, state, detail = "") {
    const card = element(documentRef, "welcomeState");
    const title = element(documentRef, "welcomeStateTitle");
    const description = element(documentRef, "welcomeStateDescription");
    const explanation = element(documentRef, "welcomeLocalExplanation");
    const install = element(documentRef, "welcomeInstall");
    const recheck = element(documentRef, "welcomeRecheck");
    const start = element(documentRef, "welcomeStart");
    const copy = {
      checking: ["onboardingChecking", "usuallyMoments"],
      connected: ["pageNestConnected", "onboardingConnectedDescription"],
      missing: ["onboardingAlmostReady", "onboardingMissingDescription"],
      incompatible: ["onboardingUpdateRequired", "onboardingUpdateDescription"],
      error: ["onboardingConnectionError", "onboardingConnectionErrorDescription"],
    }[state];
    card.className = `state-card ${state}`;
    title.textContent = t(copy[0]);
    description.textContent = detail || t(copy[1]);
    explanation.classList.toggle("hidden", !["missing", "incompatible", "error"].includes(state));
    install.classList.toggle("hidden", !["missing", "incompatible", "error"].includes(state));
    install.textContent = t(state === "incompatible" ? "updatePageNest" : "installPageNest");
    recheck.classList.toggle("hidden", !["missing", "incompatible", "error"].includes(state));
    start.classList.toggle("hidden", state !== "connected");
  }

  async function checkService(documentRef = root.document) {
    renderState(documentRef, "checking");
    const checked = await root.PageNestOnboarding.check();
    const detail = checked.state === "error"
      ? t({
        "untrusted-extension": "diagnosticUntrusted",
        "pairing-disabled": "diagnosticPairingDisabled",
      }[checked.diagnostic] || "diagnosticInvalid")
      : "";
    renderState(documentRef, checked.state, detail);
    return checked.state;
  }

  function initialize(documentRef = root.document) {
    root.PageNestI18n.localizeDocument(documentRef);
    element(documentRef, "welcomeInstall").onclick = () => root.PageNestOnboarding.openInstaller();
    element(documentRef, "welcomeRecheck").onclick = () => checkService(documentRef);
    element(documentRef, "welcomeStart").onclick = () => root.close();
    return checkService(documentRef);
  }

  const api = Object.freeze({checkService, initialize, renderState});
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PageNestWelcome = api;
  if (root.document && root.chrome?.runtime) initialize();
})(typeof globalThis !== "undefined" ? globalThis : this);
