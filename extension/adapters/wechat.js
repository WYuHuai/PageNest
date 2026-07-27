HermesAdapters.registerGeneric(
  "wechat",
  ({location}) => /(^|\.)(weixin\.qq\.com|wechat\.com)$/.test(location.hostname),
);