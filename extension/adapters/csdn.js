HermesAdapters.registerGeneric(
  "csdn",
  ({location}) => /(^|\.)csdn\.net$/.test(location.hostname),
);