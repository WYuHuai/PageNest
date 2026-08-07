globalThis.HermesAdapters = (() => {
  const adapters = [];
  const noop = () => {};
  const prepare = async () => {};

  function register(adapter) {
    if (!adapter?.name || ["detect", "extract", "validate"].some(method => typeof adapter[method] !== "function")) {
      throw new TypeError("Hermes adapter boundary is incomplete");
    }
    adapters.push(Object.freeze({
      specialized: false,
      allowFallback: true,
      isContentAcceptable: () => false,
      preparePage: prepare,
      cleanup: noop,
      ...adapter,
    }));
  }

  function registerGeneric(name, detect) {
    register({
      name,
      detect,
      extract: async () => HermesExtractorCore.findArticle(),
      validate: result => Boolean(result?.element && result.method),
    });
  }

  function select(context) {
    return adapters.find(adapter => adapter.detect(context));
  }

  return {register, registerGeneric, select, list: () => [...adapters]};
})();
