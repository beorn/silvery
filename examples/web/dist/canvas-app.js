
// Polyfill Symbol.dispose for Safari and older browsers that lack
// TC39 Explicit Resource Management. Bun's __using helper uses a
// polyfilled __dispose, but property definitions like [Symbol.dispose]
// need the global symbol to exist.
Symbol.dispose ??= Symbol.for("Symbol.dispose");
Symbol.asyncDispose ??= Symbol.for("Symbol.asyncDispose");
if (typeof globalThis.process === "undefined") {
  globalThis.process = {
    env: { NODE_ENV: "production" },
    stdout: { write() {}, columns: 80, rows: 24, isTTY: false },
    stdin: { isTTY: false, setRawMode() {}, on() {}, resume() {} },
    stderr: { write() {} },
    emit() {},
    on() {},
    platform: "browser",
  };
}
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __promiseAll = (args) => Promise.all(args);
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined")
    return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __dispose = Symbol.dispose || /* @__PURE__ */ Symbol.for("Symbol.dispose");
var __asyncDispose = Symbol.asyncDispose || /* @__PURE__ */ Symbol.for("Symbol.asyncDispose");
var __using = (stack, value, async) => {
  if (value != null) {
    if (typeof value !== "object" && typeof value !== "function")
      throw TypeError('Object expected to be assigned to "using" declaration');
    var dispose;
    if (async)
      dispose = value[__asyncDispose];
    if (dispose === undefined)
      dispose = value[__dispose];
    if (typeof dispose !== "function")
      throw TypeError("Object not disposable");
    stack.push([async, dispose, value]);
  } else if (async) {
    stack.push([async]);
  }
  return value;
};
var __callDispose = (stack, error, hasError) => {
  var E = typeof SuppressedError === "function" ? SuppressedError : function(e, s, m, _) {
    return _ = Error(m), _.name = "SuppressedError", _.error = e, _.suppressed = s, _;
  }, fail = (e) => error = hasError ? new E(e, error, "An error was suppressed during disposal") : (hasError = true, e), next = (it) => {
    while (it = stack.pop()) {
      try {
        var result = it[1] && it[1].call(it[2]);
        if (it[0])
          return Promise.resolve(result).then(next, (e) => (fail(e), next()));
      } catch (e) {
        fail(e);
      }
    }
    if (hasError)
      throw error;
  };
  return next();
};

// ../flexily/src/constants.ts
var FLEX_DIRECTION_COLUMN = 0, FLEX_DIRECTION_COLUMN_REVERSE = 1, FLEX_DIRECTION_ROW = 2, FLEX_DIRECTION_ROW_REVERSE = 3, WRAP_NO_WRAP = 0, WRAP_WRAP = 1, WRAP_WRAP_REVERSE = 2, ALIGN_AUTO = 0, ALIGN_FLEX_START = 1, ALIGN_CENTER = 2, ALIGN_FLEX_END = 3, ALIGN_STRETCH = 4, ALIGN_BASELINE = 5, ALIGN_SPACE_BETWEEN = 6, ALIGN_SPACE_AROUND = 7, ALIGN_SPACE_EVENLY = 8, JUSTIFY_FLEX_START = 0, JUSTIFY_CENTER = 1, JUSTIFY_FLEX_END = 2, JUSTIFY_SPACE_BETWEEN = 3, JUSTIFY_SPACE_AROUND = 4, JUSTIFY_SPACE_EVENLY = 5, EDGE_LEFT = 0, EDGE_TOP = 1, EDGE_RIGHT = 2, EDGE_BOTTOM = 3, EDGE_START = 4, EDGE_END = 5, EDGE_HORIZONTAL = 6, EDGE_VERTICAL = 7, EDGE_ALL = 8, GUTTER_COLUMN = 0, GUTTER_ROW = 1, GUTTER_ALL = 2, DISPLAY_FLEX = 0, DISPLAY_NONE = 1, POSITION_TYPE_STATIC = 0, POSITION_TYPE_RELATIVE = 1, POSITION_TYPE_ABSOLUTE = 2, OVERFLOW_VISIBLE = 0, OVERFLOW_HIDDEN = 1, OVERFLOW_SCROLL = 2, DIRECTION_LTR = 1, DIRECTION_RTL = 2, MEASURE_MODE_UNDEFINED = 0, MEASURE_MODE_EXACTLY = 1, MEASURE_MODE_AT_MOST = 2, UNIT_UNDEFINED = 0, UNIT_POINT = 1, UNIT_PERCENT = 2, UNIT_AUTO = 3;

// ../flexily/src/utils.ts
function setEdgeValue(arr, edge, value, unit) {
  const v = { value, unit };
  switch (edge) {
    case EDGE_LEFT:
      arr[0] = v;
      break;
    case EDGE_TOP:
      arr[1] = v;
      break;
    case EDGE_RIGHT:
      arr[2] = v;
      break;
    case EDGE_BOTTOM:
      arr[3] = v;
      break;
    case EDGE_HORIZONTAL:
      arr[0] = v;
      arr[2] = v;
      break;
    case EDGE_VERTICAL:
      arr[1] = v;
      arr[3] = v;
      break;
    case EDGE_ALL:
      arr[0] = v;
      arr[1] = v;
      arr[2] = v;
      arr[3] = v;
      break;
    case EDGE_START:
      arr[4] = v;
      break;
    case EDGE_END:
      arr[5] = v;
      break;
  }
}
function setEdgeBorder(arr, edge, value) {
  switch (edge) {
    case EDGE_LEFT:
      arr[0] = value;
      break;
    case EDGE_TOP:
      arr[1] = value;
      break;
    case EDGE_RIGHT:
      arr[2] = value;
      break;
    case EDGE_BOTTOM:
      arr[3] = value;
      break;
    case EDGE_HORIZONTAL:
      arr[0] = value;
      arr[2] = value;
      break;
    case EDGE_VERTICAL:
      arr[1] = value;
      arr[3] = value;
      break;
    case EDGE_ALL:
      arr[0] = value;
      arr[1] = value;
      arr[2] = value;
      arr[3] = value;
      break;
    case EDGE_START:
      arr[4] = value;
      break;
    case EDGE_END:
      arr[5] = value;
      break;
  }
}
function getEdgeValue(arr, edge) {
  switch (edge) {
    case EDGE_LEFT:
      return arr[0];
    case EDGE_TOP:
      return arr[1];
    case EDGE_RIGHT:
      return arr[2];
    case EDGE_BOTTOM:
      return arr[3];
    case EDGE_START:
      return arr[4];
    case EDGE_END:
      return arr[5];
    default:
      return arr[0];
  }
}
function getEdgeBorderValue(arr, edge) {
  switch (edge) {
    case EDGE_LEFT:
      return arr[0];
    case EDGE_TOP:
      return arr[1];
    case EDGE_RIGHT:
      return arr[2];
    case EDGE_BOTTOM:
      return arr[3];
    case EDGE_START:
      return arr[4];
    case EDGE_END:
      return arr[5];
    default:
      return arr[0];
  }
}
function resolveValue(value, availableSize) {
  switch (value.unit) {
    case UNIT_POINT:
      return value.value;
    case UNIT_PERCENT:
      if (Number.isNaN(availableSize)) {
        return 0;
      }
      return availableSize * (value.value / 100);
    default:
      return 0;
  }
}
function applyMinMax(size, min, max, available) {
  let result = size;
  if (max.unit !== UNIT_UNDEFINED) {
    if (max.unit === UNIT_PERCENT && Number.isNaN(available)) {} else {
      const maxValue = resolveValue(max, available);
      if (!Number.isNaN(maxValue)) {
        if (Number.isNaN(result)) {
          if (maxValue !== Infinity) {
            result = maxValue;
          }
        } else {
          result = Math.min(result, maxValue);
        }
      }
    }
  }
  if (min.unit !== UNIT_UNDEFINED) {
    if (min.unit === UNIT_PERCENT && Number.isNaN(available)) {} else {
      const minValue = resolveValue(min, available);
      if (!Number.isNaN(minValue)) {
        if (!Number.isNaN(result)) {
          result = Math.max(result, minValue);
        }
      }
    }
  }
  return result;
}
var traversalStack;
var init_utils = __esm(() => {
  traversalStack = [];
});

// ../../node_modules/.bun/ms@2.1.3/node_modules/ms/index.js
var require_ms = __commonJS((exports, module) => {
  var s = 1000;
  var m = s * 60;
  var h = m * 60;
  var d = h * 24;
  var w = d * 7;
  var y = d * 365.25;
  module.exports = function(val, options) {
    options = options || {};
    var type = typeof val;
    if (type === "string" && val.length > 0) {
      return parse(val);
    } else if (type === "number" && isFinite(val)) {
      return options.long ? fmtLong(val) : fmtShort(val);
    }
    throw new Error("val is not a non-empty string or a valid number. val=" + JSON.stringify(val));
  };
  function parse(str) {
    str = String(str);
    if (str.length > 100) {
      return;
    }
    var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(str);
    if (!match) {
      return;
    }
    var n = parseFloat(match[1]);
    var type = (match[2] || "ms").toLowerCase();
    switch (type) {
      case "years":
      case "year":
      case "yrs":
      case "yr":
      case "y":
        return n * y;
      case "weeks":
      case "week":
      case "w":
        return n * w;
      case "days":
      case "day":
      case "d":
        return n * d;
      case "hours":
      case "hour":
      case "hrs":
      case "hr":
      case "h":
        return n * h;
      case "minutes":
      case "minute":
      case "mins":
      case "min":
      case "m":
        return n * m;
      case "seconds":
      case "second":
      case "secs":
      case "sec":
      case "s":
        return n * s;
      case "milliseconds":
      case "millisecond":
      case "msecs":
      case "msec":
      case "ms":
        return n;
      default:
        return;
    }
  }
  function fmtShort(ms) {
    var msAbs = Math.abs(ms);
    if (msAbs >= d) {
      return Math.round(ms / d) + "d";
    }
    if (msAbs >= h) {
      return Math.round(ms / h) + "h";
    }
    if (msAbs >= m) {
      return Math.round(ms / m) + "m";
    }
    if (msAbs >= s) {
      return Math.round(ms / s) + "s";
    }
    return ms + "ms";
  }
  function fmtLong(ms) {
    var msAbs = Math.abs(ms);
    if (msAbs >= d) {
      return plural(ms, msAbs, d, "day");
    }
    if (msAbs >= h) {
      return plural(ms, msAbs, h, "hour");
    }
    if (msAbs >= m) {
      return plural(ms, msAbs, m, "minute");
    }
    if (msAbs >= s) {
      return plural(ms, msAbs, s, "second");
    }
    return ms + " ms";
  }
  function plural(ms, msAbs, n, name) {
    var isPlural = msAbs >= n * 1.5;
    return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
  }
});

// ../../node_modules/.bun/debug@4.4.3/node_modules/debug/src/common.js
var require_common = __commonJS((exports, module) => {
  function setup(env) {
    createDebug.debug = createDebug;
    createDebug.default = createDebug;
    createDebug.coerce = coerce;
    createDebug.disable = disable;
    createDebug.enable = enable;
    createDebug.enabled = enabled;
    createDebug.humanize = require_ms();
    createDebug.destroy = destroy;
    Object.keys(env).forEach((key) => {
      createDebug[key] = env[key];
    });
    createDebug.names = [];
    createDebug.skips = [];
    createDebug.formatters = {};
    function selectColor(namespace) {
      let hash = 0;
      for (let i = 0;i < namespace.length; i++) {
        hash = (hash << 5) - hash + namespace.charCodeAt(i);
        hash |= 0;
      }
      return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
    }
    createDebug.selectColor = selectColor;
    function createDebug(namespace) {
      let prevTime;
      let enableOverride = null;
      let namespacesCache;
      let enabledCache;
      function debug(...args) {
        if (!debug.enabled) {
          return;
        }
        const self = debug;
        const curr = Number(new Date);
        const ms = curr - (prevTime || curr);
        self.diff = ms;
        self.prev = prevTime;
        self.curr = curr;
        prevTime = curr;
        args[0] = createDebug.coerce(args[0]);
        if (typeof args[0] !== "string") {
          args.unshift("%O");
        }
        let index = 0;
        args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
          if (match === "%%") {
            return "%";
          }
          index++;
          const formatter = createDebug.formatters[format];
          if (typeof formatter === "function") {
            const val = args[index];
            match = formatter.call(self, val);
            args.splice(index, 1);
            index--;
          }
          return match;
        });
        createDebug.formatArgs.call(self, args);
        const logFn = self.log || createDebug.log;
        logFn.apply(self, args);
      }
      debug.namespace = namespace;
      debug.useColors = createDebug.useColors();
      debug.color = createDebug.selectColor(namespace);
      debug.extend = extend;
      debug.destroy = createDebug.destroy;
      Object.defineProperty(debug, "enabled", {
        enumerable: true,
        configurable: false,
        get: () => {
          if (enableOverride !== null) {
            return enableOverride;
          }
          if (namespacesCache !== createDebug.namespaces) {
            namespacesCache = createDebug.namespaces;
            enabledCache = createDebug.enabled(namespace);
          }
          return enabledCache;
        },
        set: (v) => {
          enableOverride = v;
        }
      });
      if (typeof createDebug.init === "function") {
        createDebug.init(debug);
      }
      return debug;
    }
    function extend(namespace, delimiter) {
      const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
      newDebug.log = this.log;
      return newDebug;
    }
    function enable(namespaces) {
      createDebug.save(namespaces);
      createDebug.namespaces = namespaces;
      createDebug.names = [];
      createDebug.skips = [];
      const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
      for (const ns of split) {
        if (ns[0] === "-") {
          createDebug.skips.push(ns.slice(1));
        } else {
          createDebug.names.push(ns);
        }
      }
    }
    function matchesTemplate(search, template) {
      let searchIndex = 0;
      let templateIndex = 0;
      let starIndex = -1;
      let matchIndex = 0;
      while (searchIndex < search.length) {
        if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) {
          if (template[templateIndex] === "*") {
            starIndex = templateIndex;
            matchIndex = searchIndex;
            templateIndex++;
          } else {
            searchIndex++;
            templateIndex++;
          }
        } else if (starIndex !== -1) {
          templateIndex = starIndex + 1;
          matchIndex++;
          searchIndex = matchIndex;
        } else {
          return false;
        }
      }
      while (templateIndex < template.length && template[templateIndex] === "*") {
        templateIndex++;
      }
      return templateIndex === template.length;
    }
    function disable() {
      const namespaces = [
        ...createDebug.names,
        ...createDebug.skips.map((namespace) => "-" + namespace)
      ].join(",");
      createDebug.enable("");
      return namespaces;
    }
    function enabled(name) {
      for (const skip of createDebug.skips) {
        if (matchesTemplate(name, skip)) {
          return false;
        }
      }
      for (const ns of createDebug.names) {
        if (matchesTemplate(name, ns)) {
          return true;
        }
      }
      return false;
    }
    function coerce(val) {
      if (val instanceof Error) {
        return val.stack || val.message;
      }
      return val;
    }
    function destroy() {
      console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
    }
    createDebug.enable(createDebug.load());
    return createDebug;
  }
  module.exports = setup;
});

// ../../node_modules/.bun/debug@4.4.3/node_modules/debug/src/browser.js
var require_browser = __commonJS((exports, module) => {
  exports.formatArgs = formatArgs;
  exports.save = save;
  exports.load = load;
  exports.useColors = useColors;
  exports.storage = localstorage();
  exports.destroy = (() => {
    let warned = false;
    return () => {
      if (!warned) {
        warned = true;
        console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
      }
    };
  })();
  exports.colors = [
    "#0000CC",
    "#0000FF",
    "#0033CC",
    "#0033FF",
    "#0066CC",
    "#0066FF",
    "#0099CC",
    "#0099FF",
    "#00CC00",
    "#00CC33",
    "#00CC66",
    "#00CC99",
    "#00CCCC",
    "#00CCFF",
    "#3300CC",
    "#3300FF",
    "#3333CC",
    "#3333FF",
    "#3366CC",
    "#3366FF",
    "#3399CC",
    "#3399FF",
    "#33CC00",
    "#33CC33",
    "#33CC66",
    "#33CC99",
    "#33CCCC",
    "#33CCFF",
    "#6600CC",
    "#6600FF",
    "#6633CC",
    "#6633FF",
    "#66CC00",
    "#66CC33",
    "#9900CC",
    "#9900FF",
    "#9933CC",
    "#9933FF",
    "#99CC00",
    "#99CC33",
    "#CC0000",
    "#CC0033",
    "#CC0066",
    "#CC0099",
    "#CC00CC",
    "#CC00FF",
    "#CC3300",
    "#CC3333",
    "#CC3366",
    "#CC3399",
    "#CC33CC",
    "#CC33FF",
    "#CC6600",
    "#CC6633",
    "#CC9900",
    "#CC9933",
    "#CCCC00",
    "#CCCC33",
    "#FF0000",
    "#FF0033",
    "#FF0066",
    "#FF0099",
    "#FF00CC",
    "#FF00FF",
    "#FF3300",
    "#FF3333",
    "#FF3366",
    "#FF3399",
    "#FF33CC",
    "#FF33FF",
    "#FF6600",
    "#FF6633",
    "#FF9900",
    "#FF9933",
    "#FFCC00",
    "#FFCC33"
  ];
  function useColors() {
    if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) {
      return true;
    }
    if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
      return false;
    }
    let m;
    return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
  }
  function formatArgs(args) {
    args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
    if (!this.useColors) {
      return;
    }
    const c = "color: " + this.color;
    args.splice(1, 0, c, "color: inherit");
    let index = 0;
    let lastC = 0;
    args[0].replace(/%[a-zA-Z%]/g, (match) => {
      if (match === "%%") {
        return;
      }
      index++;
      if (match === "%c") {
        lastC = index;
      }
    });
    args.splice(lastC, 0, c);
  }
  exports.log = console.debug || console.log || (() => {});
  function save(namespaces) {
    try {
      if (namespaces) {
        exports.storage.setItem("debug", namespaces);
      } else {
        exports.storage.removeItem("debug");
      }
    } catch (error) {}
  }
  function load() {
    let r;
    try {
      r = exports.storage.getItem("debug") || exports.storage.getItem("DEBUG");
    } catch (error) {}
    if (!r && typeof process !== "undefined" && "env" in process) {
      r = undefined;
    }
    return r;
  }
  function localstorage() {
    try {
      return localStorage;
    } catch (error) {}
  }
  module.exports = require_common()(exports);
  var { formatters } = module.exports;
  formatters.j = function(v) {
    try {
      return JSON.stringify(v);
    } catch (error) {
      return "[UnexpectedJSONParseError]: " + error.message;
    }
  };
});

// ../loggily/src/colors.ts
function wrap(open, close) {
  if (!enabled)
    return (str) => str;
  return (str) => open + str + close;
}
var _process, enabled, colors;
var init_colors = __esm(() => {
  _process = typeof process !== "undefined" ? process : undefined;
  enabled = _process?.env?.["FORCE_COLOR"] !== undefined && _process?.env?.["FORCE_COLOR"] !== "0" ? true : _process?.env?.["NO_COLOR"] !== undefined ? false : _process?.stdout?.isTTY ?? false;
  colors = {
    dim: wrap("\x1B[2m", "\x1B[22m"),
    blue: wrap("\x1B[34m", "\x1B[39m"),
    yellow: wrap("\x1B[33m", "\x1B[39m"),
    red: wrap("\x1B[31m", "\x1B[39m"),
    magenta: wrap("\x1B[35m", "\x1B[39m"),
    cyan: wrap("\x1B[36m", "\x1B[39m")
  };
});

// ../loggily/src/tracing.ts
function setIdFormat(format) {
  currentIdFormat = format;
}
function getIdFormat() {
  return currentIdFormat;
}
function randomHex(bytes) {
  const uuid = crypto.randomUUID().replace(/-/g, "");
  return uuid.slice(0, bytes * 2);
}
function generateSpanId() {
  if (currentIdFormat === "w3c") {
    return randomHex(8);
  }
  return `sp_${(++simpleSpanCounter).toString(36)}`;
}
function generateTraceId() {
  if (currentIdFormat === "w3c") {
    return randomHex(16);
  }
  return `tr_${(++simpleTraceCounter).toString(36)}`;
}
function resetIdCounters() {
  simpleSpanCounter = 0;
  simpleTraceCounter = 0;
}
function traceparent(spanData, options) {
  const traceId = padHex(spanData.traceId, 32);
  const spanId = padHex(spanData.id, 16);
  const flags = options?.sampled ?? true ? "01" : "00";
  return `00-${traceId}-${spanId}-${flags}`;
}
function padHex(id, length) {
  if (id.length === length && /^[0-9a-f]+$/.test(id)) {
    return id;
  }
  let hex = "";
  for (let i = 0;i < id.length; i++) {
    hex += id.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex.padStart(length, "0").slice(-length);
}
function setSampleRate(rate) {
  if (rate < 0 || rate > 1) {
    throw new Error(`Sample rate must be between 0.0 and 1.0, got ${rate}`);
  }
  sampleRate = rate;
}
function getSampleRate() {
  return sampleRate;
}
function shouldSample() {
  if (sampleRate >= 1)
    return true;
  if (sampleRate <= 0)
    return false;
  return Math.random() < sampleRate;
}
var currentIdFormat = "simple", simpleSpanCounter = 0, simpleTraceCounter = 0, sampleRate = 1;

// ../loggily/src/core.ts
function getEnv(key) {
  return _process2?.env?.[key];
}
function writeStderr(text) {
  if (_process2?.stderr?.write) {
    _process2.stderr.write(text + `
`);
  } else {
    console.error(text);
  }
}
function addWriter(writer) {
  writers.push(writer);
  return () => {
    const idx = writers.indexOf(writer);
    if (idx !== -1)
      writers.splice(idx, 1);
  };
}
function setSuppressConsole(value) {
  suppressConsole = value;
}
function setOutputMode(mode) {
  outputMode = mode;
}
function getOutputMode() {
  return outputMode;
}
function parseNamespaceFilter(input) {
  const includeList = [];
  const excludeList = [];
  for (const part of input) {
    if (part.startsWith("-")) {
      excludeList.push(part.slice(1));
    } else {
      includeList.push(part);
    }
  }
  return {
    includes: includeList.length > 0 ? new Set(includeList) : null,
    excludes: excludeList.length > 0 ? new Set(excludeList) : null
  };
}
function setLogLevel(level) {
  currentLogLevel = level;
}
function getLogLevel() {
  return currentLogLevel;
}
function enableSpans() {
  spansEnabled = true;
}
function disableSpans() {
  spansEnabled = false;
}
function spansAreEnabled() {
  return spansEnabled;
}
function setTraceFilter(namespaces) {
  if (namespaces === null || namespaces.length === 0) {
    traceFilter = null;
  } else {
    traceFilter = new Set(namespaces);
    spansEnabled = true;
  }
}
function getTraceFilter() {
  return traceFilter ? [...traceFilter] : null;
}
function setDebugFilter(namespaces) {
  if (namespaces === null || namespaces.length === 0) {
    debugIncludes = null;
    debugExcludes = null;
  } else {
    const parsed = parseNamespaceFilter(namespaces);
    debugIncludes = parsed.includes;
    debugExcludes = parsed.excludes;
    if (LOG_LEVEL_PRIORITY[currentLogLevel] > LOG_LEVEL_PRIORITY.debug) {
      currentLogLevel = "debug";
    }
  }
}
function getDebugFilter() {
  if (!debugIncludes && !debugExcludes)
    return null;
  const result = [];
  if (debugIncludes)
    result.push(...debugIncludes);
  if (debugExcludes)
    result.push(...[...debugExcludes].map((e) => `-${e}`));
  return result;
}
function setLogFormat(format) {
  currentLogFormat = format;
}
function getLogFormat() {
  return currentLogFormat;
}
function useJsonFormat() {
  return currentLogFormat === "json" || getEnv("NODE_ENV") === "production" || getEnv("TRACE_FORMAT") === "json";
}
function resetIds() {
  resetIdCounters();
}
function shouldLog(level) {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLogLevel];
}
function shouldTraceNamespace(namespace) {
  if (!spansEnabled)
    return false;
  if (!traceFilter)
    return true;
  return matchesNamespaceSet(namespace, traceFilter);
}
function safeStringify(value) {
  const seen = new WeakSet;
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === "bigint")
      return val.toString();
    if (typeof val === "symbol")
      return val.toString();
    if (val instanceof Error)
      return { message: val.message, stack: val.stack, name: val.name };
    if (typeof val === "object" && val !== null) {
      if (seen.has(val))
        return "[Circular]";
      seen.add(val);
    }
    return val;
  });
}
function formatConsole(namespace, level, message, data) {
  const time = colors.dim(new Date().toISOString().split("T")[1]?.split(".")[0] || "");
  let levelStr = "";
  switch (level) {
    case "trace":
      levelStr = colors.dim("TRACE");
      break;
    case "debug":
      levelStr = colors.dim("DEBUG");
      break;
    case "info":
      levelStr = colors.blue("INFO");
      break;
    case "warn":
      levelStr = colors.yellow("WARN");
      break;
    case "error":
      levelStr = colors.red("ERROR");
      break;
    case "span":
      levelStr = colors.magenta("SPAN");
      break;
  }
  const ns = colors.cyan(namespace);
  let output = `${time} ${levelStr} ${ns} ${message}`;
  if (data && Object.keys(data).length > 0) {
    output += ` ${colors.dim(safeStringify(data))}`;
  }
  return output;
}
function formatJSON(namespace, level, message, data) {
  const entry = {
    time: new Date().toISOString(),
    level,
    name: namespace,
    msg: message,
    ...data
  };
  return safeStringify(entry);
}
function matchesNamespaceSet(namespace, set) {
  if (set.has("*"))
    return true;
  for (const filter of set) {
    if (namespace === filter || namespace.startsWith(filter + ":")) {
      return true;
    }
  }
  return false;
}
function shouldDebugNamespace(namespace) {
  if (!debugIncludes && !debugExcludes)
    return true;
  if (debugExcludes && matchesNamespaceSet(namespace, debugExcludes)) {
    return false;
  }
  if (debugIncludes)
    return matchesNamespaceSet(namespace, debugIncludes);
  return true;
}
function resolveMessage(msg) {
  return typeof msg === "function" ? msg() : msg;
}
function writeLog(namespace, level, message, data) {
  if (!shouldLog(level))
    return;
  if (!shouldDebugNamespace(namespace))
    return;
  const resolved = resolveMessage(message);
  const contextTags = _getContextTags?.();
  const mergedData = contextTags && Object.keys(contextTags).length > 0 ? { ...contextTags, ...data } : data;
  const formatted = useJsonFormat() ? formatJSON(namespace, level, resolved, mergedData) : formatConsole(namespace, level, resolved, mergedData);
  for (const w of writers)
    w(formatted, level);
  if (suppressConsole || outputMode === "writers-only")
    return;
  if (outputMode === "stderr") {
    writeStderr(formatted);
    return;
  }
  switch (level) {
    case "trace":
    case "debug":
      console.debug(formatted);
      break;
    case "info":
      console.info(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "error":
      console.error(formatted);
      break;
  }
}
function writeSpan(namespace, duration, attrs) {
  if (!shouldTraceNamespace(namespace))
    return;
  if (!shouldDebugNamespace(namespace))
    return;
  const message = `(${duration}ms)`;
  const formatted = useJsonFormat() ? formatJSON(namespace, "span", message, { duration, ...attrs }) : formatConsole(namespace, "span", message, { duration, ...attrs });
  for (const w of writers)
    w(formatted, "span");
  if (!suppressConsole)
    writeStderr(formatted);
}
function createSpanDataProxy(getFields, attrs) {
  const READONLY_KEYS = new Set(["id", "traceId", "parentId", "startTime", "endTime", "duration"]);
  return new Proxy(attrs, {
    get(_target, prop) {
      if (READONLY_KEYS.has(prop)) {
        return getFields()[prop];
      }
      return attrs[prop];
    },
    set(_target, prop, value) {
      if (READONLY_KEYS.has(prop)) {
        return false;
      }
      attrs[prop] = value;
      return true;
    }
  });
}
function createLoggerImpl(name, props, spanMeta, parentSpanId, traceId, traceSampled = true) {
  const log = (level, msgOrError, data) => {
    if (msgOrError instanceof Error) {
      const err = msgOrError;
      writeLog(name, level, err.message, {
        ...props,
        ...data,
        error_type: err.name,
        error_stack: err.stack,
        error_code: err.code
      });
    } else {
      writeLog(name, level, msgOrError, { ...props, ...data });
    }
  };
  const logger = {
    name,
    props: Object.freeze({ ...props }),
    get spanData() {
      if (!spanMeta)
        return null;
      return createSpanDataProxy(() => ({
        id: spanMeta.id,
        traceId: spanMeta.traceId,
        parentId: spanMeta.parentId,
        startTime: spanMeta.startTime,
        endTime: spanMeta.endTime,
        duration: spanMeta.endTime !== null ? spanMeta.endTime - spanMeta.startTime : Date.now() - spanMeta.startTime
      }), spanMeta.attrs);
    },
    trace: (msg, data) => log("trace", msg, data),
    debug: (msg, data) => log("debug", msg, data),
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msgOrError, data) => log("error", msgOrError, data),
    logger(namespace, childProps) {
      const childName = namespace ? `${name}:${namespace}` : name;
      const mergedProps = { ...props, ...childProps };
      return createLoggerImpl(childName, mergedProps, null, parentSpanId, traceId, traceSampled);
    },
    span(namespace, childProps) {
      const childName = namespace ? `${name}:${namespace}` : name;
      const mergedProps = { ...props, ...childProps };
      const newSpanId = generateSpanId();
      let resolvedParentId = parentSpanId;
      let resolvedTraceId = traceId;
      if (!resolvedParentId && _getContextParent) {
        const ctxParent = _getContextParent();
        if (ctxParent) {
          resolvedParentId = ctxParent.spanId;
          resolvedTraceId = resolvedTraceId || ctxParent.traceId;
        }
      }
      const isNewTrace = !resolvedTraceId;
      const finalTraceId = resolvedTraceId || generateTraceId();
      const sampled = isNewTrace ? shouldSample() : traceSampled;
      const newSpanData = {
        id: newSpanId,
        traceId: finalTraceId,
        parentId: resolvedParentId,
        startTime: Date.now(),
        endTime: null,
        duration: null,
        attrs: {}
      };
      const spanLogger = createLoggerImpl(childName, mergedProps, newSpanData, newSpanId, finalTraceId, sampled);
      _enterContext?.(newSpanId, finalTraceId, resolvedParentId);
      spanLogger[Symbol.dispose] = () => {
        if (newSpanData.endTime !== null)
          return;
        newSpanData.endTime = Date.now();
        newSpanData.duration = newSpanData.endTime - newSpanData.startTime;
        if (collectSpans) {
          collectedSpans.push(createSpanDataProxy(() => ({
            id: newSpanData.id,
            traceId: newSpanData.traceId,
            parentId: newSpanData.parentId,
            startTime: newSpanData.startTime,
            endTime: newSpanData.endTime,
            duration: newSpanData.duration
          }), { ...newSpanData.attrs }));
        }
        _exitContext?.(newSpanId);
        if (sampled) {
          writeSpan(childName, newSpanData.duration, {
            span_id: newSpanData.id,
            trace_id: newSpanData.traceId,
            parent_id: newSpanData.parentId,
            ...mergedProps,
            ...newSpanData.attrs
          });
        }
      };
      return spanLogger;
    },
    child(context) {
      if (typeof context === "string") {
        return this.logger(context);
      }
      return createLoggerImpl(name, { ...props, ...context }, null, parentSpanId, traceId, traceSampled);
    },
    end() {
      if (spanMeta?.endTime === null) {
        this[Symbol.dispose]?.();
      }
    }
  };
  return logger;
}
function createPlainLogger(name, props) {
  return createLoggerImpl(name, props || {}, null, null, null);
}
function startCollecting() {
  collectSpans = true;
  collectedSpans.length = 0;
}
function stopCollecting() {
  collectSpans = false;
  return [...collectedSpans];
}
function getCollectedSpans() {
  return [...collectedSpans];
}
function clearCollectedSpans() {
  collectedSpans.length = 0;
}
function createLogger(name, props) {
  const baseLog = createPlainLogger(name, props);
  return new Proxy(baseLog, {
    get(target, prop) {
      if (prop in LOG_LEVEL_PRIORITY && prop !== "silent") {
        const current = LOG_LEVEL_PRIORITY[currentLogLevel];
        if (LOG_LEVEL_PRIORITY[prop] < current) {
          return;
        }
      }
      return target[prop];
    }
  });
}
var _process2, writers, suppressConsole = false, outputMode = "console", LOG_LEVEL_PRIORITY, envLogLevel, currentLogLevel, traceEnv, spansEnabled, traceFilter = null, debugEnv, debugIncludes = null, debugExcludes = null, envLogFormat, currentLogFormat, _getContextTags = null, _getContextParent = null, _enterContext = null, _exitContext = null, collectedSpans, collectSpans = false;
var init_core = __esm(() => {
  init_colors();
  _process2 = typeof process !== "undefined" ? process : undefined;
  writers = [];
  LOG_LEVEL_PRIORITY = {
    trace: 0,
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
    silent: 5
  };
  envLogLevel = getEnv("LOG_LEVEL")?.toLowerCase();
  currentLogLevel = envLogLevel === "trace" || envLogLevel === "debug" || envLogLevel === "info" || envLogLevel === "warn" || envLogLevel === "error" || envLogLevel === "silent" ? envLogLevel : "info";
  traceEnv = getEnv("TRACE");
  spansEnabled = traceEnv === "1" || traceEnv === "true";
  if (traceEnv && traceEnv !== "1" && traceEnv !== "true") {
    traceFilter = new Set(traceEnv.split(",").map((s) => s.trim()));
    spansEnabled = true;
  }
  debugEnv = getEnv("DEBUG");
  if (debugEnv) {
    const parts = debugEnv.split(",").map((s) => s.trim());
    const parsed = parseNamespaceFilter(parts);
    debugIncludes = parsed.includes;
    if (debugIncludes && [...debugIncludes].some((p) => p === "*" || p === "1" || p === "true")) {
      debugIncludes = new Set(["*"]);
    }
    debugExcludes = parsed.excludes;
    if (LOG_LEVEL_PRIORITY[currentLogLevel] > LOG_LEVEL_PRIORITY.debug) {
      currentLogLevel = "debug";
    }
  }
  envLogFormat = getEnv("LOG_FORMAT")?.toLowerCase();
  currentLogFormat = envLogFormat === "json" ? "json" : envLogFormat === "console" ? "console" : "console";
  collectedSpans = [];
});

// ../loggily/src/index.browser.ts
var exports_index_browser = {};
__export(exports_index_browser, {
  traceparent: () => traceparent,
  stopCollecting: () => stopCollecting,
  startCollecting: () => startCollecting,
  spansAreEnabled: () => spansAreEnabled,
  setTraceFilter: () => setTraceFilter,
  setSuppressConsole: () => setSuppressConsole,
  setSampleRate: () => setSampleRate,
  setOutputMode: () => setOutputMode,
  setLogLevel: () => setLogLevel,
  setLogFormat: () => setLogFormat,
  setIdFormat: () => setIdFormat,
  setDebugFilter: () => setDebugFilter,
  resetIds: () => resetIds,
  getTraceFilter: () => getTraceFilter,
  getSampleRate: () => getSampleRate,
  getOutputMode: () => getOutputMode,
  getLogLevel: () => getLogLevel,
  getLogFormat: () => getLogFormat,
  getIdFormat: () => getIdFormat,
  getDebugFilter: () => getDebugFilter,
  getCollectedSpans: () => getCollectedSpans,
  enableSpans: () => enableSpans,
  disableSpans: () => disableSpans,
  createLogger: () => createLogger,
  createFileWriter: () => createFileWriter,
  clearCollectedSpans: () => clearCollectedSpans,
  addWriter: () => addWriter
});
function createFileWriter() {
  throw new Error("createFileWriter is not available in browser environments. Use addWriter() with a custom transport instead.");
}
var init_index_browser = __esm(() => {
  init_core();
});

// ../flexily/src/logger.ts
function createFallbackLogger(namespace) {
  try {
    const createDebug = require_browser();
    const debug = createDebug(namespace);
    return { debug: debug.enabled ? debug : undefined };
  } catch {
    return { debug: undefined };
  }
}
async function detectLogger(namespace) {
  try {
    const { createLogger: createLogger2 } = await Promise.resolve().then(() => (init_index_browser(), exports_index_browser));
    const logger = createLogger2(namespace);
    if (logger.debug) {
      const originalDebug = logger.debug;
      return {
        debug: (msg, ...args) => {
          let i = 0;
          const formatted = msg.replace(/%[sdOo]/g, () => {
            const arg = args[i++];
            if (arg === undefined)
              return "";
            if (arg === null)
              return "null";
            if (typeof arg === "object")
              return JSON.stringify(arg);
            return String(arg);
          });
          originalDebug(formatted);
        }
      };
    }
    return { debug: undefined };
  } catch {
    return createFallbackLogger(namespace);
  }
}
var _logger = null, log;
var init_logger = __esm(async () => {
  _logger = await detectLogger("flexily:layout");
  log = {
    get debug() {
      return _logger?.debug;
    }
  };
});

// ../flexily/src/trace.ts
function getTrace() {
  return _trace;
}
var _trace = null;

// ../flexily/src/layout-helpers.ts
function isRowDirection(flexDirection) {
  return flexDirection === FLEX_DIRECTION_ROW || flexDirection === FLEX_DIRECTION_ROW_REVERSE;
}
function isReverseDirection(flexDirection) {
  return flexDirection === FLEX_DIRECTION_ROW_REVERSE || flexDirection === FLEX_DIRECTION_COLUMN_REVERSE;
}
function getLogicalEdgeValue(arr, physicalIndex, _flexDirection, direction = DIRECTION_LTR) {
  const isRTL = direction === DIRECTION_RTL;
  if (physicalIndex === 0) {
    return isRTL ? arr[5] : arr[4];
  } else if (physicalIndex === 2) {
    return isRTL ? arr[4] : arr[5];
  }
  return;
}
function resolveEdgeValue(arr, physicalIndex, flexDirection, availableSize, direction = DIRECTION_LTR) {
  const logicalValue = getLogicalEdgeValue(arr, physicalIndex, flexDirection, direction);
  if (logicalValue && logicalValue.unit !== UNIT_UNDEFINED) {
    return resolveValue(logicalValue, availableSize);
  }
  return resolveValue(arr[physicalIndex], availableSize);
}
function isEdgeAuto(arr, physicalIndex, flexDirection, direction = DIRECTION_LTR) {
  const logicalValue = getLogicalEdgeValue(arr, physicalIndex, flexDirection, direction);
  if (logicalValue && logicalValue.unit !== UNIT_UNDEFINED) {
    return logicalValue.unit === UNIT_AUTO;
  }
  return arr[physicalIndex].unit === UNIT_AUTO;
}
function resolvePositionEdge(arr, physicalIndex, direction = DIRECTION_LTR) {
  const logicalValue = getLogicalEdgeValue(arr, physicalIndex, 0, direction);
  if (logicalValue && logicalValue.unit !== UNIT_UNDEFINED) {
    return logicalValue;
  }
  return arr[physicalIndex];
}
function resolveEdgeBorderValue(arr, physicalIndex, _flexDirection, direction = DIRECTION_LTR) {
  const isRTL = direction === DIRECTION_RTL;
  let logicalSlot;
  if (physicalIndex === 0)
    logicalSlot = isRTL ? 5 : 4;
  else if (physicalIndex === 2)
    logicalSlot = isRTL ? 4 : 5;
  if (logicalSlot !== undefined && !Number.isNaN(arr[logicalSlot])) {
    return arr[logicalSlot];
  }
  return arr[physicalIndex];
}
var init_layout_helpers = __esm(() => {
  init_utils();
});

// ../flexily/src/layout-traversal.ts
function markSubtreeLayoutSeen(node) {
  traversalStack.length = 0;
  traversalStack.push(node);
  while (traversalStack.length > 0) {
    const current = traversalStack.pop();
    current["_isDirty"] = false;
    current["_hasNewLayout"] = true;
    for (const child of current.children) {
      traversalStack.push(child);
    }
  }
}
function countNodes(node) {
  let count = 0;
  traversalStack.length = 0;
  traversalStack.push(node);
  while (traversalStack.length > 0) {
    const current = traversalStack.pop();
    count++;
    for (const child of current.children) {
      traversalStack.push(child);
    }
  }
  return count;
}
function propagatePositionDelta(node, deltaX, deltaY) {
  traversalStack.length = 0;
  for (const child of node.children) {
    traversalStack.push(child);
  }
  while (traversalStack.length > 0) {
    const current = traversalStack.pop();
    current.flex.lastOffsetX += deltaX;
    current.flex.lastOffsetY += deltaY;
    for (const child of current.children) {
      traversalStack.push(child);
    }
  }
}
var init_layout_traversal = __esm(() => {
  init_utils();
});

// ../flexily/src/layout-stats.ts
function resetLayoutStats() {
  layoutNodeCalls = 0;
  measureNodeCalls = 0;
  layoutSizingCalls = 0;
  layoutPositioningCalls = 0;
  layoutCacheHits = 0;
}
function incLayoutNodeCalls() {
  layoutNodeCalls++;
}
function incMeasureNodeCalls() {
  measureNodeCalls++;
}
function incLayoutSizingCalls() {
  layoutSizingCalls++;
}
function incLayoutPositioningCalls() {
  layoutPositioningCalls++;
}
function incLayoutCacheHits() {
  layoutCacheHits++;
}
var layoutNodeCalls = 0, measureNodeCalls = 0, layoutSizingCalls = 0, layoutPositioningCalls = 0, layoutCacheHits = 0;

// ../flexily/src/layout-measure.ts
function measureNode(node, availableWidth, availableHeight, direction = DIRECTION_LTR) {
  incMeasureNodeCalls();
  const style = node.style;
  const layout = node.layout;
  if (style.display === DISPLAY_NONE) {
    layout.width = 0;
    layout.height = 0;
    return;
  }
  const marginLeft = resolveEdgeValue(style.margin, 0, style.flexDirection, availableWidth, direction);
  const marginTop = resolveEdgeValue(style.margin, 1, style.flexDirection, availableWidth, direction);
  const marginRight = resolveEdgeValue(style.margin, 2, style.flexDirection, availableWidth, direction);
  const marginBottom = resolveEdgeValue(style.margin, 3, style.flexDirection, availableWidth, direction);
  const paddingLeft = resolveEdgeValue(style.padding, 0, style.flexDirection, availableWidth, direction);
  const paddingTop = resolveEdgeValue(style.padding, 1, style.flexDirection, availableWidth, direction);
  const paddingRight = resolveEdgeValue(style.padding, 2, style.flexDirection, availableWidth, direction);
  const paddingBottom = resolveEdgeValue(style.padding, 3, style.flexDirection, availableWidth, direction);
  const borderLeft = resolveEdgeBorderValue(style.border, 0, style.flexDirection, direction);
  const borderTop = resolveEdgeBorderValue(style.border, 1, style.flexDirection, direction);
  const borderRight = resolveEdgeBorderValue(style.border, 2, style.flexDirection, direction);
  const borderBottom = resolveEdgeBorderValue(style.border, 3, style.flexDirection, direction);
  let nodeWidth;
  if (style.width.unit === UNIT_POINT) {
    nodeWidth = style.width.value;
  } else if (style.width.unit === UNIT_PERCENT) {
    nodeWidth = resolveValue(style.width, availableWidth);
  } else if (Number.isNaN(availableWidth)) {
    nodeWidth = NaN;
  } else {
    nodeWidth = availableWidth - marginLeft - marginRight;
  }
  nodeWidth = applyMinMax(nodeWidth, style.minWidth, style.maxWidth, availableWidth);
  let nodeHeight;
  if (style.height.unit === UNIT_POINT) {
    nodeHeight = style.height.value;
  } else if (style.height.unit === UNIT_PERCENT) {
    nodeHeight = resolveValue(style.height, availableHeight);
  } else if (Number.isNaN(availableHeight)) {
    nodeHeight = NaN;
  } else {
    nodeHeight = availableHeight - marginTop - marginBottom;
  }
  const aspectRatio = style.aspectRatio;
  if (!Number.isNaN(aspectRatio) && aspectRatio > 0) {
    const widthIsAuto = Number.isNaN(nodeWidth) || style.width.unit === UNIT_AUTO;
    const heightIsAuto = Number.isNaN(nodeHeight) || style.height.unit === UNIT_AUTO;
    if (widthIsAuto && !heightIsAuto && !Number.isNaN(nodeHeight)) {
      nodeWidth = nodeHeight * aspectRatio;
      nodeWidth = applyMinMax(nodeWidth, style.minWidth, style.maxWidth, availableWidth);
    } else if (heightIsAuto && !widthIsAuto && !Number.isNaN(nodeWidth)) {
      nodeHeight = nodeWidth / aspectRatio;
    }
  }
  nodeHeight = applyMinMax(nodeHeight, style.minHeight, style.maxHeight, availableHeight);
  const innerLeft = borderLeft + paddingLeft;
  const innerTop = borderTop + paddingTop;
  const innerRight = borderRight + paddingRight;
  const innerBottom = borderBottom + paddingBottom;
  const minInnerWidth = innerLeft + innerRight;
  const minInnerHeight = innerTop + innerBottom;
  if (!Number.isNaN(nodeWidth) && nodeWidth < minInnerWidth) {
    nodeWidth = minInnerWidth;
  }
  if (!Number.isNaN(nodeHeight) && nodeHeight < minInnerHeight) {
    nodeHeight = minInnerHeight;
  }
  const contentWidth = Number.isNaN(nodeWidth) ? NaN : Math.max(0, nodeWidth - innerLeft - innerRight);
  const contentHeight = Number.isNaN(nodeHeight) ? NaN : Math.max(0, nodeHeight - innerTop - innerBottom);
  if (node.hasMeasureFunc() && node.children.length === 0) {
    const widthIsAuto = style.width.unit === UNIT_AUTO || style.width.unit === UNIT_UNDEFINED || Number.isNaN(nodeWidth);
    const heightIsAuto = style.height.unit === UNIT_AUTO || style.height.unit === UNIT_UNDEFINED || Number.isNaN(nodeHeight);
    const widthMode = widthIsAuto ? MEASURE_MODE_AT_MOST : MEASURE_MODE_EXACTLY;
    const heightMode = heightIsAuto ? MEASURE_MODE_UNDEFINED : MEASURE_MODE_EXACTLY;
    const measureWidth = Number.isNaN(contentWidth) ? Infinity : contentWidth;
    const measureHeight = Number.isNaN(contentHeight) ? Infinity : contentHeight;
    const measured = node.cachedMeasure(measureWidth, widthMode, measureHeight, heightMode);
    if (widthIsAuto) {
      nodeWidth = measured.width + innerLeft + innerRight;
    }
    if (heightIsAuto) {
      nodeHeight = measured.height + innerTop + innerBottom;
    }
    layout.width = Math.round(nodeWidth);
    layout.height = Math.round(nodeHeight);
    return;
  }
  if (node.children.length === 0) {
    if (Number.isNaN(nodeWidth)) {
      nodeWidth = innerLeft + innerRight;
    }
    if (Number.isNaN(nodeHeight)) {
      nodeHeight = innerTop + innerBottom;
    }
    layout.width = Math.round(nodeWidth);
    layout.height = Math.round(nodeHeight);
    return;
  }
  let relativeChildCount = 0;
  for (const c of node.children) {
    if (c.style.display === DISPLAY_NONE)
      continue;
    if (c.style.positionType !== POSITION_TYPE_ABSOLUTE) {
      relativeChildCount++;
    }
  }
  if (relativeChildCount === 0) {
    if (Number.isNaN(nodeWidth))
      nodeWidth = minInnerWidth;
    if (Number.isNaN(nodeHeight))
      nodeHeight = minInnerHeight;
    layout.width = Math.round(nodeWidth);
    layout.height = Math.round(nodeHeight);
    return;
  }
  const isRow = isRowDirection(style.flexDirection);
  const mainAxisSize = isRow ? contentWidth : contentHeight;
  const crossAxisSize = isRow ? contentHeight : contentWidth;
  const mainGap = isRow ? style.gap[0] : style.gap[1];
  let totalMainSize = 0;
  let maxCrossSize = 0;
  let itemCount = 0;
  for (const child of node.children) {
    if (child.style.display === DISPLAY_NONE)
      continue;
    if (child.style.positionType === POSITION_TYPE_ABSOLUTE)
      continue;
    const childStyle = child.style;
    const childMarginMain = isRow ? resolveEdgeValue(childStyle.margin, 0, style.flexDirection, contentWidth, direction) + resolveEdgeValue(childStyle.margin, 2, style.flexDirection, contentWidth, direction) : resolveEdgeValue(childStyle.margin, 1, style.flexDirection, contentWidth, direction) + resolveEdgeValue(childStyle.margin, 3, style.flexDirection, contentWidth, direction);
    const childMarginCross = isRow ? resolveEdgeValue(childStyle.margin, 1, style.flexDirection, contentWidth, direction) + resolveEdgeValue(childStyle.margin, 3, style.flexDirection, contentWidth, direction) : resolveEdgeValue(childStyle.margin, 0, style.flexDirection, contentWidth, direction) + resolveEdgeValue(childStyle.margin, 2, style.flexDirection, contentWidth, direction);
    const childAvailW = isRow ? NaN : crossAxisSize;
    const childAvailH = isRow ? crossAxisSize : NaN;
    let measuredW = 0;
    let measuredH = 0;
    const cached = child.getCachedLayout(childAvailW, childAvailH);
    if (cached) {
      incLayoutCacheHits();
    } else {
      const savedW = child.layout.width;
      const savedH = child.layout.height;
      measureNode(child, childAvailW, childAvailH, direction);
      measuredW = child.layout.width;
      measuredH = child.layout.height;
      child.layout.width = savedW;
      child.layout.height = savedH;
      child.setCachedLayout(childAvailW, childAvailH, measuredW, measuredH);
    }
    const childMainSize = cached ? isRow ? cached.width : cached.height : isRow ? measuredW : measuredH;
    const childCrossSize = cached ? isRow ? cached.height : cached.width : isRow ? measuredH : measuredW;
    totalMainSize += childMainSize + childMarginMain;
    maxCrossSize = Math.max(maxCrossSize, childCrossSize + childMarginCross);
    itemCount++;
  }
  if (itemCount > 1) {
    totalMainSize += mainGap * (itemCount - 1);
  }
  if (Number.isNaN(nodeWidth)) {
    nodeWidth = (isRow ? totalMainSize : maxCrossSize) + innerLeft + innerRight;
  }
  if (Number.isNaN(nodeHeight)) {
    nodeHeight = (isRow ? maxCrossSize : totalMainSize) + innerTop + innerBottom;
  }
  nodeWidth = applyMinMax(nodeWidth, style.minWidth, style.maxWidth, availableWidth);
  nodeHeight = applyMinMax(nodeHeight, style.minHeight, style.maxHeight, availableHeight);
  layout.width = Math.round(nodeWidth);
  layout.height = Math.round(nodeHeight);
}
var init_layout_measure = __esm(() => {
  init_utils();
  init_layout_helpers();
});

// ../flexily/src/layout-flex-lines.ts
function growLineArrays(needed) {
  const newSize = Math.max(needed, MAX_FLEX_LINES * 2);
  MAX_FLEX_LINES = newSize;
  _lineCrossSizes = new Float64Array(newSize);
  _lineCrossOffsets = new Float64Array(newSize);
  _lineLengths = new Uint16Array(newSize);
  _lineJustifyStarts = new Float64Array(newSize);
  _lineItemSpacings = new Float64Array(newSize);
  while (_lineChildren.length < newSize) {
    _lineChildren.push([]);
  }
}
function enterLayout() {
  const depth = _layoutDepth++;
  if (depth === 0)
    return null;
  const saved = {
    crossSizes: _lineCrossSizes.slice(),
    crossOffsets: _lineCrossOffsets.slice(),
    lengths: _lineLengths.slice(),
    justifyStarts: _lineJustifyStarts.slice(),
    itemSpacings: _lineItemSpacings.slice(),
    children: _lineChildren.map((arr) => arr.slice()),
    maxLines: MAX_FLEX_LINES
  };
  return saved;
}
function exitLayout(saved) {
  _layoutDepth--;
  if (!saved)
    return;
  MAX_FLEX_LINES = saved.maxLines;
  _lineCrossSizes = saved.crossSizes;
  _lineCrossOffsets = saved.crossOffsets;
  _lineLengths = saved.lengths;
  _lineJustifyStarts = saved.justifyStarts;
  _lineItemSpacings = saved.itemSpacings;
  _lineChildren = saved.children;
}
function breakIntoLines(parent, relativeCount, mainAxisSize, mainGap, wrap2) {
  if (wrap2 === WRAP_NO_WRAP || Number.isNaN(mainAxisSize) || relativeCount === 0) {
    const lineArr = _lineChildren[0];
    let idx = 0;
    for (const child of parent.children) {
      if (child.flex.relativeIndex >= 0) {
        child.flex.lineIndex = 0;
        lineArr[idx++] = child;
      }
    }
    lineArr.length = idx;
    _lineLengths[0] = relativeCount;
    _lineCrossSizes[0] = 0;
    _lineCrossOffsets[0] = 0;
    return 1;
  }
  let lineIndex = 0;
  let lineMainSize = 0;
  let lineChildCount = 0;
  let lineChildIdx = 0;
  for (const child of parent.children) {
    if (child.flex.relativeIndex < 0)
      continue;
    const flex = child.flex;
    const hypotheticalMainSize = Math.max(flex.minMain, Math.min(flex.maxMain, flex.baseSize));
    const childMainSize = hypotheticalMainSize + flex.mainMargin;
    const gapIfNotFirst = lineChildCount > 0 ? mainGap : 0;
    if (lineChildCount > 0 && lineMainSize + gapIfNotFirst + childMainSize > mainAxisSize) {
      _lineChildren[lineIndex].length = lineChildIdx;
      _lineLengths[lineIndex] = lineChildCount;
      lineIndex++;
      if (lineIndex >= MAX_FLEX_LINES) {
        growLineArrays(lineIndex + 16);
      }
      lineChildIdx = 0;
      lineMainSize = childMainSize;
      lineChildCount = 1;
    } else {
      lineMainSize += gapIfNotFirst + childMainSize;
      lineChildCount++;
    }
    flex.lineIndex = lineIndex;
    _lineChildren[lineIndex][lineChildIdx++] = child;
  }
  if (lineChildCount > 0) {
    _lineChildren[lineIndex].length = lineChildIdx;
    _lineLengths[lineIndex] = lineChildCount;
    lineIndex++;
  }
  const numLines = lineIndex;
  for (let i = 0;i < numLines; i++) {
    _lineCrossSizes[i] = 0;
    _lineCrossOffsets[i] = 0;
  }
  if (wrap2 === WRAP_WRAP_REVERSE && numLines > 1) {
    for (let i = 0;i < Math.floor(numLines / 2); i++) {
      const j = numLines - 1 - i;
      const lineI = _lineChildren[i];
      const lineJ = _lineChildren[j];
      const lenI = lineI.length;
      const lenJ = lineJ.length;
      const maxLen = Math.max(lenI, lenJ);
      for (let k = 0;k < maxLen; k++) {
        const hasI = k < lenI;
        const hasJ = k < lenJ;
        const tmpI = hasI ? lineI[k] : null;
        const tmpJ = hasJ ? lineJ[k] : null;
        if (hasJ)
          lineI[k] = tmpJ;
        if (hasI)
          lineJ[k] = tmpI;
      }
      lineI.length = lenJ;
      lineJ.length = lenI;
    }
    for (let i = 0;i < numLines; i++) {
      const lc = _lineChildren[i];
      for (let c = 0;c < lc.length; c++) {
        lc[c].flex.lineIndex = i;
      }
    }
  }
  return numLines;
}
function distributeFlexSpaceForLine(lineChildren, initialFreeSpace) {
  const isGrowing = initialFreeSpace > 0;
  if (initialFreeSpace === 0)
    return;
  const childCount = lineChildren.length;
  if (childCount === 0)
    return;
  if (childCount === 1) {
    const flex = lineChildren[0].flex;
    const canFlex = isGrowing ? flex.flexGrow > 0 : flex.flexShrink > 0;
    if (canFlex) {
      const target = flex.baseSize + initialFreeSpace;
      flex.mainSize = Math.max(flex.minMain, Math.min(flex.maxMain, target));
    }
    return;
  }
  let totalBase = 0;
  for (let i = 0;i < childCount; i++) {
    totalBase += lineChildren[i].flex.baseSize;
  }
  const containerInner = initialFreeSpace + totalBase;
  for (let i = 0;i < childCount; i++) {
    lineChildren[i].flex.frozen = false;
  }
  let freeSpace = initialFreeSpace;
  let iterations = 0;
  const maxIterations = childCount + 1;
  while (iterations++ < maxIterations) {
    let totalFlex = 0;
    for (let i = 0;i < childCount; i++) {
      const flex = lineChildren[i].flex;
      if (flex.frozen)
        continue;
      if (isGrowing) {
        totalFlex += flex.flexGrow;
      } else {
        totalFlex += flex.flexShrink * flex.baseSize;
      }
    }
    if (totalFlex === 0)
      break;
    let effectiveFreeSpace = freeSpace;
    if (isGrowing && totalFlex < 1) {
      effectiveFreeSpace = freeSpace * totalFlex;
    }
    let totalViolation = 0;
    for (let i = 0;i < childCount; i++) {
      const flex = lineChildren[i].flex;
      if (flex.frozen)
        continue;
      const flexFactor = isGrowing ? flex.flexGrow : flex.flexShrink * flex.baseSize;
      const ratio = totalFlex > 0 ? flexFactor / totalFlex : 0;
      const target = flex.baseSize + effectiveFreeSpace * ratio;
      const clamped = Math.max(flex.minMain, Math.min(flex.maxMain, target));
      totalViolation += clamped - target;
      flex.mainSize = clamped;
    }
    let anyFrozen = false;
    if (Math.abs(totalViolation) < EPSILON_FLOAT) {
      for (let i = 0;i < childCount; i++) {
        lineChildren[i].flex.frozen = true;
      }
      break;
    } else if (totalViolation > 0) {
      for (let i = 0;i < childCount; i++) {
        const flex = lineChildren[i].flex;
        if (flex.frozen)
          continue;
        const target = flex.baseSize + (isGrowing ? flex.flexGrow : flex.flexShrink * flex.baseSize) / totalFlex * effectiveFreeSpace;
        if (flex.mainSize > target + EPSILON_FLOAT) {
          flex.frozen = true;
          anyFrozen = true;
        }
      }
    } else {
      for (let i = 0;i < childCount; i++) {
        const flex = lineChildren[i].flex;
        if (flex.frozen)
          continue;
        const flexFactor = isGrowing ? flex.flexGrow : flex.flexShrink * flex.baseSize;
        const target = flex.baseSize + flexFactor / totalFlex * effectiveFreeSpace;
        if (flex.mainSize < target - EPSILON_FLOAT) {
          flex.frozen = true;
          anyFrozen = true;
        }
      }
    }
    if (!anyFrozen)
      break;
    let frozenSpace = 0;
    let unfrozenBase = 0;
    for (let i = 0;i < childCount; i++) {
      const flex = lineChildren[i].flex;
      if (flex.frozen) {
        frozenSpace += flex.mainSize;
      } else {
        unfrozenBase += flex.baseSize;
      }
    }
    freeSpace = containerInner - frozenSpace - unfrozenBase;
  }
}
var MAX_FLEX_LINES = 32, _lineCrossSizes, _lineCrossOffsets, _lineLengths, _lineChildren, _lineJustifyStarts, _lineItemSpacings, _layoutDepth = 0, EPSILON_FLOAT = 0.001;
var init_layout_flex_lines = __esm(() => {
  _lineCrossSizes = new Float64Array(MAX_FLEX_LINES);
  _lineCrossOffsets = new Float64Array(MAX_FLEX_LINES);
  _lineLengths = new Uint16Array(MAX_FLEX_LINES);
  _lineChildren = Array.from({ length: MAX_FLEX_LINES }, () => []);
  _lineJustifyStarts = new Float64Array(MAX_FLEX_LINES);
  _lineItemSpacings = new Float64Array(MAX_FLEX_LINES);
});

// ../flexily/src/layout-zero.ts
function computeLayout(root, availableWidth, availableHeight, direction = DIRECTION_LTR) {
  const saved = enterLayout();
  try {
    resetLayoutStats();
    getTrace()?.resetCounter();
    root.resetLayoutCache();
    layoutNode(root, availableWidth, availableHeight, 0, 0, 0, 0, direction);
  } finally {
    exitLayout(saved);
  }
}
function layoutNode(node, availableWidth, availableHeight, offsetX, offsetY, absX, absY, direction = DIRECTION_LTR) {
  incLayoutNodeCalls();
  const isSizingPass = offsetX === 0 && offsetY === 0 && absX === 0 && absY === 0;
  if (isSizingPass && node.children.length > 0) {
    incLayoutSizingCalls();
  } else {
    incLayoutPositioningCalls();
  }
  log.debug?.("layoutNode called: availW=%d, availH=%d, offsetX=%d, offsetY=%d, absX=%d, absY=%d, children=%d", availableWidth, availableHeight, offsetX, offsetY, absX, absY, node.children.length);
  const _t = getTrace();
  const _tn = _t?.nextNode() ?? 0;
  _t?.layoutEnter(_tn, availableWidth, availableHeight, node.isDirty(), node.children.length);
  const style = node.style;
  const layout = node.layout;
  if (style.display === DISPLAY_NONE) {
    layout.left = 0;
    layout.top = 0;
    layout.width = 0;
    layout.height = 0;
    return;
  }
  const flex = node.flex;
  if (flex.layoutValid && !node.isDirty() && Object.is(flex.lastAvailW, availableWidth) && Object.is(flex.lastAvailH, availableHeight) && flex.lastDir === direction && flex.lastAbsX === absX && flex.lastAbsY === absY) {
    _t?.fingerprintHit(_tn, availableWidth, availableHeight);
    const deltaX = offsetX - flex.lastOffsetX;
    const deltaY = offsetY - flex.lastOffsetY;
    if (deltaX !== 0 || deltaY !== 0) {
      layout.left += deltaX;
      layout.top += deltaY;
      flex.lastOffsetX = offsetX;
      flex.lastOffsetY = offsetY;
      propagatePositionDelta(node, deltaX, deltaY);
    }
    return;
  }
  _t?.fingerprintMiss(_tn, availableWidth, availableHeight, {
    layoutValid: flex.layoutValid,
    isDirty: node.isDirty(),
    sameW: Object.is(flex.lastAvailW, availableWidth),
    sameH: Object.is(flex.lastAvailH, availableHeight),
    sameDir: flex.lastDir === direction,
    sameAbsX: flex.lastAbsX === absX,
    sameAbsY: flex.lastAbsY === absY
  });
  const marginLeft = resolveEdgeValue(style.margin, 0, style.flexDirection, availableWidth, direction);
  const marginTop = resolveEdgeValue(style.margin, 1, style.flexDirection, availableWidth, direction);
  const marginRight = resolveEdgeValue(style.margin, 2, style.flexDirection, availableWidth, direction);
  const marginBottom = resolveEdgeValue(style.margin, 3, style.flexDirection, availableWidth, direction);
  const paddingLeft = resolveEdgeValue(style.padding, 0, style.flexDirection, availableWidth, direction);
  const paddingTop = resolveEdgeValue(style.padding, 1, style.flexDirection, availableWidth, direction);
  const paddingRight = resolveEdgeValue(style.padding, 2, style.flexDirection, availableWidth, direction);
  const paddingBottom = resolveEdgeValue(style.padding, 3, style.flexDirection, availableWidth, direction);
  const borderLeft = resolveEdgeBorderValue(style.border, 0, style.flexDirection, direction);
  const borderTop = resolveEdgeBorderValue(style.border, 1, style.flexDirection, direction);
  const borderRight = resolveEdgeBorderValue(style.border, 2, style.flexDirection, direction);
  const borderBottom = resolveEdgeBorderValue(style.border, 3, style.flexDirection, direction);
  let nodeWidth;
  if (style.width.unit === UNIT_POINT) {
    nodeWidth = style.width.value;
  } else if (style.width.unit === UNIT_PERCENT) {
    nodeWidth = resolveValue(style.width, availableWidth);
  } else if (Number.isNaN(availableWidth)) {
    nodeWidth = NaN;
  } else {
    nodeWidth = availableWidth - marginLeft - marginRight;
  }
  nodeWidth = applyMinMax(nodeWidth, style.minWidth, style.maxWidth, availableWidth);
  let nodeHeight;
  if (style.height.unit === UNIT_POINT) {
    nodeHeight = style.height.value;
  } else if (style.height.unit === UNIT_PERCENT) {
    nodeHeight = resolveValue(style.height, availableHeight);
  } else if (Number.isNaN(availableHeight)) {
    nodeHeight = NaN;
  } else {
    nodeHeight = availableHeight - marginTop - marginBottom;
  }
  const aspectRatio = style.aspectRatio;
  if (!Number.isNaN(aspectRatio) && aspectRatio > 0) {
    const widthIsAuto = Number.isNaN(nodeWidth) || style.width.unit === UNIT_AUTO;
    const heightIsAuto = Number.isNaN(nodeHeight) || style.height.unit === UNIT_AUTO;
    if (widthIsAuto && !heightIsAuto && !Number.isNaN(nodeHeight)) {
      nodeWidth = nodeHeight * aspectRatio;
      nodeWidth = applyMinMax(nodeWidth, style.minWidth, style.maxWidth, availableWidth);
    } else if (heightIsAuto && !widthIsAuto && !Number.isNaN(nodeWidth)) {
      nodeHeight = nodeWidth / aspectRatio;
    }
  }
  nodeHeight = applyMinMax(nodeHeight, style.minHeight, style.maxHeight, availableHeight);
  const innerLeft = borderLeft + paddingLeft;
  const innerTop = borderTop + paddingTop;
  const innerRight = borderRight + paddingRight;
  const innerBottom = borderBottom + paddingBottom;
  const minInnerWidth = innerLeft + innerRight;
  const minInnerHeight = innerTop + innerBottom;
  if (!Number.isNaN(nodeWidth) && nodeWidth < minInnerWidth) {
    nodeWidth = minInnerWidth;
  }
  if (!Number.isNaN(nodeHeight) && nodeHeight < minInnerHeight) {
    nodeHeight = minInnerHeight;
  }
  const contentWidth = Number.isNaN(nodeWidth) ? NaN : Math.max(0, nodeWidth - innerLeft - innerRight);
  const contentHeight = Number.isNaN(nodeHeight) ? NaN : Math.max(0, nodeHeight - innerTop - innerBottom);
  let parentPosOffsetX = 0;
  let parentPosOffsetY = 0;
  if (style.positionType === POSITION_TYPE_RELATIVE) {
    const leftPos = resolvePositionEdge(style.position, 0, direction);
    const topPos = style.position[1];
    const rightPos = resolvePositionEdge(style.position, 2, direction);
    const bottomPos = style.position[3];
    if (leftPos.unit !== UNIT_UNDEFINED) {
      parentPosOffsetX = resolveValue(leftPos, availableWidth);
    } else if (rightPos.unit !== UNIT_UNDEFINED) {
      parentPosOffsetX = -resolveValue(rightPos, availableWidth);
    }
    if (topPos.unit !== UNIT_UNDEFINED) {
      parentPosOffsetY = resolveValue(topPos, availableHeight);
    } else if (bottomPos.unit !== UNIT_UNDEFINED) {
      parentPosOffsetY = -resolveValue(bottomPos, availableHeight);
    }
  }
  if (node.hasMeasureFunc() && node.children.length === 0) {
    const widthIsAuto = style.width.unit === UNIT_AUTO || style.width.unit === UNIT_UNDEFINED || Number.isNaN(nodeWidth);
    const heightIsAuto = style.height.unit === UNIT_AUTO || style.height.unit === UNIT_UNDEFINED || Number.isNaN(nodeHeight);
    const widthMode = widthIsAuto ? MEASURE_MODE_AT_MOST : MEASURE_MODE_EXACTLY;
    const heightMode = heightIsAuto ? MEASURE_MODE_UNDEFINED : MEASURE_MODE_EXACTLY;
    const measureWidth = Number.isNaN(contentWidth) ? Infinity : contentWidth;
    const measureHeight = Number.isNaN(contentHeight) ? Infinity : contentHeight;
    const measured = node.cachedMeasure(measureWidth, widthMode, measureHeight, heightMode);
    if (widthIsAuto) {
      nodeWidth = measured.width + innerLeft + innerRight;
    }
    if (heightIsAuto) {
      nodeHeight = measured.height + innerTop + innerBottom;
    }
    layout.width = Math.round(nodeWidth);
    layout.height = Math.round(nodeHeight);
    layout.left = Math.round(offsetX + marginLeft);
    layout.top = Math.round(offsetY + marginTop);
    return;
  }
  if (node.children.length === 0) {
    if (Number.isNaN(nodeWidth)) {
      nodeWidth = innerLeft + innerRight;
    }
    if (Number.isNaN(nodeHeight)) {
      nodeHeight = innerTop + innerBottom;
    }
    layout.width = Math.round(nodeWidth);
    layout.height = Math.round(nodeHeight);
    layout.left = Math.round(offsetX + marginLeft);
    layout.top = Math.round(offsetY + marginTop);
    return;
  }
  const isRow = isRowDirection(style.flexDirection);
  const isReverse = isReverseDirection(style.flexDirection);
  const isRTL = direction === DIRECTION_RTL;
  const effectiveReverse = isRow ? isRTL !== isReverse : isReverse;
  const mainAxisSize = isRow ? contentWidth : contentHeight;
  const crossAxisSize = isRow ? contentHeight : contentWidth;
  const mainGap = isRow ? style.gap[0] : style.gap[1];
  let totalBaseMain = 0;
  let relativeCount = 0;
  let totalAutoMargins = 0;
  let hasBaselineAlignment = style.alignItems === ALIGN_BASELINE;
  for (const child of node.children) {
    if (child.style.display === DISPLAY_NONE || child.style.positionType === POSITION_TYPE_ABSOLUTE) {
      child.flex.relativeIndex = -1;
      continue;
    }
    child.flex.relativeIndex = relativeCount++;
    const childStyle = child.style;
    const cflex = child.flex;
    const mainStartIndex = isRow ? effectiveReverse ? 2 : 0 : isReverse ? 3 : 1;
    const mainEndIndex = isRow ? effectiveReverse ? 0 : 2 : isReverse ? 1 : 3;
    cflex.mainStartMarginAuto = isEdgeAuto(childStyle.margin, mainStartIndex, style.flexDirection, direction);
    cflex.mainEndMarginAuto = isEdgeAuto(childStyle.margin, mainEndIndex, style.flexDirection, direction);
    cflex.marginL = resolveEdgeValue(childStyle.margin, 0, style.flexDirection, contentWidth, direction);
    cflex.marginT = resolveEdgeValue(childStyle.margin, 1, style.flexDirection, contentWidth, direction);
    cflex.marginR = resolveEdgeValue(childStyle.margin, 2, style.flexDirection, contentWidth, direction);
    cflex.marginB = resolveEdgeValue(childStyle.margin, 3, style.flexDirection, contentWidth, direction);
    cflex.mainStartMarginValue = cflex.mainStartMarginAuto ? 0 : isRow ? effectiveReverse ? cflex.marginR : cflex.marginL : isReverse ? cflex.marginB : cflex.marginT;
    cflex.mainEndMarginValue = cflex.mainEndMarginAuto ? 0 : isRow ? effectiveReverse ? cflex.marginL : cflex.marginR : isReverse ? cflex.marginT : cflex.marginB;
    cflex.mainMargin = cflex.mainStartMarginValue + cflex.mainEndMarginValue;
    let baseSize = 0;
    if (childStyle.flexBasis.unit === UNIT_POINT) {
      baseSize = childStyle.flexBasis.value;
    } else if (childStyle.flexBasis.unit === UNIT_PERCENT) {
      baseSize = Number.isNaN(mainAxisSize) ? 0 : mainAxisSize * (childStyle.flexBasis.value / 100);
    } else {
      const sizeVal = isRow ? childStyle.width : childStyle.height;
      if (sizeVal.unit === UNIT_POINT) {
        baseSize = sizeVal.value;
      } else if (sizeVal.unit === UNIT_PERCENT) {
        baseSize = Number.isNaN(mainAxisSize) ? 0 : mainAxisSize * (sizeVal.value / 100);
      } else if (child.hasMeasureFunc()) {
        const crossMargin = isRow ? cflex.marginT + cflex.marginB : cflex.marginL + cflex.marginR;
        const availCross = crossAxisSize - crossMargin;
        const wantMaxContent = childStyle.flexGrow > 0;
        const mW = isRow ? wantMaxContent ? Infinity : Number.isNaN(mainAxisSize) ? Infinity : mainAxisSize : Number.isNaN(availCross) ? Infinity : availCross;
        const mH = isRow ? Number.isNaN(availCross) ? Infinity : availCross : wantMaxContent ? Infinity : Number.isNaN(mainAxisSize) ? Infinity : mainAxisSize;
        const mWMode = isRow ? wantMaxContent ? MEASURE_MODE_UNDEFINED : MEASURE_MODE_AT_MOST : Number.isNaN(availCross) ? MEASURE_MODE_UNDEFINED : MEASURE_MODE_AT_MOST;
        const mHMode = isRow ? MEASURE_MODE_UNDEFINED : wantMaxContent ? MEASURE_MODE_UNDEFINED : MEASURE_MODE_AT_MOST;
        const measured = child.cachedMeasure(mW, mWMode, mH, mHMode);
        baseSize = isRow ? measured.width : measured.height;
      } else if (child.children.length > 0) {
        const sizingW = isRow ? NaN : crossAxisSize;
        const sizingH = isRow ? crossAxisSize : NaN;
        const cached = child.getCachedLayout(sizingW, sizingH);
        if (cached) {
          incLayoutCacheHits();
          _t?.cacheHit(_tn, sizingW, sizingH, cached.width, cached.height);
          baseSize = isRow ? cached.width : cached.height;
        } else {
          _t?.cacheMiss(_tn, sizingW, sizingH);
          const savedW = child.layout.width;
          const savedH = child.layout.height;
          measureNode(child, sizingW, sizingH, direction);
          const measuredW = child.layout.width;
          const measuredH = child.layout.height;
          child.layout.width = savedW;
          child.layout.height = savedH;
          _t?.measureSaveRestore(_tn, savedW, savedH, measuredW, measuredH);
          baseSize = isRow ? measuredW : measuredH;
          child.setCachedLayout(sizingW, sizingH, measuredW, measuredH);
        }
      } else {
        const parentWidth = isRow ? mainAxisSize : crossAxisSize;
        const childPadding = isRow ? resolveEdgeValue(childStyle.padding, 0, childStyle.flexDirection, parentWidth, direction) + resolveEdgeValue(childStyle.padding, 2, childStyle.flexDirection, parentWidth, direction) : resolveEdgeValue(childStyle.padding, 1, childStyle.flexDirection, parentWidth, direction) + resolveEdgeValue(childStyle.padding, 3, childStyle.flexDirection, parentWidth, direction);
        const childBorder = isRow ? resolveEdgeBorderValue(childStyle.border, 0, childStyle.flexDirection, direction) + resolveEdgeBorderValue(childStyle.border, 2, childStyle.flexDirection, direction) : resolveEdgeBorderValue(childStyle.border, 1, childStyle.flexDirection, direction) + resolveEdgeBorderValue(childStyle.border, 3, childStyle.flexDirection, direction);
        baseSize = childPadding + childBorder;
      }
    }
    const minVal = isRow ? childStyle.minWidth : childStyle.minHeight;
    const maxVal = isRow ? childStyle.maxWidth : childStyle.maxHeight;
    cflex.minMain = minVal.unit !== UNIT_UNDEFINED ? resolveValue(minVal, mainAxisSize) : 0;
    cflex.maxMain = maxVal.unit !== UNIT_UNDEFINED ? resolveValue(maxVal, mainAxisSize) : Infinity;
    cflex.flexGrow = childStyle.flexGrow;
    let shrink = childStyle.flexShrink;
    if (childStyle.overflow !== OVERFLOW_VISIBLE)
      shrink = Math.max(shrink, 1);
    if (child.hasMeasureFunc() && childStyle.flexGrow > 0)
      shrink = Math.max(shrink, 1);
    cflex.flexShrink = shrink;
    cflex.baseSize = baseSize;
    cflex.mainSize = baseSize;
    cflex.frozen = false;
    totalBaseMain += baseSize + cflex.mainMargin;
    if (cflex.mainStartMarginAuto)
      totalAutoMargins++;
    if (cflex.mainEndMarginAuto)
      totalAutoMargins++;
    if (!hasBaselineAlignment && childStyle.alignSelf === ALIGN_BASELINE) {
      hasBaselineAlignment = true;
    }
  }
  log.debug?.("layoutNode: node.children=%d, relativeCount=%d", node.children.length, relativeCount);
  if (relativeCount > 0) {
    const numLines = breakIntoLines(node, relativeCount, mainAxisSize, mainGap, style.flexWrap);
    const crossGap = isRow ? style.gap[1] : style.gap[0];
    for (let lineIdx = 0;lineIdx < numLines; lineIdx++) {
      const lineChildren = _lineChildren[lineIdx];
      const lineLength = lineChildren.length;
      if (lineLength === 0)
        continue;
      let lineTotalBaseMain = 0;
      for (let i = 0;i < lineLength; i++) {
        const c = lineChildren[i];
        lineTotalBaseMain += c.flex.baseSize + c.flex.mainMargin;
      }
      const lineTotalGaps = lineLength > 1 ? mainGap * (lineLength - 1) : 0;
      let effectiveMainSize = mainAxisSize;
      if (Number.isNaN(mainAxisSize)) {
        const maxMainVal = isRow ? style.maxWidth : style.maxHeight;
        if (maxMainVal.unit !== UNIT_UNDEFINED) {
          const maxMain = resolveValue(maxMainVal, isRow ? availableWidth : availableHeight);
          if (!Number.isNaN(maxMain) && lineTotalBaseMain + lineTotalGaps > maxMain) {
            const innerMain = isRow ? innerLeft + innerRight : innerTop + innerBottom;
            effectiveMainSize = maxMain - innerMain;
          }
        }
      }
      if (!Number.isNaN(effectiveMainSize)) {
        const adjustedFreeSpace = effectiveMainSize - lineTotalBaseMain - lineTotalGaps;
        distributeFlexSpaceForLine(lineChildren, adjustedFreeSpace);
      }
      for (let i = 0;i < lineLength; i++) {
        const f = lineChildren[i].flex;
        f.mainSize = Math.max(f.minMain, Math.min(f.maxMain, f.mainSize));
      }
    }
    for (let lineIdx = 0;lineIdx < numLines; lineIdx++) {
      const lineChildren = _lineChildren[lineIdx];
      const lineLength = lineChildren.length;
      if (lineLength === 0) {
        _lineJustifyStarts[lineIdx] = 0;
        _lineItemSpacings[lineIdx] = mainGap;
        continue;
      }
      let lineUsedMain = 0;
      let lineAutoMargins = 0;
      for (let i = 0;i < lineLength; i++) {
        const c = lineChildren[i];
        lineUsedMain += c.flex.mainSize + c.flex.mainMargin;
        if (c.flex.mainStartMarginAuto)
          lineAutoMargins++;
        if (c.flex.mainEndMarginAuto)
          lineAutoMargins++;
      }
      const lineGaps = lineLength > 1 ? mainGap * (lineLength - 1) : 0;
      lineUsedMain += lineGaps;
      const lineRemainingSpace = Number.isNaN(mainAxisSize) ? 0 : mainAxisSize - lineUsedMain;
      const lineHasAutoMargins = lineAutoMargins > 0;
      if (lineHasAutoMargins) {
        const positiveRemaining = Math.max(0, lineRemainingSpace);
        const autoMarginValue = positiveRemaining / lineAutoMargins;
        for (let i = 0;i < lineLength; i++) {
          const child = lineChildren[i];
          if (child.flex.mainStartMarginAuto) {
            child.flex.mainStartMarginValue = autoMarginValue;
          }
          if (child.flex.mainEndMarginAuto) {
            child.flex.mainEndMarginValue = autoMarginValue;
          }
        }
      }
      let lineStartOffset = 0;
      let lineItemSpacing = mainGap;
      if (!lineHasAutoMargins) {
        switch (style.justifyContent) {
          case JUSTIFY_FLEX_END:
            lineStartOffset = lineRemainingSpace;
            break;
          case JUSTIFY_CENTER:
            lineStartOffset = lineRemainingSpace / 2;
            break;
          case JUSTIFY_SPACE_BETWEEN:
            if (lineLength > 1 && lineRemainingSpace > 0) {
              lineItemSpacing = mainGap + lineRemainingSpace / (lineLength - 1);
            }
            break;
          case JUSTIFY_SPACE_AROUND:
            if (lineLength > 0 && lineRemainingSpace > 0) {
              const extraSpace = lineRemainingSpace / lineLength;
              lineStartOffset = extraSpace / 2;
              lineItemSpacing = mainGap + extraSpace;
            }
            break;
          case JUSTIFY_SPACE_EVENLY:
            if (lineLength > 0 && lineRemainingSpace > 0) {
              const extraSpace = lineRemainingSpace / (lineLength + 1);
              lineStartOffset = extraSpace;
              lineItemSpacing = mainGap + extraSpace;
            }
            break;
        }
      }
      _lineJustifyStarts[lineIdx] = lineStartOffset;
      _lineItemSpacings[lineIdx] = lineItemSpacing;
    }
    const startOffset = _lineJustifyStarts[0];
    const itemSpacing = _lineItemSpacings[0];
    let maxBaseline = 0;
    let baselineZoneHeight = 0;
    const alignItemsIsBaseline = style.alignItems === ALIGN_BASELINE;
    if (hasBaselineAlignment && isRow) {
      let maxChildHeight = 0;
      for (const child of node.children) {
        if (child.flex.relativeIndex < 0)
          continue;
        const childStyle = child.style;
        const topMargin = child.flex.marginT;
        let childWidth;
        let childHeight;
        const widthDim = childStyle.width;
        const heightDim = childStyle.height;
        if (widthDim.unit === UNIT_POINT) {
          childWidth = widthDim.value;
        } else if (widthDim.unit === UNIT_PERCENT && !Number.isNaN(mainAxisSize)) {
          childWidth = mainAxisSize * (widthDim.value / 100);
        } else {
          childWidth = child.flex.mainSize;
        }
        if (heightDim.unit === UNIT_POINT) {
          childHeight = heightDim.value;
        } else if (heightDim.unit === UNIT_PERCENT && !Number.isNaN(crossAxisSize)) {
          childHeight = crossAxisSize * (heightDim.value / 100);
        } else {
          const cached = child.getCachedLayout(child.flex.mainSize, NaN);
          if (cached) {
            incLayoutCacheHits();
            _t?.cacheHit(_tn, child.flex.mainSize, NaN, cached.width, cached.height);
            childWidth = cached.width;
            childHeight = cached.height;
          } else {
            _t?.cacheMiss(_tn, child.flex.mainSize, NaN);
            const savedW = child.layout.width;
            const savedH = child.layout.height;
            measureNode(child, child.flex.mainSize, NaN, direction);
            childWidth = child.layout.width;
            childHeight = child.layout.height;
            child.layout.width = savedW;
            child.layout.height = savedH;
            _t?.measureSaveRestore(_tn, savedW, savedH, childWidth, childHeight);
            child.setCachedLayout(child.flex.mainSize, NaN, childWidth, childHeight);
          }
        }
        if (child.baselineFunc !== null) {
          child.flex.baseline = topMargin + child.baselineFunc(childWidth, childHeight);
        } else {
          child.flex.baseline = topMargin + childHeight;
        }
        maxChildHeight = Math.max(maxChildHeight, topMargin + childHeight + child.flex.marginB);
        if (alignItemsIsBaseline || childStyle.alignSelf === ALIGN_BASELINE) {
          maxBaseline = Math.max(maxBaseline, child.flex.baseline);
        }
      }
      baselineZoneHeight = Math.max(maxBaseline, maxChildHeight);
    }
    let cumulativeCrossOffset = 0;
    const isWrapReverse = style.flexWrap === WRAP_WRAP_REVERSE;
    for (let lineIdx = 0;lineIdx < numLines; lineIdx++) {
      _lineCrossOffsets[lineIdx] = cumulativeCrossOffset;
      const lineChildren = _lineChildren[lineIdx];
      const lineLength = lineChildren.length;
      let maxLineCross = 0;
      for (let i = 0;i < lineLength; i++) {
        const child = lineChildren[i];
        const childStyle = child.style;
        const crossDim = isRow ? childStyle.height : childStyle.width;
        const crossMarginStart = isRow ? child.flex.marginT : child.flex.marginL;
        const crossMarginEnd = isRow ? child.flex.marginB : child.flex.marginR;
        let childCross = 0;
        if (crossDim.unit === UNIT_POINT) {
          childCross = crossDim.value;
        } else if (crossDim.unit === UNIT_PERCENT && !Number.isNaN(crossAxisSize)) {
          childCross = crossAxisSize * (crossDim.value / 100);
        } else if (child.hasMeasureFunc()) {
          const crossMargin = crossMarginStart + crossMarginEnd;
          const availCross = Number.isNaN(crossAxisSize) ? Infinity : crossAxisSize - crossMargin;
          const childMainSize = child.flex.mainSize;
          const mW = isRow ? childMainSize : availCross;
          const mH = isRow ? availCross : childMainSize;
          const mWMode = Number.isNaN(mW) ? MEASURE_MODE_UNDEFINED : MEASURE_MODE_AT_MOST;
          const mHMode = Number.isNaN(mH) ? MEASURE_MODE_UNDEFINED : MEASURE_MODE_AT_MOST;
          const measured = child.cachedMeasure(Number.isNaN(mW) ? Infinity : mW, mWMode, Number.isNaN(mH) ? Infinity : mH, mHMode);
          if (measured) {
            childCross = isRow ? measured.height : measured.width;
          }
        } else if (child.children.length > 0) {
          const savedW = child.layout.width;
          const savedH = child.layout.height;
          measureNode(child, NaN, NaN, direction);
          childCross = isRow ? child.layout.height : child.layout.width;
          child.layout.width = savedW;
          child.layout.height = savedH;
        }
        maxLineCross = Math.max(maxLineCross, childCross + crossMarginStart + crossMarginEnd);
      }
      const lineCrossSize = maxLineCross;
      _lineCrossSizes[lineIdx] = lineCrossSize;
      cumulativeCrossOffset += lineCrossSize + crossGap;
    }
    if (!Number.isNaN(crossAxisSize) && numLines > 0) {
      const totalLineCrossSize = cumulativeCrossOffset - crossGap;
      const freeSpace = crossAxisSize - totalLineCrossSize;
      const alignContent = style.alignContent;
      switch (alignContent) {
        case ALIGN_FLEX_END:
          for (let i = 0;i < numLines; i++) {
            _lineCrossOffsets[i] += freeSpace;
          }
          break;
        case ALIGN_CENTER:
          {
            const centerOffset = freeSpace / 2;
            for (let i = 0;i < numLines; i++) {
              _lineCrossOffsets[i] += centerOffset;
            }
          }
          break;
        case ALIGN_SPACE_BETWEEN:
          if (freeSpace > 0 && numLines > 1) {
            const gap = freeSpace / (numLines - 1);
            for (let i = 1;i < numLines; i++) {
              _lineCrossOffsets[i] += gap * i;
            }
          }
          break;
        case ALIGN_SPACE_AROUND:
          if (freeSpace > 0) {
            const halfGap = freeSpace / (numLines * 2);
            for (let i = 0;i < numLines; i++) {
              _lineCrossOffsets[i] += halfGap + halfGap * 2 * i;
            }
          } else {
            const centerOffset = freeSpace / 2;
            for (let i = 0;i < numLines; i++) {
              _lineCrossOffsets[i] += centerOffset;
            }
          }
          break;
        case ALIGN_SPACE_EVENLY:
          if (freeSpace > 0 && numLines > 0) {
            const gap = freeSpace / (numLines + 1);
            for (let i = 0;i < numLines; i++) {
              _lineCrossOffsets[i] += gap * (i + 1);
            }
          } else if (freeSpace < 0) {
            const centerOffset = freeSpace / 2;
            for (let i = 0;i < numLines; i++) {
              _lineCrossOffsets[i] += centerOffset;
            }
          }
          break;
        case ALIGN_STRETCH:
          if (freeSpace > 0 && numLines > 0) {
            const extraPerLine = freeSpace / numLines;
            for (let i = 0;i < numLines; i++) {
              _lineCrossSizes[i] += extraPerLine;
              if (i > 0) {
                _lineCrossOffsets[i] = _lineCrossOffsets[i - 1] + _lineCrossSizes[i - 1] + crossGap;
              }
            }
          }
          break;
      }
      if (isWrapReverse) {
        let totalLineCrossSize2 = 0;
        for (let i = 0;i < numLines; i++) {
          totalLineCrossSize2 += _lineCrossSizes[i];
        }
        totalLineCrossSize2 += crossGap * (numLines - 1);
        const crossStartOffset = crossAxisSize - totalLineCrossSize2;
        for (let i = 0;i < numLines; i++) {
          _lineCrossOffsets[i] += crossStartOffset;
        }
      }
    }
    let savedLineCrossSizes = null;
    let savedLineCrossOffsets = null;
    let savedLineJustifyStarts = null;
    let savedLineItemSpacings = null;
    if (numLines > 1) {
      savedLineCrossSizes = new Float64Array(numLines);
      savedLineCrossOffsets = new Float64Array(numLines);
      savedLineJustifyStarts = new Float64Array(numLines);
      savedLineItemSpacings = new Float64Array(numLines);
      for (let i = 0;i < numLines; i++) {
        savedLineCrossSizes[i] = _lineCrossSizes[i];
        savedLineCrossOffsets[i] = _lineCrossOffsets[i];
        savedLineJustifyStarts[i] = _lineJustifyStarts[i];
        savedLineItemSpacings[i] = _lineItemSpacings[i];
      }
    }
    let effectiveMainAxisSize = mainAxisSize;
    const mainIsAuto = isRow ? style.width.unit !== UNIT_POINT && style.width.unit !== UNIT_PERCENT : style.height.unit !== UNIT_POINT && style.height.unit !== UNIT_PERCENT;
    const totalGaps = relativeCount > 1 ? mainGap * (relativeCount - 1) : 0;
    if (effectiveReverse && mainIsAuto) {
      let totalContent = 0;
      for (const child of node.children) {
        if (child.flex.relativeIndex < 0)
          continue;
        totalContent += child.flex.mainSize + child.flex.mainStartMarginValue + child.flex.mainEndMarginValue;
      }
      totalContent += totalGaps;
      effectiveMainAxisSize = totalContent;
    }
    let mainPos = effectiveReverse ? effectiveMainAxisSize - startOffset : startOffset;
    let currentLineIdx = -1;
    let relIdx = 0;
    let lineChildIdx = 0;
    let currentLineLength = 0;
    let currentItemSpacing = itemSpacing;
    log.debug?.("positioning children: isRow=%s, startOffset=%d, relativeCount=%d, effectiveReverse=%s, numLines=%d", isRow, startOffset, relativeCount, effectiveReverse, numLines);
    for (const child of node.children) {
      if (child.flex.relativeIndex < 0)
        continue;
      const cflex = child.flex;
      const childStyle = child.style;
      const childLineIdx = cflex.lineIndex;
      if (childLineIdx !== currentLineIdx) {
        currentLineIdx = childLineIdx;
        lineChildIdx = 0;
        currentLineLength = _lineChildren[childLineIdx].length;
        const lineOffset = savedLineJustifyStarts ? savedLineJustifyStarts[childLineIdx] : _lineJustifyStarts[childLineIdx];
        currentItemSpacing = savedLineItemSpacings ? savedLineItemSpacings[childLineIdx] : _lineItemSpacings[childLineIdx];
        mainPos = effectiveReverse ? effectiveMainAxisSize - lineOffset : lineOffset;
      }
      const lineCrossOffset = savedLineCrossOffsets ? savedLineCrossOffsets[childLineIdx] : childLineIdx < MAX_FLEX_LINES ? _lineCrossOffsets[childLineIdx] : 0;
      let childMarginLeft;
      let childMarginTop;
      let childMarginRight;
      let childMarginBottom;
      if (isRow) {
        childMarginLeft = cflex.mainStartMarginAuto && !effectiveReverse ? cflex.mainStartMarginValue : cflex.mainEndMarginAuto && effectiveReverse ? cflex.mainEndMarginValue : cflex.marginL;
        childMarginRight = cflex.mainEndMarginAuto && !effectiveReverse ? cflex.mainEndMarginValue : cflex.mainStartMarginAuto && effectiveReverse ? cflex.mainStartMarginValue : cflex.marginR;
        childMarginTop = cflex.marginT;
        childMarginBottom = cflex.marginB;
      } else {
        childMarginTop = cflex.mainStartMarginAuto && !isReverse ? cflex.mainStartMarginValue : cflex.mainEndMarginAuto && isReverse ? cflex.mainEndMarginValue : cflex.marginT;
        childMarginBottom = cflex.mainEndMarginAuto && !isReverse ? cflex.mainEndMarginValue : cflex.mainStartMarginAuto && isReverse ? cflex.mainStartMarginValue : cflex.marginB;
        childMarginLeft = cflex.marginL;
        childMarginRight = cflex.marginR;
      }
      const childMainSize = cflex.mainSize;
      let alignment = style.alignItems;
      if (childStyle.alignSelf !== ALIGN_AUTO) {
        alignment = childStyle.alignSelf;
      }
      const childCrossDimForAR = isRow ? childStyle.height : childStyle.width;
      const childCrossIsAutoForAR = childCrossDimForAR.unit === UNIT_AUTO || childCrossDimForAR.unit === UNIT_UNDEFINED;
      if (alignment === ALIGN_STRETCH && childStyle.alignSelf === ALIGN_AUTO && !Number.isNaN(childStyle.aspectRatio) && childStyle.aspectRatio > 0 && childCrossIsAutoForAR) {
        alignment = ALIGN_FLEX_START;
      }
      let childCrossSize;
      const crossDim = isRow ? childStyle.height : childStyle.width;
      const crossMargin = isRow ? childMarginTop + childMarginBottom : childMarginLeft + childMarginRight;
      const parentCrossDim = isRow ? style.height : style.width;
      const parentHasDefiniteCrossStyle = parentCrossDim.unit === UNIT_POINT || parentCrossDim.unit === UNIT_PERCENT;
      const parentHasDefiniteCross = parentHasDefiniteCrossStyle || !Number.isNaN(crossAxisSize);
      if (crossDim.unit === UNIT_POINT) {
        childCrossSize = crossDim.value;
      } else if (crossDim.unit === UNIT_PERCENT) {
        childCrossSize = resolveValue(crossDim, crossAxisSize);
      } else if (parentHasDefiniteCross && alignment === ALIGN_STRETCH) {
        const lineCross = numLines > 1 ? savedLineCrossSizes ? savedLineCrossSizes[childLineIdx] : _lineCrossSizes[childLineIdx] : crossAxisSize;
        childCrossSize = lineCross - crossMargin;
      } else {
        childCrossSize = NaN;
      }
      const crossMinVal = isRow ? childStyle.minHeight : childStyle.minWidth;
      const crossMaxVal = isRow ? childStyle.maxHeight : childStyle.maxWidth;
      const crossMin = crossMinVal.unit !== UNIT_UNDEFINED ? resolveValue(crossMinVal, crossAxisSize) : 0;
      const crossMax = crossMaxVal.unit !== UNIT_UNDEFINED ? resolveValue(crossMaxVal, crossAxisSize) : Infinity;
      if (Number.isNaN(childCrossSize)) {
        if (crossMin > 0) {
          childCrossSize = crossMin;
        }
      } else {
        childCrossSize = Math.max(crossMin, Math.min(crossMax, childCrossSize));
      }
      const mainDim = isRow ? childStyle.width : childStyle.height;
      const hasDefiniteFlexBasis = childStyle.flexBasis.unit === UNIT_POINT || childStyle.flexBasis.unit === UNIT_PERCENT;
      const mainIsAutoChild = (mainDim.unit === UNIT_AUTO || mainDim.unit === UNIT_UNDEFINED) && !hasDefiniteFlexBasis;
      const hasFlexGrow = cflex.flexGrow > 0;
      const effectiveMainSize = childMainSize;
      let childWidth = isRow ? effectiveMainSize : childCrossSize;
      let childHeight = isRow ? childCrossSize : effectiveMainSize;
      const shouldMeasure = child.hasMeasureFunc() && child.children.length === 0 && !hasFlexGrow;
      if (shouldMeasure) {
        const widthAuto = childStyle.width.unit === UNIT_AUTO || childStyle.width.unit === UNIT_UNDEFINED;
        const heightAuto = childStyle.height.unit === UNIT_AUTO || childStyle.height.unit === UNIT_UNDEFINED;
        if (widthAuto || heightAuto) {
          const widthMode = widthAuto ? MEASURE_MODE_AT_MOST : MEASURE_MODE_EXACTLY;
          const heightMode = heightAuto ? MEASURE_MODE_UNDEFINED : MEASURE_MODE_EXACTLY;
          const rawAvailW = widthAuto ? isRow ? mainAxisSize - mainPos : crossAxisSize - crossMargin : childStyle.width.value;
          const rawAvailH = heightAuto ? isRow ? crossAxisSize - crossMargin : mainAxisSize - mainPos : childStyle.height.value;
          const availW = Number.isNaN(rawAvailW) ? Infinity : rawAvailW;
          const availH = Number.isNaN(rawAvailH) ? Infinity : rawAvailH;
          const measured = child.cachedMeasure(availW, widthMode, availH, heightMode);
          if (widthAuto) {
            childWidth = measured.width;
          }
          if (heightAuto) {
            childHeight = measured.height;
          }
        }
      }
      let childX;
      let childY;
      if (effectiveReverse) {
        if (isRow) {
          childX = mainPos - childMainSize - childMarginRight;
          childY = lineCrossOffset + childMarginTop;
        } else {
          childX = lineCrossOffset + childMarginLeft;
          childY = mainPos - childMainSize - childMarginTop;
        }
      } else {
        childX = isRow ? mainPos + childMarginLeft : lineCrossOffset + childMarginLeft;
        childY = isRow ? lineCrossOffset + childMarginTop : mainPos + childMarginTop;
      }
      const fractionalLeft = innerLeft + childX;
      const fractionalTop = innerTop + childY;
      let posOffsetX = 0;
      let posOffsetY = 0;
      if (childStyle.positionType === POSITION_TYPE_RELATIVE) {
        const relLeftPos = resolvePositionEdge(childStyle.position, 0, direction);
        const relTopPos = childStyle.position[1];
        const relRightPos = resolvePositionEdge(childStyle.position, 2, direction);
        const relBottomPos = childStyle.position[3];
        if (relLeftPos.unit !== UNIT_UNDEFINED) {
          posOffsetX = resolveValue(relLeftPos, contentWidth);
        } else if (relRightPos.unit !== UNIT_UNDEFINED) {
          posOffsetX = -resolveValue(relRightPos, contentWidth);
        }
        if (relTopPos.unit !== UNIT_UNDEFINED) {
          posOffsetY = resolveValue(relTopPos, contentHeight);
        } else if (relBottomPos.unit !== UNIT_UNDEFINED) {
          posOffsetY = -resolveValue(relBottomPos, contentHeight);
        }
      }
      const absChildLeft = absX + marginLeft + parentPosOffsetX + fractionalLeft + posOffsetX;
      const absChildTop = absY + marginTop + parentPosOffsetY + fractionalTop + posOffsetY;
      let roundedAbsMainStart;
      let roundedAbsMainEnd;
      let edgeBasedMainSize;
      const useEdgeBasedRounding = childMainSize > 0;
      const childPaddingL = resolveEdgeValue(childStyle.padding, 0, childStyle.flexDirection, contentWidth, direction);
      const childPaddingT = resolveEdgeValue(childStyle.padding, 1, childStyle.flexDirection, contentWidth, direction);
      const childPaddingR = resolveEdgeValue(childStyle.padding, 2, childStyle.flexDirection, contentWidth, direction);
      const childPaddingB = resolveEdgeValue(childStyle.padding, 3, childStyle.flexDirection, contentWidth, direction);
      const childBorderL = resolveEdgeBorderValue(childStyle.border, 0, childStyle.flexDirection, direction);
      const childBorderT = resolveEdgeBorderValue(childStyle.border, 1, childStyle.flexDirection, direction);
      const childBorderR = resolveEdgeBorderValue(childStyle.border, 2, childStyle.flexDirection, direction);
      const childBorderB = resolveEdgeBorderValue(childStyle.border, 3, childStyle.flexDirection, direction);
      const childMinW = childPaddingL + childPaddingR + childBorderL + childBorderR;
      const childMinH = childPaddingT + childPaddingB + childBorderT + childBorderB;
      const childMinMain = isRow ? childMinW : childMinH;
      const constrainedMainSize = Math.max(childMainSize, childMinMain);
      if (useEdgeBasedRounding) {
        if (isRow) {
          roundedAbsMainStart = Math.round(absChildLeft);
          roundedAbsMainEnd = Math.round(absChildLeft + constrainedMainSize);
          edgeBasedMainSize = roundedAbsMainEnd - roundedAbsMainStart;
        } else {
          roundedAbsMainStart = Math.round(absChildTop);
          roundedAbsMainEnd = Math.round(absChildTop + constrainedMainSize);
          edgeBasedMainSize = roundedAbsMainEnd - roundedAbsMainStart;
        }
      } else {
        roundedAbsMainStart = isRow ? Math.round(absChildLeft) : Math.round(absChildTop);
        edgeBasedMainSize = childMinMain;
      }
      const posRound = shouldMeasure ? Math.floor : Math.round;
      const childLeft = posRound(fractionalLeft + posOffsetX);
      const childTop = posRound(fractionalTop + posOffsetY);
      const crossDimForLayoutCall = isRow ? childStyle.height : childStyle.width;
      const crossIsAutoForLayoutCall = crossDimForLayoutCall.unit === UNIT_AUTO || crossDimForLayoutCall.unit === UNIT_UNDEFINED;
      const mainDimForLayoutCall = isRow ? childStyle.width : childStyle.height;
      const mainIsPercentForLayoutCall = mainDimForLayoutCall.unit === UNIT_PERCENT;
      const crossIsPercentForLayoutCall = crossDimForLayoutCall.unit === UNIT_PERCENT;
      const flexDistChanged = child.flex.mainSize !== child.flex.baseSize;
      const hasMeasureLeaf = child.hasMeasureFunc() && child.children.length === 0;
      const passWidthToChild = isRow && mainIsAutoChild && !hasFlexGrow && !flexDistChanged && !hasMeasureLeaf ? NaN : !isRow && crossIsAutoForLayoutCall && !parentHasDefiniteCross ? NaN : isRow && mainIsPercentForLayoutCall ? mainAxisSize : !isRow && crossIsPercentForLayoutCall ? crossAxisSize : childWidth;
      const passHeightToChild = !isRow && mainIsAutoChild && !hasFlexGrow && !flexDistChanged && !hasMeasureLeaf ? NaN : isRow && crossIsAutoForLayoutCall && !parentHasDefiniteCross ? NaN : !isRow && mainIsPercentForLayoutCall ? mainAxisSize : isRow && crossIsPercentForLayoutCall ? crossAxisSize : childHeight;
      const childAbsX = absChildLeft - childMarginLeft;
      const childAbsY = absChildTop - childMarginTop;
      layoutNode(child, passWidthToChild, passHeightToChild, childLeft, childTop, childAbsX, childAbsY, direction);
      if (childWidth < childMinW)
        childWidth = childMinW;
      if (childHeight < childMinH)
        childHeight = childMinH;
      const hasMeasure = child.hasMeasureFunc() && child.children.length === 0;
      const flexDistributionChangedSize = child.flex.mainSize !== child.flex.baseSize;
      if (!mainIsAuto && !mainIsAutoChild || hasFlexGrow || hasMeasure || flexDistributionChangedSize) {
        if (isRow) {
          _t?.parentOverride(_tn, "main", child.layout.width, edgeBasedMainSize);
          child.layout.width = edgeBasedMainSize;
        } else {
          _t?.parentOverride(_tn, "main", child.layout.height, edgeBasedMainSize);
          child.layout.height = edgeBasedMainSize;
        }
      }
      const crossDimForCheck = isRow ? childStyle.height : childStyle.width;
      const crossIsAuto = crossDimForCheck.unit === UNIT_AUTO || crossDimForCheck.unit === UNIT_UNDEFINED;
      const parentCrossIsAuto = !parentHasDefiniteCross;
      const hasCrossMinMax = crossMinVal.unit !== UNIT_UNDEFINED || crossMaxVal.unit !== UNIT_UNDEFINED;
      const shouldOverrideCross = !crossIsAuto || !parentCrossIsAuto && alignment === ALIGN_STRETCH || hasCrossMinMax && !Number.isNaN(childCrossSize);
      if (shouldOverrideCross) {
        if (isRow) {
          child.layout.height = Math.round(childHeight);
        } else {
          child.layout.width = Math.round(childWidth);
        }
      }
      child.layout.left = childLeft;
      child.layout.top = childTop;
      childWidth = child.layout.width;
      childHeight = child.layout.height;
      const finalCrossSize = isRow ? child.layout.height : child.layout.width;
      let crossOffset = 0;
      const crossStartIndex = isRow ? 1 : 0;
      const crossEndIndex = isRow ? 3 : 2;
      const hasAutoStartMargin = isEdgeAuto(childStyle.margin, crossStartIndex, style.flexDirection, direction);
      const hasAutoEndMargin = isEdgeAuto(childStyle.margin, crossEndIndex, style.flexDirection, direction);
      const useBaselineZone = hasBaselineAlignment && isRow && !alignItemsIsBaseline && alignment !== ALIGN_BASELINE && baselineZoneHeight > 0;
      const effectiveCrossSize = useBaselineZone ? baselineZoneHeight : crossAxisSize;
      const availableCrossSpace = effectiveCrossSize - finalCrossSize - crossMargin;
      if (hasAutoStartMargin && hasAutoEndMargin) {
        crossOffset = Math.max(0, availableCrossSpace) / 2;
      } else if (hasAutoStartMargin) {
        crossOffset = Math.max(0, availableCrossSpace);
      } else if (hasAutoEndMargin) {
        crossOffset = 0;
      } else {
        switch (alignment) {
          case ALIGN_FLEX_END:
            crossOffset = availableCrossSpace;
            break;
          case ALIGN_CENTER:
            crossOffset = availableCrossSpace / 2;
            break;
          case ALIGN_BASELINE:
            if (isRow && hasBaselineAlignment) {
              crossOffset = maxBaseline - child.flex.baseline;
            }
            break;
        }
      }
      if (crossOffset !== 0) {
        const crossRound = shouldMeasure ? Math.floor : Math.round;
        if (isRow) {
          child.layout.top += crossRound(crossOffset);
        } else {
          child.layout.left += crossRound(crossOffset);
        }
      }
      const phaseEightOverrode = !mainIsAuto && !mainIsAutoChild || hasFlexGrow || hasMeasure || flexDistributionChangedSize;
      const fractionalMainSize = phaseEightOverrode ? constrainedMainSize : isRow ? child.layout.width : child.layout.height;
      const totalMainMargin = cflex.mainStartMarginValue + cflex.mainEndMarginValue;
      log.debug?.("  child %d: mainPos=%d -> top=%d (fractionalMainSize=%d, totalMainMargin=%d)", relIdx, mainPos, child.layout.top, fractionalMainSize, totalMainMargin);
      if (effectiveReverse) {
        mainPos -= fractionalMainSize + totalMainMargin;
        if (lineChildIdx < currentLineLength - 1) {
          mainPos -= currentItemSpacing;
        }
      } else {
        mainPos += fractionalMainSize + totalMainMargin;
        if (lineChildIdx < currentLineLength - 1) {
          mainPos += currentItemSpacing;
        }
      }
      relIdx++;
      lineChildIdx++;
    }
    let actualUsedMain = 0;
    for (const child of node.children) {
      if (child.flex.relativeIndex < 0)
        continue;
      const childMainSize = isRow ? child.layout.width : child.layout.height;
      const totalMainMargin = child.flex.mainStartMarginValue + child.flex.mainEndMarginValue;
      actualUsedMain += childMainSize + totalMainMargin;
    }
    actualUsedMain += totalGaps;
    const hasAR = !Number.isNaN(aspectRatio) && aspectRatio > 0;
    if (isRow && style.width.unit !== UNIT_POINT && style.width.unit !== UNIT_PERCENT && !hasAR) {
      nodeWidth = actualUsedMain + innerLeft + innerRight;
    }
    if (!isRow && style.height.unit !== UNIT_POINT && style.height.unit !== UNIT_PERCENT && !hasAR) {
      nodeHeight = actualUsedMain + innerTop + innerBottom;
    }
    let totalCrossSize = 0;
    if (numLines > 1) {
      for (let i = 0;i < numLines; i++) {
        totalCrossSize += savedLineCrossSizes ? savedLineCrossSizes[i] : _lineCrossSizes[i];
      }
      totalCrossSize += crossGap * (numLines - 1);
    } else {
      for (const child of node.children) {
        if (child.flex.relativeIndex < 0)
          continue;
        const childCross = isRow ? child.layout.height : child.layout.width;
        const childMargin = isRow ? resolveEdgeValue(child.style.margin, 1, style.flexDirection, contentWidth, direction) + resolveEdgeValue(child.style.margin, 3, style.flexDirection, contentWidth, direction) : resolveEdgeValue(child.style.margin, 0, style.flexDirection, contentWidth, direction) + resolveEdgeValue(child.style.margin, 2, style.flexDirection, contentWidth, direction);
        totalCrossSize = Math.max(totalCrossSize, childCross + childMargin);
      }
    }
    if (isRow && style.height.unit !== UNIT_POINT && style.height.unit !== UNIT_PERCENT && Number.isNaN(availableHeight) && !hasAR) {
      nodeHeight = totalCrossSize + innerTop + innerBottom;
    }
    if (!isRow && style.width.unit !== UNIT_POINT && style.width.unit !== UNIT_PERCENT && Number.isNaN(availableWidth) && !hasAR) {
      nodeWidth = totalCrossSize + innerLeft + innerRight;
    }
  }
  nodeWidth = applyMinMax(nodeWidth, style.minWidth, style.maxWidth, availableWidth);
  nodeHeight = applyMinMax(nodeHeight, style.minHeight, style.maxHeight, availableHeight);
  if (!Number.isNaN(nodeWidth) && nodeWidth < minInnerWidth) {
    nodeWidth = minInnerWidth;
  }
  if (!Number.isNaN(nodeHeight) && nodeHeight < minInnerHeight) {
    nodeHeight = minInnerHeight;
  }
  if (Number.isNaN(crossAxisSize) && relativeCount > 0) {
    const finalCross = isRow ? nodeHeight - innerTop - innerBottom : nodeWidth - innerLeft - innerRight;
    if (!Number.isNaN(finalCross) && finalCross > 0) {
      for (const child of node.children) {
        if (child.flex.relativeIndex < 0)
          continue;
        const cstyle = child.style;
        let childAlign = style.alignItems;
        if (cstyle.alignSelf !== ALIGN_AUTO) {
          childAlign = cstyle.alignSelf;
        }
        const cCrossDim = isRow ? cstyle.height : cstyle.width;
        const cCrossIsAuto = cCrossDim.unit === UNIT_AUTO || cCrossDim.unit === UNIT_UNDEFINED;
        if (childAlign === ALIGN_STRETCH && cstyle.alignSelf === ALIGN_AUTO && !Number.isNaN(cstyle.aspectRatio) && cstyle.aspectRatio > 0 && cCrossIsAuto) {
          childAlign = ALIGN_FLEX_START;
        }
        if (childAlign !== ALIGN_STRETCH)
          continue;
        if (!cCrossIsAuto)
          continue;
        const cCrossMargin = isRow ? resolveEdgeValue(cstyle.margin, 1, style.flexDirection, contentWidth, direction) + resolveEdgeValue(cstyle.margin, 3, style.flexDirection, contentWidth, direction) : resolveEdgeValue(cstyle.margin, 0, style.flexDirection, contentWidth, direction) + resolveEdgeValue(cstyle.margin, 2, style.flexDirection, contentWidth, direction);
        const stretchedCross = finalCross - cCrossMargin;
        const currentCross = isRow ? child.layout.height : child.layout.width;
        if (Math.round(stretchedCross) <= currentCross)
          continue;
        const savedLeft = child.layout.left;
        const savedTop = child.layout.top;
        const cMarginL = resolveEdgeValue(cstyle.margin, 0, style.flexDirection, contentWidth, direction);
        const cMarginT = resolveEdgeValue(cstyle.margin, 1, style.flexDirection, contentWidth, direction);
        const cAbsX = absX + innerLeft + savedLeft - cMarginL;
        const cAbsY = absY + innerTop + savedTop - cMarginT;
        const passW = isRow ? child.layout.width : stretchedCross;
        const passH = isRow ? stretchedCross : child.layout.height;
        layoutNode(child, passW, passH, savedLeft, savedTop, cAbsX, cAbsY, direction);
        child.layout.left = savedLeft;
        child.layout.top = savedTop;
        if (isRow) {
          child.layout.height = Math.round(stretchedCross);
        } else {
          child.layout.width = Math.round(stretchedCross);
        }
      }
      if (Number.isNaN(crossAxisSize) && relativeCount > 0) {
        const finalCross9c = isRow ? nodeHeight - innerTop - innerBottom : nodeWidth - innerLeft - innerRight;
        if (!Number.isNaN(finalCross9c) && finalCross9c > 0) {
          for (const child of node.children) {
            if (child.flex.relativeIndex < 0)
              continue;
            const cstyle = child.style;
            let childAlign = style.alignItems;
            if (cstyle.alignSelf !== ALIGN_AUTO) {
              childAlign = cstyle.alignSelf;
            }
            const cCrossDim = isRow ? cstyle.height : cstyle.width;
            const cCrossIsAuto = cCrossDim.unit === UNIT_AUTO || cCrossDim.unit === UNIT_UNDEFINED;
            if (childAlign === ALIGN_STRETCH && cstyle.alignSelf === ALIGN_AUTO && !Number.isNaN(cstyle.aspectRatio) && cstyle.aspectRatio > 0 && cCrossIsAuto) {
              childAlign = ALIGN_FLEX_START;
            }
            const crossStartIdx = isRow ? 1 : 0;
            const crossEndIdx = isRow ? 3 : 2;
            const hasAutoStart = isEdgeAuto(cstyle.margin, crossStartIdx, style.flexDirection, direction);
            const hasAutoEnd = isEdgeAuto(cstyle.margin, crossEndIdx, style.flexDirection, direction);
            const needsAlignment = hasAutoStart || hasAutoEnd || childAlign === ALIGN_CENTER || childAlign === ALIGN_FLEX_END;
            if (!needsAlignment)
              continue;
            const childCrossSize = isRow ? child.layout.height : child.layout.width;
            const cCrossMargin = isRow ? resolveEdgeValue(cstyle.margin, 1, style.flexDirection, contentWidth, direction) + resolveEdgeValue(cstyle.margin, 3, style.flexDirection, contentWidth, direction) : resolveEdgeValue(cstyle.margin, 0, style.flexDirection, contentWidth, direction) + resolveEdgeValue(cstyle.margin, 2, style.flexDirection, contentWidth, direction);
            const availSpace = finalCross9c - childCrossSize - cCrossMargin;
            let crossOffset = 0;
            if (hasAutoStart && hasAutoEnd) {
              crossOffset = Math.max(0, availSpace) / 2;
            } else if (hasAutoStart) {
              crossOffset = Math.max(0, availSpace);
            } else if (hasAutoEnd) {
              crossOffset = 0;
            } else {
              switch (childAlign) {
                case ALIGN_FLEX_END:
                  crossOffset = availSpace;
                  break;
                case ALIGN_CENTER:
                  crossOffset = availSpace / 2;
                  break;
              }
            }
            if (isRow) {
              if (Number.isNaN(child.layout.top)) {
                const cMarginT = resolveEdgeValue(cstyle.margin, 1, style.flexDirection, contentWidth, direction);
                child.layout.top = Math.round(cMarginT + crossOffset);
              } else if (crossOffset !== 0) {
                child.layout.top += Math.round(crossOffset);
              }
            } else {
              if (Number.isNaN(child.layout.left)) {
                const cMarginL = resolveEdgeValue(cstyle.margin, 0, style.flexDirection, contentWidth, direction);
                child.layout.left = Math.round(cMarginL + crossOffset);
              } else if (crossOffset !== 0) {
                child.layout.left += Math.round(crossOffset);
              }
            }
          }
        }
      }
    }
  }
  const absNodeLeft = absX + marginLeft + parentPosOffsetX;
  const absNodeTop = absY + marginTop + parentPosOffsetY;
  const absNodeRight = absNodeLeft + nodeWidth;
  const absNodeBottom = absNodeTop + nodeHeight;
  const roundedAbsLeft = Math.round(absNodeLeft);
  const roundedAbsTop = Math.round(absNodeTop);
  const roundedAbsRight = Math.round(absNodeRight);
  const roundedAbsBottom = Math.round(absNodeBottom);
  layout.width = roundedAbsRight - roundedAbsLeft;
  layout.height = roundedAbsBottom - roundedAbsTop;
  const roundedAbsParentLeft = Math.round(absX);
  const roundedAbsParentTop = Math.round(absY);
  layout.left = roundedAbsLeft - roundedAbsParentLeft;
  layout.top = roundedAbsTop - roundedAbsParentTop;
  const absInnerLeft = borderLeft;
  const absInnerTop = borderTop;
  const absInnerRight = borderRight;
  const absInnerBottom = borderBottom;
  const absPaddingBoxW = nodeWidth - absInnerLeft - absInnerRight;
  const absPaddingBoxH = nodeHeight - absInnerTop - absInnerBottom;
  const absContentBoxW = absPaddingBoxW - paddingLeft - paddingRight;
  const absContentBoxH = absPaddingBoxH - paddingTop - paddingBottom;
  for (const child of node.children) {
    if (child.style.display === DISPLAY_NONE)
      continue;
    if (child.style.positionType !== POSITION_TYPE_ABSOLUTE)
      continue;
    const childStyle = child.style;
    const childMarginLeft = resolveEdgeValue(childStyle.margin, 0, style.flexDirection, nodeWidth, direction);
    const childMarginTop = resolveEdgeValue(childStyle.margin, 1, style.flexDirection, nodeWidth, direction);
    const childMarginRight = resolveEdgeValue(childStyle.margin, 2, style.flexDirection, nodeWidth, direction);
    const childMarginBottom = resolveEdgeValue(childStyle.margin, 3, style.flexDirection, nodeWidth, direction);
    const hasAutoMarginLeft = isEdgeAuto(childStyle.margin, 0, style.flexDirection, direction);
    const hasAutoMarginRight = isEdgeAuto(childStyle.margin, 2, style.flexDirection, direction);
    const hasAutoMarginTop = isEdgeAuto(childStyle.margin, 1, style.flexDirection, direction);
    const hasAutoMarginBottom = isEdgeAuto(childStyle.margin, 3, style.flexDirection, direction);
    const leftPos = resolvePositionEdge(childStyle.position, 0, direction);
    const topPos = childStyle.position[1];
    const rightPos = resolvePositionEdge(childStyle.position, 2, direction);
    const bottomPos = childStyle.position[3];
    const hasLeft = leftPos.unit !== UNIT_UNDEFINED;
    const hasRight = rightPos.unit !== UNIT_UNDEFINED;
    const hasTop = topPos.unit !== UNIT_UNDEFINED;
    const hasBottom = bottomPos.unit !== UNIT_UNDEFINED;
    const leftOffset = resolveValue(leftPos, absContentBoxW);
    const topOffset = resolveValue(topPos, absContentBoxH);
    const rightOffset = resolveValue(rightPos, absContentBoxW);
    const bottomOffset = resolveValue(bottomPos, absContentBoxH);
    const contentW = absPaddingBoxW;
    const contentH = absPaddingBoxH;
    let childAvailWidth;
    const widthIsAuto = childStyle.width.unit === UNIT_AUTO || childStyle.width.unit === UNIT_UNDEFINED;
    const widthIsPercent = childStyle.width.unit === UNIT_PERCENT;
    if (widthIsAuto && hasLeft && hasRight) {
      childAvailWidth = contentW - leftOffset - rightOffset - childMarginLeft - childMarginRight;
    } else if (widthIsAuto) {
      childAvailWidth = NaN;
    } else if (widthIsPercent) {
      childAvailWidth = absContentBoxW;
    } else {
      childAvailWidth = contentW;
    }
    let childAvailHeight;
    const heightIsAuto = childStyle.height.unit === UNIT_AUTO || childStyle.height.unit === UNIT_UNDEFINED;
    const heightIsPercent = childStyle.height.unit === UNIT_PERCENT;
    if (heightIsAuto && hasTop && hasBottom) {
      childAvailHeight = contentH - topOffset - bottomOffset - childMarginTop - childMarginBottom;
    } else if (heightIsAuto) {
      childAvailHeight = NaN;
    } else if (heightIsPercent) {
      childAvailHeight = absContentBoxH;
    } else {
      childAvailHeight = contentH;
    }
    let childX = childMarginLeft + leftOffset;
    let childY = childMarginTop + topOffset;
    const childAbsX = absX + marginLeft + absInnerLeft + leftOffset;
    const childAbsY = absY + marginTop + absInnerTop + topOffset;
    const clampIfNumber = (v) => Number.isNaN(v) ? NaN : Math.max(0, v);
    layoutNode(child, clampIfNumber(childAvailWidth), clampIfNumber(childAvailHeight), layout.left + absInnerLeft + childX, layout.top + absInnerTop + childY, childAbsX, childAbsY, direction);
    const childWidth = child.layout.width;
    const childHeight = child.layout.height;
    if (!hasLeft && !hasRight) {
      if (isRow) {
        const freeSpaceX = contentW - childWidth - childMarginLeft - childMarginRight;
        switch (style.justifyContent) {
          case JUSTIFY_CENTER:
            childX = childMarginLeft + freeSpaceX / 2;
            break;
          case JUSTIFY_FLEX_END:
            childX = childMarginLeft + freeSpaceX;
            break;
          default:
            childX = childMarginLeft;
            break;
        }
      } else {
        let alignment = style.alignItems;
        if (childStyle.alignSelf !== ALIGN_AUTO) {
          alignment = childStyle.alignSelf;
        }
        const freeSpaceX = contentW - childWidth - childMarginLeft - childMarginRight;
        switch (alignment) {
          case ALIGN_CENTER:
            childX = childMarginLeft + freeSpaceX / 2;
            break;
          case ALIGN_FLEX_END:
            childX = childMarginLeft + freeSpaceX;
            break;
          case ALIGN_STRETCH:
            break;
          default:
            childX = childMarginLeft;
            break;
        }
      }
    } else if (!hasLeft && hasRight) {
      childX = contentW - rightOffset - childMarginRight - childWidth;
    } else if (hasLeft && hasRight) {
      if (widthIsAuto) {
        child.layout.width = Math.round(childAvailWidth);
      } else if (hasAutoMarginLeft || hasAutoMarginRight) {
        const freeSpace = Math.max(0, contentW - leftOffset - rightOffset - childWidth);
        if (hasAutoMarginLeft && hasAutoMarginRight) {
          childX = leftOffset + freeSpace / 2;
        } else if (hasAutoMarginLeft) {
          childX = leftOffset + freeSpace;
        }
      }
    }
    if (!hasTop && !hasBottom) {
      if (isRow) {
        let alignment = style.alignItems;
        if (childStyle.alignSelf !== ALIGN_AUTO) {
          alignment = childStyle.alignSelf;
        }
        const freeSpaceY = contentH - childHeight - childMarginTop - childMarginBottom;
        switch (alignment) {
          case ALIGN_CENTER:
            childY = childMarginTop + freeSpaceY / 2;
            break;
          case ALIGN_FLEX_END:
            childY = childMarginTop + freeSpaceY;
            break;
          case ALIGN_STRETCH:
            break;
          default:
            childY = childMarginTop;
            break;
        }
      } else {
        const freeSpaceY = contentH - childHeight - childMarginTop - childMarginBottom;
        switch (style.justifyContent) {
          case JUSTIFY_CENTER:
            childY = childMarginTop + freeSpaceY / 2;
            break;
          case JUSTIFY_FLEX_END:
            childY = childMarginTop + freeSpaceY;
            break;
          default:
            childY = childMarginTop;
            break;
        }
      }
    } else if (!hasTop && hasBottom) {
      childY = contentH - bottomOffset - childMarginBottom - childHeight;
    } else if (hasTop && hasBottom) {
      if (heightIsAuto) {
        child.layout.height = Math.round(childAvailHeight);
      } else if (hasAutoMarginTop || hasAutoMarginBottom) {
        const freeSpace = Math.max(0, contentH - topOffset - bottomOffset - childHeight);
        if (hasAutoMarginTop && hasAutoMarginBottom) {
          childY = topOffset + freeSpace / 2;
        } else if (hasAutoMarginTop) {
          childY = topOffset + freeSpace;
        }
      }
    }
    child.layout.left = Math.round(absInnerLeft + childX);
    child.layout.top = Math.round(absInnerTop + childY);
  }
  flex.lastAvailW = availableWidth;
  flex.lastAvailH = availableHeight;
  flex.lastOffsetX = offsetX;
  flex.lastOffsetY = offsetY;
  flex.lastAbsX = absX;
  flex.lastAbsY = absY;
  flex.lastDir = direction;
  flex.layoutValid = true;
  _t?.layoutExit(_tn, layout.width, layout.height);
}
var init_layout_zero = __esm(async () => {
  init_utils();
  init_layout_helpers();
  init_layout_traversal();
  init_layout_measure();
  init_layout_helpers();
  init_layout_traversal();
  init_layout_measure();
  init_layout_flex_lines();
  await init_logger();
});

// ../flexily/src/types.ts
function createValue(value = 0, unit = 0) {
  return { value, unit };
}
function createDefaultStyle() {
  return {
    display: 0,
    positionType: 1,
    position: [createValue(), createValue(), createValue(), createValue(), createValue(), createValue()],
    flexDirection: 2,
    flexWrap: 0,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: createValue(0, 3),
    alignItems: 4,
    alignSelf: 0,
    alignContent: 1,
    justifyContent: 0,
    width: createValue(0, 3),
    height: createValue(0, 3),
    minWidth: createValue(),
    minHeight: createValue(),
    maxWidth: createValue(),
    maxHeight: createValue(),
    aspectRatio: NaN,
    margin: [createValue(), createValue(), createValue(), createValue(), createValue(), createValue()],
    padding: [createValue(), createValue(), createValue(), createValue(), createValue(), createValue()],
    border: [0, 0, 0, 0, NaN, NaN],
    gap: [0, 0],
    overflow: 0
  };
}

// ../flexily/src/node-zero.ts
var Node;
var init_node_zero = __esm(async () => {
  init_utils();
  await __promiseAll([
    init_layout_zero(),
    init_logger()
  ]);
  Node = class Node {
    _parent = null;
    _children = [];
    _style = createDefaultStyle();
    _measureFunc = null;
    _baselineFunc = null;
    _m0;
    _m1;
    _m2;
    _m3;
    _lc0;
    _lc1;
    _measureResult = {
      width: 0,
      height: 0
    };
    _layoutResult = {
      width: 0,
      height: 0
    };
    static measureCalls = 0;
    static measureCacheHits = 0;
    static resetMeasureStats() {
      Node.measureCalls = 0;
      Node.measureCacheHits = 0;
    }
    _layout = { left: 0, top: 0, width: 0, height: 0 };
    _flex = {
      mainSize: 0,
      baseSize: 0,
      mainMargin: 0,
      flexGrow: 0,
      flexShrink: 0,
      minMain: 0,
      maxMain: Infinity,
      mainStartMarginAuto: false,
      mainEndMarginAuto: false,
      mainStartMarginValue: 0,
      mainEndMarginValue: 0,
      marginL: 0,
      marginT: 0,
      marginR: 0,
      marginB: 0,
      frozen: false,
      lineIndex: 0,
      relativeIndex: -1,
      baseline: 0,
      lastAvailW: NaN,
      lastAvailH: NaN,
      lastOffsetX: NaN,
      lastOffsetY: NaN,
      lastAbsX: NaN,
      lastAbsY: NaN,
      layoutValid: false,
      lastDir: 0
    };
    _isDirty = true;
    _hasNewLayout = false;
    _lastCalcW = NaN;
    _lastCalcH = NaN;
    _lastCalcDir = 0;
    static create() {
      return new Node;
    }
    getChildCount() {
      return this._children.length;
    }
    getChild(index) {
      return this._children[index];
    }
    getParent() {
      return this._parent;
    }
    insertChild(child, index) {
      if (child === this) {
        throw new Error("Cannot insert a node as a child of itself");
      }
      let ancestor = this._parent;
      while (ancestor !== null) {
        if (ancestor === child) {
          throw new Error("Cannot insert an ancestor as a child (would create a cycle)");
        }
        ancestor = ancestor._parent;
      }
      if (child._parent !== null) {
        child._parent.removeChild(child);
      }
      child._parent = this;
      const clampedIndex = Math.max(0, Math.min(index, this._children.length));
      this._children.splice(clampedIndex, 0, child);
      for (let i = clampedIndex + 1;i < this._children.length; i++) {
        this._children[i]._flex.layoutValid = false;
      }
      this.markDirty();
    }
    removeChild(child) {
      const index = this._children.indexOf(child);
      if (index !== -1) {
        this._children.splice(index, 1);
        child._parent = null;
        for (let i = index;i < this._children.length; i++) {
          this._children[i]._flex.layoutValid = false;
        }
        this.markDirty();
      }
    }
    free() {
      if (this._parent !== null) {
        this._parent.removeChild(this);
      }
      for (const child of this._children) {
        child._parent = null;
      }
      this._children = [];
      this._measureFunc = null;
      this._baselineFunc = null;
    }
    freeRecursive() {
      const nodes = [];
      traversalStack.length = 0;
      traversalStack.push(this);
      while (traversalStack.length > 0) {
        const current = traversalStack.pop();
        nodes.push(current);
        for (const child of current._children) {
          traversalStack.push(child);
        }
      }
      for (let i = nodes.length - 1;i >= 0; i--) {
        nodes[i].free();
      }
    }
    [Symbol.dispose]() {
      this.free();
    }
    setMeasureFunc(measureFunc) {
      this._measureFunc = measureFunc;
      this.markDirty();
    }
    unsetMeasureFunc() {
      this._measureFunc = null;
      this.markDirty();
    }
    hasMeasureFunc() {
      return this._measureFunc !== null;
    }
    setBaselineFunc(baselineFunc) {
      this._baselineFunc = baselineFunc;
      this.markDirty();
    }
    unsetBaselineFunc() {
      this._baselineFunc = null;
      this.markDirty();
    }
    hasBaselineFunc() {
      return this._baselineFunc !== null;
    }
    cachedMeasure(w, wm, h, hm) {
      if (!this._measureFunc)
        return null;
      Node.measureCalls++;
      const m0 = this._m0;
      if (m0 && m0.w === w && m0.wm === wm && m0.h === h && m0.hm === hm) {
        Node.measureCacheHits++;
        this._measureResult.width = m0.rw;
        this._measureResult.height = m0.rh;
        getTrace()?.measureCacheHit(0, w, h, m0.rw, m0.rh);
        return this._measureResult;
      }
      const m1 = this._m1;
      if (m1 && m1.w === w && m1.wm === wm && m1.h === h && m1.hm === hm) {
        Node.measureCacheHits++;
        this._measureResult.width = m1.rw;
        this._measureResult.height = m1.rh;
        getTrace()?.measureCacheHit(0, w, h, m1.rw, m1.rh);
        return this._measureResult;
      }
      const m2 = this._m2;
      if (m2 && m2.w === w && m2.wm === wm && m2.h === h && m2.hm === hm) {
        Node.measureCacheHits++;
        this._measureResult.width = m2.rw;
        this._measureResult.height = m2.rh;
        getTrace()?.measureCacheHit(0, w, h, m2.rw, m2.rh);
        return this._measureResult;
      }
      const m3 = this._m3;
      if (m3 && m3.w === w && m3.wm === wm && m3.h === h && m3.hm === hm) {
        Node.measureCacheHits++;
        this._measureResult.width = m3.rw;
        this._measureResult.height = m3.rh;
        getTrace()?.measureCacheHit(0, w, h, m3.rw, m3.rh);
        return this._measureResult;
      }
      getTrace()?.measureCacheMiss(0, w, h);
      const result = this._measureFunc(w, wm, h, hm);
      if (this._m2) {
        if (!this._m3)
          this._m3 = { w: 0, wm: 0, h: 0, hm: 0, rw: 0, rh: 0 };
        this._m3.w = this._m2.w;
        this._m3.wm = this._m2.wm;
        this._m3.h = this._m2.h;
        this._m3.hm = this._m2.hm;
        this._m3.rw = this._m2.rw;
        this._m3.rh = this._m2.rh;
      }
      if (this._m1) {
        if (!this._m2)
          this._m2 = { w: 0, wm: 0, h: 0, hm: 0, rw: 0, rh: 0 };
        this._m2.w = this._m1.w;
        this._m2.wm = this._m1.wm;
        this._m2.h = this._m1.h;
        this._m2.hm = this._m1.hm;
        this._m2.rw = this._m1.rw;
        this._m2.rh = this._m1.rh;
      }
      if (this._m0) {
        if (!this._m1)
          this._m1 = { w: 0, wm: 0, h: 0, hm: 0, rw: 0, rh: 0 };
        this._m1.w = this._m0.w;
        this._m1.wm = this._m0.wm;
        this._m1.h = this._m0.h;
        this._m1.hm = this._m0.hm;
        this._m1.rw = this._m0.rw;
        this._m1.rh = this._m0.rh;
      }
      if (!this._m0)
        this._m0 = { w: 0, wm: 0, h: 0, hm: 0, rw: 0, rh: 0 };
      this._m0.w = w;
      this._m0.wm = wm;
      this._m0.h = h;
      this._m0.hm = hm;
      this._m0.rw = result.width;
      this._m0.rh = result.height;
      this._measureResult.width = result.width;
      this._measureResult.height = result.height;
      return this._measureResult;
    }
    getCachedLayout(availW, availH) {
      if (this._isDirty) {
        return null;
      }
      const lc0 = this._lc0;
      if (lc0 && Object.is(lc0.availW, availW) && Object.is(lc0.availH, availH)) {
        this._layoutResult.width = lc0.computedW;
        this._layoutResult.height = lc0.computedH;
        return this._layoutResult;
      }
      const lc1 = this._lc1;
      if (lc1 && Object.is(lc1.availW, availW) && Object.is(lc1.availH, availH)) {
        this._layoutResult.width = lc1.computedW;
        this._layoutResult.height = lc1.computedH;
        return this._layoutResult;
      }
      return null;
    }
    setCachedLayout(availW, availH, computedW, computedH) {
      if (this._lc0) {
        if (!this._lc1) {
          this._lc1 = { availW: NaN, availH: NaN, computedW: 0, computedH: 0 };
        }
        this._lc1.availW = this._lc0.availW;
        this._lc1.availH = this._lc0.availH;
        this._lc1.computedW = this._lc0.computedW;
        this._lc1.computedH = this._lc0.computedH;
      }
      if (!this._lc0) {
        this._lc0 = { availW: 0, availH: 0, computedW: 0, computedH: 0 };
      }
      this._lc0.availW = availW;
      this._lc0.availH = availH;
      this._lc0.computedW = computedW;
      this._lc0.computedH = computedH;
    }
    resetLayoutCache() {
      traversalStack.length = 0;
      traversalStack.push(this);
      while (traversalStack.length > 0) {
        const node = traversalStack.pop();
        if (node._lc0)
          node._lc0.availW = -1;
        if (node._lc1)
          node._lc1.availW = -1;
        for (const child of node._children) {
          traversalStack.push(child);
        }
      }
    }
    isDirty() {
      return this._isDirty;
    }
    markDirty() {
      let current = this;
      while (current !== null) {
        current._m0 = current._m1 = current._m2 = current._m3 = undefined;
        current._lc0 = current._lc1 = undefined;
        if (current._isDirty)
          break;
        current._isDirty = true;
        current._flex.layoutValid = false;
        current = current._parent;
      }
    }
    hasNewLayout() {
      return this._hasNewLayout;
    }
    markLayoutSeen() {
      this._hasNewLayout = false;
    }
    calculateLayout(width, height, direction = DIRECTION_LTR) {
      const availableWidth = width ?? NaN;
      const availableHeight = height ?? NaN;
      if (!this._isDirty && Object.is(this._lastCalcW, availableWidth) && Object.is(this._lastCalcH, availableHeight) && this._lastCalcDir === direction) {
        log.debug?.("layout skip (not dirty, constraints unchanged)");
        return;
      }
      this._lastCalcW = availableWidth;
      this._lastCalcH = availableHeight;
      this._lastCalcDir = direction;
      const start = log.debug ? Date.now() : 0;
      const nodeCount = log.debug ? countNodes(this) : 0;
      Node.resetMeasureStats();
      computeLayout(this, availableWidth, availableHeight, direction);
      this._isDirty = false;
      this._hasNewLayout = true;
      markSubtreeLayoutSeen(this);
      log.debug?.("layout: %dx%d, %d nodes in %dms (measure: calls=%d hits=%d)", width, height, nodeCount, Date.now() - start, Node.measureCalls, Node.measureCacheHits);
    }
    getComputedLeft() {
      return this._layout.left;
    }
    getComputedTop() {
      return this._layout.top;
    }
    getComputedWidth() {
      return this._layout.width;
    }
    getComputedHeight() {
      return this._layout.height;
    }
    getComputedRight() {
      return this._layout.left + this._layout.width;
    }
    getComputedBottom() {
      return this._layout.top + this._layout.height;
    }
    getComputedPadding(edge) {
      return getEdgeValue(this._style.padding, edge).value;
    }
    getComputedMargin(edge) {
      return getEdgeValue(this._style.margin, edge).value;
    }
    getComputedBorder(edge) {
      return getEdgeBorderValue(this._style.border, edge);
    }
    get children() {
      return this._children;
    }
    get style() {
      return this._style;
    }
    get layout() {
      return this._layout;
    }
    get measureFunc() {
      return this._measureFunc;
    }
    get baselineFunc() {
      return this._baselineFunc;
    }
    get flex() {
      return this._flex;
    }
    setWidth(value) {
      if (Number.isNaN(value)) {
        this._style.width = { value: 0, unit: UNIT_AUTO };
      } else {
        this._style.width = { value, unit: UNIT_POINT };
      }
      this.markDirty();
    }
    setWidthPercent(value) {
      this._style.width = { value, unit: UNIT_PERCENT };
      this.markDirty();
    }
    setWidthAuto() {
      this._style.width = { value: 0, unit: UNIT_AUTO };
      this.markDirty();
    }
    setHeight(value) {
      if (Number.isNaN(value)) {
        this._style.height = { value: 0, unit: UNIT_AUTO };
      } else {
        this._style.height = { value, unit: UNIT_POINT };
      }
      this.markDirty();
    }
    setHeightPercent(value) {
      this._style.height = { value, unit: UNIT_PERCENT };
      this.markDirty();
    }
    setHeightAuto() {
      this._style.height = { value: 0, unit: UNIT_AUTO };
      this.markDirty();
    }
    setMinWidth(value) {
      this._style.minWidth = { value, unit: UNIT_POINT };
      this.markDirty();
    }
    setMinWidthPercent(value) {
      this._style.minWidth = { value, unit: UNIT_PERCENT };
      this.markDirty();
    }
    setMinHeight(value) {
      this._style.minHeight = { value, unit: UNIT_POINT };
      this.markDirty();
    }
    setMinHeightPercent(value) {
      this._style.minHeight = { value, unit: UNIT_PERCENT };
      this.markDirty();
    }
    setMaxWidth(value) {
      this._style.maxWidth = { value, unit: UNIT_POINT };
      this.markDirty();
    }
    setMaxWidthPercent(value) {
      this._style.maxWidth = { value, unit: UNIT_PERCENT };
      this.markDirty();
    }
    setMaxHeight(value) {
      this._style.maxHeight = { value, unit: UNIT_POINT };
      this.markDirty();
    }
    setMaxHeightPercent(value) {
      this._style.maxHeight = { value, unit: UNIT_PERCENT };
      this.markDirty();
    }
    setAspectRatio(value) {
      this._style.aspectRatio = value;
      this.markDirty();
    }
    setFlexGrow(value) {
      this._style.flexGrow = value;
      this.markDirty();
    }
    setFlexShrink(value) {
      this._style.flexShrink = value;
      this.markDirty();
    }
    setFlexBasis(value) {
      this._style.flexBasis = { value, unit: UNIT_POINT };
      this.markDirty();
    }
    setFlexBasisPercent(value) {
      this._style.flexBasis = { value, unit: UNIT_PERCENT };
      this.markDirty();
    }
    setFlexBasisAuto() {
      this._style.flexBasis = { value: 0, unit: UNIT_AUTO };
      this.markDirty();
    }
    setFlexDirection(direction) {
      this._style.flexDirection = direction;
      this.markDirty();
    }
    setFlexWrap(wrap2) {
      this._style.flexWrap = wrap2;
      this.markDirty();
    }
    setAlignItems(align) {
      this._style.alignItems = align;
      this.markDirty();
    }
    setAlignSelf(align) {
      this._style.alignSelf = align;
      this.markDirty();
    }
    setAlignContent(align) {
      this._style.alignContent = align;
      this.markDirty();
    }
    setJustifyContent(justify) {
      this._style.justifyContent = justify;
      this.markDirty();
    }
    setPadding(edge, value) {
      setEdgeValue(this._style.padding, edge, value, UNIT_POINT);
      this.markDirty();
    }
    setPaddingPercent(edge, value) {
      setEdgeValue(this._style.padding, edge, value, UNIT_PERCENT);
      this.markDirty();
    }
    setMargin(edge, value) {
      setEdgeValue(this._style.margin, edge, value, UNIT_POINT);
      this.markDirty();
    }
    setMarginPercent(edge, value) {
      setEdgeValue(this._style.margin, edge, value, UNIT_PERCENT);
      this.markDirty();
    }
    setMarginAuto(edge) {
      setEdgeValue(this._style.margin, edge, 0, UNIT_AUTO);
      this.markDirty();
    }
    setBorder(edge, value) {
      setEdgeBorder(this._style.border, edge, value);
      this.markDirty();
    }
    setGap(gutter, value) {
      if (gutter === GUTTER_COLUMN) {
        this._style.gap[0] = value;
      } else if (gutter === GUTTER_ROW) {
        this._style.gap[1] = value;
      } else if (gutter === GUTTER_ALL) {
        this._style.gap[0] = value;
        this._style.gap[1] = value;
      }
      this.markDirty();
    }
    setPositionType(positionType) {
      this._style.positionType = positionType;
      this.markDirty();
    }
    setPosition(edge, value) {
      if (Number.isNaN(value)) {
        setEdgeValue(this._style.position, edge, 0, UNIT_UNDEFINED);
      } else {
        setEdgeValue(this._style.position, edge, value, UNIT_POINT);
      }
      this.markDirty();
    }
    setPositionPercent(edge, value) {
      setEdgeValue(this._style.position, edge, value, UNIT_PERCENT);
      this.markDirty();
    }
    setDisplay(display) {
      this._style.display = display;
      this.markDirty();
    }
    setOverflow(overflow) {
      this._style.overflow = overflow;
      this.markDirty();
    }
    getWidth() {
      return this._style.width;
    }
    getHeight() {
      return this._style.height;
    }
    getMinWidth() {
      return this._style.minWidth;
    }
    getMinHeight() {
      return this._style.minHeight;
    }
    getMaxWidth() {
      return this._style.maxWidth;
    }
    getMaxHeight() {
      return this._style.maxHeight;
    }
    getAspectRatio() {
      return this._style.aspectRatio;
    }
    getFlexGrow() {
      return this._style.flexGrow;
    }
    getFlexShrink() {
      return this._style.flexShrink;
    }
    getFlexBasis() {
      return this._style.flexBasis;
    }
    getFlexDirection() {
      return this._style.flexDirection;
    }
    getFlexWrap() {
      return this._style.flexWrap;
    }
    getAlignItems() {
      return this._style.alignItems;
    }
    getAlignSelf() {
      return this._style.alignSelf;
    }
    getAlignContent() {
      return this._style.alignContent;
    }
    getJustifyContent() {
      return this._style.justifyContent;
    }
    getPadding(edge) {
      return getEdgeValue(this._style.padding, edge);
    }
    getMargin(edge) {
      return getEdgeValue(this._style.margin, edge);
    }
    getBorder(edge) {
      return getEdgeBorderValue(this._style.border, edge);
    }
    getPosition(edge) {
      return getEdgeValue(this._style.position, edge);
    }
    getPositionType() {
      return this._style.positionType;
    }
    getDisplay() {
      return this._style.display;
    }
    getOverflow() {
      return this._style.overflow;
    }
    getGap(gutter) {
      if (gutter === GUTTER_COLUMN) {
        return this._style.gap[0];
      } else if (gutter === GUTTER_ROW) {
        return this._style.gap[1];
      }
      return this._style.gap[0];
    }
  };
});

// ../flexily/src/index.ts
var init_src = __esm(async () => {
  await __promiseAll([
    init_node_zero(),
    init_layout_zero()
  ]);
});

// packages/ag-term/src/adapters/flexily-zero-adapter.ts
class FlexilyZeroNodeAdapter {
  node;
  constructor(node) {
    this.node = node;
  }
  getFlexilyNode() {
    return this.node;
  }
  insertChild(child, index) {
    const flexilyChild = child.getFlexilyNode();
    this.node.insertChild(flexilyChild, index);
  }
  removeChild(child) {
    const flexilyChild = child.getFlexilyNode();
    this.node.removeChild(flexilyChild);
  }
  free() {
    this.node.free();
  }
  setMeasureFunc(measureFunc) {
    this.node.setMeasureFunc((width, widthMode, height, heightMode) => {
      const widthModeStr = this.measureModeToString(widthMode);
      const heightModeStr = this.measureModeToString(heightMode);
      return measureFunc(width, widthModeStr, height, heightModeStr);
    });
  }
  markDirty() {
    this.node.markDirty();
  }
  measureModeToString(mode) {
    if (mode === MEASURE_MODE_EXACTLY)
      return "exactly";
    if (mode === MEASURE_MODE_AT_MOST)
      return "at-most";
    return "undefined";
  }
  setWidth(value) {
    this.node.setWidth(value);
  }
  setWidthPercent(value) {
    this.node.setWidthPercent(value);
  }
  setWidthAuto() {
    this.node.setWidthAuto();
  }
  setHeight(value) {
    this.node.setHeight(value);
  }
  setHeightPercent(value) {
    this.node.setHeightPercent(value);
  }
  setHeightAuto() {
    this.node.setHeightAuto();
  }
  setMinWidth(value) {
    this.node.setMinWidth(value);
  }
  setMinWidthPercent(value) {
    this.node.setMinWidthPercent(value);
  }
  setMinHeight(value) {
    this.node.setMinHeight(value);
  }
  setMinHeightPercent(value) {
    this.node.setMinHeightPercent(value);
  }
  setMaxWidth(value) {
    this.node.setMaxWidth(value);
  }
  setMaxWidthPercent(value) {
    this.node.setMaxWidthPercent(value);
  }
  setMaxHeight(value) {
    this.node.setMaxHeight(value);
  }
  setMaxHeightPercent(value) {
    this.node.setMaxHeightPercent(value);
  }
  setFlexGrow(value) {
    this.node.setFlexGrow(value);
  }
  setFlexShrink(value) {
    this.node.setFlexShrink(value);
  }
  setFlexBasis(value) {
    this.node.setFlexBasis(value);
  }
  setFlexBasisPercent(value) {
    this.node.setFlexBasisPercent(value);
  }
  setFlexBasisAuto() {
    this.node.setFlexBasisAuto();
  }
  setFlexDirection(direction) {
    this.node.setFlexDirection(direction);
  }
  setFlexWrap(wrap2) {
    this.node.setFlexWrap(wrap2);
  }
  setAlignItems(align) {
    this.node.setAlignItems(align);
  }
  setAlignSelf(align) {
    this.node.setAlignSelf(align);
  }
  setAlignContent(align) {
    this.node.setAlignContent(align);
  }
  setJustifyContent(justify) {
    this.node.setJustifyContent(justify);
  }
  setPadding(edge, value) {
    this.node.setPadding(edge, value);
  }
  setMargin(edge, value) {
    this.node.setMargin(edge, value);
  }
  setBorder(edge, value) {
    this.node.setBorder(edge, value);
  }
  setGap(gutter, value) {
    this.node.setGap(gutter, value);
  }
  setDisplay(display) {
    this.node.setDisplay(display);
  }
  setPositionType(positionType) {
    this.node.setPositionType(positionType);
  }
  setPosition(edge, value) {
    this.node.setPosition(edge, value);
  }
  setPositionPercent(edge, value) {
    this.node.setPositionPercent(edge, value);
  }
  setOverflow(overflow) {
    this.node.setOverflow(overflow);
  }
  setAspectRatio(value) {
    this.node.setAspectRatio(value);
  }
  calculateLayout(width, height, direction) {
    this.node.calculateLayout(width, height, direction ?? DIRECTION_LTR);
  }
  getComputedLeft() {
    return this.node.getComputedLeft();
  }
  getComputedTop() {
    return this.node.getComputedTop();
  }
  getComputedWidth() {
    return this.node.getComputedWidth();
  }
  getComputedHeight() {
    return this.node.getComputedHeight();
  }
}

class FlexilyZeroLayoutEngine {
  _constants = {
    FLEX_DIRECTION_COLUMN,
    FLEX_DIRECTION_COLUMN_REVERSE,
    FLEX_DIRECTION_ROW,
    FLEX_DIRECTION_ROW_REVERSE,
    WRAP_NO_WRAP,
    WRAP_WRAP,
    WRAP_WRAP_REVERSE,
    ALIGN_AUTO,
    ALIGN_FLEX_START,
    ALIGN_CENTER,
    ALIGN_FLEX_END,
    ALIGN_STRETCH,
    ALIGN_BASELINE,
    ALIGN_SPACE_BETWEEN,
    ALIGN_SPACE_AROUND,
    ALIGN_SPACE_EVENLY,
    JUSTIFY_FLEX_START,
    JUSTIFY_CENTER,
    JUSTIFY_FLEX_END,
    JUSTIFY_SPACE_BETWEEN,
    JUSTIFY_SPACE_AROUND,
    JUSTIFY_SPACE_EVENLY,
    EDGE_LEFT,
    EDGE_TOP,
    EDGE_RIGHT,
    EDGE_BOTTOM,
    EDGE_HORIZONTAL,
    EDGE_VERTICAL,
    EDGE_ALL,
    GUTTER_COLUMN,
    GUTTER_ROW,
    GUTTER_ALL,
    DISPLAY_FLEX,
    DISPLAY_NONE,
    POSITION_TYPE_STATIC,
    POSITION_TYPE_RELATIVE,
    POSITION_TYPE_ABSOLUTE,
    OVERFLOW_VISIBLE,
    OVERFLOW_HIDDEN,
    OVERFLOW_SCROLL,
    DIRECTION_LTR,
    MEASURE_MODE_UNDEFINED,
    MEASURE_MODE_EXACTLY,
    MEASURE_MODE_AT_MOST
  };
  createNode() {
    return new FlexilyZeroNodeAdapter(Node.create());
  }
  get constants() {
    return this._constants;
  }
  get name() {
    return "flexily-zero";
  }
}
function createFlexilyZeroEngine() {
  return new FlexilyZeroLayoutEngine;
}
var init_flexily_zero_adapter = __esm(async () => {
  await init_src();
});

// ../../node_modules/.bun/chalk@5.6.2/node_modules/chalk/source/vendor/ansi-styles/index.js
function assembleStyles() {
  const codes = new Map;
  for (const [groupName, group] of Object.entries(styles)) {
    for (const [styleName, style] of Object.entries(group)) {
      styles[styleName] = {
        open: `\x1B[${style[0]}m`,
        close: `\x1B[${style[1]}m`
      };
      group[styleName] = styles[styleName];
      codes.set(style[0], style[1]);
    }
    Object.defineProperty(styles, groupName, {
      value: group,
      enumerable: false
    });
  }
  Object.defineProperty(styles, "codes", {
    value: codes,
    enumerable: false
  });
  styles.color.close = "\x1B[39m";
  styles.bgColor.close = "\x1B[49m";
  styles.color.ansi = wrapAnsi16();
  styles.color.ansi256 = wrapAnsi256();
  styles.color.ansi16m = wrapAnsi16m();
  styles.bgColor.ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);
  Object.defineProperties(styles, {
    rgbToAnsi256: {
      value(red, green, blue) {
        if (red === green && green === blue) {
          if (red < 8) {
            return 16;
          }
          if (red > 248) {
            return 231;
          }
          return Math.round((red - 8) / 247 * 24) + 232;
        }
        return 16 + 36 * Math.round(red / 255 * 5) + 6 * Math.round(green / 255 * 5) + Math.round(blue / 255 * 5);
      },
      enumerable: false
    },
    hexToRgb: {
      value(hex) {
        const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16));
        if (!matches) {
          return [0, 0, 0];
        }
        let [colorString] = matches;
        if (colorString.length === 3) {
          colorString = [...colorString].map((character) => character + character).join("");
        }
        const integer = Number.parseInt(colorString, 16);
        return [
          integer >> 16 & 255,
          integer >> 8 & 255,
          integer & 255
        ];
      },
      enumerable: false
    },
    hexToAnsi256: {
      value: (hex) => styles.rgbToAnsi256(...styles.hexToRgb(hex)),
      enumerable: false
    },
    ansi256ToAnsi: {
      value(code) {
        if (code < 8) {
          return 30 + code;
        }
        if (code < 16) {
          return 90 + (code - 8);
        }
        let red;
        let green;
        let blue;
        if (code >= 232) {
          red = ((code - 232) * 10 + 8) / 255;
          green = red;
          blue = red;
        } else {
          code -= 16;
          const remainder = code % 36;
          red = Math.floor(code / 36) / 5;
          green = Math.floor(remainder / 6) / 5;
          blue = remainder % 6 / 5;
        }
        const value = Math.max(red, green, blue) * 2;
        if (value === 0) {
          return 30;
        }
        let result = 30 + (Math.round(blue) << 2 | Math.round(green) << 1 | Math.round(red));
        if (value === 2) {
          result += 60;
        }
        return result;
      },
      enumerable: false
    },
    rgbToAnsi: {
      value: (red, green, blue) => styles.ansi256ToAnsi(styles.rgbToAnsi256(red, green, blue)),
      enumerable: false
    },
    hexToAnsi: {
      value: (hex) => styles.ansi256ToAnsi(styles.hexToAnsi256(hex)),
      enumerable: false
    }
  });
  return styles;
}
var ANSI_BACKGROUND_OFFSET = 10, wrapAnsi16 = (offset = 0) => (code) => `\x1B[${code + offset}m`, wrapAnsi256 = (offset = 0) => (code) => `\x1B[${38 + offset};5;${code}m`, wrapAnsi16m = (offset = 0) => (red, green, blue) => `\x1B[${38 + offset};2;${red};${green};${blue}m`, styles, modifierNames, foregroundColorNames, backgroundColorNames, colorNames, ansiStyles, ansi_styles_default;
var init_ansi_styles = __esm(() => {
  styles = {
    modifier: {
      reset: [0, 0],
      bold: [1, 22],
      dim: [2, 22],
      italic: [3, 23],
      underline: [4, 24],
      overline: [53, 55],
      inverse: [7, 27],
      hidden: [8, 28],
      strikethrough: [9, 29]
    },
    color: {
      black: [30, 39],
      red: [31, 39],
      green: [32, 39],
      yellow: [33, 39],
      blue: [34, 39],
      magenta: [35, 39],
      cyan: [36, 39],
      white: [37, 39],
      blackBright: [90, 39],
      gray: [90, 39],
      grey: [90, 39],
      redBright: [91, 39],
      greenBright: [92, 39],
      yellowBright: [93, 39],
      blueBright: [94, 39],
      magentaBright: [95, 39],
      cyanBright: [96, 39],
      whiteBright: [97, 39]
    },
    bgColor: {
      bgBlack: [40, 49],
      bgRed: [41, 49],
      bgGreen: [42, 49],
      bgYellow: [43, 49],
      bgBlue: [44, 49],
      bgMagenta: [45, 49],
      bgCyan: [46, 49],
      bgWhite: [47, 49],
      bgBlackBright: [100, 49],
      bgGray: [100, 49],
      bgGrey: [100, 49],
      bgRedBright: [101, 49],
      bgGreenBright: [102, 49],
      bgYellowBright: [103, 49],
      bgBlueBright: [104, 49],
      bgMagentaBright: [105, 49],
      bgCyanBright: [106, 49],
      bgWhiteBright: [107, 49]
    }
  };
  modifierNames = Object.keys(styles.modifier);
  foregroundColorNames = Object.keys(styles.color);
  backgroundColorNames = Object.keys(styles.bgColor);
  colorNames = [...foregroundColorNames, ...backgroundColorNames];
  ansiStyles = assembleStyles();
  ansi_styles_default = ansiStyles;
});

// ../../node_modules/.bun/chalk@5.6.2/node_modules/chalk/source/vendor/supports-color/browser.js
var level, colorSupport, supportsColor, browser_default;
var init_browser = __esm(() => {
  level = (() => {
    if (!("navigator" in globalThis)) {
      return 0;
    }
    if (globalThis.navigator.userAgentData) {
      const brand = navigator.userAgentData.brands.find(({ brand: brand2 }) => brand2 === "Chromium");
      if (brand && brand.version > 93) {
        return 3;
      }
    }
    if (/\b(Chrome|Chromium)\//.test(globalThis.navigator.userAgent)) {
      return 1;
    }
    return 0;
  })();
  colorSupport = level !== 0 && {
    level,
    hasBasic: true,
    has256: level >= 2,
    has16m: level >= 3
  };
  supportsColor = {
    stdout: colorSupport,
    stderr: colorSupport
  };
  browser_default = supportsColor;
});

// ../../node_modules/.bun/chalk@5.6.2/node_modules/chalk/source/utilities.js
function stringReplaceAll(string, substring, replacer) {
  let index = string.indexOf(substring);
  if (index === -1) {
    return string;
  }
  const substringLength = substring.length;
  let endIndex = 0;
  let returnValue = "";
  do {
    returnValue += string.slice(endIndex, index) + substring + replacer;
    endIndex = index + substringLength;
    index = string.indexOf(substring, endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}
function stringEncaseCRLFWithFirstIndex(string, prefix, postfix, index) {
  let endIndex = 0;
  let returnValue = "";
  do {
    const gotCR = string[index - 1] === "\r";
    returnValue += string.slice(endIndex, gotCR ? index - 1 : index) + prefix + (gotCR ? `\r
` : `
`) + postfix;
    endIndex = index + 1;
    index = string.indexOf(`
`, endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}

// ../../node_modules/.bun/chalk@5.6.2/node_modules/chalk/source/index.js
class Chalk {
  constructor(options) {
    return chalkFactory(options);
  }
}
function createChalk(options) {
  return chalkFactory(options);
}
var stdoutColor, stderrColor, GENERATOR, STYLER, IS_EMPTY, levelMapping, styles2, applyOptions = (object, options = {}) => {
  if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
    throw new Error("The `level` option should be an integer from 0 to 3");
  }
  const colorLevel = stdoutColor ? stdoutColor.level : 0;
  object.level = options.level === undefined ? colorLevel : options.level;
}, chalkFactory = (options) => {
  const chalk = (...strings) => strings.join(" ");
  applyOptions(chalk, options);
  Object.setPrototypeOf(chalk, createChalk.prototype);
  return chalk;
}, getModelAnsi = (model, level2, type, ...arguments_) => {
  if (model === "rgb") {
    if (level2 === "ansi16m") {
      return ansi_styles_default[type].ansi16m(...arguments_);
    }
    if (level2 === "ansi256") {
      return ansi_styles_default[type].ansi256(ansi_styles_default.rgbToAnsi256(...arguments_));
    }
    return ansi_styles_default[type].ansi(ansi_styles_default.rgbToAnsi(...arguments_));
  }
  if (model === "hex") {
    return getModelAnsi("rgb", level2, type, ...ansi_styles_default.hexToRgb(...arguments_));
  }
  return ansi_styles_default[type][model](...arguments_);
}, usedModels, proto, createStyler = (open, close, parent) => {
  let openAll;
  let closeAll;
  if (parent === undefined) {
    openAll = open;
    closeAll = close;
  } else {
    openAll = parent.openAll + open;
    closeAll = close + parent.closeAll;
  }
  return {
    open,
    close,
    openAll,
    closeAll,
    parent
  };
}, createBuilder = (self, _styler, _isEmpty) => {
  const builder = (...arguments_) => applyStyle(builder, arguments_.length === 1 ? "" + arguments_[0] : arguments_.join(" "));
  Object.setPrototypeOf(builder, proto);
  builder[GENERATOR] = self;
  builder[STYLER] = _styler;
  builder[IS_EMPTY] = _isEmpty;
  return builder;
}, applyStyle = (self, string) => {
  if (self.level <= 0 || !string) {
    return self[IS_EMPTY] ? "" : string;
  }
  let styler = self[STYLER];
  if (styler === undefined) {
    return string;
  }
  const { openAll, closeAll } = styler;
  if (string.includes("\x1B")) {
    while (styler !== undefined) {
      string = stringReplaceAll(string, styler.close, styler.open);
      styler = styler.parent;
    }
  }
  const lfIndex = string.indexOf(`
`);
  if (lfIndex !== -1) {
    string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
  }
  return openAll + string + closeAll;
}, chalk, chalkStderr;
var init_source = __esm(() => {
  init_ansi_styles();
  init_browser();
  ({ stdout: stdoutColor, stderr: stderrColor } = browser_default);
  GENERATOR = Symbol("GENERATOR");
  STYLER = Symbol("STYLER");
  IS_EMPTY = Symbol("IS_EMPTY");
  levelMapping = [
    "ansi",
    "ansi",
    "ansi256",
    "ansi16m"
  ];
  styles2 = Object.create(null);
  Object.setPrototypeOf(createChalk.prototype, Function.prototype);
  for (const [styleName, style] of Object.entries(ansi_styles_default)) {
    styles2[styleName] = {
      get() {
        const builder = createBuilder(this, createStyler(style.open, style.close, this[STYLER]), this[IS_EMPTY]);
        Object.defineProperty(this, styleName, { value: builder });
        return builder;
      }
    };
  }
  styles2.visible = {
    get() {
      const builder = createBuilder(this, this[STYLER], true);
      Object.defineProperty(this, "visible", { value: builder });
      return builder;
    }
  };
  usedModels = ["rgb", "hex", "ansi256"];
  for (const model of usedModels) {
    styles2[model] = {
      get() {
        const { level: level2 } = this;
        return function(...arguments_) {
          const styler = createStyler(getModelAnsi(model, levelMapping[level2], "color", ...arguments_), ansi_styles_default.color.close, this[STYLER]);
          return createBuilder(this, styler, this[IS_EMPTY]);
        };
      }
    };
    const bgModel = "bg" + model[0].toUpperCase() + model.slice(1);
    styles2[bgModel] = {
      get() {
        const { level: level2 } = this;
        return function(...arguments_) {
          const styler = createStyler(getModelAnsi(model, levelMapping[level2], "bgColor", ...arguments_), ansi_styles_default.bgColor.close, this[STYLER]);
          return createBuilder(this, styler, this[IS_EMPTY]);
        };
      }
    };
  }
  proto = Object.defineProperties(() => {}, {
    ...styles2,
    level: {
      enumerable: true,
      get() {
        return this[GENERATOR].level;
      },
      set(level2) {
        this[GENERATOR].level = level2;
      }
    }
  });
  Object.defineProperties(createChalk.prototype, styles2);
  chalk = createChalk();
  chalkStderr = createChalk({ level: stderrColor ? stderrColor.level : 0 });
});

// packages/ag-term/src/ansi/sgr-codes.ts
function fgColorCode(color) {
  if (typeof color === "number") {
    if (color >= 0 && color <= 7)
      return `${30 + color}`;
    return `38;5;${color}`;
  }
  return `38;2;${color.r};${color.g};${color.b}`;
}
function bgColorCode(color) {
  if (typeof color === "number") {
    if (color >= 0 && color <= 7)
      return `${40 + color}`;
    return `48;5;${color}`;
  }
  return `48;2;${color.r};${color.g};${color.b}`;
}

// packages/ag-term/src/buffer.ts
function isDefaultBg(color) {
  return color !== null && typeof color === "object" && color.r === -1;
}
function colorEquals(a, b) {
  if (a === b)
    return true;
  if (a === null || a === undefined)
    return b === null || b === undefined;
  if (b === null || b === undefined)
    return false;
  if (typeof a === "number")
    return a === b;
  if (typeof b === "number")
    return false;
  return a.r === b.r && a.g === b.g && a.b === b.b;
}
function attrsEquals(a, b) {
  return Boolean(a.bold) === Boolean(b.bold) && Boolean(a.dim) === Boolean(b.dim) && Boolean(a.italic) === Boolean(b.italic) && Boolean(a.underline) === Boolean(b.underline) && (a.underlineStyle ?? false) === (b.underlineStyle ?? false) && Boolean(a.blink) === Boolean(b.blink) && Boolean(a.inverse) === Boolean(b.inverse) && Boolean(a.hidden) === Boolean(b.hidden) && Boolean(a.strikethrough) === Boolean(b.strikethrough);
}
function styleEquals(a, b) {
  if (a === b)
    return true;
  if (!a || !b)
    return false;
  return colorEquals(a.fg, b.fg) && colorEquals(a.bg, b.bg) && colorEquals(a.underlineColor, b.underlineColor) && attrsEquals(a.attrs, b.attrs) && (a.hyperlink ?? undefined) === (b.hyperlink ?? undefined);
}
function createMutableCell() {
  return {
    char: " ",
    fg: null,
    bg: null,
    underlineColor: null,
    attrs: {},
    wide: false,
    continuation: false,
    hyperlink: undefined
  };
}
function bufferToText(buffer, options = {}) {
  const { trimTrailingWhitespace = true, trimEmptyLines = true } = options;
  const lines = [];
  for (let y = 0;y < buffer.height; y++) {
    let line = "";
    let strOffset = 0;
    let contentEdgeStrOffset = 0;
    const contentEdge = trimTrailingWhitespace ? getContentEdge(buffer, y) : 0;
    for (let x = 0;x < buffer.width; x++) {
      if (buffer.isCellContinuation(x, y))
        continue;
      line += buffer.getCellChar(x, y);
      strOffset++;
      if (x < contentEdge) {
        contentEdgeStrOffset = strOffset;
      }
    }
    if (trimTrailingWhitespace) {
      const trimmed = line.trimEnd();
      line = trimmed.length >= contentEdgeStrOffset ? trimmed : line.substring(0, contentEdgeStrOffset);
    }
    lines.push(line);
  }
  let result = lines.join(`
`);
  if (trimEmptyLines) {
    while (lines.length > 0 && lines[lines.length - 1].length === 0) {
      lines.pop();
    }
    result = lines.join(`
`);
  }
  return result;
}
function getContentEdge(buffer, y) {
  const FLAG_MASK = ~(WIDE_FLAG | CONTINUATION_FLAG);
  for (let x = buffer.width - 1;x >= 0; x--) {
    if (buffer.isCellContinuation(x, y))
      continue;
    const attrs = buffer.getCellAttrs(x, y) & FLAG_MASK;
    if (attrs !== 0)
      return x + 1;
    if (buffer.getCellChar(x, y) !== " ")
      return x + 1;
  }
  return 0;
}
function bufferToStyledText(buffer, options = {}) {
  const { trimTrailingWhitespace = true, trimEmptyLines = true } = options;
  const lines = [];
  let currentStyle = null;
  let currentHyperlink;
  for (let y = 0;y < buffer.height; y++) {
    let line = "";
    for (let x = 0;x < buffer.width; x++) {
      const cell = buffer.getCell(x, y);
      if (cell.continuation)
        continue;
      const cellHyperlink = cell.hyperlink;
      if (cellHyperlink !== currentHyperlink) {
        if (currentHyperlink) {
          line += emitHyperlinkClose(currentHyperlink);
        }
        if (cellHyperlink) {
          line += emitHyperlinkOpen(cellHyperlink);
        }
        currentHyperlink = cellHyperlink;
      }
      const cellStyle = {
        fg: cell.fg,
        bg: cell.bg,
        underlineColor: cell.underlineColor,
        attrs: cell.attrs
      };
      if (!styleEquals(currentStyle, cellStyle)) {
        line += styleTransitionCodes(currentStyle, cellStyle);
        currentStyle = cellStyle;
      }
      line += cell.char;
    }
    if (currentHyperlink) {
      line += emitHyperlinkClose(currentHyperlink);
      currentHyperlink = undefined;
    }
    if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
      line += styleResetCodes(currentStyle);
      currentStyle = null;
    }
    if (trimTrailingWhitespace) {
      line = trimTrailingWhitespacePreservingAnsi(line);
    }
    lines.push(line);
  }
  let result = lines.join(`
`);
  if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
    result += styleResetCodes(currentStyle);
  }
  if (trimEmptyLines) {
    result = result.replace(/\n+$/, "");
  }
  return result;
}
function decodeHyperlinkFormat(encoded) {
  if (encoded.charCodeAt(0) === 1) {
    const sepIdx = encoded.indexOf("\x02");
    if (sepIdx > 0) {
      const tag = encoded.slice(1, sepIdx);
      const url = encoded.slice(sepIdx + 1);
      if (tag === "c1b") {
        return {
          url,
          oscIntro: "",
          oscClose: "",
          closeIntro: "",
          closeTerminator: "\x07"
        };
      }
      if (tag === "c1s") {
        return {
          url,
          oscIntro: "",
          oscClose: "",
          closeIntro: "",
          closeTerminator: "\x1B\\"
        };
      }
      if (tag === "e7b") {
        return {
          url,
          oscIntro: "\x1B]",
          oscClose: "\x1B]",
          closeIntro: "\x1B]",
          closeTerminator: "\x07"
        };
      }
    }
  }
  return {
    url: encoded,
    oscIntro: "\x1B]",
    oscClose: "\x1B]",
    closeIntro: "\x1B]",
    closeTerminator: "\x1B\\"
  };
}
function emitHyperlinkOpen(encoded) {
  const fmt = decodeHyperlinkFormat(encoded);
  return `${fmt.oscIntro}8;;${fmt.url}${fmt.closeTerminator}`;
}
function emitHyperlinkClose(encoded) {
  const fmt = decodeHyperlinkFormat(encoded);
  return `${fmt.closeIntro}8;;${fmt.closeTerminator}`;
}
function hasActiveAttrs(attrs) {
  return !!(attrs.bold || attrs.dim || attrs.italic || attrs.underline || attrs.underlineStyle || attrs.blink || attrs.inverse || attrs.hidden || attrs.strikethrough);
}
function styleToAnsiCodes(style) {
  const fg = style.fg;
  const bg = style.bg;
  let result = "";
  if (fg !== null) {
    result += `\x1B[${fgColorCode(fg)}m`;
  }
  if (bg !== null && !isDefaultBg(bg)) {
    result += `\x1B[${bgColorCode(bg)}m`;
  }
  if (style.attrs.bold)
    result += "\x1B[1m";
  if (style.attrs.dim)
    result += "\x1B[2m";
  if (style.attrs.italic)
    result += "\x1B[3m";
  const underlineStyle = style.attrs.underlineStyle;
  if (typeof underlineStyle === "string") {
    const styleMap = {
      single: 1,
      double: 2,
      curly: 3,
      dotted: 4,
      dashed: 5
    };
    const subparam = styleMap[underlineStyle];
    if (subparam !== undefined && subparam !== 0) {
      result += `\x1B[4:${subparam}m`;
    }
  } else if (style.attrs.underline) {
    result += "\x1B[4m";
  }
  if (style.attrs.inverse)
    result += "\x1B[7m";
  if (style.attrs.strikethrough)
    result += "\x1B[9m";
  if (style.underlineColor !== null && style.underlineColor !== undefined) {
    if (typeof style.underlineColor === "number") {
      result += `\x1B[58;5;${style.underlineColor}m`;
    } else {
      result += `\x1B[58;2;${style.underlineColor.r};${style.underlineColor.g};${style.underlineColor.b}m`;
    }
  }
  return result;
}
function styleTransitionCodes(oldStyle, newStyle) {
  if (!oldStyle)
    return styleToAnsiCodes(newStyle);
  if (styleEquals(oldStyle, newStyle))
    return "";
  let result = "";
  const oa = oldStyle.attrs;
  const na = newStyle.attrs;
  const boldChanged = Boolean(oa.bold) !== Boolean(na.bold);
  const dimChanged = Boolean(oa.dim) !== Boolean(na.dim);
  if (boldChanged || dimChanged) {
    const boldOff = boldChanged && !na.bold;
    const dimOff = dimChanged && !na.dim;
    if (boldOff || dimOff) {
      result += "\x1B[22m";
      if (na.bold)
        result += "\x1B[1m";
      if (na.dim)
        result += "\x1B[2m";
    } else {
      if (boldChanged && na.bold)
        result += "\x1B[1m";
      if (dimChanged && na.dim)
        result += "\x1B[2m";
    }
  }
  if (Boolean(oa.italic) !== Boolean(na.italic)) {
    result += na.italic ? "\x1B[3m" : "\x1B[23m";
  }
  const oldUl = Boolean(oa.underline);
  const newUl = Boolean(na.underline);
  const oldUlStyle = oa.underlineStyle ?? false;
  const newUlStyle = na.underlineStyle ?? false;
  if (oldUl !== newUl || oldUlStyle !== newUlStyle) {
    if (typeof na.underlineStyle === "string") {
      const styleMap = {
        single: 1,
        double: 2,
        curly: 3,
        dotted: 4,
        dashed: 5
      };
      const sub = styleMap[na.underlineStyle];
      if (sub !== undefined && sub !== 0) {
        result += `\x1B[4:${sub}m`;
      } else if (newUl) {
        result += "\x1B[4m";
      } else {
        result += "\x1B[24m";
      }
    } else if (newUl) {
      result += "\x1B[4m";
    } else {
      result += "\x1B[24m";
    }
  }
  if (Boolean(oa.inverse) !== Boolean(na.inverse)) {
    result += na.inverse ? "\x1B[7m" : "\x1B[27m";
  }
  if (Boolean(oa.strikethrough) !== Boolean(na.strikethrough)) {
    result += na.strikethrough ? "\x1B[9m" : "\x1B[29m";
  }
  if (!colorEquals(oldStyle.fg, newStyle.fg)) {
    if (newStyle.fg === null) {
      result += "\x1B[39m";
    } else {
      result += `\x1B[${fgColorCode(newStyle.fg)}m`;
    }
  }
  if (!colorEquals(oldStyle.bg, newStyle.bg)) {
    if (newStyle.bg === null) {
      result += "\x1B[49m";
    } else {
      result += `\x1B[${bgColorCode(newStyle.bg)}m`;
    }
  }
  if (!colorEquals(oldStyle.underlineColor, newStyle.underlineColor)) {
    if (newStyle.underlineColor === null || newStyle.underlineColor === undefined) {
      result += "\x1B[59m";
    } else if (typeof newStyle.underlineColor === "number") {
      result += `\x1B[58;5;${newStyle.underlineColor}m`;
    } else {
      result += `\x1B[58;2;${newStyle.underlineColor.r};${newStyle.underlineColor.g};${newStyle.underlineColor.b}m`;
    }
  }
  return result;
}
function styleResetCodes(style) {
  let result = "";
  if (style.attrs.underline || style.attrs.underlineStyle)
    result += "\x1B[24m";
  if (style.attrs.bold || style.attrs.dim)
    result += "\x1B[22m";
  if (style.attrs.italic)
    result += "\x1B[23m";
  if (style.attrs.strikethrough)
    result += "\x1B[29m";
  if (style.attrs.inverse)
    result += "\x1B[27m";
  if (style.bg !== null && !isDefaultBg(style.bg))
    result += "\x1B[49m";
  if (style.fg !== null)
    result += "\x1B[39m";
  if (style.underlineColor !== null && style.underlineColor !== undefined)
    result += "\x1B[59m";
  return result;
}
function trimTrailingWhitespacePreservingAnsi(str) {
  let lastContentIndex = -1;
  let i = 0;
  while (i < str.length) {
    if (str[i] === "\x1B") {
      if (str[i + 1] === "]") {
        let end2 = -1;
        for (let j = i + 2;j < str.length; j++) {
          if (str[j] === "\x07") {
            end2 = j;
            break;
          }
          if (str[j] === "\x1B" && str[j + 1] === "\\") {
            end2 = j + 1;
            break;
          }
        }
        if (end2 !== -1) {
          lastContentIndex = end2;
          i = end2 + 1;
          continue;
        }
      }
      const end = str.indexOf("m", i);
      if (end !== -1) {
        lastContentIndex = end;
        i = end + 1;
        continue;
      }
    }
    if (str[i] !== " " && str[i] !== "\t") {
      lastContentIndex = i;
    }
    i++;
  }
  return str.slice(0, lastContentIndex + 1);
}
function ansi256ToRgb(idx) {
  if (idx < 16) {
    const table = [
      [0, 0, 0],
      [128, 0, 0],
      [0, 128, 0],
      [128, 128, 0],
      [0, 0, 128],
      [128, 0, 128],
      [0, 128, 128],
      [192, 192, 192],
      [128, 128, 128],
      [255, 0, 0],
      [0, 255, 0],
      [255, 255, 0],
      [0, 0, 255],
      [255, 0, 255],
      [0, 255, 255],
      [255, 255, 255]
    ];
    const [r, g, b] = table[idx];
    return { r, g, b };
  }
  if (idx < 232) {
    const i = idx - 16;
    const r = Math.floor(i / 36);
    const g = Math.floor(i % 36 / 6);
    const b = i % 6;
    return {
      r: r ? r * 40 + 55 : 0,
      g: g ? g * 40 + 55 : 0,
      b: b ? b * 40 + 55 : 0
    };
  }
  const v = (idx - 232) * 10 + 8;
  return { r: v, g: v, b: v };
}
function resolveColor2(color) {
  if (color === null)
    return null;
  if (typeof color === "number")
    return ansi256ToRgb(color);
  if (color.r === -1)
    return null;
  return color;
}
function cellToFrameCell(c) {
  const ulStyle = c.attrs.underlineStyle ?? (c.attrs.underline ? "single" : false);
  return {
    char: c.char,
    fg: resolveColor2(c.fg),
    bg: resolveColor2(c.bg),
    bold: c.attrs.bold ?? false,
    dim: c.attrs.dim ?? false,
    italic: c.attrs.italic ?? false,
    underline: ulStyle,
    underlineColor: resolveColor2(c.underlineColor ?? null),
    strikethrough: c.attrs.strikethrough ?? false,
    inverse: c.attrs.inverse ?? false,
    blink: c.attrs.blink ?? false,
    hidden: c.attrs.hidden ?? false,
    wide: c.wide,
    continuation: c.continuation,
    hyperlink: c.hyperlink ?? null
  };
}
function createTextFrame(buffer) {
  const width = buffer.width;
  const height = buffer.height;
  const snapshot = buffer.clone();
  const cellData = new Array(width * height);
  for (let y = 0;y < height; y++) {
    for (let x = 0;x < width; x++) {
      cellData[y * width + x] = snapshot.getCell(x, y);
    }
  }
  let _text;
  let _ansi;
  let _lines;
  const frame = {
    width,
    height,
    get text() {
      if (_text === undefined)
        _text = bufferToText(snapshot);
      return _text;
    },
    get ansi() {
      if (_ansi === undefined)
        _ansi = bufferToStyledText(snapshot);
      return _ansi;
    },
    get lines() {
      if (_lines === undefined)
        _lines = frame.text.split(`
`);
      return _lines;
    },
    cell(col, row) {
      if (col < 0 || col >= width || row < 0 || row >= height) {
        return EMPTY_FRAME_CELL;
      }
      return cellToFrameCell(cellData[row * width + col]);
    },
    containsText(text) {
      return frame.text.includes(text);
    }
  };
  return frame;
}
var DEFAULT_BG, ATTR_BOLD, ATTR_DIM, ATTR_ITALIC, ATTR_BLINK, ATTR_INVERSE, ATTR_HIDDEN, ATTR_STRIKETHROUGH, UNDERLINE_STYLE_SHIFT = 24, UNDERLINE_STYLE_MASK, WIDE_FLAG, CONTINUATION_FLAG, TRUE_COLOR_FG_FLAG, TRUE_COLOR_BG_FLAG, VISIBLE_SPACE_ATTR_MASK, EMPTY_ATTRS, XTERM_256_PALETTE, EMPTY_FRAME_CELL;
var init_buffer = __esm(() => {
  DEFAULT_BG = Object.freeze({ r: -1, g: -1, b: -1 });
  ATTR_BOLD = 1 << 16;
  ATTR_DIM = 1 << 17;
  ATTR_ITALIC = 1 << 18;
  ATTR_BLINK = 1 << 19;
  ATTR_INVERSE = 1 << 20;
  ATTR_HIDDEN = 1 << 21;
  ATTR_STRIKETHROUGH = 1 << 22;
  UNDERLINE_STYLE_MASK = 7 << UNDERLINE_STYLE_SHIFT;
  WIDE_FLAG = 1 << 27;
  CONTINUATION_FLAG = 1 << 28;
  TRUE_COLOR_FG_FLAG = 1 << 29;
  TRUE_COLOR_BG_FLAG = 1 << 30;
  VISIBLE_SPACE_ATTR_MASK = ATTR_INVERSE | ATTR_STRIKETHROUGH | UNDERLINE_STYLE_MASK;
  EMPTY_ATTRS = Object.freeze({});
  XTERM_256_PALETTE = (() => {
    const palette = new Array(256);
    const standard = ["#000000", "#cd0000", "#00cd00", "#cdcd00", "#0000ee", "#cd00cd", "#00cdcd", "#e5e5e5"];
    const bright = ["#7f7f7f", "#ff0000", "#00ff00", "#ffff00", "#5c5cff", "#ff00ff", "#00ffff", "#ffffff"];
    for (let i = 0;i < 8; i++) {
      palette[i] = standard[i];
      palette[i + 8] = bright[i];
    }
    const cubeValues = [0, 95, 135, 175, 215, 255];
    for (let i = 0;i < 216; i++) {
      const r = cubeValues[Math.floor(i / 36)];
      const g = cubeValues[Math.floor(i % 36 / 6)];
      const b = cubeValues[i % 6];
      palette[16 + i] = "#" + r.toString(16).padStart(2, "0") + g.toString(16).padStart(2, "0") + b.toString(16).padStart(2, "0");
    }
    for (let i = 0;i < 24; i++) {
      const v = 8 + i * 10;
      const hex = v.toString(16).padStart(2, "0");
      palette[232 + i] = "#" + hex + hex + hex;
    }
    return palette;
  })();
  EMPTY_FRAME_CELL = Object.freeze({
    char: " ",
    fg: null,
    bg: null,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    underlineColor: null,
    strikethrough: false,
    inverse: false,
    blink: false,
    hidden: false,
    wide: false,
    continuation: false,
    hyperlink: null
  });
});

// packages/ag-term/src/errors.ts
var IncrementalRenderMismatchError;
var init_errors = __esm(() => {
  IncrementalRenderMismatchError = class IncrementalRenderMismatchError extends Error {
    renderPhaseStats;
    mismatchContext;
    constructor(message, data) {
      super(message);
      this.name = "IncrementalRenderMismatchError";
      this.renderPhaseStats = data?.renderPhaseStats;
      this.mismatchContext = data?.mismatchContext;
    }
  };
});

// packages/ag-term/src/text-sizing.ts
function textSized(text, width) {
  return `${OSC}66;w=${width};${text}${ST}`;
}
function isPrivateUseArea(cp) {
  return cp >= 57344 && cp <= 63743 || cp >= 983040 && cp <= 1048573 || cp >= 1048576 && cp <= 1114109;
}
var OSC = "\x1B]", ST = "\x07", probeCache;
var init_text_sizing = __esm(() => {
  probeCache = new Map;
});

// packages/ag-term/src/pipeline/diff-buffers.ts
function createEmptyCellChange() {
  return {
    x: 0,
    y: 0,
    cell: {
      char: " ",
      fg: null,
      bg: null,
      underlineColor: null,
      attrs: {},
      wide: false,
      continuation: false,
      hyperlink: undefined
    }
  };
}
function ensureDiffPoolCapacity(capacity) {
  if (capacity <= diffPoolCapacity)
    return;
  for (let i = diffPoolCapacity;i < capacity; i++) {
    diffPool.push(createEmptyCellChange());
  }
  diffPoolCapacity = capacity;
}
function writeCellChange(change, x, y, buffer) {
  change.x = x;
  change.y = y;
  buffer.readCellInto(x, y, change.cell);
}
function writeEmptyCellChange(change, x, y) {
  change.x = x;
  change.y = y;
  const cell = change.cell;
  cell.char = " ";
  cell.fg = null;
  cell.bg = null;
  cell.underlineColor = null;
  const attrs = cell.attrs;
  attrs.bold = undefined;
  attrs.dim = undefined;
  attrs.italic = undefined;
  attrs.underline = undefined;
  attrs.underlineStyle = undefined;
  attrs.blink = undefined;
  attrs.inverse = undefined;
  attrs.hidden = undefined;
  attrs.strikethrough = undefined;
  cell.wide = false;
  cell.continuation = false;
  cell.hyperlink = undefined;
}
function diffBuffers(prev, next) {
  const cells = Math.max(prev.width, next.width) * Math.max(prev.height, next.height);
  const maxChanges = cells + (cells >> 1);
  ensureDiffPoolCapacity(maxChanges);
  let changeCount = 0;
  const height = Math.min(prev.height, next.height);
  const width = Math.min(prev.width, next.width);
  const startRow = next.minDirtyRow === -1 ? 0 : next.minDirtyRow;
  const endRow = next.maxDirtyRow === -1 ? -1 : Math.min(next.maxDirtyRow, height - 1);
  for (let y = startRow;y <= endRow; y++) {
    if (!next.isRowDirty(y))
      continue;
    if (next.rowMetadataEquals(y, prev) && next.rowCharsEquals(y, prev) && next.rowExtrasEquals(y, prev))
      continue;
    for (let x = 0;x < width; x++) {
      if (!next.cellEquals(x, y, prev)) {
        writeCellChange(diffPool[changeCount], x, y, next);
        changeCount++;
        if (x + 1 < width && prev.isCellWide(x, y) && !next.isCellWide(x, y)) {
          writeCellChange(diffPool[changeCount], x + 1, y, next);
          changeCount++;
        }
      }
    }
  }
  const widthGrew = next.width > prev.width;
  if (widthGrew) {
    for (let y = 0;y < next.height; y++) {
      for (let x = prev.width;x < next.width; x++) {
        writeCellChange(diffPool[changeCount], x, y, next);
        changeCount++;
      }
    }
  }
  if (next.height > prev.height) {
    const xEnd = widthGrew ? prev.width : next.width;
    for (let y = prev.height;y < next.height; y++) {
      for (let x = 0;x < xEnd; x++) {
        writeCellChange(diffPool[changeCount], x, y, next);
        changeCount++;
      }
    }
  }
  const widthShrank = prev.width > next.width;
  if (widthShrank) {
    for (let y = 0;y < height; y++) {
      for (let x = next.width;x < prev.width; x++) {
        writeEmptyCellChange(diffPool[changeCount], x, y);
        changeCount++;
      }
    }
  }
  if (prev.height > next.height) {
    for (let y = next.height;y < prev.height; y++) {
      for (let x = 0;x < prev.width; x++) {
        writeEmptyCellChange(diffPool[changeCount], x, y);
        changeCount++;
      }
    }
  }
  if (changeCount > maxChanges) {
    throw new Error(`diffBuffers: changeCount ${changeCount} exceeds pool capacity ${maxChanges} ` + `(prev ${prev.width}x${prev.height}, next ${next.width}x${next.height})`);
  }
  diffResult.pool = diffPool;
  diffResult.count = changeCount;
  return diffResult;
}
var diffPool, diffPoolCapacity = 0, diffResult;
var init_diff_buffers = __esm(() => {
  diffPool = [];
  diffResult = { pool: diffPool, count: 0 };
});

// node:path
var exports_path = {};
__export(exports_path, {
  sep: () => sep,
  resolve: () => resolve,
  relative: () => relative,
  posix: () => posix,
  parse: () => parse,
  normalize: () => normalize,
  join: () => join,
  isAbsolute: () => isAbsolute,
  format: () => format,
  extname: () => extname,
  dirname: () => dirname,
  delimiter: () => delimiter,
  default: () => path_default,
  basename: () => basename,
  _makeLong: () => _makeLong
});
function assertPath(path) {
  if (typeof path !== "string")
    throw TypeError("Path must be a string. Received " + JSON.stringify(path));
}
function normalizeStringPosix(path, allowAboveRoot) {
  var res = "", lastSegmentLength = 0, lastSlash = -1, dots = 0, code;
  for (var i = 0;i <= path.length; ++i) {
    if (i < path.length)
      code = path.charCodeAt(i);
    else if (code === 47)
      break;
    else
      code = 47;
    if (code === 47) {
      if (lastSlash === i - 1 || dots === 1)
        ;
      else if (lastSlash !== i - 1 && dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 || res.charCodeAt(res.length - 2) !== 46) {
          if (res.length > 2) {
            var lastSlashIndex = res.lastIndexOf("/");
            if (lastSlashIndex !== res.length - 1) {
              if (lastSlashIndex === -1)
                res = "", lastSegmentLength = 0;
              else
                res = res.slice(0, lastSlashIndex), lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
              lastSlash = i, dots = 0;
              continue;
            }
          } else if (res.length === 2 || res.length === 1) {
            res = "", lastSegmentLength = 0, lastSlash = i, dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0)
            res += "/..";
          else
            res = "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0)
          res += "/" + path.slice(lastSlash + 1, i);
        else
          res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i, dots = 0;
    } else if (code === 46 && dots !== -1)
      ++dots;
    else
      dots = -1;
  }
  return res;
}
function _format(sep, pathObject) {
  var dir = pathObject.dir || pathObject.root, base = pathObject.base || (pathObject.name || "") + (pathObject.ext || "");
  if (!dir)
    return base;
  if (dir === pathObject.root)
    return dir + base;
  return dir + sep + base;
}
function resolve() {
  var resolvedPath = "", resolvedAbsolute = false, cwd;
  for (var i = arguments.length - 1;i >= -1 && !resolvedAbsolute; i--) {
    var path;
    if (i >= 0)
      path = arguments[i];
    else {
      if (cwd === undefined)
        cwd = process.cwd();
      path = cwd;
    }
    if (assertPath(path), path.length === 0)
      continue;
    resolvedPath = path + "/" + resolvedPath, resolvedAbsolute = path.charCodeAt(0) === 47;
  }
  if (resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute), resolvedAbsolute)
    if (resolvedPath.length > 0)
      return "/" + resolvedPath;
    else
      return "/";
  else if (resolvedPath.length > 0)
    return resolvedPath;
  else
    return ".";
}
function normalize(path) {
  if (assertPath(path), path.length === 0)
    return ".";
  var isAbsolute = path.charCodeAt(0) === 47, trailingSeparator = path.charCodeAt(path.length - 1) === 47;
  if (path = normalizeStringPosix(path, !isAbsolute), path.length === 0 && !isAbsolute)
    path = ".";
  if (path.length > 0 && trailingSeparator)
    path += "/";
  if (isAbsolute)
    return "/" + path;
  return path;
}
function isAbsolute(path) {
  return assertPath(path), path.length > 0 && path.charCodeAt(0) === 47;
}
function join() {
  if (arguments.length === 0)
    return ".";
  var joined;
  for (var i = 0;i < arguments.length; ++i) {
    var arg = arguments[i];
    if (assertPath(arg), arg.length > 0)
      if (joined === undefined)
        joined = arg;
      else
        joined += "/" + arg;
  }
  if (joined === undefined)
    return ".";
  return normalize(joined);
}
function relative(from, to) {
  if (assertPath(from), assertPath(to), from === to)
    return "";
  if (from = resolve(from), to = resolve(to), from === to)
    return "";
  var fromStart = 1;
  for (;fromStart < from.length; ++fromStart)
    if (from.charCodeAt(fromStart) !== 47)
      break;
  var fromEnd = from.length, fromLen = fromEnd - fromStart, toStart = 1;
  for (;toStart < to.length; ++toStart)
    if (to.charCodeAt(toStart) !== 47)
      break;
  var toEnd = to.length, toLen = toEnd - toStart, length = fromLen < toLen ? fromLen : toLen, lastCommonSep = -1, i = 0;
  for (;i <= length; ++i) {
    if (i === length) {
      if (toLen > length) {
        if (to.charCodeAt(toStart + i) === 47)
          return to.slice(toStart + i + 1);
        else if (i === 0)
          return to.slice(toStart + i);
      } else if (fromLen > length) {
        if (from.charCodeAt(fromStart + i) === 47)
          lastCommonSep = i;
        else if (i === 0)
          lastCommonSep = 0;
      }
      break;
    }
    var fromCode = from.charCodeAt(fromStart + i), toCode = to.charCodeAt(toStart + i);
    if (fromCode !== toCode)
      break;
    else if (fromCode === 47)
      lastCommonSep = i;
  }
  var out = "";
  for (i = fromStart + lastCommonSep + 1;i <= fromEnd; ++i)
    if (i === fromEnd || from.charCodeAt(i) === 47)
      if (out.length === 0)
        out += "..";
      else
        out += "/..";
  if (out.length > 0)
    return out + to.slice(toStart + lastCommonSep);
  else {
    if (toStart += lastCommonSep, to.charCodeAt(toStart) === 47)
      ++toStart;
    return to.slice(toStart);
  }
}
function _makeLong(path) {
  return path;
}
function dirname(path) {
  if (assertPath(path), path.length === 0)
    return ".";
  var code = path.charCodeAt(0), hasRoot = code === 47, end = -1, matchedSlash = true;
  for (var i = path.length - 1;i >= 1; --i)
    if (code = path.charCodeAt(i), code === 47) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else
      matchedSlash = false;
  if (end === -1)
    return hasRoot ? "/" : ".";
  if (hasRoot && end === 1)
    return "//";
  return path.slice(0, end);
}
function basename(path, ext) {
  if (ext !== undefined && typeof ext !== "string")
    throw TypeError('"ext" argument must be a string');
  assertPath(path);
  var start = 0, end = -1, matchedSlash = true, i;
  if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
    if (ext.length === path.length && ext === path)
      return "";
    var extIdx = ext.length - 1, firstNonSlashEnd = -1;
    for (i = path.length - 1;i >= 0; --i) {
      var code = path.charCodeAt(i);
      if (code === 47) {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else {
        if (firstNonSlashEnd === -1)
          matchedSlash = false, firstNonSlashEnd = i + 1;
        if (extIdx >= 0)
          if (code === ext.charCodeAt(extIdx)) {
            if (--extIdx === -1)
              end = i;
          } else
            extIdx = -1, end = firstNonSlashEnd;
      }
    }
    if (start === end)
      end = firstNonSlashEnd;
    else if (end === -1)
      end = path.length;
    return path.slice(start, end);
  } else {
    for (i = path.length - 1;i >= 0; --i)
      if (path.charCodeAt(i) === 47) {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else if (end === -1)
        matchedSlash = false, end = i + 1;
    if (end === -1)
      return "";
    return path.slice(start, end);
  }
}
function extname(path) {
  assertPath(path);
  var startDot = -1, startPart = 0, end = -1, matchedSlash = true, preDotState = 0;
  for (var i = path.length - 1;i >= 0; --i) {
    var code = path.charCodeAt(i);
    if (code === 47) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1)
      matchedSlash = false, end = i + 1;
    if (code === 46) {
      if (startDot === -1)
        startDot = i;
      else if (preDotState !== 1)
        preDotState = 1;
    } else if (startDot !== -1)
      preDotState = -1;
  }
  if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
    return "";
  return path.slice(startDot, end);
}
function format(pathObject) {
  if (pathObject === null || typeof pathObject !== "object")
    throw TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof pathObject);
  return _format("/", pathObject);
}
function parse(path) {
  assertPath(path);
  var ret = { root: "", dir: "", base: "", ext: "", name: "" };
  if (path.length === 0)
    return ret;
  var code = path.charCodeAt(0), isAbsolute2 = code === 47, start;
  if (isAbsolute2)
    ret.root = "/", start = 1;
  else
    start = 0;
  var startDot = -1, startPart = 0, end = -1, matchedSlash = true, i = path.length - 1, preDotState = 0;
  for (;i >= start; --i) {
    if (code = path.charCodeAt(i), code === 47) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1)
      matchedSlash = false, end = i + 1;
    if (code === 46) {
      if (startDot === -1)
        startDot = i;
      else if (preDotState !== 1)
        preDotState = 1;
    } else if (startDot !== -1)
      preDotState = -1;
  }
  if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
    if (end !== -1)
      if (startPart === 0 && isAbsolute2)
        ret.base = ret.name = path.slice(1, end);
      else
        ret.base = ret.name = path.slice(startPart, end);
  } else {
    if (startPart === 0 && isAbsolute2)
      ret.name = path.slice(1, startDot), ret.base = path.slice(1, end);
    else
      ret.name = path.slice(startPart, startDot), ret.base = path.slice(startPart, end);
    ret.ext = path.slice(startDot, end);
  }
  if (startPart > 0)
    ret.dir = path.slice(0, startPart - 1);
  else if (isAbsolute2)
    ret.dir = "/";
  return ret;
}
var sep = "/", delimiter = ":", posix, path_default;
var init_path = __esm(() => {
  posix = ((p) => (p.posix = p, p))({ resolve, normalize, isAbsolute, join, relative, _makeLong, dirname, basename, extname, format, parse, sep, delimiter, win32: null, posix: null });
  path_default = posix;
});

// packages/ag-term/src/pipeline/output-phase.ts
function outputGraphemeWidth(g, ctx) {
  return ctx.measurer ? ctx.measurer.graphemeWidth(g) : graphemeWidth(g);
}
function outputTextSizingEnabled(ctx) {
  return ctx.measurer ? ctx.measurer.textSizingEnabled : isTextSizingEnabled();
}
function isStrictOutput() {
  return !!process.env.SILVERY_STRICT;
}
function isStrictAccumulate() {
  return !!process.env.SILVERY_STRICT_ACCUMULATE;
}
function strictTerminalBackends() {
  const val = (process.env.SILVERY_STRICT_TERMINAL ?? "").toLowerCase().trim();
  if (!val)
    return [];
  if (val === "all")
    return ["vt100", "xterm", "ghostty"];
  const backends = val.split(",").map((s) => s.trim()).filter(Boolean);
  const valid = new Set(["vt100", "xterm", "ghostty"]);
  for (const b of backends) {
    if (!valid.has(b)) {
      console.warn(`SILVERY_STRICT_TERMINAL: unknown backend '${b}', ignoring`);
    }
  }
  return backends.filter((b) => valid.has(b));
}
function createTerminalVerifyState() {
  const allBackends = strictTerminalBackends();
  return {
    terminal: null,
    ghosttyTerminal: null,
    width: 0,
    height: 0,
    frameCount: 0,
    backends: allBackends.filter((b) => b !== "vt100"),
    hasVt100: allBackends.includes("vt100")
  };
}
function createInlineCursorState() {
  return {
    prevCursorRow: -1,
    prevOutputLines: 0,
    prevBuffer: null,
    forceFirstRender: false
  };
}
function updateInlineCursorRow(state, cursorPos, maxOutputLines, startLine) {
  if (cursorPos?.visible) {
    const visibleRow = cursorPos.y - startLine;
    state.prevCursorRow = visibleRow >= 0 && visibleRow < maxOutputLines ? visibleRow : maxOutputLines - 1;
  } else {
    state.prevCursorRow = maxOutputLines - 1;
  }
  state.prevOutputLines = maxOutputLines;
}
function wrapTextSizing(char, wide, ctx) {
  if (!wide || !outputTextSizingEnabled(ctx))
    return char;
  return textSized(char, 2);
}
function styleToKey(style) {
  const fg = style.fg;
  const bg = style.bg;
  const attrs = style.attrs;
  let key = "";
  if (fg === null) {
    key = "n";
  } else if (typeof fg === "number") {
    key = `${fg}`;
  } else {
    key = `r${fg.r},${fg.g},${fg.b}`;
  }
  key += "|";
  if (bg === null) {
    key += "n";
  } else if (typeof bg === "number") {
    key += `${bg}`;
  } else {
    key += `r${bg.r},${bg.g},${bg.b}`;
  }
  let attrBits = 0;
  if (attrs.bold)
    attrBits |= 1;
  if (attrs.dim)
    attrBits |= 2;
  if (attrs.italic)
    attrBits |= 4;
  if (attrs.underline)
    attrBits |= 8;
  if (attrs.inverse)
    attrBits |= 16;
  if (attrs.strikethrough)
    attrBits |= 32;
  if (attrs.blink)
    attrBits |= 64;
  if (attrs.hidden)
    attrBits |= 128;
  key += `|${attrBits}`;
  if (attrs.underlineStyle) {
    key += `|u${attrs.underlineStyle}`;
  }
  const ul = style.underlineColor;
  if (ul !== null && ul !== undefined) {
    if (typeof ul === "number") {
      key += `|l${ul}`;
    } else {
      key += `|lr${ul.r},${ul.g},${ul.b}`;
    }
  }
  if (style.hyperlink) {
    key += `|h${style.hyperlink}`;
  }
  return key;
}
function cachedStyleToAnsi(style, ctx) {
  const key = styleToKey(style);
  let sgr = ctx.sgrCache.get(key);
  if (sgr !== undefined)
    return sgr;
  sgr = styleToAnsi(style, ctx);
  ctx.sgrCache.set(key, sgr);
  if (ctx.sgrCache.size > 1000)
    ctx.sgrCache.clear();
  return sgr;
}
function styleTransition(oldStyle, newStyle, ctx) {
  if (!oldStyle)
    return cachedStyleToAnsi(newStyle, ctx);
  if (styleEquals(oldStyle, newStyle))
    return "";
  const oldKey = styleToKey(oldStyle);
  const newKey = styleToKey(newStyle);
  const cacheKey = `${oldKey}\x00${newKey}`;
  const cached = ctx.transitionCache.get(cacheKey);
  if (cached !== undefined)
    return cached;
  const codes = [];
  const oa = oldStyle.attrs;
  const na = newStyle.attrs;
  const boldChanged = Boolean(oa.bold) !== Boolean(na.bold);
  const dimChanged = Boolean(oa.dim) !== Boolean(na.dim);
  if (boldChanged || dimChanged) {
    const boldOff = boldChanged && !na.bold;
    const dimOff = dimChanged && !na.dim;
    if (boldOff || dimOff) {
      codes.push("22");
      if (na.bold)
        codes.push("1");
      if (na.dim)
        codes.push("2");
    } else {
      if (boldChanged && na.bold)
        codes.push("1");
      if (dimChanged && na.dim)
        codes.push("2");
    }
  }
  if (Boolean(oa.italic) !== Boolean(na.italic)) {
    codes.push(na.italic ? "3" : "23");
  }
  const oldUl = Boolean(oa.underline);
  const newUl = Boolean(na.underline);
  const oldUlStyle = oa.underlineStyle ?? false;
  const newUlStyle = na.underlineStyle ?? false;
  if (oldUl !== newUl || oldUlStyle !== newUlStyle) {
    if (!ctx.caps.underlineStyles) {
      codes.push(newUl || na.underlineStyle ? "4" : "24");
    } else {
      const sgrSub = underlineStyleToSgr(na.underlineStyle);
      if (sgrSub !== null && sgrSub !== 0) {
        codes.push(`4:${sgrSub}`);
      } else if (newUl) {
        codes.push("4");
      } else {
        codes.push("24");
      }
    }
  }
  if (Boolean(oa.inverse) !== Boolean(na.inverse)) {
    codes.push(na.inverse ? "7" : "27");
  }
  if (Boolean(oa.hidden) !== Boolean(na.hidden)) {
    codes.push(na.hidden ? "8" : "28");
  }
  if (Boolean(oa.strikethrough) !== Boolean(na.strikethrough)) {
    codes.push(na.strikethrough ? "9" : "29");
  }
  if (Boolean(oa.blink) !== Boolean(na.blink)) {
    codes.push(na.blink ? "5" : "25");
  }
  if (!colorEquals(oldStyle.fg, newStyle.fg)) {
    if (newStyle.fg === null) {
      codes.push("39");
    } else {
      codes.push(fgColorCode(newStyle.fg));
    }
  }
  if (!colorEquals(oldStyle.bg, newStyle.bg)) {
    if (newStyle.bg === null) {
      codes.push("49");
    } else {
      codes.push(bgColorCode(newStyle.bg));
    }
  }
  if (ctx.caps.underlineColor && !colorEquals(oldStyle.underlineColor, newStyle.underlineColor)) {
    if (newStyle.underlineColor === null || newStyle.underlineColor === undefined) {
      codes.push("59");
    } else if (typeof newStyle.underlineColor === "number") {
      codes.push(`58;5;${newStyle.underlineColor}`);
    } else {
      codes.push(`58;2;${newStyle.underlineColor.r};${newStyle.underlineColor.g};${newStyle.underlineColor.b}`);
    }
  }
  let result;
  if (codes.length === 0) {
    result = cachedStyleToAnsi(newStyle, ctx);
  } else {
    result = `\x1B[${codes.join(";")}m`;
  }
  ctx.transitionCache.set(cacheKey, result);
  if (ctx.transitionCache.size > 1000)
    ctx.transitionCache.clear();
  return result;
}
function underlineStyleToSgr(style) {
  switch (style) {
    case false:
      return 0;
    case "single":
      return 1;
    case "double":
      return 2;
    case "curly":
      return 3;
    case "dotted":
      return 4;
    case "dashed":
      return 5;
    default:
      return null;
  }
}
function outputPhase(prev, next, mode = "fullscreen", scrollbackOffset = 0, termRows, cursorPos, _inlineState, _ctx, _accState, _tvState) {
  const inlineState = _inlineState ?? createInlineCursorState();
  const ctx = _ctx ?? defaultContext;
  const accState = _accState ?? defaultAccState;
  ctx.mode = mode;
  ctx.termRows = termRows;
  const tvState = _tvState ?? defaultTerminalVerifyState;
  if (mode === "inline" && inlineState.forceFirstRender) {
    inlineState.forceFirstRender = false;
    prev = null;
  }
  if (!prev) {
    if (mode === "inline" && inlineState.prevBuffer && inlineState.prevCursorRow >= 0) {
      const stored = inlineState.prevBuffer;
      if (stored.width === next.width && stored.height === next.height) {
        inlineState.prevBuffer = next;
        return inlineIncrementalRender(inlineState, stored, next, scrollbackOffset, cursorPos, ctx, tvState);
      }
    }
    const firstOutput = bufferToAnsi(next, ctx, termRows);
    if (mode === "inline") {
      const firstContentLines = findLastContentLine(next) + 1;
      const firstMaxOutput = termRows != null ? Math.min(firstContentLines, termRows) : firstContentLines;
      let firstStartLine = 0;
      if (termRows != null && firstContentLines > termRows)
        firstStartLine = firstContentLines - termRows;
      let prefix = "";
      if (inlineState.prevCursorRow >= 0) {
        const clearDistance = termRows ?? Math.max(inlineState.prevCursorRow, inlineState.prevOutputLines - 1);
        if (clearDistance > 0) {
          prefix += `\x1B[${clearDistance}A`;
        }
        prefix += "\r\x1B[J";
      }
      inlineState.prevBuffer = next;
      updateInlineCursorRow(inlineState, cursorPos, firstMaxOutput, firstStartLine);
      return prefix + firstOutput + inlineCursorSuffix(cursorPos ?? null, next, ctx);
    }
    if (isStrictAccumulate()) {
      accState.accumulatedAnsi = firstOutput;
      accState.accumulateWidth = next.width;
      accState.accumulateHeight = next.height;
      accState.accumulateFrameCount = 0;
    }
    if (tvState.backends.length > 0) {
      initTerminalVerifyState(tvState, next.width, next.height, firstOutput);
    }
    if (CAPTURE_RAW) {
      try {
        const fs = (()=>{throw new Error("Cannot require module "+"fs");})();
        _captureRawFrameCount = 0;
        fs.writeFileSync("/tmp/silvery-raw.ansi", firstOutput);
        fs.writeFileSync("/tmp/silvery-raw-frames.jsonl", JSON.stringify({
          frame: 0,
          type: "full",
          bytes: firstOutput.length,
          width: next.width,
          height: next.height
        }) + `
`);
      } catch {}
    }
    return firstOutput;
  }
  if (mode === "inline") {
    inlineState.prevBuffer = next;
    return inlineIncrementalRender(inlineState, prev, next, scrollbackOffset, cursorPos, ctx, tvState);
  }
  if (FULL_RENDER) {
    return bufferToAnsi(next, ctx, termRows);
  }
  if (prev.width !== next.width || prev.height !== next.height) {
    return bufferToAnsi(next, ctx, termRows);
  }
  const { pool, count: rawCount } = diffBuffers(prev, next);
  let count = rawCount;
  if (termRows != null) {
    let writeIdx = 0;
    for (let i = 0;i < rawCount; i++) {
      if (pool[i].y < termRows) {
        pool[writeIdx++] = pool[i];
      }
    }
    count = writeIdx;
  }
  if (DEBUG_OUTPUT) {
    console.error(`[SILVERY_DEBUG_OUTPUT] diffBuffers: ${count} changes${rawCount !== count ? ` (${rawCount - count} clamped beyond termRows)` : ""}`);
    const debugLimit = Math.min(count, 10);
    for (let i = 0;i < debugLimit; i++) {
      const change = pool[i];
      console.error(`  (${change.x},${change.y}): "${change.cell.char}"`);
    }
    if (count > 10) {
      console.error(`  ... and ${count - 10} more`);
    }
  }
  if (count === 0) {
    return "";
  }
  const incrOutput = changesToAnsi(pool, count, ctx, next).output;
  if (DEBUG_OUTPUT || isStrictAccumulate()) {
    const bytes = Buffer.byteLength(incrOutput);
    try {
      const fs = (()=>{throw new Error("Cannot require module "+"fs");})();
      fs.appendFileSync("/tmp/silvery-sizes.log", `changesToAnsi: ${count} changes, ${bytes} bytes
`);
    } catch {}
  }
  if (DEBUG_CAPTURE) {
    _debugFrameCount++;
    try {
      const fs = (()=>{throw new Error("Cannot require module "+"fs");})();
      const freshOutput = bufferToAnsi(next, ctx);
      const freshPrev = prev ? bufferToAnsi(prev, ctx) : "";
      const w = Math.max(prev?.width ?? next.width, next.width);
      const h = Math.max(prev?.height ?? next.height, next.height);
      const screenIncr = replayAnsiWithStyles(w, h, freshPrev + incrOutput, ctx);
      const screenFresh = replayAnsiWithStyles(w, h, freshOutput, ctx);
      let mismatchInfo = "";
      for (let y = 0;y < h && !mismatchInfo; y++) {
        for (let x = 0;x < w && !mismatchInfo; x++) {
          const ic = screenIncr[y]?.[x];
          const fc = screenFresh[y]?.[x];
          if (ic && fc && (ic.char !== fc.char || !sgrColorEquals(ic.fg, fc.fg) || !sgrColorEquals(ic.bg, fc.bg))) {
            mismatchInfo = `MISMATCH at (${x},${y}): incr='${ic.char}' fresh='${fc.char}' incrFg=${formatColor(ic.fg)} freshFg=${formatColor(fc.fg)} incrBg=${formatColor(ic.bg)} freshBg=${formatColor(fc.bg)}`;
            const incrRow = screenIncr[y].map((c) => c.char).join("");
            const freshRow = screenFresh[y].map((c) => c.char).join("");
            mismatchInfo += `
  incr row ${y}: ${incrRow.slice(Math.max(0, x - 20), x + 40)}
  fresh row ${y}: ${freshRow.slice(Math.max(0, x - 20), x + 40)}`;
          }
        }
      }
      const status = mismatchInfo || "MATCH";
      fs.appendFileSync("/tmp/silvery-capture.log", `Frame ${_debugFrameCount}: ${count} changes, ${status}
`);
      if (mismatchInfo) {
        fs.writeFileSync(`/tmp/silvery-incr-${_debugFrameCount}.ansi`, freshPrev + incrOutput);
        fs.writeFileSync(`/tmp/silvery-fresh-${_debugFrameCount}.ansi`, freshOutput);
        fs.appendFileSync("/tmp/silvery-capture.log", `  Saved ANSI files: /tmp/silvery-incr-${_debugFrameCount}.ansi and /tmp/silvery-fresh-${_debugFrameCount}.ansi
`);
      }
    } catch (e) {
      try {
        (()=>{throw new Error("Cannot require module "+"fs");})().appendFileSync("/tmp/silvery-capture.log", `Frame ${_debugFrameCount}: ERROR ${e}
`);
      } catch {}
    }
  }
  if (isStrictOutput() || tvState.hasVt100) {
    verifyOutputEquivalence(prev, next, incrOutput, ctx);
  }
  if (isStrictAccumulate()) {
    accState.accumulatedAnsi += incrOutput;
    accState.accumulateFrameCount++;
    verifyAccumulatedOutput(next, ctx, accState);
  }
  if (tvState.backends.length > 0 && (tvState.terminal || tvState.ghosttyTerminal)) {
    tvState.frameCount++;
    verifyTerminalEquivalence(tvState, incrOutput, next, ctx);
  }
  if (CAPTURE_RAW) {
    try {
      const fs = (()=>{throw new Error("Cannot require module "+"fs");})();
      _captureRawFrameCount++;
      fs.appendFileSync("/tmp/silvery-raw.ansi", incrOutput);
      const freshOutput = bufferToAnsi(next, ctx);
      fs.writeFileSync(`/tmp/silvery-raw-fresh-${_captureRawFrameCount}.ansi`, freshOutput);
      fs.appendFileSync("/tmp/silvery-raw-frames.jsonl", JSON.stringify({
        frame: _captureRawFrameCount,
        type: "incremental",
        changes: count,
        bytes: incrOutput.length,
        width: next.width,
        height: next.height
      }) + `
`);
    } catch {}
  }
  return incrOutput;
}
function lineHasContent(buffer, y) {
  for (let x = 0;x < buffer.width; x++) {
    const ch = buffer.getCellChar(x, y);
    if (ch !== " " && ch !== "")
      return true;
    const bg = buffer.getCellBg(x, y);
    if (bg !== null)
      return true;
    if (buffer.getCellAttrs(x, y) & VISIBLE_SPACE_ATTR_MASK)
      return true;
  }
  return false;
}
function findLastContentLine(buffer) {
  for (let y = buffer.height - 1;y >= 0; y--) {
    if (lineHasContent(buffer, y)) {
      return y;
    }
  }
  return 0;
}
function inlineCursorSuffix(cursorPos, buffer, ctx) {
  const { termRows } = ctx;
  if (!cursorPos?.visible) {
    return "\x1B[?25l";
  }
  const lastContentLine = findLastContentLine(buffer);
  const maxLine = lastContentLine;
  let startLine = 0;
  const maxOutputLines = termRows != null ? Math.min(lastContentLine + 1, termRows) : lastContentLine + 1;
  if (termRows != null && maxLine >= termRows) {
    startLine = maxLine - termRows + 1;
  }
  const visibleRow = cursorPos.y - startLine;
  if (visibleRow < 0 || visibleRow >= maxOutputLines) {
    return "\x1B[?25l";
  }
  const currentRow = maxOutputLines - 1;
  const rowDelta = currentRow - visibleRow;
  let suffix = "";
  if (rowDelta > 0) {
    suffix += `\x1B[${rowDelta}A`;
  }
  suffix += "\r";
  if (cursorPos.x > 0) {
    suffix += `\x1B[${cursorPos.x}C`;
  }
  suffix += "\x1B[?25h";
  return suffix;
}
function inlineIncrementalRender(state, prev, next, scrollbackOffset, cursorPos, ctx = defaultContext, tvState) {
  const { termRows } = ctx;
  if (scrollbackOffset > 0 || prev.width !== next.width || prev.height !== next.height || state.prevCursorRow < 0) {
    return inlineFullRender(state, prev, next, scrollbackOffset, cursorPos, ctx);
  }
  const nextContentLines = findLastContentLine(next) + 1;
  const prevContentLines = findLastContentLine(prev) + 1;
  const prevMaxOutputLines = termRows != null ? Math.min(prevContentLines, termRows) : prevContentLines;
  const maxOutputLines = termRows != null ? Math.min(nextContentLines, termRows) : nextContentLines;
  let prevStartLine = 0;
  if (termRows != null && prevContentLines > termRows) {
    prevStartLine = prevContentLines - termRows;
  }
  let startLine = 0;
  if (termRows != null && nextContentLines > termRows) {
    startLine = nextContentLines - termRows;
  }
  if (startLine !== prevStartLine) {
    return inlineFullRender(state, prev, next, scrollbackOffset, cursorPos, ctx);
  }
  const { pool, count } = diffBuffers(prev, next);
  if (count === 0 && nextContentLines === prevContentLines) {
    const suffix = inlineCursorSuffix(cursorPos ?? null, next, ctx);
    updateInlineCursorRow(state, cursorPos, maxOutputLines, startLine);
    return suffix;
  }
  let output = "";
  if (state.prevCursorRow > 0) {
    output += `\x1B[${state.prevCursorRow}A`;
  }
  output += "\r";
  output += "\x1B[?25l";
  const effectiveOutputLines = Math.max(prevMaxOutputLines, maxOutputLines);
  const changes = changesToAnsi(pool, count, ctx, next, startLine, effectiveOutputLines);
  output += changes.output;
  const finalY = changes.finalY;
  const prevBottomRow = prevMaxOutputLines - 1;
  const bottomRow = maxOutputLines - 1;
  if (maxOutputLines > prevMaxOutputLines) {
    const fromRow = finalY >= 0 ? finalY : 0;
    if (fromRow >= bottomRow) {} else if (fromRow >= prevBottomRow) {
      const remainingRows = bottomRow - fromRow;
      for (let i = 0;i < remainingRows; i++) {
        output += `\r
`;
      }
    } else {
      if (fromRow < prevBottomRow) {
        const dy = prevBottomRow - fromRow;
        output += dy === 1 ? `\r
` : `\r\x1B[${dy}B`;
      }
      const newRows = bottomRow - prevBottomRow;
      for (let i = 0;i < newRows; i++) {
        output += `\r
`;
      }
    }
  } else if (maxOutputLines < prevMaxOutputLines) {
    const fromRow = finalY >= 0 ? finalY : 0;
    if (fromRow < bottomRow) {
      const dy = bottomRow - fromRow;
      output += dy === 1 ? `\r
` : `\r\x1B[${dy}B`;
    } else if (fromRow > bottomRow) {
      output += `\x1B[${fromRow - bottomRow}A`;
    }
    const orphanCount = prevMaxOutputLines - maxOutputLines;
    for (let y = 0;y < orphanCount; y++) {
      output += `
\r\x1B[K`;
    }
    if (orphanCount > 0)
      output += `\x1B[${orphanCount}A`;
  } else {
    if (finalY >= 0 && finalY < bottomRow) {
      const dy = bottomRow - finalY;
      output += dy === 1 ? `\r
` : `\r\x1B[${dy}B`;
    }
  }
  output += inlineCursorSuffix(cursorPos ?? null, next, ctx);
  if (isStrictOutput() || tvState?.hasVt100) {
    const savedMode = ctx.mode;
    ctx.mode = "fullscreen";
    const fsIncrOutput = changesToAnsi(pool, count, ctx, next).output;
    verifyOutputEquivalence(prev, next, fsIncrOutput, ctx);
    ctx.mode = savedMode;
  }
  updateInlineCursorRow(state, cursorPos, maxOutputLines, startLine);
  return output;
}
function inlineFullRender(state, prev, next, scrollbackOffset, cursorPos, ctx = defaultContext) {
  const { termRows } = ctx;
  const nextContentLines = findLastContentLine(next) + 1;
  let prevOutputLines;
  let cursorRowInRegion;
  if (state.prevCursorRow >= 0) {
    prevOutputLines = state.prevOutputLines;
    cursorRowInRegion = state.prevCursorRow;
  } else {
    const prevContentLines = findLastContentLine(prev) + 1;
    prevOutputLines = termRows != null ? Math.min(prevContentLines, termRows) : prevContentLines;
    cursorRowInRegion = prevOutputLines - 1;
  }
  const rawCursorOffset = cursorRowInRegion + scrollbackOffset;
  const cursorOffset = termRows != null && !isStrictOutput() ? Math.min(rawCursorOffset, termRows - 1) : rawCursorOffset;
  const maxOutputLines = termRows != null ? Math.min(nextContentLines, termRows) : nextContentLines;
  if (scrollbackOffset === 0) {
    const { count } = diffBuffers(prev, next);
    if (count === 0)
      return "";
  }
  let prefix = "";
  if (cursorOffset > 0) {
    prefix = `\x1B[${cursorOffset}A\r`;
  }
  let output = prefix + bufferToAnsi(next, ctx, maxOutputLines);
  const terminalScroll = termRows != null ? Math.max(0, rawCursorOffset - (termRows - 1)) : 0;
  const lastOccupiedLine = Math.max(prevOutputLines - 1 - terminalScroll, 0);
  const nextLastLine = maxOutputLines - 1;
  if (lastOccupiedLine > nextLastLine) {
    for (let y = nextLastLine + 1;y <= lastOccupiedLine; y++) {
      output += `
\r\x1B[K`;
    }
    const up = lastOccupiedLine - nextLastLine;
    if (up > 0)
      output += `\x1B[${up}A`;
  }
  output += inlineCursorSuffix(cursorPos ?? null, next, ctx);
  let startLine = 0;
  if (termRows != null && nextContentLines > termRows)
    startLine = nextContentLines - termRows;
  updateInlineCursorRow(state, cursorPos, maxOutputLines, startLine);
  return output;
}
function bufferToAnsi(buffer, ctx = defaultContext, maxRows) {
  const { mode } = ctx;
  let output = "";
  let currentStyle = null;
  let currentHyperlink;
  let maxLine = mode === "inline" ? findLastContentLine(buffer) : buffer.height - 1;
  let startLine = 0;
  if (maxRows != null && maxLine >= maxRows) {
    if (mode === "fullscreen") {
      maxLine = maxRows - 1;
    } else {
      startLine = maxLine - maxRows + 1;
    }
  }
  if (mode === "fullscreen") {
    output += "\x1B[H";
  } else {
    output += "\x1B[?25l";
  }
  const cell = createMutableCell();
  const cellStyle = {
    fg: null,
    bg: null,
    underlineColor: null,
    attrs: {}
  };
  for (let y = startLine;y <= maxLine; y++) {
    if (mode === "inline") {
      output += "\r";
    } else if (y > startLine) {
      output += `\x1B[${y + 1};1H`;
    }
    for (let x = 0;x < buffer.width; x++) {
      buffer.readCellInto(x, y, cell);
      const cellHyperlink = cell.hyperlink;
      if (cellHyperlink !== currentHyperlink) {
        if (currentHyperlink) {
          output += "\x1B]8;;\x1B\\";
        }
        if (cellHyperlink) {
          output += `\x1B]8;;${cellHyperlink}\x1B\\`;
        }
        currentHyperlink = cellHyperlink;
      }
      cellStyle.fg = cell.fg;
      cellStyle.bg = cell.bg;
      cellStyle.underlineColor = cell.underlineColor;
      cellStyle.attrs = cell.attrs;
      if (!styleEquals(currentStyle, cellStyle)) {
        const saved = {
          fg: cell.fg,
          bg: cell.bg,
          underlineColor: cell.underlineColor,
          attrs: { ...cell.attrs }
        };
        output += styleTransition(currentStyle, saved, ctx);
        currentStyle = saved;
      }
      const char = cell.char || " ";
      output += wrapTextSizing(char, cell.wide, ctx);
      if (cell.wide) {
        x++;
        if (mode === "fullscreen") {
          output += `\x1B[${y - startLine + 1};${x + 2}H`;
        } else {
          if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
            output += "\x1B[0m";
            currentStyle = null;
          }
          const nextCol = x + 1;
          output += "\r";
          if (nextCol > 0)
            output += nextCol === 1 ? "\x1B[C" : `\x1B[${nextCol}C`;
        }
      }
    }
    if (currentHyperlink) {
      output += "\x1B]8;;\x1B\\";
      currentHyperlink = undefined;
    }
    if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
      output += "\x1B[0m";
      currentStyle = null;
    }
    output += "\x1B[K";
    if (y < maxLine) {
      if (mode === "inline") {
        output += `\r
`;
      }
    }
  }
  if (currentHyperlink) {
    output += "\x1B]8;;\x1B\\";
  }
  output += "\x1B[0m";
  return output;
}
function sortPoolByPosition(pool, count) {
  for (let i = 1;i < count; i++) {
    const item = pool[i];
    const iy = item.y;
    const ix = item.x;
    let j = i - 1;
    while (j >= 0 && (pool[j].y > iy || pool[j].y === iy && pool[j].x > ix)) {
      pool[j + 1] = pool[j];
      j--;
    }
    pool[j + 1] = item;
  }
}
function changesToAnsi(pool, count, ctx = defaultContext, buffer, startLine = 0, maxOutputLines = Infinity) {
  const { mode } = ctx;
  if (count === 0)
    return { output: "", finalY: -1 };
  sortPoolByPosition(pool, count);
  let output = "";
  let currentStyle = null;
  let currentHyperlink;
  const isInline = mode === "inline";
  const endLine = startLine + maxOutputLines;
  let finalY = -1;
  let cursorX = -1;
  let cursorY = -1;
  let prevY = -1;
  let lastEmittedX = -1;
  let lastEmittedY = -1;
  for (let i = 0;i < count; i++) {
    const change = pool[i];
    let x = change.x;
    const y = change.y;
    let cell = change.cell;
    if (isInline && (y < startLine || y >= endLine))
      continue;
    if (cell.continuation) {
      if (lastEmittedX === x - 1 && lastEmittedY === y)
        continue;
      if (buffer && x > 0) {
        x = x - 1;
        buffer.readCellInto(x, y, wideCharLookupCell);
        cell = wideCharLookupCell;
        if (cell.continuation || !cell.wide)
          continue;
      } else {
        continue;
      }
    }
    const renderY = isInline ? y - startLine : y;
    if (y !== prevY && currentHyperlink) {
      output += "\x1B]8;;\x1B\\";
      currentHyperlink = undefined;
    }
    prevY = y;
    if (renderY !== cursorY || x !== cursorX) {
      if (cursorY >= 0 && renderY === cursorY + 1 && x === 0) {
        if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
          output += "\x1B[0m";
          currentStyle = null;
        }
        output += `\r
`;
      } else if (cursorY >= 0 && renderY === cursorY && x > cursorX) {
        if (currentStyle && currentStyle.bg !== null) {
          output += "\x1B[0m";
          currentStyle = null;
        }
        const dx = x - cursorX;
        output += dx === 1 ? "\x1B[C" : `\x1B[${dx}C`;
      } else if (cursorY >= 0 && renderY > cursorY && x === 0) {
        const dy = renderY - cursorY;
        if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
          output += "\x1B[0m";
          currentStyle = null;
        }
        output += dy === 1 ? `\r
` : `\r\x1B[${dy}B`;
      } else if (isInline) {
        if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
          output += "\x1B[0m";
          currentStyle = null;
        }
        const fromRow = cursorY >= 0 ? cursorY : 0;
        if (renderY > fromRow) {
          output += `\x1B[${renderY - fromRow}B\r`;
        } else if (renderY < fromRow) {
          output += `\x1B[${fromRow - renderY}A\r`;
        } else {
          output += "\r";
        }
        if (x > 0)
          output += x === 1 ? "\x1B[C" : `\x1B[${x}C`;
      } else {
        output += `\x1B[${renderY + 1};${x + 1}H`;
      }
    }
    const cellHyperlink = cell.hyperlink;
    if (cellHyperlink !== currentHyperlink) {
      if (currentHyperlink) {
        output += "\x1B]8;;\x1B\\";
      }
      if (cellHyperlink) {
        output += `\x1B]8;;${cellHyperlink}\x1B\\`;
      }
      currentHyperlink = cellHyperlink;
    }
    reusableCellStyle.fg = cell.fg;
    reusableCellStyle.bg = cell.bg;
    reusableCellStyle.underlineColor = cell.underlineColor;
    reusableCellStyle.attrs = cell.attrs;
    if (!styleEquals(currentStyle, reusableCellStyle)) {
      const prevStyle = currentStyle;
      currentStyle = {
        fg: cell.fg,
        bg: cell.bg,
        underlineColor: cell.underlineColor,
        attrs: { ...cell.attrs }
      };
      output += styleTransition(prevStyle, currentStyle, ctx);
    }
    const char = cell.char || " ";
    output += wrapTextSizing(char, cell.wide, ctx);
    cursorX = x + (cell.wide ? 2 : 1);
    cursorY = renderY;
    lastEmittedX = x;
    lastEmittedY = y;
    if (cell.wide) {
      if (isInline) {
        if (currentStyle && currentStyle.bg !== null) {
          output += "\x1B[0m";
          currentStyle = null;
        }
        output += "\r";
        if (cursorX > 0)
          output += cursorX === 1 ? "\x1B[C" : `\x1B[${cursorX}C`;
      } else {
        output += `\x1B[${cursorY + 1};${cursorX + 1}H`;
      }
    }
  }
  finalY = cursorY;
  if (currentHyperlink) {
    output += "\x1B]8;;\x1B\\";
  }
  if (currentStyle) {
    output += "\x1B[0m";
  }
  return { output, finalY };
}
function styleToAnsi(style, ctx = defaultContext) {
  const fg = style.fg;
  const bg = style.bg;
  let result = "";
  if (fg !== null) {
    result += `\x1B[${fgColorCode(fg)}m`;
  }
  if (bg !== null && !isDefaultBg(bg)) {
    result += `\x1B[${bgColorCode(bg)}m`;
  }
  if (style.attrs.bold)
    result += "\x1B[1m";
  if (style.attrs.dim)
    result += "\x1B[2m";
  if (style.attrs.italic)
    result += "\x1B[3m";
  if (!ctx.caps.underlineStyles) {
    if (style.attrs.underline || style.attrs.underlineStyle)
      result += "\x1B[4m";
  } else {
    const underlineStyle = style.attrs.underlineStyle;
    const sgrSubparam = underlineStyleToSgr(underlineStyle);
    if (sgrSubparam !== null && sgrSubparam !== 0) {
      result += `\x1B[4:${sgrSubparam}m`;
    } else if (style.attrs.underline) {
      result += "\x1B[4m";
    }
  }
  if (style.attrs.blink)
    result += "\x1B[5m";
  if (style.attrs.inverse)
    result += "\x1B[7m";
  if (style.attrs.hidden)
    result += "\x1B[8m";
  if (style.attrs.strikethrough)
    result += "\x1B[9m";
  if (ctx.caps.underlineColor && style.underlineColor !== null && style.underlineColor !== undefined) {
    if (typeof style.underlineColor === "number") {
      result += `\x1B[58;5;${style.underlineColor}m`;
    } else {
      result += `\x1B[58;2;${style.underlineColor.r};${style.underlineColor.g};${style.underlineColor.b}m`;
    }
  }
  return result;
}
function createDefaultSgr() {
  return {
    fg: null,
    bg: null,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    blink: false,
    inverse: false,
    hidden: false,
    strikethrough: false
  };
}
function createDefaultStyledCell() {
  return {
    char: " ",
    fg: null,
    bg: null,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    blink: false,
    inverse: false,
    hidden: false,
    strikethrough: false
  };
}
function applySgrParams(params, sgr) {
  if (params === "" || params === "0") {
    sgr.fg = null;
    sgr.bg = null;
    sgr.bold = false;
    sgr.dim = false;
    sgr.italic = false;
    sgr.underline = false;
    sgr.blink = false;
    sgr.inverse = false;
    sgr.hidden = false;
    sgr.strikethrough = false;
    return;
  }
  const parts = params.split(";");
  let i = 0;
  while (i < parts.length) {
    const code = parts[i];
    const colonIdx = code.indexOf(":");
    if (colonIdx >= 0) {
      const mainCode = parseInt(code.substring(0, colonIdx));
      if (mainCode === 4) {
        const sub = parseInt(code.substring(colonIdx + 1));
        sgr.underline = sub > 0;
      }
      i++;
      continue;
    }
    const n = parseInt(code);
    if (n === 0) {
      sgr.fg = null;
      sgr.bg = null;
      sgr.bold = false;
      sgr.dim = false;
      sgr.italic = false;
      sgr.underline = false;
      sgr.blink = false;
      sgr.inverse = false;
      sgr.hidden = false;
      sgr.strikethrough = false;
    } else if (n === 1) {
      sgr.bold = true;
    } else if (n === 2) {
      sgr.dim = true;
    } else if (n === 3) {
      sgr.italic = true;
    } else if (n === 4) {
      sgr.underline = true;
    } else if (n === 5 || n === 6) {
      sgr.blink = true;
    } else if (n === 7) {
      sgr.inverse = true;
    } else if (n === 8) {
      sgr.hidden = true;
    } else if (n === 9) {
      sgr.strikethrough = true;
    } else if (n === 22) {
      sgr.bold = false;
      sgr.dim = false;
    } else if (n === 23) {
      sgr.italic = false;
    } else if (n === 24) {
      sgr.underline = false;
    } else if (n === 25) {
      sgr.blink = false;
    } else if (n === 27) {
      sgr.inverse = false;
    } else if (n === 28) {
      sgr.hidden = false;
    } else if (n === 29) {
      sgr.strikethrough = false;
    } else if (n >= 30 && n <= 37) {
      sgr.fg = n - 30;
    } else if (n === 38) {
      if (i + 1 < parts.length && parts[i + 1] === "5" && i + 2 < parts.length) {
        sgr.fg = parseInt(parts[i + 2]);
        i += 2;
      } else if (i + 1 < parts.length && parts[i + 1] === "2" && i + 4 < parts.length) {
        sgr.fg = {
          r: parseInt(parts[i + 2]),
          g: parseInt(parts[i + 3]),
          b: parseInt(parts[i + 4])
        };
        i += 4;
      }
    } else if (n === 39) {
      sgr.fg = null;
    } else if (n >= 40 && n <= 47) {
      sgr.bg = n - 40;
    } else if (n === 48) {
      if (i + 1 < parts.length && parts[i + 1] === "5" && i + 2 < parts.length) {
        sgr.bg = parseInt(parts[i + 2]);
        i += 2;
      } else if (i + 1 < parts.length && parts[i + 1] === "2" && i + 4 < parts.length) {
        sgr.bg = {
          r: parseInt(parts[i + 2]),
          g: parseInt(parts[i + 3]),
          b: parseInt(parts[i + 4])
        };
        i += 4;
      }
    } else if (n === 49) {
      sgr.bg = null;
    } else if (n >= 90 && n <= 97) {
      sgr.fg = n - 90 + 8;
    } else if (n >= 100 && n <= 107) {
      sgr.bg = n - 100 + 8;
    }
    i++;
  }
}
function replayAnsiWithStyles(width, height, ansi, ctx = defaultContext) {
  const screen = Array.from({ length: height }, () => Array.from({ length: width }, () => createDefaultStyledCell()));
  let cx = 0;
  let cy = 0;
  const sgr = createDefaultSgr();
  let i = 0;
  while (i < ansi.length) {
    if (ansi[i] === "\x1B") {
      if (ansi[i + 1] === "[") {
        i += 2;
        let params = "";
        while (i < ansi.length && (ansi[i] >= "0" && ansi[i] <= "9" || ansi[i] === ";" || ansi[i] === "?" || ansi[i] === ":")) {
          params += ansi[i];
          i++;
        }
        const cmd = ansi[i];
        i++;
        if (cmd === "H") {
          if (params === "") {
            cx = 0;
            cy = 0;
          } else {
            const cmdParts = params.split(";");
            cy = Math.min(height - 1, Math.max(0, (parseInt(cmdParts[0]) || 1) - 1));
            cx = Math.min(width - 1, Math.max(0, (parseInt(cmdParts[1]) || 1) - 1));
          }
        } else if (cmd === "K") {
          if (cy >= height)
            continue;
          for (let x = cx;x < width; x++) {
            const cell = screen[cy][x];
            cell.char = " ";
            cell.fg = null;
            cell.bg = sgr.bg;
            cell.bold = false;
            cell.dim = false;
            cell.italic = false;
            cell.underline = false;
            cell.blink = false;
            cell.inverse = false;
            cell.hidden = false;
            cell.strikethrough = false;
          }
        } else if (cmd === "A") {
          cy = Math.max(0, cy - (parseInt(params) || 1));
        } else if (cmd === "B") {
          cy = Math.min(height - 1, cy + (parseInt(params) || 1));
        } else if (cmd === "C") {
          cx = Math.min(width - 1, cx + (parseInt(params) || 1));
        } else if (cmd === "D") {
          cx = Math.max(0, cx - (parseInt(params) || 1));
        } else if (cmd === "G") {
          cx = Math.max(0, (parseInt(params) || 1) - 1);
        } else if (cmd === "J") {
          if (params === "2") {
            for (let y = 0;y < height; y++)
              for (let x = 0;x < width; x++) {
                screen[y][x] = createDefaultStyledCell();
              }
          }
        } else if (cmd === "m") {
          applySgrParams(params, sgr);
        }
      } else if (ansi[i + 1] === "]") {
        i += 2;
        let oscPayload = "";
        while (i < ansi.length) {
          if (ansi[i] === "\x1B" && ansi[i + 1] === "\\") {
            i += 2;
            break;
          }
          if (ansi[i] === "\x07") {
            i++;
            break;
          }
          oscPayload += ansi[i];
          i++;
        }
        if (oscPayload.startsWith("66;")) {
          const semiIdx = oscPayload.indexOf(";", 3);
          if (semiIdx !== -1) {
            const text = oscPayload.slice(semiIdx + 1);
            const widthParam = oscPayload.slice(3, semiIdx);
            const declaredWidth = widthParam.startsWith("w=") ? parseInt(widthParam.slice(2)) || 1 : 1;
            if (cy < height && cx < width) {
              const cell = screen[cy][cx];
              cell.char = text;
              cell.fg = sgr.fg;
              cell.bg = sgr.bg;
              cell.bold = sgr.bold;
              cell.dim = sgr.dim;
              cell.italic = sgr.italic;
              cell.underline = sgr.underline;
              cell.blink = sgr.blink;
              cell.inverse = sgr.inverse;
              cell.hidden = sgr.hidden;
              cell.strikethrough = sgr.strikethrough;
              if (declaredWidth > 1 && cx + 1 < width) {
                const cont = screen[cy][cx + 1];
                cont.char = " ";
                cont.fg = null;
                cont.bg = sgr.bg;
                cont.bold = false;
                cont.dim = false;
                cont.italic = false;
                cont.underline = false;
                cont.blink = false;
                cont.inverse = false;
                cont.hidden = false;
                cont.strikethrough = false;
              }
              cx += declaredWidth;
            }
          }
        }
      } else if (ansi[i + 1] === ">") {
        i += 2;
        while (i < ansi.length && ansi[i] !== "\x1B")
          i++;
      } else {
        i += 2;
      }
    } else if (ansi[i] === "\r") {
      cx = 0;
      i++;
    } else if (ansi[i] === `
`) {
      cy = Math.min(height - 1, cy + 1);
      i++;
    } else {
      const cp = ansi.codePointAt(i);
      const cpLen = cp > 65535 ? 2 : 1;
      let grapheme = String.fromCodePoint(cp);
      let j = i + cpLen;
      let prevWasZwj = false;
      while (j < ansi.length) {
        const nextCp = ansi.codePointAt(j);
        const isCombining = prevWasZwj || nextCp >= 768 && nextCp <= 879 || nextCp >= 8400 && nextCp <= 8447 || nextCp >= 65024 && nextCp <= 65039 || nextCp === 65038 || nextCp === 65039 || nextCp === 8205 || nextCp >= 917760 && nextCp <= 917999 || nextCp >= 127995 && nextCp <= 127999 || cp >= 127462 && cp <= 127487 && nextCp >= 127462 && nextCp <= 127487;
        if (!isCombining)
          break;
        prevWasZwj = nextCp === 8205;
        const nextLen = nextCp > 65535 ? 2 : 1;
        grapheme += String.fromCodePoint(nextCp);
        j += nextLen;
      }
      if (cy < height && cx < width) {
        const gw = outputGraphemeWidth(grapheme, ctx);
        const charWidth = gw || 1;
        const cell = screen[cy][cx];
        cell.char = grapheme;
        cell.fg = sgr.fg;
        cell.bg = sgr.bg;
        cell.bold = sgr.bold;
        cell.dim = sgr.dim;
        cell.italic = sgr.italic;
        cell.underline = sgr.underline;
        cell.blink = sgr.blink;
        cell.inverse = sgr.inverse;
        cell.hidden = sgr.hidden;
        cell.strikethrough = sgr.strikethrough;
        if (charWidth > 1 && cx + 1 < width) {
          const cont = screen[cy][cx + 1];
          cont.char = " ";
          cont.fg = null;
          cont.bg = sgr.bg;
          cont.bold = false;
          cont.dim = false;
          cont.italic = false;
          cont.underline = false;
          cont.blink = false;
          cont.inverse = false;
          cont.hidden = false;
          cont.strikethrough = false;
        }
        cx += charWidth;
      }
      i = j;
    }
  }
  return screen;
}
function formatColor(c) {
  if (c === null)
    return "default";
  if (typeof c === "number")
    return `${c}`;
  return `rgb(${c.r},${c.g},${c.b})`;
}
function captureStrictFailureArtifacts(opts) {
  try {
    const fs = (()=>{throw new Error("Cannot require module "+"fs");})();
    const path = (init_path(), __toCommonJS(exports_path));
    const timestamp = Date.now();
    const dir = `/tmp/silvery-strict-failure-${timestamp}`;
    fs.mkdirSync(dir, { recursive: true });
    const meta = {
      source: opts.source,
      timestamp: new Date().toISOString(),
      frameCount: opts.frameCount,
      prevSize: opts.prev ? { width: opts.prev.width, height: opts.prev.height } : null,
      nextSize: opts.next ? { width: opts.next.width, height: opts.next.height } : null,
      incrOutputLength: opts.incrOutput?.length,
      freshOutputLength: opts.freshOutput?.length,
      testName: globalThis.__vitest_worker__?.current?.name
    };
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    fs.writeFileSync(path.join(dir, "error.txt"), opts.errorMessage);
    if (opts.incrOutput) {
      fs.writeFileSync(path.join(dir, "incremental.ansi"), opts.incrOutput);
    }
    if (opts.freshOutput) {
      fs.writeFileSync(path.join(dir, "fresh.ansi"), opts.freshOutput);
    }
    if (opts.prev) {
      const rows = [];
      for (let y = 0;y < opts.prev.height; y++) {
        let row = "";
        for (let x = 0;x < opts.prev.width; x++) {
          const cell = opts.prev.getCell(x, y);
          row += cell.char || " ";
        }
        rows.push(row.trimEnd());
      }
      fs.writeFileSync(path.join(dir, "prev-buffer.txt"), rows.join(`
`));
    }
    if (opts.next) {
      const rows = [];
      for (let y = 0;y < opts.next.height; y++) {
        let row = "";
        for (let x = 0;x < opts.next.width; x++) {
          const cell = opts.next.getCell(x, y);
          row += cell.char || " ";
        }
        rows.push(row.trimEnd());
      }
      fs.writeFileSync(path.join(dir, "next-buffer.txt"), rows.join(`
`));
    }
    if (opts.prev && opts.ctx) {
      const freshPrev = bufferToAnsi(opts.prev, opts.ctx);
      fs.writeFileSync(path.join(dir, "fresh-prev.ansi"), freshPrev);
    }
    return dir;
  } catch {
    return "(artifact capture failed)";
  }
}
function verifyOutputEquivalence(prev, next, incrOutput, ctx = defaultContext) {
  const { mode } = ctx;
  const w = Math.max(prev.width, next.width);
  const vtHeight = Math.max(prev.height, next.height);
  const compareHeight = next.height;
  if (process.env.SILVERY_DEBUG_OUTPUT) {
    console.error(`[VERIFY] prev=${prev.width}x${prev.height} next=${next.width}x${next.height} vtSize=${w}x${vtHeight}`);
  }
  const freshPrev = bufferToAnsi(prev, ctx);
  if (process.env.SILVERY_DEBUG_OUTPUT) {
    console.error(`[VERIFY] freshPrev len=${freshPrev.length} incrOutput len=${incrOutput.length}`);
    const escaped = incrOutput.replace(/\x1b/g, "\\e").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
    console.error(`[VERIFY] incrOutput: ${escaped.slice(0, 500)}`);
  }
  const screenIncr = replayAnsiWithStyles(w, vtHeight, freshPrev + incrOutput, ctx);
  const freshNext = bufferToAnsi(next, ctx);
  const screenFresh = replayAnsiWithStyles(w, vtHeight, freshNext, ctx);
  const _dumpRowWideCells = (buf, row) => {
    const parts = [];
    for (let cx = 0;cx < buf.width; cx++) {
      const c = buf.getCell(cx, row);
      const cp = c.char ? [...c.char].map((ch) => "U+" + (ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")).join(",") : "empty";
      if (c.wide)
        parts.push(`W@${cx}:${cp}(gw=${outputGraphemeWidth(c.char, ctx)})`);
      if (c.continuation)
        parts.push(`C@${cx}`);
      const charToWrite = c.char || " ";
      const vtWidth = outputGraphemeWidth(charToWrite, ctx);
      const bufWidth = c.wide ? 2 : 1;
      if (!c.continuation && vtWidth !== bufWidth) {
        parts.push(`MISMATCH@${cx}:${cp}(vtW=${vtWidth},bufW=${bufWidth},tse=${outputTextSizingEnabled(ctx)})`);
      }
    }
    return parts.join(" ");
  };
  for (let y = 0;y < vtHeight; y++) {
    for (let x = 0;x < w; x++) {
      const incr = screenIncr[y][x];
      const fresh = screenFresh[y][x];
      if (incr.char !== fresh.char) {
        const incrRow = screenIncr[y].map((c) => c.char).join("");
        const freshRow = screenFresh[y].map((c) => c.char).join("");
        const prevRow = screenIncr[y].map((_, cx) => {
          const prevCell2 = prev.getCell(cx, y);
          return prevCell2.char;
        }).join("");
        const nextCell = next.getCell(x, y);
        const prevCell = prev.getCell(x, y);
        const contextStart = Math.max(0, x - 5);
        const contextEnd = Math.min(w, x + 10);
        const colDetails = [];
        for (let cx = contextStart;cx < contextEnd; cx++) {
          const ic = screenIncr[y][cx];
          const fc = screenFresh[y][cx];
          const pc = prev.getCell(cx, y);
          const nc = next.getCell(cx, y);
          const marker = cx === x ? " <<<" : ic.char !== fc.char ? " !!!" : "";
          colDetails.push(`  col ${cx}: prev='${pc.char}'(w=${pc.wide},c=${pc.continuation}) next='${nc.char}' incr='${ic.char}' fresh='${fc.char}' wide=${nc.wide} cont=${nc.continuation}${marker}`);
        }
        const msg = `STRICT_OUTPUT char mismatch at (${x},${y}): ` + `incremental='${incr.char}' fresh='${fresh.char}'
` + `  prev buffer cell: char='${prevCell.char}' bg=${prevCell.bg} wide=${prevCell.wide} cont=${prevCell.continuation}
` + `  next buffer cell: char='${nextCell.char}' bg=${nextCell.bg} wide=${nextCell.wide} cont=${nextCell.continuation}
` + `  incr row: ${incrRow}
` + `  fresh row: ${freshRow}
` + `  prev row: ${prevRow}
` + `Wide/cont cells on row ${y} (next buffer): ${_dumpRowWideCells(next, y)}
` + `Wide/cont cells on row ${y} (prev buffer): ${_dumpRowWideCells(prev, y)}
` + `Column detail around mismatch:
${colDetails.join(`
`)}`;
        const artifactDir = captureStrictFailureArtifacts({
          source: "STRICT_OUTPUT",
          errorMessage: msg,
          prev,
          next,
          incrOutput,
          freshOutput: freshNext,
          ctx
        });
        const fullMsg = `${msg}
  Artifacts: ${artifactDir}`;
        console.error(fullMsg);
        throw new IncrementalRenderMismatchError(fullMsg);
      }
      const diffs = [];
      if (!sgrColorEquals(incr.fg, fresh.fg))
        diffs.push(`fg: ${formatColor(incr.fg)} vs ${formatColor(fresh.fg)}`);
      if (!sgrColorEquals(incr.bg, fresh.bg))
        diffs.push(`bg: ${formatColor(incr.bg)} vs ${formatColor(fresh.bg)}`);
      if (incr.bold !== fresh.bold)
        diffs.push(`bold: ${incr.bold} vs ${fresh.bold}`);
      if (incr.dim !== fresh.dim)
        diffs.push(`dim: ${incr.dim} vs ${fresh.dim}`);
      if (incr.italic !== fresh.italic)
        diffs.push(`italic: ${incr.italic} vs ${fresh.italic}`);
      if (incr.underline !== fresh.underline)
        diffs.push(`underline: ${incr.underline} vs ${fresh.underline}`);
      if (incr.inverse !== fresh.inverse)
        diffs.push(`inverse: ${incr.inverse} vs ${fresh.inverse}`);
      if (incr.strikethrough !== fresh.strikethrough)
        diffs.push(`strikethrough: ${incr.strikethrough} vs ${fresh.strikethrough}`);
      if (diffs.length > 0) {
        const msg = `STRICT_OUTPUT style mismatch at (${x},${y}) char='${incr.char}': ` + diffs.join(", ") + `
  incremental: fg=${formatColor(incr.fg)} bg=${formatColor(incr.bg)} bold=${incr.bold} dim=${incr.dim}` + `
  fresh:       fg=${formatColor(fresh.fg)} bg=${formatColor(fresh.bg)} bold=${fresh.bold} dim=${fresh.dim}`;
        const artifactDir2 = captureStrictFailureArtifacts({
          source: "STRICT_OUTPUT",
          errorMessage: msg,
          prev,
          next,
          incrOutput,
          freshOutput: freshNext,
          ctx
        });
        throw new IncrementalRenderMismatchError(`${msg}
  Artifacts: ${artifactDir2}`);
      }
    }
  }
}
function verifyAccumulatedOutput(currentBuffer, ctx = defaultContext, accState = defaultAccState) {
  const { mode } = ctx;
  const w = accState.accumulateWidth;
  const h = accState.accumulateHeight;
  const screenAccumulated = replayAnsiWithStyles(w, h, accState.accumulatedAnsi, ctx);
  const freshOutput = bufferToAnsi(currentBuffer, ctx);
  const screenFresh = replayAnsiWithStyles(w, h, freshOutput, ctx);
  for (let y = 0;y < h; y++) {
    for (let x = 0;x < w; x++) {
      const accum = screenAccumulated[y][x];
      const fresh = screenFresh[y][x];
      if (accum.char !== fresh.char) {
        const msg = `SILVERY_STRICT_ACCUMULATE char mismatch at (${x},${y}) after ${accState.accumulateFrameCount} frames: ` + `accumulated='${accum.char}' fresh='${fresh.char}'`;
        const dir = captureStrictFailureArtifacts({
          source: "STRICT_ACCUMULATE",
          errorMessage: msg,
          next: currentBuffer,
          incrOutput: accState.accumulatedAnsi,
          freshOutput,
          ctx,
          frameCount: accState.accumulateFrameCount
        });
        console.error(`${msg}
  Artifacts: ${dir}`);
        throw new IncrementalRenderMismatchError(`${msg}
  Artifacts: ${dir}`);
      }
      const diffs = [];
      if (!sgrColorEquals(accum.fg, fresh.fg))
        diffs.push(`fg: ${formatColor(accum.fg)} vs ${formatColor(fresh.fg)}`);
      if (!sgrColorEquals(accum.bg, fresh.bg))
        diffs.push(`bg: ${formatColor(accum.bg)} vs ${formatColor(fresh.bg)}`);
      if (accum.bold !== fresh.bold)
        diffs.push(`bold: ${accum.bold} vs ${fresh.bold}`);
      if (accum.dim !== fresh.dim)
        diffs.push(`dim: ${accum.dim} vs ${fresh.dim}`);
      if (accum.italic !== fresh.italic)
        diffs.push(`italic: ${accum.italic} vs ${fresh.italic}`);
      if (accum.underline !== fresh.underline)
        diffs.push(`underline: ${accum.underline} vs ${fresh.underline}`);
      if (accum.inverse !== fresh.inverse)
        diffs.push(`inverse: ${accum.inverse} vs ${fresh.inverse}`);
      if (accum.strikethrough !== fresh.strikethrough)
        diffs.push(`strikethrough: ${accum.strikethrough} vs ${fresh.strikethrough}`);
      if (diffs.length > 0) {
        const msg = `SILVERY_STRICT_ACCUMULATE style mismatch at (${x},${y}) char='${accum.char}' after ${accState.accumulateFrameCount} frames: ` + diffs.join(", ");
        const dir2 = captureStrictFailureArtifacts({
          source: "STRICT_ACCUMULATE",
          errorMessage: msg,
          next: currentBuffer,
          freshOutput,
          ctx,
          frameCount: accState.accumulateFrameCount
        });
        console.error(`${msg}
  Artifacts: ${dir2}`);
        throw new IncrementalRenderMismatchError(`${msg}
  Artifacts: ${dir2}`);
      }
    }
  }
}
function loadTermless() {
  if (!_createTerminal || !_createXtermBackend) {
    _createTerminal = __require("@termless/core").createTerminal;
    _createXtermBackend = __require("@termless/xtermjs").createXtermBackend;
  }
  return { createTerminal: _createTerminal, createXtermBackend: _createXtermBackend };
}
function loadGhosttyBackend() {
  if (!_createGhosttyBackend) {
    const mod = __require("@termless/ghostty");
    _createGhosttyBackend = mod.createGhosttyBackend;
    if (!_ghosttyInitPromise) {
      _ghosttyInitPromise = mod.initGhostty();
    }
  }
  return _createGhosttyBackend;
}
function initTerminalVerifyState(state, width, height, initialAnsi) {
  if (state.terminal)
    state.terminal.close();
  if (state.ghosttyTerminal)
    state.ghosttyTerminal.close();
  if (state.backends.includes("xterm")) {
    const { createTerminal, createXtermBackend } = loadTermless();
    state.terminal = createTerminal({ backend: createXtermBackend(), cols: width, rows: height });
    state.terminal.feed(initialAnsi);
  } else {
    state.terminal = null;
  }
  if (state.backends.includes("ghostty")) {
    const { createTerminal } = loadTermless();
    const createGhostty = loadGhosttyBackend();
    state.ghosttyTerminal = createTerminal({ backend: createGhostty(), cols: width, rows: height });
    state.ghosttyTerminal.feed(initialAnsi);
  } else {
    state.ghosttyTerminal = null;
  }
  state.width = width;
  state.height = height;
  state.frameCount = 0;
}
function verifyTerminalEquivalence(state, incrOutput, nextBuffer, ctx) {
  if (nextBuffer.width !== state.width || nextBuffer.height !== state.height) {
    const freshAnsi2 = bufferToAnsi(nextBuffer, ctx);
    initTerminalVerifyState(state, nextBuffer.width, nextBuffer.height, freshAnsi2);
    state.frameCount++;
    return;
  }
  const freshAnsi = bufferToAnsi(nextBuffer, ctx);
  if (state.terminal) {
    state.terminal.feed(incrOutput);
    const { createTerminal, createXtermBackend } = loadTermless();
    const freshTerm = createTerminal({
      backend: createXtermBackend(),
      cols: state.width,
      rows: state.height
    });
    freshTerm.feed(freshAnsi);
    try {
      compareTerminals(state.terminal, freshTerm, state, "xterm");
    } catch (e) {
      if (e instanceof IncrementalRenderMismatchError) {
        const dir = captureStrictFailureArtifacts({
          source: "STRICT_TERMINAL[xterm]",
          errorMessage: e.message,
          next: nextBuffer,
          incrOutput,
          freshOutput: freshAnsi,
          ctx,
          frameCount: state.frameCount
        });
        throw new IncrementalRenderMismatchError(`${e.message}
  Artifacts: ${dir}`);
      }
      throw e;
    } finally {
      freshTerm.close();
    }
  }
  if (state.ghosttyTerminal) {
    state.ghosttyTerminal.feed(incrOutput);
    const { createTerminal } = loadTermless();
    const createGhostty = loadGhosttyBackend();
    const freshTerm = createTerminal({
      backend: createGhostty(),
      cols: state.width,
      rows: state.height
    });
    freshTerm.feed(freshAnsi);
    try {
      compareTerminals(state.ghosttyTerminal, freshTerm, state, "ghostty");
    } catch (e) {
      if (e instanceof IncrementalRenderMismatchError) {
        const dir = captureStrictFailureArtifacts({
          source: "STRICT_TERMINAL[ghostty]",
          errorMessage: e.message,
          next: nextBuffer,
          incrOutput,
          freshOutput: freshAnsi,
          ctx,
          frameCount: state.frameCount
        });
        throw new IncrementalRenderMismatchError(`${e.message}
  Artifacts: ${dir}`);
      }
      throw e;
    } finally {
      freshTerm.close();
    }
  }
}
function compareTerminals(incrTerm, freshTerm, state, backendName) {
  const w = state.width;
  const h = state.height;
  const prefix = `SILVERY_STRICT_TERMINAL[${backendName}]`;
  for (let y = 0;y < h; y++) {
    for (let x = 0;x < w; x++) {
      const incrCell = incrTerm.getCell(y, x);
      const freshCell = freshTerm.getCell(y, x);
      const incrChar = incrCell.char || " ";
      const freshChar = freshCell.char || " ";
      if (incrChar !== freshChar) {
        const incrRow = Array.from({ length: w }, (_, cx) => incrTerm.getCell(y, cx).char || " ").join("");
        const freshRow = Array.from({ length: w }, (_, cx) => freshTerm.getCell(y, cx).char || " ").join("");
        const msg = `${prefix} char mismatch at (${x},${y}) frame ${state.frameCount}: ` + `incremental='${incrChar}' fresh='${freshChar}'
` + `  incr row: ${incrRow.trimEnd()}
` + `  fresh row: ${freshRow.trimEnd()}`;
        console.error(msg);
        throw new IncrementalRenderMismatchError(msg);
      }
      if (!rgbEquals(incrCell.fg, freshCell.fg)) {
        const msg = `${prefix} fg color mismatch at (${x},${y}) char='${incrChar}' frame ${state.frameCount}: ` + `incremental=${formatRgb(incrCell.fg)} fresh=${formatRgb(freshCell.fg)}`;
        console.error(msg);
        throw new IncrementalRenderMismatchError(msg);
      }
      if (!rgbEquals(incrCell.bg, freshCell.bg)) {
        const msg = `${prefix} bg color mismatch at (${x},${y}) char='${incrChar}' frame ${state.frameCount}: ` + `incremental=${formatRgb(incrCell.bg)} fresh=${formatRgb(freshCell.bg)}`;
        console.error(msg);
        throw new IncrementalRenderMismatchError(msg);
      }
      const attrDiffs = [];
      if (incrCell.bold !== freshCell.bold)
        attrDiffs.push(`bold: ${incrCell.bold} vs ${freshCell.bold}`);
      if (incrCell.dim !== freshCell.dim)
        attrDiffs.push(`dim: ${incrCell.dim} vs ${freshCell.dim}`);
      if (incrCell.italic !== freshCell.italic)
        attrDiffs.push(`italic: ${incrCell.italic} vs ${freshCell.italic}`);
      if (incrCell.inverse !== freshCell.inverse)
        attrDiffs.push(`inverse: ${incrCell.inverse} vs ${freshCell.inverse}`);
      if (incrCell.strikethrough !== freshCell.strikethrough)
        attrDiffs.push(`strikethrough: ${incrCell.strikethrough} vs ${freshCell.strikethrough}`);
      if (attrDiffs.length > 0) {
        const msg = `${prefix} attr mismatch at (${x},${y}) char='${incrChar}' frame ${state.frameCount}: ` + attrDiffs.join(", ");
        console.error(msg);
        throw new IncrementalRenderMismatchError(msg);
      }
    }
  }
}
function rgbEquals(a, b) {
  if (a === b)
    return true;
  if (a === null || b === null)
    return false;
  return a.r === b.r && a.g === b.g && a.b === b.b;
}
function formatRgb(c) {
  if (c === null)
    return "null";
  return `rgb(${c.r},${c.g},${c.b})`;
}
function sgrColorEquals(a, b) {
  if (a === b)
    return true;
  if (a === null || b === null)
    return false;
  if (typeof a === "number" || typeof b === "number")
    return a === b;
  return a.r === b.r && a.g === b.g && a.b === b.b;
}
var DEBUG_OUTPUT, FULL_RENDER, DEBUG_CAPTURE, CAPTURE_RAW, _debugFrameCount = 0, _captureRawFrameCount = 0, defaultContext, defaultAccState, defaultTerminalVerifyState, reusableCellStyle, wideCharLookupCell, _createTerminal = null, _createXtermBackend = null, _createGhosttyBackend = null, _ghosttyInitPromise = null;
var init_output_phase = __esm(() => {
  init_buffer();
  init_errors();
  init_text_sizing();
  init_unicode();
  init_diff_buffers();
  DEBUG_OUTPUT = !!process.env.SILVERY_DEBUG_OUTPUT;
  FULL_RENDER = !!process.env.SILVERY_FULL_RENDER;
  DEBUG_CAPTURE = !!process.env.SILVERY_DEBUG_CAPTURE;
  CAPTURE_RAW = !!process.env.SILVERY_CAPTURE_RAW;
  defaultContext = {
    caps: {
      underlineStyles: true,
      underlineColor: true,
      colorLevel: "truecolor"
    },
    measurer: null,
    sgrCache: new Map,
    transitionCache: new Map,
    mode: "fullscreen",
    termRows: undefined
  };
  defaultAccState = {
    accumulatedAnsi: "",
    accumulateWidth: 0,
    accumulateHeight: 0,
    accumulateFrameCount: 0
  };
  defaultTerminalVerifyState = createTerminalVerifyState();
  reusableCellStyle = {
    fg: null,
    bg: null,
    underlineColor: null,
    attrs: {}
  };
  wideCharLookupCell = createMutableCell();
});

// node-stub:child_process
function spawnSync() {
  return { status: 1, stdout: "", stderr: "" };
}

// packages/ag-term/src/ansi/detection.ts
function detectCursor(stdout) {
  if (!stdout.isTTY)
    return false;
  if (false)
    ;
  return true;
}
function detectInput(stdin) {
  if (!stdin.isTTY)
    return false;
  return typeof stdin.setRawMode === "function";
}
function detectColor(stdout) {
  if (false) {}
  const forceColor = undefined;
  if (forceColor !== undefined) {
    if (forceColor === "0" || forceColor === "false")
      return null;
    if (forceColor === "1")
      return "basic";
    if (forceColor === "2")
      return "256";
    if (forceColor === "3")
      return "truecolor";
    return "basic";
  }
  if (!stdout.isTTY) {
    return null;
  }
  if (false) {}
  const colorTerm = undefined;
  if (colorTerm === "truecolor" || colorTerm === "24bit") {
    return "truecolor";
  }
  const term = "";
  if (term.includes("truecolor") || term.includes("24bit") || term.includes("xterm-ghostty") || term.includes("xterm-kitty") || term.includes("wezterm")) {
    return "truecolor";
  }
  if (term.includes("256color") || term.includes("256")) {
    return "256";
  }
  const termProgram = undefined;
  if (termProgram === "iTerm.app" || termProgram === "Apple_Terminal") {
    return termProgram === "iTerm.app" ? "truecolor" : "256";
  }
  if (termProgram === "Ghostty" || termProgram === "WezTerm") {
    return "truecolor";
  }
  if (undefined) {}
  if (term.includes("xterm") || term.includes("color") || term.includes("ansi")) {
    return "basic";
  }
  if (CI_ENVS.some((env) => process.env[env] !== undefined)) {
    return "basic";
  }
  if (undefined) {}
  return "basic";
}
function detectUnicode() {
  if (undefined) {}
  const lang = "";
  if (lang.toLowerCase().includes("utf-8") || lang.toLowerCase().includes("utf8")) {
    return true;
  }
  if (undefined) {}
  const termProgram = "";
  if (["iTerm.app", "Ghostty", "WezTerm", "Apple_Terminal"].includes(termProgram)) {
    return true;
  }
  if (undefined) {}
  const term = "";
  if (term.includes("xterm") || term.includes("rxvt") || term.includes("screen") || term.includes("tmux")) {
    return true;
  }
  return false;
}
function defaultCaps() {
  return {
    program: "",
    term: "",
    colorLevel: "truecolor",
    kittyKeyboard: false,
    kittyGraphics: false,
    sixel: false,
    osc52: false,
    hyperlinks: false,
    notifications: false,
    bracketedPaste: true,
    mouse: true,
    syncOutput: false,
    unicode: true,
    underlineStyles: true,
    underlineColor: true,
    textEmojiWide: true,
    textSizingSupported: false,
    darkBackground: true,
    nerdfont: false
  };
}
function detectMacOSDarkMode() {
  if (cachedMacOSDarkMode !== undefined)
    return cachedMacOSDarkMode;
  try {
    const result = spawnSync("defaults", ["read", "-g", "AppleInterfaceStyle"], {
      encoding: "utf-8",
      timeout: 500
    });
    cachedMacOSDarkMode = result.stdout?.trim() === "Dark";
  } catch {
    cachedMacOSDarkMode = false;
  }
  return cachedMacOSDarkMode;
}
function detectTerminalCaps() {
  const program = "";
  const term = "";
  const colorTerm = "";
  const noColor = false;
  const isAppleTerminal = program === "Apple_Terminal";
  let colorLevel = "none";
  if (!noColor) {
    if (isAppleTerminal) {
      colorLevel = "256";
    } else if (colorTerm === "truecolor" || colorTerm === "24bit") {
      colorLevel = "truecolor";
    } else if (term.includes("256color")) {
      colorLevel = "256";
    } else if (process.stdout?.isTTY) {
      colorLevel = "basic";
    }
  }
  const isKitty = term === "xterm-kitty";
  const isITerm = program === "iTerm.app";
  const isGhostty = program === "ghostty";
  const isWezTerm = program === "WezTerm";
  const isAlacritty = program === "Alacritty";
  const isFoot = term === "foot" || term === "foot-extra";
  const isModern = isKitty || isITerm || isGhostty || isWezTerm || isFoot;
  let isKittyWithTextSizing = false;
  if (isKitty) {
    const version = process.env.TERM_PROGRAM_VERSION ?? "";
    const parts = version.split(".");
    const major = Number(parts[0]) || 0;
    const minor = Number(parts[1]) || 0;
    isKittyWithTextSizing = major > 0 || major === 0 && minor >= 40;
  }
  let darkBackground = !isAppleTerminal;
  const colorFgBg = process.env.COLORFGBG;
  if (colorFgBg) {
    const parts = colorFgBg.split(";");
    const bg = parseInt(parts[parts.length - 1] ?? "", 10);
    if (!isNaN(bg)) {
      darkBackground = bg < 7;
    }
  } else if (isAppleTerminal) {
    darkBackground = detectMacOSDarkMode();
  }
  let nerdfont = isModern || isAlacritty;
  const nfEnv = process.env.NERDFONT;
  if (nfEnv === "0" || nfEnv === "false")
    nerdfont = false;
  else if (nfEnv === "1" || nfEnv === "true")
    nerdfont = true;
  const underlineExtensions = isModern || isAlacritty;
  return {
    program,
    term,
    colorLevel,
    kittyKeyboard: isKitty || isGhostty || isWezTerm || isFoot,
    kittyGraphics: isKitty || isGhostty,
    sixel: isFoot || isWezTerm,
    osc52: isModern || isAlacritty,
    hyperlinks: isModern || isAlacritty,
    notifications: isITerm || isKitty,
    bracketedPaste: true,
    mouse: true,
    syncOutput: isModern || isAlacritty,
    unicode: true,
    underlineStyles: underlineExtensions,
    underlineColor: underlineExtensions,
    textEmojiWide: !isAppleTerminal,
    textSizingSupported: isKittyWithTextSizing,
    darkBackground,
    nerdfont
  };
}
var CI_ENVS, cachedMacOSDarkMode;
var init_detection = __esm(() => {
  CI_ENVS = ["CI", "GITHUB_ACTIONS", "GITLAB_CI", "JENKINS_URL", "BUILDKITE", "CIRCLECI", "TRAVIS"];
});

// packages/ag/src/keys.ts
function isValidCodepoint(cp) {
  return cp >= 0 && cp <= 1114111 && !(cp >= 55296 && cp <= 57343);
}
function safeFromCodePoint(cp) {
  return isValidCodepoint(cp) ? String.fromCodePoint(cp) : "?";
}
function kittyCodepointToName(cp) {
  return KITTY_CODEPOINT_MAP[cp];
}
function numericToEventType(n) {
  if (n === 1)
    return "press";
  if (n === 2)
    return "repeat";
  if (n === 3)
    return "release";
  return;
}
function parseKeypress(s) {
  let input;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(s)) {
    if (s[0] !== undefined && s[0] > 127 && s[1] === undefined) {
      const buf = Buffer.from(s);
      buf[0] -= 128;
      input = `\x1B${buf.toString()}`;
    } else {
      input = s.toString();
    }
  } else {
    input = typeof s === "string" ? s ?? "" : String(s);
  }
  const key = {
    name: "",
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    super: false,
    hyper: false,
    sequence: input
  };
  if (input === "\r") {
    key.name = "return";
  } else if (input === `
`) {
    key.name = "return";
    key.ctrl = true;
  } else if (input === "\t") {
    key.name = "tab";
  } else if (input === "\b" || input === "\x1B\b") {
    key.name = "backspace";
    key.meta = input.charAt(0) === "\x1B";
  } else if (input === "" || input === "\x1B") {
    key.name = "backspace";
    key.meta = input.charAt(0) === "\x1B";
  } else if (input === "\x1B\r") {
    key.name = "return";
    key.meta = true;
  } else if (input === "\x1B" || input === "\x1B\x1B") {
    key.name = "escape";
    key.meta = input.length === 2;
  } else if (input === " " || input === "\x1B ") {
    key.name = "space";
    key.meta = input.length === 2;
  } else if (input.length === 1 && input <= "\x1A") {
    key.name = String.fromCharCode(input.charCodeAt(0) + 97 - 1);
    key.ctrl = true;
  } else if (input === "\x1F") {
    key.name = "/";
    key.ctrl = true;
  } else if (input.length === 1 && input >= "0" && input <= "9") {
    key.name = "number";
  } else if (input.length === 1 && input >= "a" && input <= "z") {
    key.name = input;
  } else if (input.length === 1 && input >= "A" && input <= "Z") {
    key.name = input.toLowerCase();
    key.shift = true;
  } else {
    const kittyParts = KITTY_RE.exec(input);
    const kittySpecialParts = !kittyParts && KITTY_SPECIAL_RE.exec(input);
    const modifyOtherKeysParts = !kittyParts && !kittySpecialParts && MODIFY_OTHER_KEYS_RE.exec(input);
    if (kittySpecialParts) {
      const number = Number(kittySpecialParts[1]);
      const modifier = Math.max(0, Number(kittySpecialParts[2]) - 1);
      const eventType = Number(kittySpecialParts[3]);
      const terminator = kittySpecialParts[4];
      const name = terminator === "~" ? KITTY_SPECIAL_NUMBER_KEYS[number] : KITTY_SPECIAL_LETTER_KEYS[terminator];
      key.isKittyProtocol = true;
      key.isPrintable = false;
      key.raw = input;
      key.name = name ?? "";
      key.shift = !!(modifier & 1);
      key.option = !!(modifier & 2);
      key.ctrl = !!(modifier & 4);
      key.super = !!(modifier & 8);
      key.hyper = !!(modifier & 16);
      key.meta = !!(modifier & 32);
      key.capsLock = !!(modifier & 64);
      key.numLock = !!(modifier & 128);
      const eventTypeStr = numericToEventType(eventType);
      if (eventTypeStr) {
        key.eventType = eventTypeStr;
      }
    } else if (kittyParts || modifyOtherKeysParts) {
      let codepoint;
      let modifier;
      if (kittyParts) {
        codepoint = Number(kittyParts[1]);
        modifier = Math.max(0, Number(kittyParts[4] || 1) - 1);
      } else {
        const mokParts = modifyOtherKeysParts;
        modifier = Math.max(0, Number(mokParts[1]) - 1);
        codepoint = Number(mokParts[2]);
      }
      if (kittyParts) {
        key.isKittyProtocol = true;
        key.raw = input;
        if (!isValidCodepoint(codepoint)) {
          key.name = "";
          key.isPrintable = false;
          return key;
        }
      }
      key.shift = !!(modifier & 1);
      key.option = !!(modifier & 2);
      key.ctrl = !!(modifier & 4);
      key.super = !!(modifier & 8);
      key.hyper = !!(modifier & 16);
      key.meta = !!(modifier & 32);
      key.capsLock = !!(modifier & 64);
      key.numLock = !!(modifier & 128);
      if (kittyParts?.[5]) {
        const et = numericToEventType(Number(kittyParts[5]));
        if (et)
          key.eventType = et;
      }
      if (kittyParts?.[2]) {
        key.shiftedKey = String.fromCodePoint(Number(kittyParts[2]));
      }
      if (kittyParts?.[3]) {
        key.baseLayoutKey = String.fromCodePoint(Number(kittyParts[3]));
      }
      let textFromProtocol;
      if (kittyParts?.[6]) {
        textFromProtocol = kittyParts[6].split(":").map((cp) => safeFromCodePoint(Number(cp))).join("");
        key.associatedText = textFromProtocol;
        key.text = textFromProtocol;
      }
      if (codepoint === 32) {
        key.name = "space";
        key.isPrintable = true;
      } else if (codepoint === 13) {
        key.name = "return";
        key.isPrintable = true;
      } else {
        const mapped = kittyCodepointToName(codepoint);
        if (mapped) {
          key.name = mapped;
          key.isPrintable = false;
        } else if (codepoint >= 1 && codepoint <= 26) {
          key.name = String.fromCodePoint(codepoint + 96);
          key.isPrintable = false;
        } else if (codepoint >= 32 && codepoint <= 126) {
          key.name = String.fromCharCode(codepoint).toLowerCase();
          if (codepoint >= 65 && codepoint <= 90) {
            key.shift = true;
            key.name = String.fromCharCode(codepoint + 32);
          }
          key.isPrintable = true;
        } else if (isValidCodepoint(codepoint)) {
          key.name = safeFromCodePoint(codepoint);
          key.isPrintable = true;
        } else {
          key.name = "";
          key.isPrintable = false;
        }
      }
      if (kittyParts && key.isPrintable && !textFromProtocol) {
        if (key.shift && codepoint >= 97 && codepoint <= 122) {
          key.text = String.fromCharCode(codepoint - 32);
        } else {
          key.text = safeFromCodePoint(codepoint);
        }
      }
    } else if (KITTY_RE.test(input)) {
      key.isKittyProtocol = true;
      key.isPrintable = false;
      key.raw = input;
      return key;
    } else {
      let parts = META_KEY_CODE_RE.exec(input);
      if (parts) {
        key.meta = true;
        key.shift = /^[A-Z]$/.test(parts[1] ?? "");
      } else {
        parts = FN_KEY_RE.exec(input);
        if (parts) {
          const segs = input.split("");
          if (segs[0] === "\x1B" && segs[1] === "\x1B") {
            key.option = true;
          }
          const code = [parts[1], parts[2], parts[4], parts[6]].filter(Boolean).join("");
          const modifier = Number(parts[3] || parts[5] || 1) - 1;
          key.ctrl = !!(modifier & 4);
          key.meta = !!(modifier & 2);
          key.super = !!(modifier & 8);
          key.hyper = !!(modifier & 16);
          key.shift = !!(modifier & 1);
          key.capsLock = !!(modifier & 64);
          key.numLock = !!(modifier & 128);
          key.code = code;
          key.name = CODE_TO_KEY[code] ?? "";
          key.shift = SHIFT_CODES.has(code) || key.shift;
          key.ctrl = CTRL_CODES.has(code) || key.ctrl;
        }
      }
    }
  }
  return key;
}
function parseKey(rawInput) {
  const keypress = parseKeypress(rawInput);
  const key = {
    upArrow: keypress.name === "up",
    downArrow: keypress.name === "down",
    leftArrow: keypress.name === "left",
    rightArrow: keypress.name === "right",
    pageDown: keypress.name === "pagedown",
    pageUp: keypress.name === "pageup",
    home: keypress.name === "home",
    end: keypress.name === "end",
    return: keypress.name === "return",
    escape: keypress.name === "escape",
    ctrl: keypress.ctrl,
    shift: keypress.shift,
    tab: keypress.name === "tab",
    backspace: keypress.name === "backspace",
    delete: keypress.name === "delete",
    meta: keypress.name !== "escape" && (keypress.meta || keypress.option),
    super: keypress.super,
    hyper: keypress.hyper,
    capsLock: keypress.capsLock ?? false,
    numLock: keypress.numLock ?? false,
    eventType: keypress.eventType
  };
  let input;
  if (keypress.isKittyProtocol) {
    if (keypress.isPrintable) {
      input = keypress.text ?? keypress.name;
    } else if (keypress.ctrl && keypress.name.length === 1) {
      input = keypress.name;
    } else {
      input = "";
    }
  } else {
    input = keypress.ctrl ? keypress.name : keypress.sequence;
    if (NON_ALPHANUMERIC_KEYS.includes(keypress.name)) {
      input = "";
    }
    if (input.startsWith("\x1B")) {
      input = input.slice(1);
    }
    if (input.startsWith("[") && input.length > 1 || input.startsWith("O") && input.length > 1) {
      if (keypress.super || keypress.hyper) {
        input = keypress.name;
      } else {
        input = "";
      }
    }
  }
  if (input.length === 1 && typeof input[0] === "string" && /[A-Z]/.test(input[0])) {
    key.shift = true;
  }
  return [input, key];
}
function* splitRawInput(data) {
  if (data.length <= 1) {
    if (data.length === 1)
      yield data;
    return;
  }
  let i = 0;
  let textStart = -1;
  while (i < data.length) {
    if (data.charCodeAt(i) === 27) {
      if (textStart >= 0) {
        yield* splitNonEscapeText(data.slice(textStart, i));
        textStart = -1;
      }
      if (i + 1 >= data.length) {
        yield "\x1B";
        i++;
        continue;
      }
      const next = data.charCodeAt(i + 1);
      if (next === 91) {
        let j = i + 2;
        while (j < data.length) {
          const c = data.charCodeAt(j);
          if (c >= 64 && c <= 126) {
            j++;
            break;
          }
          j++;
        }
        yield data.slice(i, j);
        i = j;
      } else if (next === 79) {
        const end = Math.min(i + 3, data.length);
        yield data.slice(i, end);
        i = end;
      } else if (next === 27) {
        if (i + 2 < data.length) {
          const third = data.charCodeAt(i + 2);
          if (third === 91) {
            let j = i + 3;
            while (j < data.length) {
              const c = data.charCodeAt(j);
              if (c >= 64 && c <= 126) {
                j++;
                break;
              }
              j++;
            }
            yield data.slice(i, j);
            i = j;
          } else if (third === 79) {
            const end = Math.min(i + 4, data.length);
            yield data.slice(i, end);
            i = end;
          } else {
            yield "\x1B\x1B";
            i += 2;
          }
        } else {
          yield "\x1B\x1B";
          i += 2;
        }
      } else {
        yield data.slice(i, i + 2);
        i += 2;
      }
    } else {
      if (textStart < 0)
        textStart = i;
      i++;
    }
  }
  if (textStart >= 0) {
    yield* splitNonEscapeText(data.slice(textStart));
  }
}
function* splitNonEscapeText(text) {
  let segmentStart = 0;
  for (let i = 0;i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 127 || ch === 8) {
      if (i > segmentStart) {
        yield text.slice(segmentStart, i);
      }
      yield text[i];
      segmentStart = i + 1;
    }
  }
  if (segmentStart < text.length) {
    yield text.slice(segmentStart);
  }
}
var MODIFIER_SYMBOLS, CODE_TO_KEY, NON_ALPHANUMERIC_KEYS, SHIFT_CODES, CTRL_CODES, META_KEY_CODE_RE, FN_KEY_RE, KITTY_RE, MODIFY_OTHER_KEYS_RE, KITTY_SPECIAL_RE, KITTY_SPECIAL_LETTER_KEYS, KITTY_SPECIAL_NUMBER_KEYS, KITTY_CODEPOINT_MAP, NAME_TO_KITTY_CODEPOINT, graphemeSegmenter;
var init_keys = __esm(() => {
  MODIFIER_SYMBOLS = new Set(["⌃", "⇧", "⌥", "⌘", "✦"]);
  CODE_TO_KEY = {
    "[A": "up",
    "[B": "down",
    "[C": "right",
    "[D": "left",
    "[E": "clear",
    "[F": "end",
    "[H": "home",
    OA: "up",
    OB: "down",
    OC: "right",
    OD: "left",
    OE: "clear",
    OF: "end",
    OH: "home",
    OP: "f1",
    OQ: "f2",
    OR: "f3",
    OS: "f4",
    "[11~": "f1",
    "[12~": "f2",
    "[13~": "f3",
    "[14~": "f4",
    "[15~": "f5",
    "[17~": "f6",
    "[18~": "f7",
    "[19~": "f8",
    "[20~": "f9",
    "[21~": "f10",
    "[23~": "f11",
    "[24~": "f12",
    "[[A": "f1",
    "[[B": "f2",
    "[[C": "f3",
    "[[D": "f4",
    "[[E": "f5",
    "[1~": "home",
    "[2~": "insert",
    "[3~": "delete",
    "[4~": "end",
    "[5~": "pageup",
    "[6~": "pagedown",
    "[[5~": "pageup",
    "[[6~": "pagedown",
    "[7~": "home",
    "[8~": "end",
    "[a": "up",
    "[b": "down",
    "[c": "right",
    "[d": "left",
    "[e": "clear",
    "[2$": "insert",
    "[3$": "delete",
    "[5$": "pageup",
    "[6$": "pagedown",
    "[7$": "home",
    "[8$": "end",
    Oa: "up",
    Ob: "down",
    Oc: "right",
    Od: "left",
    Oe: "clear",
    "[2^": "insert",
    "[3^": "delete",
    "[5^": "pageup",
    "[6^": "pagedown",
    "[7^": "home",
    "[8^": "end",
    "[Z": "tab"
  };
  NON_ALPHANUMERIC_KEYS = [
    ...Object.values(CODE_TO_KEY),
    "backspace",
    "tab",
    "delete"
  ];
  SHIFT_CODES = new Set(["[a", "[b", "[c", "[d", "[e", "[2$", "[3$", "[5$", "[6$", "[7$", "[8$", "[Z"]);
  CTRL_CODES = new Set(["Oa", "Ob", "Oc", "Od", "Oe", "[2^", "[3^", "[5^", "[6^", "[7^", "[8^"]);
  META_KEY_CODE_RE = /^(?:\x1b)([a-zA-Z0-9])$/;
  FN_KEY_RE = /^(?:\x1b+)(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/;
  KITTY_RE = /^\x1b\[(\d+)(?::(\d+))?(?::(\d+))?(?:;(\d+)(?::(\d+))?(?:;([\d:]+))?)?u$/;
  MODIFY_OTHER_KEYS_RE = /^\x1b\[27;(\d+);(\d+)~$/;
  KITTY_SPECIAL_RE = /^\x1b\[(\d+);(\d+):(\d+)([A-Za-z~])$/;
  KITTY_SPECIAL_LETTER_KEYS = {
    A: "up",
    B: "down",
    C: "right",
    D: "left",
    E: "clear",
    F: "end",
    H: "home",
    P: "f1",
    Q: "f2",
    R: "f3",
    S: "f4"
  };
  KITTY_SPECIAL_NUMBER_KEYS = {
    2: "insert",
    3: "delete",
    5: "pageup",
    6: "pagedown",
    7: "home",
    8: "end",
    11: "f1",
    12: "f2",
    13: "f3",
    14: "f4",
    15: "f5",
    17: "f6",
    18: "f7",
    19: "f8",
    20: "f9",
    21: "f10",
    23: "f11",
    24: "f12"
  };
  KITTY_CODEPOINT_MAP = {
    8: "backspace",
    9: "tab",
    13: "return",
    27: "escape",
    127: "delete",
    57376: "f13",
    57377: "f14",
    57378: "f15",
    57379: "f16",
    57380: "f17",
    57381: "f18",
    57382: "f19",
    57383: "f20",
    57384: "f21",
    57385: "f22",
    57386: "f23",
    57387: "f24",
    57388: "f25",
    57389: "f26",
    57390: "f27",
    57391: "f28",
    57392: "f29",
    57393: "f30",
    57394: "f31",
    57395: "f32",
    57396: "f33",
    57397: "f34",
    57398: "f35",
    57358: "capslock",
    57359: "scrolllock",
    57360: "numlock",
    57361: "printscreen",
    57362: "pause",
    57363: "menu",
    57399: "kp0",
    57400: "kp1",
    57401: "kp2",
    57402: "kp3",
    57403: "kp4",
    57404: "kp5",
    57405: "kp6",
    57406: "kp7",
    57407: "kp8",
    57408: "kp9",
    57409: "kpdecimal",
    57410: "kpdivide",
    57411: "kpmultiply",
    57412: "kpsubtract",
    57413: "kpadd",
    57414: "kpenter",
    57415: "kpequal",
    57416: "kpseparator",
    57417: "kpleft",
    57418: "kpright",
    57419: "kpup",
    57420: "kpdown",
    57421: "kppageup",
    57422: "kppagedown",
    57423: "kphome",
    57424: "kpend",
    57425: "kpinsert",
    57426: "kpdelete",
    57427: "kpbegin",
    57428: "mediaplay",
    57429: "mediapause",
    57430: "mediaplaypause",
    57431: "mediareverse",
    57432: "mediastop",
    57433: "mediafastforward",
    57434: "mediarewind",
    57435: "mediatracknext",
    57436: "mediatrackprevious",
    57437: "mediarecord",
    57438: "lowervolume",
    57439: "raisevolume",
    57440: "mutevolume",
    57441: "leftshift",
    57442: "leftcontrol",
    57443: "leftalt",
    57444: "leftsuper",
    57445: "lefthyper",
    57446: "leftmeta",
    57447: "rightshift",
    57448: "rightcontrol",
    57449: "rightalt",
    57450: "rightsuper",
    57451: "righthyper",
    57452: "rightmeta",
    57453: "isoLevel3Shift",
    57454: "isoLevel5Shift"
  };
  NAME_TO_KITTY_CODEPOINT = {};
  for (const [cp, name] of Object.entries(KITTY_CODEPOINT_MAP)) {
    NAME_TO_KITTY_CODEPOINT[name] = Number(cp);
  }
  graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
});

// packages/ag-term/src/runtime/keys.ts
var init_keys2 = __esm(() => {
  init_keys();
});

// packages/ag-term/src/mouse.ts
function parseMouseSequence(input) {
  const m = SGR_MOUSE_RE.exec(input);
  if (!m)
    return null;
  const raw = parseInt(m[1]);
  const x = parseInt(m[2]) - 1;
  const y = parseInt(m[3]) - 1;
  const terminator = m[4];
  const shift = !!(raw & 4);
  const meta = !!(raw & 8);
  const ctrl = !!(raw & 16);
  const motion = !!(raw & 32);
  const isWheel = !!(raw & 64);
  if (isWheel) {
    const wheelButton = raw & 3;
    return {
      button: 0,
      x,
      y,
      action: "wheel",
      delta: wheelButton === 0 ? -1 : 1,
      shift,
      meta,
      ctrl
    };
  }
  const button = raw & 3;
  const action = motion ? "move" : terminator === "M" ? "down" : "up";
  return { button, x, y, action, shift, meta, ctrl };
}
function isMouseSequence(input) {
  return SGR_MOUSE_TEST_RE.test(input);
}
var SGR_MOUSE_RE, SGR_MOUSE_TEST_RE;
var init_mouse = __esm(() => {
  SGR_MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/;
  SGR_MOUSE_TEST_RE = /^\x1b\[<\d+;\d+;\d+[Mm]$/;
});

// packages/ag-term/src/bracketed-paste.ts
function enableBracketedPaste(stdout) {
  stdout.write("\x1B[?2004h");
}
function disableBracketedPaste(stdout) {
  stdout.write("\x1B[?2004l");
}
function parseBracketedPaste(input) {
  const startIdx = input.indexOf(PASTE_START);
  if (startIdx === -1)
    return null;
  const contentStart = startIdx + PASTE_START.length;
  const endIdx = input.indexOf(PASTE_END, contentStart);
  if (endIdx === -1)
    return null;
  return {
    type: "paste",
    content: input.slice(contentStart, endIdx)
  };
}
var PASTE_START = "\x1B[200~", PASTE_END = "\x1B[201~";

// packages/ag-term/src/focus-reporting.ts
function parseFocusEvent(input) {
  if (input.includes(`${CSI}I`)) {
    return { type: "focus-in" };
  }
  if (input.includes(`${CSI}O`)) {
    return { type: "focus-out" };
  }
  return null;
}
var CSI = "\x1B[";

// packages/ag-term/src/runtime/term-provider.ts
function splitRawInput2(raw) {
  const sequences = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "\x1B") {
      if (i + 1 >= raw.length) {
        sequences.push("\x1B");
        i++;
      } else if (raw[i + 1] === "[") {
        let j = i + 2;
        while (j < raw.length && !isCSITerminator(raw[j]))
          j++;
        if (j < raw.length) {
          j++;
          sequences.push(raw.slice(i, j));
          i = j;
        } else {
          return { sequences, incomplete: raw.slice(i) };
        }
      } else if (raw[i + 1] === "O") {
        const end = Math.min(i + 3, raw.length);
        sequences.push(raw.slice(i, end));
        i = end;
      } else if (raw[i + 1] === "\x1B") {
        if (i + 2 < raw.length && raw[i + 2] === "[") {
          let j = i + 3;
          while (j < raw.length && !isCSITerminator(raw[j]))
            j++;
          if (j < raw.length) {
            j++;
            sequences.push(raw.slice(i, j));
            i = j;
          } else {
            return { sequences, incomplete: raw.slice(i) };
          }
        } else if (i + 2 < raw.length && raw[i + 2] === "O") {
          const end = Math.min(i + 4, raw.length);
          sequences.push(raw.slice(i, end));
          i = end;
        } else {
          sequences.push("\x1B\x1B");
          i += 2;
        }
      } else {
        sequences.push(raw.slice(i, i + 2));
        i += 2;
      }
    } else {
      sequences.push(raw[i]);
      i++;
    }
  }
  return { sequences, incomplete: null };
}
function isCSITerminator(ch) {
  return ch >= "A" && ch <= "Z" || ch >= "a" && ch <= "z" || ch === "~";
}
function createTermProvider(stdin, stdout, options = {}) {
  const { cols = stdout.columns || 80, rows = stdout.rows || 24 } = options;
  let state = { cols, rows };
  const listeners = new Set;
  let disposed = false;
  const controller = new AbortController;
  const signal = controller.signal;
  let stdinCleanup = null;
  const onResize = () => {
    state = {
      cols: stdout.columns || 80,
      rows: stdout.rows || 24
    };
    listeners.forEach((l) => l(state));
  };
  if (typeof stdout.setMaxListeners === "function") {
    const current = stdout.getMaxListeners?.() ?? 10;
    if (current < 50)
      stdout.setMaxListeners(50);
  }
  stdout.on("resize", onResize);
  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async* events() {
      if (disposed)
        return;
      if (stdin.isTTY) {
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding("utf8");
      }
      const queue = [];
      let eventResolve = null;
      const onKey = (raw) => {
        const focusEvent = parseFocusEvent(raw);
        if (focusEvent) {
          queue.push({ type: "focus", data: { focused: focusEvent.type === "focus-in" } });
          return;
        }
        if (isMouseSequence(raw)) {
          const parsed = parseMouseSequence(raw);
          if (parsed) {
            queue.push({ type: "mouse", data: parsed });
            return;
          }
        }
        const [input, key] = parseKey(raw);
        queue.push({ type: "key", data: { input, key } });
      };
      let incompleteCSI = null;
      const onChunk = (chunk) => {
        if (incompleteCSI !== null) {
          chunk = incompleteCSI + chunk;
          incompleteCSI = null;
        }
        const pasteResult = parseBracketedPaste(chunk);
        if (pasteResult) {
          queue.push({ type: "paste", data: { text: pasteResult.content } });
          if (eventResolve) {
            const resolve2 = eventResolve;
            eventResolve = null;
            resolve2();
          }
          return;
        }
        const { sequences, incomplete } = splitRawInput2(chunk);
        for (const raw of sequences)
          onKey(raw);
        incompleteCSI = incomplete;
        if (eventResolve) {
          const resolve2 = eventResolve;
          eventResolve = null;
          resolve2();
        }
      };
      const onResizeEvent = () => {
        const event = {
          type: "resize",
          data: {
            cols: stdout.columns || 80,
            rows: stdout.rows || 24
          }
        };
        queue.push(event);
        if (eventResolve) {
          const resolve2 = eventResolve;
          eventResolve = null;
          resolve2();
        }
      };
      if (stdin.isTTY) {
        enableBracketedPaste(stdout);
      }
      stdin.on("data", onChunk);
      stdout.on("resize", onResizeEvent);
      stdinCleanup = () => {
        if (stdin.isTTY) {
          disableBracketedPaste(stdout);
        }
        stdin.off("data", onChunk);
        stdout.off("resize", onResizeEvent);
        if (stdin.isTTY) {
          stdin.setRawMode(false);
        }
        stdin.pause();
      };
      try {
        while (!disposed && !signal.aborted) {
          if (queue.length === 0) {
            await new Promise((resolve2) => {
              eventResolve = resolve2;
              signal.addEventListener("abort", () => resolve2(), { once: true });
            });
          }
          if (disposed || signal.aborted)
            break;
          while (queue.length > 0) {
            yield queue.shift();
          }
        }
      } finally {
        if (stdinCleanup) {
          const fn = stdinCleanup;
          stdinCleanup = null;
          fn();
        }
      }
    },
    [Symbol.dispose]() {
      if (disposed)
        return;
      disposed = true;
      controller.abort();
      stdout.off("resize", onResize);
      listeners.clear();
      if (stdinCleanup) {
        const fn = stdinCleanup;
        stdinCleanup = null;
        fn();
      }
    }
  };
}
var init_term_provider = __esm(() => {
  init_keys2();
  init_mouse();
});

// packages/ag-term/src/ansi/term.ts
function stripAnsi(text) {
  return text.replace(ANSI_REGEX, "");
}
function createTerm(first, second) {
  if (second && first && isTermBackend(first)) {
    const mod = "@termless/core";
    const { createTerminal } = __require(mod);
    const emulator = createTerminal({ backend: first, ...second });
    return createBackendTerm(emulator);
  }
  if (first && isTermEmulator(first)) {
    return createBackendTerm(first);
  }
  if (first && isHeadlessDims(first)) {
    return createHeadlessTerm(first);
  }
  return createNodeTerm(first ?? {});
}
function isTermEmulator(obj) {
  if (typeof obj !== "object" || obj === null)
    return false;
  const o = obj;
  return typeof o.feed === "function" && typeof o.screen === "object" && o.screen !== null;
}
function isTermBackend(obj) {
  if (typeof obj !== "object" || obj === null)
    return false;
  const o = obj;
  return typeof o.init === "function" && typeof o.name === "string" && typeof o.destroy === "function";
}
function isHeadlessDims(obj) {
  if (typeof obj !== "object" || obj === null)
    return false;
  const o = obj;
  return typeof o.cols === "number" && typeof o.rows === "number" && !("stdout" in o) && !("stdin" in o);
}
function createNodeTerm(options) {
  const stdout = options.stdout ?? process.stdout;
  const stdin = options.stdin ?? process.stdin;
  const cachedCursor = options.cursor ?? detectCursor(stdout);
  const cachedInput = detectInput(stdin);
  const cachedColor = options.color !== undefined ? options.color : detectColor(stdout);
  const cachedUnicode = options.unicode ?? detectUnicode();
  const detectedCaps = options.caps ? { ...defaultCaps(), ...options.caps } : stdin.isTTY ? detectTerminalCaps() : undefined;
  const chalkLevel = cachedColor === null ? 0 : cachedColor === "basic" ? 1 : cachedColor === "256" ? 2 : 3;
  const chalkInstance = new Chalk({ level: chalkLevel });
  let provider = null;
  const getProvider = () => {
    if (!provider) {
      provider = createTermProvider(stdin, stdout, {
        cols: stdout.columns || 80,
        rows: stdout.rows || 24
      });
    }
    return provider;
  };
  let _frame;
  const termBase = {
    hasCursor: () => cachedCursor,
    hasInput: () => cachedInput,
    hasColor: () => cachedColor,
    hasUnicode: () => cachedUnicode,
    caps: detectedCaps,
    stdout,
    stdin,
    write: (str) => {
      stdout.write(str);
    },
    writeLine: (str) => {
      stdout.write(str + `
`);
    },
    getState: () => getProvider().getState(),
    subscribe: (listener) => getProvider().subscribe(listener),
    events: () => getProvider().events(),
    stripAnsi,
    paint: (buffer, prev) => {
      const output = outputPhase(prev, buffer);
      _frame = createTextFrame(buffer);
      return output;
    },
    [Symbol.dispose]: () => {
      if (provider)
        provider[Symbol.dispose]();
    }
  };
  Object.defineProperty(termBase, "frame", { get: () => _frame, enumerable: true });
  const term = createStyleProxy(chalkInstance, termBase);
  Object.defineProperty(term, "cols", {
    get: () => stdout.isTTY ? stdout.columns : undefined,
    enumerable: true
  });
  Object.defineProperty(term, "rows", {
    get: () => stdout.isTTY ? stdout.rows : undefined,
    enumerable: true
  });
  return term;
}
function createHeadlessTerm(dims) {
  const state = { cols: dims.cols, rows: dims.rows };
  let disposed = false;
  const controller = new AbortController;
  const chalkInstance = new Chalk({ level: 0 });
  let _frame;
  const termBase = {
    hasCursor: () => false,
    hasInput: () => false,
    hasColor: () => null,
    hasUnicode: () => false,
    caps: undefined,
    stdout: process.stdout,
    stdin: process.stdin,
    write: () => {},
    writeLine: () => {},
    getState: () => state,
    subscribe: () => () => {},
    async* events() {
      if (disposed)
        return;
      await new Promise((resolve2) => {
        controller.signal.addEventListener("abort", () => resolve2(), { once: true });
      });
    },
    stripAnsi,
    paint: (buffer, prev) => {
      _frame = createTextFrame(buffer);
      return "";
    },
    [Symbol.dispose]: () => {
      if (disposed)
        return;
      disposed = true;
      controller.abort();
    }
  };
  Object.defineProperty(termBase, "frame", { get: () => _frame, enumerable: true });
  const term = createStyleProxy(chalkInstance, termBase);
  Object.defineProperty(term, "cols", { get: () => dims.cols, enumerable: true });
  Object.defineProperty(term, "rows", { get: () => dims.rows, enumerable: true });
  return term;
}
function createBackendTerm(emulator) {
  let disposed = false;
  const controller = new AbortController;
  const chalkInstance = new Chalk({ level: 3 });
  const listeners = new Set;
  const eventQueue = [];
  let eventResolve = null;
  let _frame;
  const termBase = {
    hasCursor: () => true,
    hasInput: () => true,
    hasColor: () => "truecolor",
    hasUnicode: () => true,
    caps: undefined,
    stdout: process.stdout,
    stdin: process.stdin,
    write: (str) => emulator.feed(str),
    writeLine: (str) => emulator.feed(str + `
`),
    getState: () => ({ cols: emulator.cols, rows: emulator.rows }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async* events() {
      if (disposed)
        return;
      while (!disposed && !controller.signal.aborted) {
        if (eventQueue.length === 0) {
          await new Promise((resolve2) => {
            eventResolve = resolve2;
            controller.signal.addEventListener("abort", () => resolve2(), { once: true });
          });
        }
        if (disposed || controller.signal.aborted)
          break;
        while (eventQueue.length > 0) {
          yield eventQueue.shift();
        }
      }
    },
    resize: (cols, rows) => {
      emulator.resize(cols, rows);
      const state = { cols, rows };
      listeners.forEach((l) => l(state));
      eventQueue.push({ type: "resize", data: { cols, rows } });
      if (eventResolve) {
        const resolve2 = eventResolve;
        eventResolve = null;
        resolve2();
      }
    },
    sendInput: (data) => {
      const pasteResult = parseBracketedPaste(data);
      if (pasteResult) {
        eventQueue.push({ type: "paste", data: { text: pasteResult.content } });
      } else {
        for (const raw of splitRawInput(data)) {
          const focusEvent = parseFocusEvent(raw);
          if (focusEvent) {
            eventQueue.push({ type: "focus", data: { focused: focusEvent.type === "focus-in" } });
            continue;
          }
          if (isMouseSequence(raw)) {
            const parsed = parseMouseSequence(raw);
            if (parsed) {
              eventQueue.push({ type: "mouse", data: parsed });
            }
            continue;
          }
          const [input, key] = parseKey(raw);
          eventQueue.push({ type: "key", data: { input, key } });
        }
      }
      if (eventResolve) {
        const resolve2 = eventResolve;
        eventResolve = null;
        resolve2();
      }
    },
    stripAnsi,
    paint: (buffer, prev) => {
      const output = outputPhase(prev, buffer);
      if (output)
        emulator.feed(output);
      _frame = createTextFrame(buffer);
      return output;
    },
    _emulator: emulator,
    [Symbol.dispose]: () => {
      if (disposed)
        return;
      disposed = true;
      controller.abort();
      listeners.clear();
      emulator.close().catch(() => {});
    }
  };
  Object.defineProperty(termBase, "cols", { get: () => emulator.cols, enumerable: true });
  Object.defineProperty(termBase, "rows", { get: () => emulator.rows, enumerable: true });
  Object.defineProperty(termBase, "screen", { get: () => emulator.screen, enumerable: true });
  Object.defineProperty(termBase, "frame", { get: () => _frame, enumerable: true });
  Object.defineProperty(termBase, "scrollback", {
    get: () => emulator.scrollback,
    enumerable: true
  });
  const term = createStyleProxy(chalkInstance, termBase);
  return term;
}
function createStyleProxy(chalkInstance, termBase) {
  return createChainProxy(chalkInstance, termBase);
}
function createChainProxy(currentChalk, termBase) {
  const handler = {
    apply(_target, _thisArg, args) {
      if (args.length === 1 && typeof args[0] === "string") {
        return currentChalk(args[0]);
      }
      if (args.length > 0 && Array.isArray(args[0]) && "raw" in args[0]) {
        return currentChalk(args[0], ...args.slice(1));
      }
      return currentChalk(String(args[0] ?? ""));
    },
    get(target, prop, receiver) {
      if (prop in termBase) {
        const value = termBase[prop];
        if (typeof value === "function") {
          return value;
        }
        return value;
      }
      if (typeof prop === "symbol") {
        if (prop === Symbol.dispose) {
          return termBase[Symbol.dispose];
        }
        return Reflect.get(target, prop, receiver);
      }
      if (prop === "rgb" || prop === "bgRgb") {
        return (r, g, b) => {
          const newChalk = currentChalk[prop](r, g, b);
          return createChainProxy(newChalk, termBase);
        };
      }
      if (prop === "hex" || prop === "bgHex") {
        return (color) => {
          const newChalk = currentChalk[prop](color);
          return createChainProxy(newChalk, termBase);
        };
      }
      if (prop === "ansi256" || prop === "bgAnsi256") {
        return (code) => {
          const newChalk = currentChalk[prop](code);
          return createChainProxy(newChalk, termBase);
        };
      }
      const chalkProp = currentChalk[prop];
      if (chalkProp !== undefined) {
        if (typeof chalkProp === "function" || typeof chalkProp === "object") {
          return createChainProxy(chalkProp, termBase);
        }
        return chalkProp;
      }
      return;
    },
    has(_target, prop) {
      if (prop in termBase)
        return true;
      if (typeof prop === "string" && prop in currentChalk)
        return true;
      return false;
    }
  };
  const proxyTarget = Object.assign(function() {}, currentChalk);
  return new Proxy(proxyTarget, handler);
}
var ANSI_REGEX;
var init_term = __esm(() => {
  init_source();
  init_buffer();
  init_output_phase();
  init_detection();
  init_term_provider();
  init_keys();
  init_mouse();
  ANSI_REGEX = /\x1b\[[0-9;:]*m|\x9b[0-9;:]*m|\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)|\x9d8;;[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c)/g;
});

// packages/ag-term/src/ansi/patch-console.ts
var STDERR_METHODS;
var init_patch_console = __esm(() => {
  STDERR_METHODS = new Set(["error", "warn"]);
});

// ../../node_modules/.bun/ansi-regex@6.2.2/node_modules/ansi-regex/index.js
function ansiRegex({ onlyFirst = false } = {}) {
  const ST2 = "(?:\\u0007|\\u001B\\u005C|\\u009C)";
  const osc = `(?:\\u001B\\][\\s\\S]*?${ST2})`;
  const csi = "[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]";
  const pattern = `${osc}|${csi}`;
  return new RegExp(pattern, onlyFirst ? undefined : "g");
}

// ../../node_modules/.bun/strip-ansi@7.2.0/node_modules/strip-ansi/index.js
function stripAnsi2(string) {
  if (typeof string !== "string") {
    throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``);
  }
  if (!string.includes("\x1B") && !string.includes("")) {
    return string;
  }
  return string.replace(regex, "");
}
var regex;
var init_strip_ansi = __esm(() => {
  regex = ansiRegex();
});

// ../../node_modules/.bun/get-east-asian-width@1.5.0/node_modules/get-east-asian-width/lookup-data.js
var ambiguousRanges, fullwidthRanges, halfwidthRanges, narrowRanges, wideRanges;
var init_lookup_data = __esm(() => {
  ambiguousRanges = [161, 161, 164, 164, 167, 168, 170, 170, 173, 174, 176, 180, 182, 186, 188, 191, 198, 198, 208, 208, 215, 216, 222, 225, 230, 230, 232, 234, 236, 237, 240, 240, 242, 243, 247, 250, 252, 252, 254, 254, 257, 257, 273, 273, 275, 275, 283, 283, 294, 295, 299, 299, 305, 307, 312, 312, 319, 322, 324, 324, 328, 331, 333, 333, 338, 339, 358, 359, 363, 363, 462, 462, 464, 464, 466, 466, 468, 468, 470, 470, 472, 472, 474, 474, 476, 476, 593, 593, 609, 609, 708, 708, 711, 711, 713, 715, 717, 717, 720, 720, 728, 731, 733, 733, 735, 735, 768, 879, 913, 929, 931, 937, 945, 961, 963, 969, 1025, 1025, 1040, 1103, 1105, 1105, 8208, 8208, 8211, 8214, 8216, 8217, 8220, 8221, 8224, 8226, 8228, 8231, 8240, 8240, 8242, 8243, 8245, 8245, 8251, 8251, 8254, 8254, 8308, 8308, 8319, 8319, 8321, 8324, 8364, 8364, 8451, 8451, 8453, 8453, 8457, 8457, 8467, 8467, 8470, 8470, 8481, 8482, 8486, 8486, 8491, 8491, 8531, 8532, 8539, 8542, 8544, 8555, 8560, 8569, 8585, 8585, 8592, 8601, 8632, 8633, 8658, 8658, 8660, 8660, 8679, 8679, 8704, 8704, 8706, 8707, 8711, 8712, 8715, 8715, 8719, 8719, 8721, 8721, 8725, 8725, 8730, 8730, 8733, 8736, 8739, 8739, 8741, 8741, 8743, 8748, 8750, 8750, 8756, 8759, 8764, 8765, 8776, 8776, 8780, 8780, 8786, 8786, 8800, 8801, 8804, 8807, 8810, 8811, 8814, 8815, 8834, 8835, 8838, 8839, 8853, 8853, 8857, 8857, 8869, 8869, 8895, 8895, 8978, 8978, 9312, 9449, 9451, 9547, 9552, 9587, 9600, 9615, 9618, 9621, 9632, 9633, 9635, 9641, 9650, 9651, 9654, 9655, 9660, 9661, 9664, 9665, 9670, 9672, 9675, 9675, 9678, 9681, 9698, 9701, 9711, 9711, 9733, 9734, 9737, 9737, 9742, 9743, 9756, 9756, 9758, 9758, 9792, 9792, 9794, 9794, 9824, 9825, 9827, 9829, 9831, 9834, 9836, 9837, 9839, 9839, 9886, 9887, 9919, 9919, 9926, 9933, 9935, 9939, 9941, 9953, 9955, 9955, 9960, 9961, 9963, 9969, 9972, 9972, 9974, 9977, 9979, 9980, 9982, 9983, 10045, 10045, 10102, 10111, 11094, 11097, 12872, 12879, 57344, 63743, 65024, 65039, 65533, 65533, 127232, 127242, 127248, 127277, 127280, 127337, 127344, 127373, 127375, 127376, 127387, 127404, 917760, 917999, 983040, 1048573, 1048576, 1114109];
  fullwidthRanges = [12288, 12288, 65281, 65376, 65504, 65510];
  halfwidthRanges = [8361, 8361, 65377, 65470, 65474, 65479, 65482, 65487, 65490, 65495, 65498, 65500, 65512, 65518];
  narrowRanges = [32, 126, 162, 163, 165, 166, 172, 172, 175, 175, 10214, 10221, 10629, 10630];
  wideRanges = [4352, 4447, 8986, 8987, 9001, 9002, 9193, 9196, 9200, 9200, 9203, 9203, 9725, 9726, 9748, 9749, 9776, 9783, 9800, 9811, 9855, 9855, 9866, 9871, 9875, 9875, 9889, 9889, 9898, 9899, 9917, 9918, 9924, 9925, 9934, 9934, 9940, 9940, 9962, 9962, 9970, 9971, 9973, 9973, 9978, 9978, 9981, 9981, 9989, 9989, 9994, 9995, 10024, 10024, 10060, 10060, 10062, 10062, 10067, 10069, 10071, 10071, 10133, 10135, 10160, 10160, 10175, 10175, 11035, 11036, 11088, 11088, 11093, 11093, 11904, 11929, 11931, 12019, 12032, 12245, 12272, 12287, 12289, 12350, 12353, 12438, 12441, 12543, 12549, 12591, 12593, 12686, 12688, 12773, 12783, 12830, 12832, 12871, 12880, 42124, 42128, 42182, 43360, 43388, 44032, 55203, 63744, 64255, 65040, 65049, 65072, 65106, 65108, 65126, 65128, 65131, 94176, 94180, 94192, 94198, 94208, 101589, 101631, 101662, 101760, 101874, 110576, 110579, 110581, 110587, 110589, 110590, 110592, 110882, 110898, 110898, 110928, 110930, 110933, 110933, 110948, 110951, 110960, 111355, 119552, 119638, 119648, 119670, 126980, 126980, 127183, 127183, 127374, 127374, 127377, 127386, 127488, 127490, 127504, 127547, 127552, 127560, 127568, 127569, 127584, 127589, 127744, 127776, 127789, 127797, 127799, 127868, 127870, 127891, 127904, 127946, 127951, 127955, 127968, 127984, 127988, 127988, 127992, 128062, 128064, 128064, 128066, 128252, 128255, 128317, 128331, 128334, 128336, 128359, 128378, 128378, 128405, 128406, 128420, 128420, 128507, 128591, 128640, 128709, 128716, 128716, 128720, 128722, 128725, 128728, 128732, 128735, 128747, 128748, 128756, 128764, 128992, 129003, 129008, 129008, 129292, 129338, 129340, 129349, 129351, 129535, 129648, 129660, 129664, 129674, 129678, 129734, 129736, 129736, 129741, 129756, 129759, 129770, 129775, 129784, 131072, 196605, 196608, 262141];
});

// ../../node_modules/.bun/get-east-asian-width@1.5.0/node_modules/get-east-asian-width/utilities.js
var isInRange = (ranges, codePoint) => {
  let low = 0;
  let high = Math.floor(ranges.length / 2) - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const i = mid * 2;
    if (codePoint < ranges[i]) {
      high = mid - 1;
    } else if (codePoint > ranges[i + 1]) {
      low = mid + 1;
    } else {
      return true;
    }
  }
  return false;
};

// ../../node_modules/.bun/get-east-asian-width@1.5.0/node_modules/get-east-asian-width/lookup.js
function findWideFastPathRange(ranges) {
  let fastPathStart = ranges[0];
  let fastPathEnd = ranges[1];
  for (let index = 0;index < ranges.length; index += 2) {
    const start = ranges[index];
    const end = ranges[index + 1];
    if (commonCjkCodePoint >= start && commonCjkCodePoint <= end) {
      return [start, end];
    }
    if (end - start > fastPathEnd - fastPathStart) {
      fastPathStart = start;
      fastPathEnd = end;
    }
  }
  return [fastPathStart, fastPathEnd];
}
var minimumAmbiguousCodePoint, maximumAmbiguousCodePoint, minimumFullWidthCodePoint, maximumFullWidthCodePoint, minimumHalfWidthCodePoint, maximumHalfWidthCodePoint, minimumNarrowCodePoint, maximumNarrowCodePoint, minimumWideCodePoint, maximumWideCodePoint, commonCjkCodePoint = 19968, wideFastPathStart, wideFastPathEnd, isAmbiguous = (codePoint) => {
  if (codePoint < minimumAmbiguousCodePoint || codePoint > maximumAmbiguousCodePoint) {
    return false;
  }
  return isInRange(ambiguousRanges, codePoint);
}, isFullWidth = (codePoint) => {
  if (codePoint < minimumFullWidthCodePoint || codePoint > maximumFullWidthCodePoint) {
    return false;
  }
  return isInRange(fullwidthRanges, codePoint);
}, isWide = (codePoint) => {
  if (codePoint >= wideFastPathStart && codePoint <= wideFastPathEnd) {
    return true;
  }
  if (codePoint < minimumWideCodePoint || codePoint > maximumWideCodePoint) {
    return false;
  }
  return isInRange(wideRanges, codePoint);
};
var init_lookup = __esm(() => {
  init_lookup_data();
  minimumAmbiguousCodePoint = ambiguousRanges[0];
  maximumAmbiguousCodePoint = ambiguousRanges.at(-1);
  minimumFullWidthCodePoint = fullwidthRanges[0];
  maximumFullWidthCodePoint = fullwidthRanges.at(-1);
  minimumHalfWidthCodePoint = halfwidthRanges[0];
  maximumHalfWidthCodePoint = halfwidthRanges.at(-1);
  minimumNarrowCodePoint = narrowRanges[0];
  maximumNarrowCodePoint = narrowRanges.at(-1);
  minimumWideCodePoint = wideRanges[0];
  maximumWideCodePoint = wideRanges.at(-1);
  [wideFastPathStart, wideFastPathEnd] = findWideFastPathRange(wideRanges);
});

// ../../node_modules/.bun/get-east-asian-width@1.5.0/node_modules/get-east-asian-width/index.js
function validate(codePoint) {
  if (!Number.isSafeInteger(codePoint)) {
    throw new TypeError(`Expected a code point, got \`${typeof codePoint}\`.`);
  }
}
function eastAsianWidth(codePoint, { ambiguousAsWide = false } = {}) {
  validate(codePoint);
  if (isFullWidth(codePoint) || isWide(codePoint) || ambiguousAsWide && isAmbiguous(codePoint)) {
    return 2;
  }
  return 1;
}
var init_get_east_asian_width = __esm(() => {
  init_lookup();
  init_lookup();
});

// ../../node_modules/.bun/string-width@8.2.0/node_modules/string-width/index.js
function isDoubleWidthNonRgiEmojiSequence(segment) {
  if (segment.length > 50) {
    return false;
  }
  if (unqualifiedKeycapRegex.test(segment)) {
    return true;
  }
  if (segment.includes("‍")) {
    const pictographics = segment.match(extendedPictographicRegex);
    return pictographics !== null && pictographics.length >= 2;
  }
  return false;
}
function baseVisible(segment) {
  return segment.replace(leadingNonPrintingRegex, "");
}
function isZeroWidthCluster(segment) {
  return zeroWidthClusterRegex.test(segment);
}
function trailingHalfwidthWidth(segment, eastAsianWidthOptions) {
  let extra = 0;
  if (segment.length > 1) {
    for (const char of segment.slice(1)) {
      if (char >= "＀" && char <= "￯") {
        extra += eastAsianWidth(char.codePointAt(0), eastAsianWidthOptions);
      }
    }
  }
  return extra;
}
function stringWidth(input, options = {}) {
  if (typeof input !== "string" || input.length === 0) {
    return 0;
  }
  const {
    ambiguousIsNarrow = true,
    countAnsiEscapeCodes = false
  } = options;
  let string = input;
  if (!countAnsiEscapeCodes && (string.includes("\x1B") || string.includes(""))) {
    string = stripAnsi2(string);
  }
  if (string.length === 0) {
    return 0;
  }
  if (/^[\u0020-\u007E]*$/.test(string)) {
    return string.length;
  }
  let width = 0;
  const eastAsianWidthOptions = { ambiguousAsWide: !ambiguousIsNarrow };
  for (const { segment } of segmenter.segment(string)) {
    if (isZeroWidthCluster(segment)) {
      continue;
    }
    if (rgiEmojiRegex.test(segment) || isDoubleWidthNonRgiEmojiSequence(segment)) {
      width += 2;
      continue;
    }
    const codePoint = baseVisible(segment).codePointAt(0);
    width += eastAsianWidth(codePoint, eastAsianWidthOptions);
    width += trailingHalfwidthWidth(segment, eastAsianWidthOptions);
  }
  return width;
}
var segmenter, zeroWidthClusterRegex, leadingNonPrintingRegex, rgiEmojiRegex, unqualifiedKeycapRegex, extendedPictographicRegex;
var init_string_width = __esm(() => {
  init_strip_ansi();
  init_get_east_asian_width();
  segmenter = new Intl.Segmenter;
  zeroWidthClusterRegex = /^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Format}|\p{Mark}|\p{Surrogate})+$/v;
  leadingNonPrintingRegex = /^[\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Mark}\p{Surrogate}]+/v;
  rgiEmojiRegex = /^\p{RGI_Emoji}$/v;
  unqualifiedKeycapRegex = /^[\d#*]\u20E3$/;
  extendedPictographicRegex = /\p{Extended_Pictographic}/gu;
});

// packages/ag-term/src/ansi/utils.ts
var init_utils2 = () => {};

// packages/ag-term/src/ansi/constants.ts
var init_constants = () => {};

// packages/ag-term/src/ansi/underline.ts
var init_underline = __esm(() => {
  init_constants();
  init_detection();
});

// packages/ag-term/src/ansi/hyperlink.ts
var init_hyperlink = __esm(() => {
  init_constants();
});

// packages/ag-term/src/ansi/ansi.ts
var ESC = "\x1B", CSI2, OSC2;
var init_ansi = __esm(() => {
  CSI2 = `${ESC}[`;
  OSC2 = `${ESC}]`;
});

// packages/ag-term/src/ansi/index.ts
var _lazyTerm, term;
var init_ansi2 = __esm(() => {
  init_term();
  init_term();
  init_patch_console();
  init_detection();
  init_utils2();
  init_underline();
  init_hyperlink();
  init_ansi();
  term = new Proxy({}, {
    get(_target, prop, receiver) {
      if (!_lazyTerm)
        _lazyTerm = createTerm();
      return Reflect.get(_lazyTerm, prop, receiver);
    },
    apply(_target, thisArg, args) {
      if (!_lazyTerm)
        _lazyTerm = createTerm();
      return Reflect.apply(_lazyTerm, thisArg, args);
    },
    has(_target, prop) {
      if (!_lazyTerm)
        _lazyTerm = createTerm();
      return Reflect.has(_lazyTerm, prop);
    }
  });
});

// ../../node_modules/.bun/ansi-styles@6.2.3/node_modules/ansi-styles/index.js
function assembleStyles2() {
  const codes = new Map;
  for (const [groupName, group] of Object.entries(styles3)) {
    for (const [styleName, style] of Object.entries(group)) {
      styles3[styleName] = {
        open: `\x1B[${style[0]}m`,
        close: `\x1B[${style[1]}m`
      };
      group[styleName] = styles3[styleName];
      codes.set(style[0], style[1]);
    }
    Object.defineProperty(styles3, groupName, {
      value: group,
      enumerable: false
    });
  }
  Object.defineProperty(styles3, "codes", {
    value: codes,
    enumerable: false
  });
  styles3.color.close = "\x1B[39m";
  styles3.bgColor.close = "\x1B[49m";
  styles3.color.ansi = wrapAnsi162();
  styles3.color.ansi256 = wrapAnsi2562();
  styles3.color.ansi16m = wrapAnsi16m2();
  styles3.bgColor.ansi = wrapAnsi162(ANSI_BACKGROUND_OFFSET2);
  styles3.bgColor.ansi256 = wrapAnsi2562(ANSI_BACKGROUND_OFFSET2);
  styles3.bgColor.ansi16m = wrapAnsi16m2(ANSI_BACKGROUND_OFFSET2);
  Object.defineProperties(styles3, {
    rgbToAnsi256: {
      value(red, green, blue) {
        if (red === green && green === blue) {
          if (red < 8) {
            return 16;
          }
          if (red > 248) {
            return 231;
          }
          return Math.round((red - 8) / 247 * 24) + 232;
        }
        return 16 + 36 * Math.round(red / 255 * 5) + 6 * Math.round(green / 255 * 5) + Math.round(blue / 255 * 5);
      },
      enumerable: false
    },
    hexToRgb: {
      value(hex) {
        const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16));
        if (!matches) {
          return [0, 0, 0];
        }
        let [colorString] = matches;
        if (colorString.length === 3) {
          colorString = [...colorString].map((character) => character + character).join("");
        }
        const integer = Number.parseInt(colorString, 16);
        return [
          integer >> 16 & 255,
          integer >> 8 & 255,
          integer & 255
        ];
      },
      enumerable: false
    },
    hexToAnsi256: {
      value: (hex) => styles3.rgbToAnsi256(...styles3.hexToRgb(hex)),
      enumerable: false
    },
    ansi256ToAnsi: {
      value(code) {
        if (code < 8) {
          return 30 + code;
        }
        if (code < 16) {
          return 90 + (code - 8);
        }
        let red;
        let green;
        let blue;
        if (code >= 232) {
          red = ((code - 232) * 10 + 8) / 255;
          green = red;
          blue = red;
        } else {
          code -= 16;
          const remainder = code % 36;
          red = Math.floor(code / 36) / 5;
          green = Math.floor(remainder / 6) / 5;
          blue = remainder % 6 / 5;
        }
        const value = Math.max(red, green, blue) * 2;
        if (value === 0) {
          return 30;
        }
        let result = 30 + (Math.round(blue) << 2 | Math.round(green) << 1 | Math.round(red));
        if (value === 2) {
          result += 60;
        }
        return result;
      },
      enumerable: false
    },
    rgbToAnsi: {
      value: (red, green, blue) => styles3.ansi256ToAnsi(styles3.rgbToAnsi256(red, green, blue)),
      enumerable: false
    },
    hexToAnsi: {
      value: (hex) => styles3.ansi256ToAnsi(styles3.hexToAnsi256(hex)),
      enumerable: false
    }
  });
  return styles3;
}
var ANSI_BACKGROUND_OFFSET2 = 10, wrapAnsi162 = (offset = 0) => (code) => `\x1B[${code + offset}m`, wrapAnsi2562 = (offset = 0) => (code) => `\x1B[${38 + offset};5;${code}m`, wrapAnsi16m2 = (offset = 0) => (red, green, blue) => `\x1B[${38 + offset};2;${red};${green};${blue}m`, styles3, modifierNames2, foregroundColorNames2, backgroundColorNames2, colorNames2, ansiStyles2, ansi_styles_default2;
var init_ansi_styles2 = __esm(() => {
  styles3 = {
    modifier: {
      reset: [0, 0],
      bold: [1, 22],
      dim: [2, 22],
      italic: [3, 23],
      underline: [4, 24],
      overline: [53, 55],
      inverse: [7, 27],
      hidden: [8, 28],
      strikethrough: [9, 29]
    },
    color: {
      black: [30, 39],
      red: [31, 39],
      green: [32, 39],
      yellow: [33, 39],
      blue: [34, 39],
      magenta: [35, 39],
      cyan: [36, 39],
      white: [37, 39],
      blackBright: [90, 39],
      gray: [90, 39],
      grey: [90, 39],
      redBright: [91, 39],
      greenBright: [92, 39],
      yellowBright: [93, 39],
      blueBright: [94, 39],
      magentaBright: [95, 39],
      cyanBright: [96, 39],
      whiteBright: [97, 39]
    },
    bgColor: {
      bgBlack: [40, 49],
      bgRed: [41, 49],
      bgGreen: [42, 49],
      bgYellow: [43, 49],
      bgBlue: [44, 49],
      bgMagenta: [45, 49],
      bgCyan: [46, 49],
      bgWhite: [47, 49],
      bgBlackBright: [100, 49],
      bgGray: [100, 49],
      bgGrey: [100, 49],
      bgRedBright: [101, 49],
      bgGreenBright: [102, 49],
      bgYellowBright: [103, 49],
      bgBlueBright: [104, 49],
      bgMagentaBright: [105, 49],
      bgCyanBright: [106, 49],
      bgWhiteBright: [107, 49]
    }
  };
  modifierNames2 = Object.keys(styles3.modifier);
  foregroundColorNames2 = Object.keys(styles3.color);
  backgroundColorNames2 = Object.keys(styles3.bgColor);
  colorNames2 = [...foregroundColorNames2, ...backgroundColorNames2];
  ansiStyles2 = assembleStyles2();
  ansi_styles_default2 = ansiStyles2;
});

// ../../node_modules/.bun/is-fullwidth-code-point@5.1.0/node_modules/is-fullwidth-code-point/index.js
function isFullwidthCodePoint(codePoint) {
  if (!Number.isInteger(codePoint)) {
    return false;
  }
  return isFullWidth(codePoint) || isWide(codePoint);
}
var init_is_fullwidth_code_point = __esm(() => {
  init_get_east_asian_width();
});

// ../../node_modules/.bun/slice-ansi@8.0.0/node_modules/slice-ansi/tokenize-ansi.js
function isSgrParameterCharacter(codePoint) {
  return codePoint >= CODE_POINT_0 && codePoint <= CODE_POINT_9 || codePoint === CODE_POINT_SEMICOLON || codePoint === CODE_POINT_COLON;
}
function isCsiParameterCharacter(codePoint) {
  return codePoint >= CODE_POINT_CSI_PARAMETER_START && codePoint <= CODE_POINT_CSI_PARAMETER_END;
}
function isCsiIntermediateCharacter(codePoint) {
  return codePoint >= CODE_POINT_CSI_INTERMEDIATE_START && codePoint <= CODE_POINT_CSI_INTERMEDIATE_END;
}
function isCsiFinalCharacter(codePoint) {
  return codePoint >= CODE_POINT_CSI_FINAL_START && codePoint <= CODE_POINT_CSI_FINAL_END;
}
function isRegionalIndicatorCodePoint(codePoint) {
  return codePoint >= REGIONAL_INDICATOR_SYMBOL_LETTER_A && codePoint <= REGIONAL_INDICATOR_SYMBOL_LETTER_Z;
}
function createControlParseResult(code, endIndex) {
  return {
    token: {
      type: "control",
      code
    },
    endIndex
  };
}
function isEmojiStyleGrapheme(grapheme) {
  if (EMOJI_PRESENTATION_GRAPHEME_REGEX.test(grapheme)) {
    return true;
  }
  for (const character of grapheme) {
    const codePoint = character.codePointAt(0);
    if (codePoint === VARIATION_SELECTOR_16_CODE_POINT || codePoint === COMBINING_ENCLOSING_KEYCAP_CODE_POINT) {
      return true;
    }
  }
  return false;
}
function getGraphemeWidth(grapheme) {
  let regionalIndicatorCount = 0;
  for (const character of grapheme) {
    const codePoint = character.codePointAt(0);
    if (isFullwidthCodePoint(codePoint)) {
      return 2;
    }
    if (isRegionalIndicatorCodePoint(codePoint)) {
      regionalIndicatorCount++;
    }
  }
  if (regionalIndicatorCount >= 1) {
    return 2;
  }
  if (isEmojiStyleGrapheme(grapheme)) {
    return 2;
  }
  return 1;
}
function getSgrPrefix(code) {
  if (code.startsWith("")) {
    return "";
  }
  return `${ESCAPE}${ANSI_CSI}`;
}
function createSgrCode(prefix, values) {
  return `${prefix}${values.join(";")}${ANSI_SGR_TERMINATOR}`;
}
function getSgrFragments(code) {
  const fragments = [];
  const sgrPrefix = getSgrPrefix(code);
  let parameterString;
  if (code.startsWith(`${ESCAPE}${ANSI_CSI}`)) {
    parameterString = code.slice(2, -1);
  } else if (code.startsWith("")) {
    parameterString = code.slice(1, -1);
  } else {
    return fragments;
  }
  const rawCodes = parameterString.length === 0 ? [String(SGR_RESET_CODE)] : parameterString.split(";");
  let index = 0;
  while (index < rawCodes.length) {
    const codeNumber = Number.parseInt(rawCodes[index], 10);
    if (Number.isNaN(codeNumber)) {
      index++;
      continue;
    }
    if (codeNumber === SGR_RESET_CODE) {
      fragments.push({ type: "reset" });
      index++;
      continue;
    }
    if (codeNumber === SGR_EXTENDED_FOREGROUND_CODE || codeNumber === SGR_EXTENDED_BACKGROUND_CODE) {
      const colorType = Number.parseInt(rawCodes[index + 1], 10);
      if (colorType === SGR_COLOR_TYPE_ANSI_256 && index + SGR_ANSI_256_LAST_PARAMETER_OFFSET < rawCodes.length) {
        const openCode3 = createSgrCode(sgrPrefix, rawCodes.slice(index, index + SGR_ANSI_256_FRAGMENT_LENGTH));
        fragments.push({
          type: "start",
          code: openCode3,
          endCode: ansi_styles_default2.color.ansi(codeNumber === SGR_EXTENDED_FOREGROUND_CODE ? SGR_DEFAULT_FOREGROUND_CODE : SGR_DEFAULT_BACKGROUND_CODE)
        });
        index += SGR_ANSI_256_FRAGMENT_LENGTH;
        continue;
      }
      if (colorType === SGR_COLOR_TYPE_TRUECOLOR && index + SGR_TRUECOLOR_LAST_PARAMETER_OFFSET < rawCodes.length) {
        const openCode3 = createSgrCode(sgrPrefix, rawCodes.slice(index, index + SGR_TRUECOLOR_FRAGMENT_LENGTH));
        fragments.push({
          type: "start",
          code: openCode3,
          endCode: ansi_styles_default2.color.ansi(codeNumber === SGR_EXTENDED_FOREGROUND_CODE ? SGR_DEFAULT_FOREGROUND_CODE : SGR_DEFAULT_BACKGROUND_CODE)
        });
        index += SGR_TRUECOLOR_FRAGMENT_LENGTH;
        continue;
      }
      const openCode2 = createSgrCode(sgrPrefix, [rawCodes[index]]);
      fragments.push({
        type: "start",
        code: openCode2,
        endCode: ansi_styles_default2.color.ansi(codeNumber === SGR_EXTENDED_FOREGROUND_CODE ? SGR_DEFAULT_FOREGROUND_CODE : SGR_DEFAULT_BACKGROUND_CODE)
      });
      index++;
      continue;
    }
    if (endCodeNumbers.has(codeNumber)) {
      fragments.push({
        type: "end",
        endCode: ansi_styles_default2.color.ansi(codeNumber)
      });
      index++;
      continue;
    }
    const mappedEndCode = ansi_styles_default2.codes.get(codeNumber);
    if (mappedEndCode !== undefined) {
      const openCode2 = createSgrCode(sgrPrefix, [rawCodes[index]]);
      fragments.push({
        type: "start",
        code: openCode2,
        endCode: ansi_styles_default2.color.ansi(mappedEndCode)
      });
      index++;
      continue;
    }
    const openCode = createSgrCode(sgrPrefix, [rawCodes[index]]);
    fragments.push({
      type: "start",
      code: openCode,
      endCode: ansi_styles_default2.reset.open
    });
    index++;
  }
  if (fragments.length === 0) {
    fragments.push({ type: "reset" });
  }
  return fragments;
}
function parseCsiCode(string, index) {
  const escapeCodePoint = string.codePointAt(index);
  let sequenceStartIndex;
  if (escapeCodePoint === ESCAPE_CODE_POINT) {
    if (string[index + 1] !== ANSI_CSI) {
      return;
    }
    sequenceStartIndex = index + 2;
  } else if (escapeCodePoint === C1_CSI_CODE_POINT) {
    sequenceStartIndex = index + 1;
  } else {
    return;
  }
  let hasCanonicalSgrParameters = true;
  for (let sequenceIndex = sequenceStartIndex;sequenceIndex < string.length; sequenceIndex++) {
    const codePoint = string.codePointAt(sequenceIndex);
    if (isCsiFinalCharacter(codePoint)) {
      const code = string.slice(index, sequenceIndex + 1);
      if (string[sequenceIndex] !== ANSI_SGR_TERMINATOR || !hasCanonicalSgrParameters) {
        return createControlParseResult(code, sequenceIndex + 1);
      }
      return {
        token: {
          type: "sgr",
          code,
          fragments: getSgrFragments(code)
        },
        endIndex: sequenceIndex + 1
      };
    }
    if (isCsiParameterCharacter(codePoint)) {
      if (!isSgrParameterCharacter(codePoint)) {
        hasCanonicalSgrParameters = false;
      }
      continue;
    }
    if (isCsiIntermediateCharacter(codePoint)) {
      hasCanonicalSgrParameters = false;
      continue;
    }
    const endIndex = sequenceIndex;
    return createControlParseResult(string.slice(index, endIndex), endIndex);
  }
  return createControlParseResult(string.slice(index), string.length);
}
function parseHyperlinkCode(string, index) {
  let hyperlinkPrefix;
  let hyperlinkClose;
  const codePoint = string.codePointAt(index);
  if (codePoint === ESCAPE_CODE_POINT && string.startsWith(ANSI_HYPERLINK_ESC_PREFIX, index)) {
    hyperlinkPrefix = ANSI_HYPERLINK_ESC_PREFIX;
    hyperlinkClose = ANSI_HYPERLINK_ESC_CLOSE;
  } else if (codePoint === C1_OSC_CODE_POINT && string.startsWith(ANSI_HYPERLINK_C1_PREFIX, index)) {
    hyperlinkPrefix = ANSI_HYPERLINK_C1_PREFIX;
    hyperlinkClose = ANSI_HYPERLINK_C1_CLOSE;
  } else {
    return;
  }
  const uriStart = string.indexOf(";", index + hyperlinkPrefix.length);
  if (uriStart === -1) {
    return createControlParseResult(string.slice(index), string.length);
  }
  for (let sequenceIndex = uriStart + 1;sequenceIndex < string.length; sequenceIndex++) {
    const character = string[sequenceIndex];
    if (character === ANSI_BELL) {
      const code = string.slice(index, sequenceIndex + 1);
      const action = sequenceIndex === uriStart + 1 ? "close" : "open";
      return {
        token: {
          type: "hyperlink",
          code,
          action,
          closePrefix: hyperlinkClose,
          terminator: ANSI_BELL
        },
        endIndex: sequenceIndex + 1
      };
    }
    if (character === ESCAPE && string[sequenceIndex + 1] === ANSI_OSC_TERMINATOR) {
      const code = string.slice(index, sequenceIndex + 2);
      const action = sequenceIndex === uriStart + 1 ? "close" : "open";
      return {
        token: {
          type: "hyperlink",
          code,
          action,
          closePrefix: hyperlinkClose,
          terminator: ANSI_STRING_TERMINATOR
        },
        endIndex: sequenceIndex + 2
      };
    }
    if (character === C1_STRING_TERMINATOR) {
      const code = string.slice(index, sequenceIndex + 1);
      const action = sequenceIndex === uriStart + 1 ? "close" : "open";
      return {
        token: {
          type: "hyperlink",
          code,
          action,
          closePrefix: hyperlinkClose,
          terminator: C1_STRING_TERMINATOR
        },
        endIndex: sequenceIndex + 1
      };
    }
  }
  return createControlParseResult(string.slice(index), string.length);
}
function parseControlStringCode(string, index) {
  const codePoint = string.codePointAt(index);
  let sequenceStartIndex;
  let supportsBellTerminator = false;
  switch (codePoint) {
    case ESCAPE_CODE_POINT: {
      const command = string[index + 1];
      switch (command) {
        case ANSI_OSC: {
          sequenceStartIndex = index + 2;
          supportsBellTerminator = true;
          break;
        }
        case ANSI_DCS:
        case ANSI_SOS:
        case ANSI_PM:
        case ANSI_APC: {
          sequenceStartIndex = index + 2;
          break;
        }
        case ANSI_OSC_TERMINATOR: {
          return createControlParseResult(ANSI_STRING_TERMINATOR, index + 2);
        }
        default: {
          return;
        }
      }
      break;
    }
    case C1_OSC_CODE_POINT: {
      sequenceStartIndex = index + 1;
      supportsBellTerminator = true;
      break;
    }
    case C1_DCS_CODE_POINT:
    case C1_SOS_CODE_POINT:
    case C1_PM_CODE_POINT:
    case C1_APC_CODE_POINT: {
      sequenceStartIndex = index + 1;
      break;
    }
    case C1_ST_CODE_POINT: {
      return createControlParseResult(C1_STRING_TERMINATOR, index + 1);
    }
    default: {
      return;
    }
  }
  for (let sequenceIndex = sequenceStartIndex;sequenceIndex < string.length; sequenceIndex++) {
    if (supportsBellTerminator && string[sequenceIndex] === ANSI_BELL) {
      return createControlParseResult(string.slice(index, sequenceIndex + 1), sequenceIndex + 1);
    }
    if (string[sequenceIndex] === ESCAPE && string[sequenceIndex + 1] === ANSI_OSC_TERMINATOR) {
      return createControlParseResult(string.slice(index, sequenceIndex + 2), sequenceIndex + 2);
    }
    if (string[sequenceIndex] === C1_STRING_TERMINATOR) {
      return createControlParseResult(string.slice(index, sequenceIndex + 1), sequenceIndex + 1);
    }
  }
  return createControlParseResult(string.slice(index), string.length);
}
function parseAnsiCode(string, index) {
  const codePoint = string.codePointAt(index);
  if (codePoint === ESCAPE_CODE_POINT || codePoint === C1_OSC_CODE_POINT) {
    const hyperlinkCode = parseHyperlinkCode(string, index);
    if (hyperlinkCode) {
      return hyperlinkCode;
    }
  }
  const controlStringCode = parseControlStringCode(string, index);
  if (controlStringCode) {
    return controlStringCode;
  }
  return parseCsiCode(string, index);
}
function appendTrailingAnsiTokens(string, index, tokens) {
  while (index < string.length) {
    const nextCodePoint = string.codePointAt(index);
    if (!ESCAPES.has(nextCodePoint)) {
      break;
    }
    const escapeCode = parseAnsiCode(string, index);
    if (!escapeCode) {
      break;
    }
    tokens.push(escapeCode.token);
    index = escapeCode.endIndex;
  }
  return index;
}
function parseCharacterTokenWithRawSegmentation(string, index, graphemeSegments) {
  const segment = graphemeSegments.containing(index);
  if (!segment || segment.index !== index) {
    return;
  }
  return {
    token: {
      type: "character",
      value: segment.segment,
      visibleWidth: getGraphemeWidth(segment.segment),
      isGraphemeContinuation: false
    },
    endIndex: index + segment.segment.length
  };
}
function collectVisibleCharacters(string) {
  const visibleCharacters = [];
  let index = 0;
  while (index < string.length) {
    const codePoint = string.codePointAt(index);
    if (ESCAPES.has(codePoint)) {
      const code = parseAnsiCode(string, index);
      if (code) {
        index = code.endIndex;
        continue;
      }
    }
    const value = String.fromCodePoint(codePoint);
    visibleCharacters.push({
      value,
      visibleWidth: 1,
      isGraphemeContinuation: false
    });
    index += value.length;
  }
  return visibleCharacters;
}
function applyGraphemeMetadata(visibleCharacters) {
  if (visibleCharacters.length === 0) {
    return;
  }
  const visibleString = visibleCharacters.map(({ value }) => value).join("");
  const scalarOffsets = [];
  let scalarOffset = 0;
  for (const visibleCharacter of visibleCharacters) {
    scalarOffsets.push(scalarOffset);
    scalarOffset += visibleCharacter.value.length;
  }
  let scalarIndex = 0;
  for (const segment of GRAPHEME_SEGMENTER.segment(visibleString)) {
    while (scalarIndex < visibleCharacters.length && scalarOffsets[scalarIndex] < segment.index) {
      scalarIndex++;
    }
    let graphemeIndex = scalarIndex;
    let isFirstInGrapheme = true;
    while (graphemeIndex < visibleCharacters.length && scalarOffsets[graphemeIndex] < segment.index + segment.segment.length) {
      visibleCharacters[graphemeIndex].visibleWidth = isFirstInGrapheme ? getGraphemeWidth(segment.segment) : 0;
      visibleCharacters[graphemeIndex].isGraphemeContinuation = !isFirstInGrapheme;
      isFirstInGrapheme = false;
      graphemeIndex++;
    }
    scalarIndex = graphemeIndex;
  }
}
function tokenizeAnsiWithVisibleSegmentation(string, { endCharacter = Number.POSITIVE_INFINITY } = {}) {
  const tokens = [];
  const visibleCharacters = collectVisibleCharacters(string);
  applyGraphemeMetadata(visibleCharacters);
  let index = 0;
  let visibleCharacterIndex = 0;
  let visibleCount = 0;
  while (index < string.length) {
    const codePoint = string.codePointAt(index);
    if (ESCAPES.has(codePoint)) {
      const code = parseAnsiCode(string, index);
      if (code) {
        tokens.push(code.token);
        index = code.endIndex;
        continue;
      }
    }
    const value = String.fromCodePoint(codePoint);
    const visibleCharacter = visibleCharacters[visibleCharacterIndex];
    let visibleWidth = isFullwidthCodePoint(codePoint) ? 2 : value.length;
    if (visibleCharacter) {
      visibleWidth = visibleCharacter.visibleWidth;
    }
    const token = {
      type: "character",
      value,
      visibleWidth,
      isGraphemeContinuation: visibleCharacter ? visibleCharacter.isGraphemeContinuation : false
    };
    tokens.push(token);
    index += value.length;
    visibleCharacterIndex++;
    visibleCount += token.visibleWidth;
    if (visibleCount >= endCharacter) {
      const nextVisibleCharacter = visibleCharacters[visibleCharacterIndex];
      if (!nextVisibleCharacter || !nextVisibleCharacter.isGraphemeContinuation) {
        index = appendTrailingAnsiTokens(string, index, tokens);
        break;
      }
    }
  }
  return tokens;
}
function areValuesInSameGrapheme(leftValue, rightValue) {
  const pair = `${leftValue}${rightValue}`;
  const splitIndex = leftValue.length;
  for (const segment of GRAPHEME_SEGMENTER.segment(pair)) {
    if (segment.index === splitIndex) {
      return false;
    }
    if (segment.index > splitIndex) {
      return true;
    }
  }
  return true;
}
function hasAnsiSplitContinuationAhead(string, startIndex, previousVisibleValue, graphemeSegments) {
  if (!previousVisibleValue) {
    return false;
  }
  let index = startIndex;
  let hasAnsiCode = false;
  while (index < string.length) {
    const codePoint = string.codePointAt(index);
    if (ESCAPES.has(codePoint)) {
      const code = parseAnsiCode(string, index);
      if (code) {
        hasAnsiCode = true;
        index = code.endIndex;
        continue;
      }
    }
    if (!hasAnsiCode) {
      return false;
    }
    const characterToken = parseCharacterTokenWithRawSegmentation(string, index, graphemeSegments);
    if (!characterToken) {
      return true;
    }
    return areValuesInSameGrapheme(previousVisibleValue, characterToken.token.value);
  }
  return false;
}
function tokenizeAnsi(string, { endCharacter = Number.POSITIVE_INFINITY } = {}) {
  const tokens = [];
  const graphemeSegments = GRAPHEME_SEGMENTER.segment(string);
  let index = 0;
  let visibleCount = 0;
  let previousVisibleValue;
  let hasAnsiSinceLastVisible = false;
  while (index < string.length) {
    const codePoint = string.codePointAt(index);
    if (ESCAPES.has(codePoint)) {
      const code = parseAnsiCode(string, index);
      if (code) {
        tokens.push(code.token);
        index = code.endIndex;
        hasAnsiSinceLastVisible = true;
        continue;
      }
    }
    const characterToken = parseCharacterTokenWithRawSegmentation(string, index, graphemeSegments);
    if (!characterToken) {
      return tokenizeAnsiWithVisibleSegmentation(string, { endCharacter });
    }
    if (hasAnsiSinceLastVisible && previousVisibleValue && areValuesInSameGrapheme(previousVisibleValue, characterToken.token.value)) {
      return tokenizeAnsiWithVisibleSegmentation(string, { endCharacter });
    }
    tokens.push(characterToken.token);
    index = characterToken.endIndex;
    visibleCount += characterToken.token.visibleWidth;
    hasAnsiSinceLastVisible = false;
    previousVisibleValue = characterToken.token.value;
    if (visibleCount >= endCharacter) {
      if (hasAnsiSplitContinuationAhead(string, index, previousVisibleValue, graphemeSegments)) {
        return tokenizeAnsiWithVisibleSegmentation(string, { endCharacter });
      }
      index = appendTrailingAnsiTokens(string, index, tokens);
      break;
    }
  }
  return tokens;
}
var ESCAPE_CODE_POINT = 27, C1_DCS_CODE_POINT = 144, C1_SOS_CODE_POINT = 152, C1_CSI_CODE_POINT = 155, C1_ST_CODE_POINT = 156, C1_OSC_CODE_POINT = 157, C1_PM_CODE_POINT = 158, C1_APC_CODE_POINT = 159, ESCAPES, ESCAPE = "\x1B", ANSI_BELL = "\x07", ANSI_CSI = "[", ANSI_OSC = "]", ANSI_DCS = "P", ANSI_SOS = "X", ANSI_PM = "^", ANSI_APC = "_", ANSI_SGR_TERMINATOR = "m", ANSI_OSC_TERMINATOR = "\\", ANSI_STRING_TERMINATOR, C1_OSC = "", C1_STRING_TERMINATOR = "", ANSI_HYPERLINK_ESC_PREFIX, ANSI_HYPERLINK_C1_PREFIX, ANSI_HYPERLINK_ESC_CLOSE, ANSI_HYPERLINK_C1_CLOSE, CODE_POINT_0, CODE_POINT_9, CODE_POINT_SEMICOLON, CODE_POINT_COLON, CODE_POINT_CSI_PARAMETER_START, CODE_POINT_CSI_PARAMETER_END, CODE_POINT_CSI_INTERMEDIATE_START, CODE_POINT_CSI_INTERMEDIATE_END, CODE_POINT_CSI_FINAL_START, CODE_POINT_CSI_FINAL_END, REGIONAL_INDICATOR_SYMBOL_LETTER_A = 127462, REGIONAL_INDICATOR_SYMBOL_LETTER_Z = 127487, SGR_RESET_CODE = 0, SGR_EXTENDED_FOREGROUND_CODE = 38, SGR_DEFAULT_FOREGROUND_CODE = 39, SGR_EXTENDED_BACKGROUND_CODE = 48, SGR_DEFAULT_BACKGROUND_CODE = 49, SGR_COLOR_TYPE_ANSI_256 = 5, SGR_COLOR_TYPE_TRUECOLOR = 2, SGR_ANSI_256_FRAGMENT_LENGTH = 3, SGR_TRUECOLOR_FRAGMENT_LENGTH = 5, SGR_ANSI_256_LAST_PARAMETER_OFFSET = 2, SGR_TRUECOLOR_LAST_PARAMETER_OFFSET = 4, VARIATION_SELECTOR_16_CODE_POINT = 65039, COMBINING_ENCLOSING_KEYCAP_CODE_POINT = 8419, EMOJI_PRESENTATION_GRAPHEME_REGEX, GRAPHEME_SEGMENTER, endCodeNumbers;
var init_tokenize_ansi = __esm(() => {
  init_ansi_styles2();
  init_is_fullwidth_code_point();
  ESCAPES = new Set([
    ESCAPE_CODE_POINT,
    C1_DCS_CODE_POINT,
    C1_SOS_CODE_POINT,
    C1_CSI_CODE_POINT,
    C1_ST_CODE_POINT,
    C1_OSC_CODE_POINT,
    C1_PM_CODE_POINT,
    C1_APC_CODE_POINT
  ]);
  ANSI_STRING_TERMINATOR = `${ESCAPE}${ANSI_OSC_TERMINATOR}`;
  ANSI_HYPERLINK_ESC_PREFIX = `${ESCAPE}${ANSI_OSC}8;`;
  ANSI_HYPERLINK_C1_PREFIX = `${C1_OSC}8;`;
  ANSI_HYPERLINK_ESC_CLOSE = `${ANSI_HYPERLINK_ESC_PREFIX};`;
  ANSI_HYPERLINK_C1_CLOSE = `${ANSI_HYPERLINK_C1_PREFIX};`;
  CODE_POINT_0 = "0".codePointAt(0);
  CODE_POINT_9 = "9".codePointAt(0);
  CODE_POINT_SEMICOLON = ";".codePointAt(0);
  CODE_POINT_COLON = ":".codePointAt(0);
  CODE_POINT_CSI_PARAMETER_START = "0".codePointAt(0);
  CODE_POINT_CSI_PARAMETER_END = "?".codePointAt(0);
  CODE_POINT_CSI_INTERMEDIATE_START = " ".codePointAt(0);
  CODE_POINT_CSI_INTERMEDIATE_END = "/".codePointAt(0);
  CODE_POINT_CSI_FINAL_START = "@".codePointAt(0);
  CODE_POINT_CSI_FINAL_END = "~".codePointAt(0);
  EMOJI_PRESENTATION_GRAPHEME_REGEX = /\p{Emoji_Presentation}/u;
  GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  endCodeNumbers = new Set;
  for (const [, end] of ansi_styles_default2.codes) {
    endCodeNumbers.add(end);
  }
});

// ../../node_modules/.bun/slice-ansi@8.0.0/node_modules/slice-ansi/index.js
function applySgrFragments(activeStyles, fragments) {
  for (const fragment of fragments) {
    switch (fragment.type) {
      case "reset": {
        activeStyles.clear();
        break;
      }
      case "end": {
        activeStyles.delete(fragment.endCode);
        break;
      }
      case "start": {
        activeStyles.delete(fragment.endCode);
        activeStyles.set(fragment.endCode, fragment.code);
        break;
      }
      default: {
        break;
      }
    }
  }
  return activeStyles;
}
function undoAnsiCodes(activeStyles) {
  return [...activeStyles.keys()].reverse().join("");
}
function closeHyperlink(hyperlinkToken) {
  return `${hyperlinkToken.closePrefix}${hyperlinkToken.terminator}`;
}
function shouldIncludeSgrAfterEnd(token, activeStyles) {
  let hasStartFragment = false;
  let hasClosingEffect = false;
  for (const fragment of token.fragments) {
    if (fragment.type === "start") {
      hasStartFragment = true;
      continue;
    }
    if (fragment.type === "reset" && activeStyles.size > 0) {
      hasClosingEffect = true;
      continue;
    }
    if (fragment.type === "end" && activeStyles.has(fragment.endCode)) {
      hasClosingEffect = true;
    }
  }
  return hasClosingEffect && !hasStartFragment;
}
function applySgrToken({ token, isPastEnd, activeStyles, returnValue, include, activeHyperlink, position }) {
  if (isPastEnd && !shouldIncludeSgrAfterEnd(token, activeStyles)) {
    return {
      activeStyles,
      activeHyperlink,
      position,
      returnValue,
      include
    };
  }
  activeStyles = applySgrFragments(activeStyles, token.fragments);
  if (include) {
    returnValue += token.code;
  }
  return {
    activeStyles,
    activeHyperlink,
    position,
    returnValue,
    include
  };
}
function applyHyperlinkToken({ token, isPastEnd, activeStyles, activeHyperlink, position, returnValue, include }) {
  if (isPastEnd && (token.action !== "close" || !activeHyperlink)) {
    return {
      activeStyles,
      activeHyperlink,
      position,
      returnValue,
      include
    };
  }
  if (token.action === "open") {
    activeHyperlink = token;
  } else if (token.action === "close") {
    activeHyperlink = undefined;
  }
  if (include) {
    returnValue += token.code;
  }
  return {
    activeStyles,
    activeHyperlink,
    position,
    returnValue,
    include
  };
}
function applyControlToken({ token, isPastEnd, activeStyles, activeHyperlink, position, returnValue, include }) {
  if (!isPastEnd && include) {
    returnValue += token.code;
  }
  return {
    activeStyles,
    activeHyperlink,
    position,
    returnValue,
    include
  };
}
function applyCharacterToken({ token, start, activeStyles, activeHyperlink, position, returnValue, include }) {
  if (!include && position >= start && !token.isGraphemeContinuation) {
    include = true;
    returnValue = [...activeStyles.values()].join("");
    if (activeHyperlink) {
      returnValue += activeHyperlink.code;
    }
  }
  if (include) {
    returnValue += token.value;
  }
  position += token.visibleWidth;
  return {
    activeStyles,
    activeHyperlink,
    position,
    returnValue,
    include
  };
}
function applyToken(parameters) {
  const tokenHandler = tokenHandlers[parameters.token.type];
  if (!tokenHandler) {
    const {
      activeStyles,
      activeHyperlink,
      position,
      returnValue,
      include
    } = parameters;
    return {
      activeStyles,
      activeHyperlink,
      position,
      returnValue,
      include
    };
  }
  return tokenHandler(parameters);
}
function createHasContinuationAheadMap(tokens) {
  const hasContinuationAhead = Array.from({ length: tokens.length }, () => false);
  let nextCharacterIsContinuation = false;
  for (let tokenIndex = tokens.length - 1;tokenIndex >= 0; tokenIndex--) {
    const token = tokens[tokenIndex];
    hasContinuationAhead[tokenIndex] = nextCharacterIsContinuation;
    if (token.type === "character") {
      nextCharacterIsContinuation = Boolean(token.isGraphemeContinuation);
    }
  }
  return hasContinuationAhead;
}
function sliceAnsi(string, start, end) {
  const tokens = tokenizeAnsi(string, { endCharacter: end });
  const hasContinuationAhead = createHasContinuationAheadMap(tokens);
  let activeStyles = new Map;
  let activeHyperlink;
  let position = 0;
  let returnValue = "";
  let include = false;
  for (const [tokenIndex, token] of tokens.entries()) {
    let isPastEnd = end !== undefined && position >= end;
    if (isPastEnd && token.type !== "character" && hasContinuationAhead[tokenIndex]) {
      isPastEnd = false;
    }
    if (isPastEnd && token.type === "character" && !token.isGraphemeContinuation) {
      break;
    }
    ({ activeStyles, activeHyperlink, position, returnValue, include } = applyToken({
      token,
      isPastEnd,
      start,
      activeStyles,
      activeHyperlink,
      position,
      returnValue,
      include
    }));
  }
  if (!include) {
    return "";
  }
  if (activeHyperlink) {
    returnValue += closeHyperlink(activeHyperlink);
  }
  returnValue += undoAnsiCodes(activeStyles);
  return returnValue;
}
var tokenHandlers;
var init_slice_ansi = __esm(() => {
  init_tokenize_ansi();
  tokenHandlers = {
    sgr: applySgrToken,
    hyperlink: applyHyperlinkToken,
    control: applyControlToken,
    character: applyCharacterToken
  };
});

// packages/ag-term/src/unicode.ts
class DisplayWidthCache {
  cache = new Map;
  maxSize;
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }
  get(text) {
    const cached = this.cache.get(text);
    if (cached !== undefined) {
      this.cache.delete(text);
      this.cache.set(text, cached);
    }
    return cached;
  }
  set(text, width) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(text, width);
  }
  clear() {
    this.cache.clear();
  }
}
function isTextSizingEnabled() {
  if (_scopedMeasurer)
    return _scopedMeasurer.textSizingEnabled;
  return DEFAULT_TEXT_SIZING_ENABLED;
}
function stripOsc8ForSlice(text) {
  return text.replace(OSC8_RE, "");
}
function createWidthMeasurer(caps = {}) {
  const textEmojiWide = caps.textEmojiWide ?? true;
  const textSizingEnabled = caps.textSizingEnabled ?? false;
  const cache = new DisplayWidthCache(1e4);
  function measuredGraphemeWidth(grapheme) {
    const width = stringWidth(grapheme);
    if (width !== 1)
      return width;
    if (textEmojiWide && isTextPresentationEmoji(grapheme))
      return 2;
    if (textSizingEnabled) {
      const cp = grapheme.codePointAt(0);
      if (cp !== undefined && isPrivateUseArea(cp))
        return 2;
    }
    return width;
  }
  function measuredDisplayWidth(text) {
    const cached = cache.get(text);
    if (cached !== undefined)
      return cached;
    let width;
    const needsSlowPath = MAY_CONTAIN_TEXT_EMOJI.test(text) || textSizingEnabled && MAY_CONTAIN_PUA.test(text);
    if (!needsSlowPath) {
      width = stringWidth(text);
    } else {
      const stripped = stripAnsi4(text);
      width = 0;
      for (const grapheme of splitGraphemes(stripped)) {
        width += measuredGraphemeWidth(grapheme);
      }
    }
    cache.set(text, width);
    return width;
  }
  function measuredDisplayWidthAnsi(text) {
    return measuredDisplayWidth(stripAnsi4(text));
  }
  function measuredSliceByWidth(text, maxWidth) {
    if (hasAnsi(text)) {
      return sliceAnsi(stripOsc8ForSlice(text), 0, maxWidth);
    }
    let width = 0;
    let result = "";
    const graphemes = splitGraphemes(text);
    for (const grapheme of graphemes) {
      const gWidth = measuredGraphemeWidth(grapheme);
      if (width + gWidth > maxWidth)
        break;
      result += grapheme;
      width += gWidth;
    }
    return result;
  }
  function measuredSliceByWidthFromEnd(text, maxWidth) {
    const totalWidth = measuredDisplayWidthAnsi(text);
    if (totalWidth <= maxWidth)
      return text;
    if (hasAnsi(text)) {
      const cleaned = stripOsc8ForSlice(text);
      const cleanedWidth = measuredDisplayWidthAnsi(cleaned);
      const startIndex = cleanedWidth - maxWidth;
      return sliceAnsi(cleaned, startIndex);
    }
    const graphemes = splitGraphemes(text);
    let width = 0;
    let startIdx = graphemes.length;
    for (let i = graphemes.length - 1;i >= 0; i--) {
      const gWidth = measuredGraphemeWidth(graphemes[i]);
      if (width + gWidth > maxWidth)
        break;
      width += gWidth;
      startIdx = i;
    }
    return graphemes.slice(startIdx).join("");
  }
  function measuredWrapText(text, width, trim, hard) {
    return wrapTextWithMeasurer(text, width, measurer, trim ?? false, hard ?? false);
  }
  const measurer = {
    textEmojiWide,
    textSizingEnabled,
    displayWidth: measuredDisplayWidth,
    displayWidthAnsi: measuredDisplayWidthAnsi,
    graphemeWidth: measuredGraphemeWidth,
    wrapText: measuredWrapText,
    sliceByWidth: measuredSliceByWidth,
    sliceByWidthFromEnd: measuredSliceByWidthFromEnd
  };
  return measurer;
}
function getDefaultMeasurer() {
  if (!_defaultMeasurer) {
    _defaultMeasurer = createWidthMeasurer();
  }
  return _defaultMeasurer;
}
function splitGraphemes(text) {
  return [...segmenter2.segment(text)].map((s) => s.segment);
}
function isTextPresentationEmoji(grapheme) {
  const cp = grapheme.codePointAt(0);
  if (cp === undefined)
    return false;
  const cached = textPresentationEmojiCache.get(cp);
  if (cached !== undefined)
    return cached;
  const singleChar = String.fromCodePoint(cp);
  if (singleChar.length !== grapheme.length) {
    textPresentationEmojiCache.set(cp, false);
    return false;
  }
  const isExtPict = TEXT_PRESENTATION_EMOJI_REGEX.test(grapheme);
  const isEmojiPres = EMOJI_PRESENTATION_REGEX.test(grapheme);
  if (!isExtPict || isEmojiPres) {
    textPresentationEmojiCache.set(cp, false);
    return false;
  }
  const withVs16 = grapheme + "️";
  const result = RGI_EMOJI_REGEX.test(withVs16);
  textPresentationEmojiCache.set(cp, result);
  return result;
}
function displayWidth(text) {
  if (_scopedMeasurer)
    return _scopedMeasurer.displayWidth(text);
  const cached = displayWidthCache.get(text);
  if (cached !== undefined) {
    return cached;
  }
  let width;
  const needsSlowPath = MAY_CONTAIN_TEXT_EMOJI.test(text) || DEFAULT_TEXT_SIZING_ENABLED && MAY_CONTAIN_PUA.test(text);
  if (!needsSlowPath) {
    width = stringWidth(text);
  } else {
    const stripped = stripAnsi4(text);
    width = 0;
    for (const grapheme of splitGraphemes(stripped)) {
      width += graphemeWidth(grapheme);
    }
  }
  displayWidthCache.set(text, width);
  return width;
}
function graphemeWidth(grapheme) {
  if (_scopedMeasurer)
    return _scopedMeasurer.graphemeWidth(grapheme);
  const width = stringWidth(grapheme);
  if (width !== 1)
    return width;
  if (DEFAULT_TEXT_EMOJI_WIDE && isTextPresentationEmoji(grapheme))
    return 2;
  if (DEFAULT_TEXT_SIZING_ENABLED) {
    const cp = grapheme.codePointAt(0);
    if (cp !== undefined && isPrivateUseArea(cp))
      return 2;
  }
  return width;
}
function isWordBoundary(grapheme) {
  return grapheme === " " || grapheme === "-" || grapheme === "\t";
}
function isBreakBeforeOperatorWith(graphemes, spaceIndex, gWidthFn) {
  let j = spaceIndex + 1;
  while (j < graphemes.length && gWidthFn(graphemes[j]) === 0)
    j++;
  if (j >= graphemes.length)
    return false;
  const nextChar = graphemes[j];
  if (gWidthFn(nextChar) !== 1)
    return false;
  if (/^[a-zA-Z0-9\s]$/.test(nextChar))
    return false;
  let k = j + 1;
  while (k < graphemes.length && gWidthFn(graphemes[k]) === 0)
    k++;
  if (k >= graphemes.length)
    return false;
  return graphemes[k] === " ";
}
function canBreakAnywhere(grapheme) {
  return isCJK(grapheme);
}
function splitGraphemesAnsiAware(text) {
  if (!hasAnsi(text)) {
    return splitGraphemes(text);
  }
  const result = [];
  let pos = 0;
  while (pos < text.length) {
    if (text[pos] === "\x1B") {
      const remaining = text.slice(pos);
      const csi = remaining.match(ANSI_CSI_RE);
      if (csi) {
        result.push(csi[0]);
        pos += csi[0].length;
        continue;
      }
      const osc = remaining.match(ANSI_OSC_RE);
      if (osc) {
        result.push(osc[0]);
        pos += osc[0].length;
        continue;
      }
      const single = remaining.match(ANSI_SINGLE_RE);
      if (single) {
        result.push(single[0]);
        pos += single[0].length;
        continue;
      }
    }
    const nextEsc = text.indexOf("\x1B", pos + 1);
    const chunk = nextEsc === -1 ? text.slice(pos) : text.slice(pos, nextEsc);
    for (const g of splitGraphemes(chunk)) {
      result.push(g);
    }
    pos += chunk.length;
  }
  return result;
}
function wrapText(text, width, preserveNewlines = true, trim = false) {
  return wrapTextWithMeasurer(text, width, _scopedMeasurer ?? undefined, trim, false, preserveNewlines);
}
function wrapTextWithMeasurer(text, width, measurer, trim = false, _hard = false, preserveNewlines = true) {
  if (width <= 0) {
    return [];
  }
  const gWidthFn = measurer ? measurer.graphemeWidth.bind(measurer) : graphemeWidth;
  const lines = [];
  const inputLines = preserveNewlines ? text.split(`
`) : [text.replace(/\n/g, " ")];
  for (const line of inputLines) {
    if (line === "") {
      lines.push("");
      continue;
    }
    const graphemes = splitGraphemesAnsiAware(line);
    let currentLine = "";
    let currentWidth = 0;
    let isFirstLineOfParagraph = true;
    let lastBreakIndex = -1;
    let lastBreakWidth = 0;
    let lastBreakGraphemeIndex = -1;
    for (let i = 0;i < graphemes.length; i++) {
      const grapheme = graphemes[i];
      const gWidth = gWidthFn(grapheme);
      if (gWidth === 0) {
        currentLine += grapheme;
        continue;
      }
      if (trim && !isFirstLineOfParagraph && currentWidth === 0 && isWordBoundary(grapheme) && grapheme !== "-") {
        continue;
      }
      if (isWordBoundary(grapheme)) {
        if (currentWidth + gWidth <= width) {
          currentLine += grapheme;
          currentWidth += gWidth;
          if (grapheme !== " " || !isBreakBeforeOperatorWith(graphemes, i, gWidthFn)) {
            lastBreakIndex = currentLine.length;
            lastBreakWidth = currentWidth;
            lastBreakGraphemeIndex = i + 1;
          }
          continue;
        }
        if (currentLine) {
          let lineToAdd = currentLine;
          if (trim)
            lineToAdd = lineToAdd.trimEnd();
          lines.push(lineToAdd);
          isFirstLineOfParagraph = false;
        }
        currentLine = "";
        currentWidth = 0;
        lastBreakIndex = -1;
        lastBreakWidth = 0;
        lastBreakGraphemeIndex = -1;
        continue;
      } else if (canBreakAnywhere(grapheme)) {
        lastBreakIndex = currentLine.length;
        lastBreakWidth = currentWidth;
        lastBreakGraphemeIndex = i;
      }
      if (currentWidth + gWidth > width) {
        if (lastBreakIndex > 0) {
          let lineToAdd = currentLine.slice(0, lastBreakIndex);
          if (trim)
            lineToAdd = lineToAdd.trimEnd();
          lines.push(lineToAdd);
          isFirstLineOfParagraph = false;
          currentLine = currentLine.slice(lastBreakIndex);
          currentWidth = currentWidth - lastBreakWidth;
          i = lastBreakGraphemeIndex - 1;
          currentLine = "";
          currentWidth = 0;
          lastBreakIndex = -1;
          lastBreakWidth = 0;
          lastBreakGraphemeIndex = -1;
        } else {
          if (currentLine) {
            if (trim)
              currentLine = currentLine.trimEnd();
            lines.push(currentLine);
            isFirstLineOfParagraph = false;
          }
          currentLine = grapheme;
          currentWidth = gWidth;
          lastBreakIndex = -1;
          lastBreakWidth = 0;
          lastBreakGraphemeIndex = -1;
        }
      } else {
        currentLine += grapheme;
        currentWidth += gWidth;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }
  if (text.includes("\x1B]8;;")) {
    fixOsc8AcrossWrappedLines(lines);
  }
  return lines;
}
function fixOsc8AcrossWrappedLines(lines) {
  let activeHref = null;
  for (let i = 0;i < lines.length; i++) {
    let line = lines[i];
    if (activeHref !== null) {
      line = `\x1B]8;;${activeHref}\x1B\\` + line;
    }
    let lineHref = activeHref;
    const osc8Matches = line.matchAll(/\x1b\]8;;([^\x07\x1b]*)(?:\x07|\x1b\\)/g);
    for (const m of osc8Matches) {
      lineHref = m[1] === "" ? null : m[1];
    }
    if (lineHref !== null) {
      line += "\x1B]8;;\x1B\\";
    }
    lines[i] = line;
    activeHref = lineHref;
  }
}
function sliceByWidth(text, maxWidth) {
  return (_scopedMeasurer ?? getDefaultMeasurer()).sliceByWidth(text, maxWidth);
}
function sliceByWidthFromEnd(text, maxWidth) {
  return (_scopedMeasurer ?? getDefaultMeasurer()).sliceByWidthFromEnd(text, maxWidth);
}
function stripAnsi4(text) {
  return text.replace(/\x1b\[[0-9;:?]*[A-Za-z]/g, "").replace(/\x9b[0-9;:?]*[A-Za-z]/g, "").replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "").replace(/\x9d[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c)/g, "").replace(/\x1b[DME78]/g, "").replace(/\x1b\(B/g, "");
}
function displayWidthAnsi(text) {
  return displayWidth(stripAnsi4(text));
}
function hasAnsi(text) {
  return ANSI_TEST_REGEX.test(text);
}
function getFirstCodePoint(str) {
  const cp = str.codePointAt(0);
  return cp ?? 0;
}
function isCJK(grapheme) {
  const cp = getFirstCodePoint(grapheme);
  return CHAR_RANGES.isCJK(cp) || CHAR_RANGES.isJapaneseKana(cp) || CHAR_RANGES.isHangul(cp);
}
var segmenter2, displayWidthCache, DEFAULT_TEXT_EMOJI_WIDE = true, DEFAULT_TEXT_SIZING_ENABLED = false, _scopedMeasurer = null, OSC8_RE, _defaultMeasurer, TEXT_PRESENTATION_EMOJI_REGEX, EMOJI_PRESENTATION_REGEX, RGI_EMOJI_REGEX, textPresentationEmojiCache, MAY_CONTAIN_TEXT_EMOJI, MAY_CONTAIN_PUA, ANSI_CSI_RE, ANSI_OSC_RE, ANSI_SINGLE_RE, ANSI_TEST_REGEX, CHAR_RANGES;
var init_unicode = __esm(() => {
  init_ansi2();
  init_slice_ansi();
  init_string_width();
  init_buffer();
  init_text_sizing();
  segmenter2 = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  displayWidthCache = new DisplayWidthCache(1e4);
  OSC8_RE = /\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g;
  TEXT_PRESENTATION_EMOJI_REGEX = /^\p{Extended_Pictographic}$/u;
  EMOJI_PRESENTATION_REGEX = /^\p{Emoji_Presentation}$/u;
  RGI_EMOJI_REGEX = /^\p{RGI_Emoji}$/v;
  textPresentationEmojiCache = new Map;
  MAY_CONTAIN_TEXT_EMOJI = /[\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u2328\u23CF\u23ED-\u23EF\u23F1\u23F2\u23F8-\u23FA\u25AA\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u261D\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692-\u2697\u2699\u269B\u269C\u26A0\u26A1\u26A7\u26AA\u26AB\u26B0\u26B1\u26BD\u26BE\u26C4\u26C5\u26C8\u26CE\u26CF\u26D1\u26D3\u26D4\u26E9\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]/;
  MAY_CONTAIN_PUA = /[\uE000-\uF8FF]/;
  ANSI_CSI_RE = /^\x1b\[[0-9;:?]*[A-Za-z]/;
  ANSI_OSC_RE = /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/;
  ANSI_SINGLE_RE = /^\x1b[DME78(B]/;
  ANSI_TEST_REGEX = /\x1b(?:\[[0-9;:]*[A-Za-z]|\])|\x9b[\x30-\x3f]*[\x40-\x7e]|\x9d/;
  CHAR_RANGES = {
    isBasicLatin: (cp) => cp >= 32 && cp <= 127,
    isCJK: (cp) => cp >= 19968 && cp <= 40959 || cp >= 13312 && cp <= 19903 || cp >= 131072 && cp <= 173791 || cp >= 63744 && cp <= 64255 || cp >= 194560 && cp <= 195103,
    isJapaneseKana: (cp) => cp >= 12352 && cp <= 12447 || cp >= 12448 && cp <= 12543,
    isHangul: (cp) => cp >= 44032 && cp <= 55203 || cp >= 4352 && cp <= 4607,
    isEmoji: (cp) => cp >= 128512 && cp <= 128591 || cp >= 127744 && cp <= 128511 || cp >= 128640 && cp <= 128767 || cp >= 128768 && cp <= 128895 || cp >= 129280 && cp <= 129535 || cp >= 9728 && cp <= 9983 || cp >= 9984 && cp <= 10175
  };
});

// packages/theme/src/color.ts
function hexToRgb(hex) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match)
    return null;
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}
function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`.toUpperCase();
}
function blend(a, b, t) {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB)
    return a;
  return rgbToHex(rgbA[0] + (rgbB[0] - rgbA[0]) * t, rgbA[1] + (rgbB[1] - rgbA[1]) * t, rgbA[2] + (rgbB[2] - rgbA[2]) * t);
}
function brighten(color, amount) {
  return blend(color, "#FFFFFF", amount);
}
function contrastFg(bg) {
  const rgb = hexToRgb(bg);
  if (!rgb)
    return "#FFFFFF";
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? "#000000" : "#FFFFFF";
}
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min)
    return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r)
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g)
    h = ((b - r) / d + 2) / 6;
  else
    h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}
function hslToHex(h, s, l) {
  h = (h % 360 + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
function hexToHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb)
    return null;
  return rgbToHsl(rgb[0], rgb[1], rgb[2]);
}
function complement(color) {
  const hsl = hexToHsl(color);
  if (!hsl)
    return color;
  const [h, s, l] = hsl;
  return hslToHex(h + 180, s, l);
}

// packages/theme/src/contrast.ts
function channelLuminance(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb)
    return null;
  return 0.2126 * channelLuminance(rgb[0]) + 0.7152 * channelLuminance(rgb[1]) + 0.0722 * channelLuminance(rgb[2]);
}
function checkContrast(fg, bg) {
  const fgLum = relativeLuminance(fg);
  const bgLum = relativeLuminance(bg);
  if (fgLum === null || bgLum === null)
    return null;
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return {
    ratio,
    aa: ratio >= 4.5,
    aaa: ratio >= 7
  };
}
function ensureContrast(color, against, minRatio) {
  const current = checkContrast(color, against);
  if (!current)
    return color;
  if (current.ratio >= minRatio)
    return color;
  const hsl = hexToHsl(color);
  if (!hsl)
    return color;
  const [h, s] = hsl;
  const lightBg = contrastFg(against) === "#000000";
  let lo, hi;
  if (lightBg) {
    lo = 0;
    hi = hsl[2];
  } else {
    lo = hsl[2];
    hi = 1;
  }
  for (let i = 0;i < 20; i++) {
    const mid = (lo + hi) / 2;
    const candidate = hslToHex(h, s, mid);
    const r = checkContrast(candidate, against);
    if (!r)
      break;
    if (lightBg) {
      if (r.ratio >= minRatio)
        lo = mid;
      else
        hi = mid;
    } else {
      if (r.ratio >= minRatio)
        hi = mid;
      else
        lo = mid;
    }
  }
  return hslToHex(h, s, lightBg ? lo : hi);
}
var init_contrast = () => {};

// packages/theme/src/derive.ts
function deriveTheme(palette, mode = "truecolor", adjustments) {
  if (mode === "ansi16")
    return deriveAnsi16Theme(palette);
  return deriveTruecolorTheme(palette, adjustments);
}
function deriveTruecolorTheme(p, adjustments) {
  const dark = p.dark ?? true;
  const bg = p.background;
  function ensure(token, color, against, target) {
    const result = ensureContrast(color, against, target);
    if (adjustments && result !== color) {
      const before = checkContrast(color, against);
      const after = checkContrast(result, against);
      adjustments.push({
        token,
        from: color,
        to: result,
        against,
        target,
        ratioBefore: before?.ratio ?? 0,
        ratioAfter: after?.ratio ?? 0
      });
    }
    return result;
  }
  const surfacebg = blend(bg, p.foreground, 0.05);
  const popoverbg = blend(bg, p.foreground, 0.08);
  const fg = ensure("fg", p.foreground, popoverbg, AA);
  const primary = ensure("primary", p.primary ?? (dark ? p.yellow : p.blue), bg, AA);
  const accent = ensure("accent", complement(primary), bg, AA);
  const secondary = ensure("secondary", blend(primary, accent, 0.35), bg, AA);
  const error = ensure("error", p.red, bg, AA);
  const warning = ensure("warning", p.yellow, bg, AA);
  const success = ensure("success", p.green, bg, AA);
  const info = ensure("info", blend(fg, accent, 0.5), bg, AA);
  const link = ensure("link", dark ? p.brightBlue : p.blue, bg, AA);
  const mutedbg = blend(bg, p.foreground, 0.04);
  const muted = ensure("muted", blend(fg, bg, 0.4), mutedbg, AA);
  const disabledfg = ensure("disabledfg", blend(fg, bg, 0.5), bg, DIM);
  const border = ensure("border", blend(bg, p.foreground, 0.15), bg, FAINT);
  const inputborder = ensure("inputborder", blend(bg, p.foreground, 0.25), bg, CONTROL);
  const selection = ensure("selection", p.selectionForeground, p.selectionBackground, AA);
  const cursor = ensure("cursor", p.cursorText, p.cursorColor, AA);
  return {
    name: p.name ?? (dark ? "derived-dark" : "derived-light"),
    bg,
    fg,
    muted,
    mutedbg,
    surface: fg,
    surfacebg,
    popover: fg,
    popoverbg,
    inverse: contrastFg(blend(fg, bg, 0.1)),
    inversebg: blend(fg, bg, 0.1),
    cursor,
    cursorbg: p.cursorColor,
    selection,
    selectionbg: p.selectionBackground,
    primary,
    primaryfg: contrastFg(primary),
    secondary,
    secondaryfg: contrastFg(secondary),
    accent,
    accentfg: contrastFg(accent),
    error,
    errorfg: contrastFg(error),
    warning,
    warningfg: contrastFg(warning),
    success,
    successfg: contrastFg(success),
    info,
    infofg: contrastFg(info),
    border,
    inputborder,
    focusborder: link,
    link,
    disabledfg,
    palette: [
      p.black,
      p.red,
      p.green,
      p.yellow,
      p.blue,
      p.magenta,
      p.cyan,
      p.white,
      p.brightBlack,
      p.brightRed,
      p.brightGreen,
      p.brightYellow,
      p.brightBlue,
      p.brightMagenta,
      p.brightCyan,
      p.brightWhite
    ]
  };
}
function deriveAnsi16Theme(p) {
  const dark = p.dark ?? true;
  const primaryColor = dark ? p.yellow : p.blue;
  return {
    name: p.name ?? (dark ? "derived-ansi16-dark" : "derived-ansi16-light"),
    bg: p.background,
    fg: p.foreground,
    muted: p.white,
    mutedbg: p.black,
    surface: p.foreground,
    surfacebg: p.black,
    popover: p.foreground,
    popoverbg: p.black,
    inverse: p.black,
    inversebg: p.brightWhite,
    cursor: p.cursorText,
    cursorbg: p.cursorColor,
    selection: p.selectionForeground,
    selectionbg: p.selectionBackground,
    primary: primaryColor,
    primaryfg: p.black,
    secondary: p.magenta,
    secondaryfg: p.black,
    accent: p.cyan,
    accentfg: p.black,
    error: dark ? p.brightRed : p.red,
    errorfg: p.black,
    warning: p.yellow,
    warningfg: p.black,
    success: dark ? p.brightGreen : p.green,
    successfg: p.black,
    info: p.cyan,
    infofg: p.black,
    border: p.brightBlack,
    inputborder: p.brightBlack,
    focusborder: dark ? p.brightBlue : p.blue,
    link: dark ? p.brightBlue : p.blue,
    disabledfg: p.brightBlack,
    palette: [
      p.black,
      p.red,
      p.green,
      p.yellow,
      p.blue,
      p.magenta,
      p.cyan,
      p.white,
      p.brightBlack,
      p.brightRed,
      p.brightGreen,
      p.brightYellow,
      p.brightBlue,
      p.brightMagenta,
      p.brightCyan,
      p.brightWhite
    ]
  };
}
var AA = 4.5, DIM = 3, FAINT = 1.5, CONTROL = 3;
var init_derive = __esm(() => {
  init_contrast();
});

// packages/theme/src/palettes/catppuccin.ts
var catppuccinMocha, catppuccinFrappe, catppuccinMacchiato, catppuccinLatte;
var init_catppuccin = __esm(() => {
  catppuccinMocha = {
    name: "catppuccin-mocha",
    dark: true,
    black: "#11111B",
    red: "#F38BA8",
    green: "#A6E3A1",
    yellow: "#F9E2AF",
    blue: "#89B4FA",
    magenta: "#CBA6F7",
    cyan: "#94E2D5",
    white: "#A6ADC8",
    brightBlack: "#313244",
    brightRed: "#FAB387",
    brightGreen: brighten("#A6E3A1", 0.15),
    brightYellow: brighten("#F9E2AF", 0.15),
    brightBlue: brighten("#89B4FA", 0.15),
    brightMagenta: "#F5C2E7",
    brightCyan: brighten("#94E2D5", 0.15),
    brightWhite: "#CDD6F4",
    foreground: "#CDD6F4",
    background: "#1E1E2E",
    cursorColor: "#CDD6F4",
    cursorText: "#1E1E2E",
    selectionBackground: "#6C7086",
    selectionForeground: "#CDD6F4"
  };
  catppuccinFrappe = {
    name: "catppuccin-frappe",
    dark: true,
    black: "#232634",
    red: "#E78284",
    green: "#A6D189",
    yellow: "#E5C890",
    blue: "#8CAAEE",
    magenta: "#CA9EE6",
    cyan: "#81C8BE",
    white: "#A5ADCE",
    brightBlack: "#414559",
    brightRed: "#EF9F76",
    brightGreen: brighten("#A6D189", 0.15),
    brightYellow: brighten("#E5C890", 0.15),
    brightBlue: brighten("#8CAAEE", 0.15),
    brightMagenta: "#F4B8E4",
    brightCyan: brighten("#81C8BE", 0.15),
    brightWhite: "#C6D0F5",
    foreground: "#C6D0F5",
    background: "#303446",
    cursorColor: "#C6D0F5",
    cursorText: "#303446",
    selectionBackground: "#737994",
    selectionForeground: "#C6D0F5"
  };
  catppuccinMacchiato = {
    name: "catppuccin-macchiato",
    dark: true,
    black: "#181926",
    red: "#ED8796",
    green: "#A6DA95",
    yellow: "#EED49F",
    blue: "#8AADF4",
    magenta: "#C6A0F6",
    cyan: "#8BD5CA",
    white: "#A5ADCB",
    brightBlack: "#363A4F",
    brightRed: "#F5A97F",
    brightGreen: brighten("#A6DA95", 0.15),
    brightYellow: brighten("#EED49F", 0.15),
    brightBlue: brighten("#8AADF4", 0.15),
    brightMagenta: "#F5BDE6",
    brightCyan: brighten("#8BD5CA", 0.15),
    brightWhite: "#CAD3F5",
    foreground: "#CAD3F5",
    background: "#24273A",
    cursorColor: "#CAD3F5",
    cursorText: "#24273A",
    selectionBackground: "#6E738D",
    selectionForeground: "#CAD3F5"
  };
  catppuccinLatte = {
    name: "catppuccin-latte",
    dark: false,
    black: "#DCE0E8",
    red: "#D20F39",
    green: "#40A02B",
    yellow: "#DF8E1D",
    blue: "#1E66F5",
    magenta: "#8839EF",
    cyan: "#179299",
    white: "#6C6F85",
    brightBlack: "#CCD0DA",
    brightRed: "#FE640B",
    brightGreen: brighten("#40A02B", 0.15),
    brightYellow: brighten("#DF8E1D", 0.15),
    brightBlue: brighten("#1E66F5", 0.15),
    brightMagenta: "#EA76CB",
    brightCyan: brighten("#179299", 0.15),
    brightWhite: "#4C4F69",
    foreground: "#4C4F69",
    background: "#EFF1F5",
    cursorColor: "#4C4F69",
    cursorText: "#EFF1F5",
    selectionBackground: "#9CA0B0",
    selectionForeground: "#4C4F69"
  };
});

// packages/theme/src/palettes/nord.ts
var nord;
var init_nord = __esm(() => {
  nord = {
    name: "nord",
    dark: true,
    black: "#2E3440",
    red: "#BF616A",
    green: "#A3BE8C",
    yellow: "#EBCB8B",
    blue: "#5E81AC",
    magenta: "#B48EAD",
    cyan: "#8FBCBB",
    white: "#D8DEE9",
    brightBlack: "#3B4252",
    brightRed: "#D08770",
    brightGreen: brighten("#A3BE8C", 0.15),
    brightYellow: brighten("#EBCB8B", 0.15),
    brightBlue: brighten("#5E81AC", 0.15),
    brightMagenta: "#B48EAD",
    brightCyan: brighten("#8FBCBB", 0.15),
    brightWhite: "#ECEFF4",
    foreground: "#ECEFF4",
    background: "#2E3440",
    cursorColor: "#ECEFF4",
    cursorText: "#2E3440",
    selectionBackground: "#4C566A",
    selectionForeground: "#ECEFF4"
  };
});

// packages/theme/src/palettes/dracula.ts
var dracula;
var init_dracula = __esm(() => {
  dracula = {
    name: "dracula",
    dark: true,
    black: "#21222C",
    red: "#FF5555",
    green: "#50FA7B",
    yellow: "#F1FA8C",
    blue: "#BD93F9",
    magenta: "#BD93F9",
    cyan: "#8BE9FD",
    white: "#6272A4",
    brightBlack: "#44475A",
    brightRed: "#FFB86C",
    brightGreen: brighten("#50FA7B", 0.15),
    brightYellow: brighten("#F1FA8C", 0.15),
    brightBlue: brighten("#BD93F9", 0.15),
    brightMagenta: "#FF79C6",
    brightCyan: brighten("#8BE9FD", 0.15),
    brightWhite: "#F8F8F2",
    foreground: "#F8F8F2",
    background: "#282A36",
    cursorColor: "#F8F8F2",
    cursorText: "#282A36",
    selectionBackground: "#6272A4",
    selectionForeground: "#F8F8F2"
  };
});

// packages/theme/src/palettes/solarized.ts
var solarizedDark, solarizedLight;
var init_solarized = __esm(() => {
  solarizedDark = {
    name: "solarized-dark",
    dark: true,
    black: "#002B36",
    red: "#DC322F",
    green: "#859900",
    yellow: "#B58900",
    blue: "#268BD2",
    magenta: "#6C71C4",
    cyan: "#2AA198",
    white: "#839496",
    brightBlack: "#586E75",
    brightRed: "#CB4B16",
    brightGreen: brighten("#859900", 0.15),
    brightYellow: brighten("#B58900", 0.15),
    brightBlue: brighten("#268BD2", 0.15),
    brightMagenta: "#D33682",
    brightCyan: brighten("#2AA198", 0.15),
    brightWhite: "#FDF6E3",
    foreground: "#FDF6E3",
    background: "#073642",
    cursorColor: "#FDF6E3",
    cursorText: "#073642",
    selectionBackground: "#657B83",
    selectionForeground: "#FDF6E3"
  };
  solarizedLight = {
    name: "solarized-light",
    dark: false,
    black: "#FDF6E3",
    red: "#DC322F",
    green: "#859900",
    yellow: "#B58900",
    blue: "#268BD2",
    magenta: "#6C71C4",
    cyan: "#2AA198",
    white: "#657B83",
    brightBlack: "#DDD6C1",
    brightRed: "#CB4B16",
    brightGreen: brighten("#859900", 0.15),
    brightYellow: brighten("#B58900", 0.15),
    brightBlue: brighten("#268BD2", 0.15),
    brightMagenta: "#D33682",
    brightCyan: brighten("#2AA198", 0.15),
    brightWhite: "#073642",
    foreground: "#073642",
    background: "#EEE8D5",
    cursorColor: "#073642",
    cursorText: "#EEE8D5",
    selectionBackground: "#93A1A1",
    selectionForeground: "#073642"
  };
});

// packages/theme/src/palettes/tokyo-night.ts
var tokyoNight, tokyoNightStorm, tokyoNightDay;
var init_tokyo_night = __esm(() => {
  tokyoNight = {
    name: "tokyo-night",
    dark: true,
    black: "#1A1B26",
    red: "#F7768E",
    green: "#9ECE6A",
    yellow: "#E0AF68",
    blue: "#7AA2F7",
    magenta: "#BB9AF7",
    cyan: "#73DACA",
    white: "#A9B1D6",
    brightBlack: "#292E42",
    brightRed: "#FF9E64",
    brightGreen: brighten("#9ECE6A", 0.15),
    brightYellow: brighten("#E0AF68", 0.15),
    brightBlue: brighten("#7AA2F7", 0.15),
    brightMagenta: "#FF007C",
    brightCyan: brighten("#73DACA", 0.15),
    brightWhite: "#C0CAF5",
    foreground: "#C0CAF5",
    background: "#24283B",
    cursorColor: "#C0CAF5",
    cursorText: "#24283B",
    selectionBackground: "#545C7E",
    selectionForeground: "#C0CAF5"
  };
  tokyoNightStorm = {
    name: "tokyo-night-storm",
    dark: true,
    black: "#1F2335",
    red: "#F7768E",
    green: "#9ECE6A",
    yellow: "#E0AF68",
    blue: "#7AA2F7",
    magenta: "#BB9AF7",
    cyan: "#73DACA",
    white: "#A9B1D6",
    brightBlack: "#292E42",
    brightRed: "#FF9E64",
    brightGreen: brighten("#9ECE6A", 0.15),
    brightYellow: brighten("#E0AF68", 0.15),
    brightBlue: brighten("#7AA2F7", 0.15),
    brightMagenta: "#FF007C",
    brightCyan: brighten("#73DACA", 0.15),
    brightWhite: "#C0CAF5",
    foreground: "#C0CAF5",
    background: "#24283B",
    cursorColor: "#C0CAF5",
    cursorText: "#24283B",
    selectionBackground: "#545C7E",
    selectionForeground: "#C0CAF5"
  };
  tokyoNightDay = {
    name: "tokyo-night-day",
    dark: false,
    black: "#E1E2E7",
    red: "#F52A65",
    green: "#587539",
    yellow: "#8C6C3E",
    blue: "#2E7DE9",
    magenta: "#9854F1",
    cyan: "#118C74",
    white: "#6172B0",
    brightBlack: "#C4C5CB",
    brightRed: "#B15C00",
    brightGreen: brighten("#587539", 0.15),
    brightYellow: brighten("#8C6C3E", 0.15),
    brightBlue: brighten("#2E7DE9", 0.15),
    brightMagenta: "#F52A65",
    brightCyan: brighten("#118C74", 0.15),
    brightWhite: "#3760BF",
    foreground: "#3760BF",
    background: "#D5D6DB",
    cursorColor: "#3760BF",
    cursorText: "#D5D6DB",
    selectionBackground: "#9699A3",
    selectionForeground: "#3760BF"
  };
});

// packages/theme/src/palettes/one-dark.ts
var oneDark;
var init_one_dark = __esm(() => {
  oneDark = {
    name: "one-dark",
    dark: true,
    black: "#21252B",
    red: "#E06C75",
    green: "#98C379",
    yellow: "#E5C07B",
    blue: "#61AFEF",
    magenta: "#C678DD",
    cyan: "#56B6C2",
    white: "#ABB2BF",
    brightBlack: "#2C313A",
    brightRed: "#D19A66",
    brightGreen: brighten("#98C379", 0.15),
    brightYellow: brighten("#E5C07B", 0.15),
    brightBlue: brighten("#61AFEF", 0.15),
    brightMagenta: "#E06C75",
    brightCyan: brighten("#56B6C2", 0.15),
    brightWhite: "#ABB2BF",
    foreground: "#ABB2BF",
    background: "#282C34",
    cursorColor: "#ABB2BF",
    cursorText: "#282C34",
    selectionBackground: "#5C6370",
    selectionForeground: "#ABB2BF"
  };
});

// packages/theme/src/palettes/gruvbox.ts
var gruvboxDark, gruvboxLight;
var init_gruvbox = __esm(() => {
  gruvboxDark = {
    name: "gruvbox-dark",
    dark: true,
    black: "#1D2021",
    red: "#FB4934",
    green: "#B8BB26",
    yellow: "#FABD2F",
    blue: "#83A598",
    magenta: "#D3869B",
    cyan: "#8EC07C",
    white: "#BDAE93",
    brightBlack: "#3C3836",
    brightRed: "#FE8019",
    brightGreen: brighten("#B8BB26", 0.15),
    brightYellow: brighten("#FABD2F", 0.15),
    brightBlue: brighten("#83A598", 0.15),
    brightMagenta: "#D3869B",
    brightCyan: brighten("#8EC07C", 0.15),
    brightWhite: "#EBDBB2",
    foreground: "#EBDBB2",
    background: "#282828",
    cursorColor: "#EBDBB2",
    cursorText: "#282828",
    selectionBackground: "#665C54",
    selectionForeground: "#EBDBB2"
  };
  gruvboxLight = {
    name: "gruvbox-light",
    dark: false,
    black: "#F9F5D7",
    red: "#CC241D",
    green: "#98971A",
    yellow: "#D79921",
    blue: "#458588",
    magenta: "#B16286",
    cyan: "#689D6A",
    white: "#665C54",
    brightBlack: "#EBDBB2",
    brightRed: "#D65D0E",
    brightGreen: brighten("#98971A", 0.15),
    brightYellow: brighten("#D79921", 0.15),
    brightBlue: brighten("#458588", 0.15),
    brightMagenta: "#B16286",
    brightCyan: brighten("#689D6A", 0.15),
    brightWhite: "#3C3836",
    foreground: "#3C3836",
    background: "#FBF1C7",
    cursorColor: "#3C3836",
    cursorText: "#FBF1C7",
    selectionBackground: "#A89984",
    selectionForeground: "#3C3836"
  };
});

// packages/theme/src/palettes/rose-pine.ts
var rosePine, rosePineMoon, rosePineDawn;
var init_rose_pine = __esm(() => {
  rosePine = {
    name: "rose-pine",
    dark: true,
    black: "#191724",
    red: "#EB6F92",
    green: "#31748F",
    yellow: "#F6C177",
    blue: "#3E8FB0",
    magenta: "#C4A7E7",
    cyan: "#9CCFD8",
    white: "#908CAA",
    brightBlack: "#26233A",
    brightRed: "#EA9A97",
    brightGreen: brighten("#31748F", 0.15),
    brightYellow: brighten("#F6C177", 0.15),
    brightBlue: brighten("#3E8FB0", 0.15),
    brightMagenta: "#EBBCBA",
    brightCyan: brighten("#9CCFD8", 0.15),
    brightWhite: "#E0DEF4",
    foreground: "#E0DEF4",
    background: "#1F1D2E",
    cursorColor: "#E0DEF4",
    cursorText: "#1F1D2E",
    selectionBackground: "#6E6A86",
    selectionForeground: "#E0DEF4"
  };
  rosePineMoon = {
    name: "rose-pine-moon",
    dark: true,
    black: "#232136",
    red: "#EB6F92",
    green: "#3E8FB0",
    yellow: "#F6C177",
    blue: "#3E8FB0",
    magenta: "#C4A7E7",
    cyan: "#9CCFD8",
    white: "#908CAA",
    brightBlack: "#393552",
    brightRed: "#EA9A97",
    brightGreen: brighten("#3E8FB0", 0.15),
    brightYellow: brighten("#F6C177", 0.15),
    brightBlue: brighten("#3E8FB0", 0.15),
    brightMagenta: "#EA9A97",
    brightCyan: brighten("#9CCFD8", 0.15),
    brightWhite: "#E0DEF4",
    foreground: "#E0DEF4",
    background: "#2A273F",
    cursorColor: "#E0DEF4",
    cursorText: "#2A273F",
    selectionBackground: "#6E6A86",
    selectionForeground: "#E0DEF4"
  };
  rosePineDawn = {
    name: "rose-pine-dawn",
    dark: false,
    black: "#FAF4ED",
    red: "#B4637A",
    green: "#286983",
    yellow: "#EA9D34",
    blue: "#286983",
    magenta: "#907AA9",
    cyan: "#56949F",
    white: "#797593",
    brightBlack: "#F2E9E1",
    brightRed: "#D7827E",
    brightGreen: brighten("#286983", 0.15),
    brightYellow: brighten("#EA9D34", 0.15),
    brightBlue: brighten("#286983", 0.15),
    brightMagenta: "#D7827E",
    brightCyan: brighten("#56949F", 0.15),
    brightWhite: "#575279",
    foreground: "#575279",
    background: "#FFFAF3",
    cursorColor: "#575279",
    cursorText: "#FFFAF3",
    selectionBackground: "#9893A5",
    selectionForeground: "#575279"
  };
});

// packages/theme/src/palettes/kanagawa.ts
var kanagawaWave, kanagawaDragon, kanagawaLotus;
var init_kanagawa = __esm(() => {
  kanagawaWave = {
    name: "kanagawa-wave",
    dark: true,
    black: "#16161D",
    red: "#C34043",
    green: "#98BB6C",
    yellow: "#E6C384",
    blue: "#7E9CD8",
    magenta: "#957FB8",
    cyan: "#6A9589",
    white: "#727169",
    brightBlack: "#2A2A37",
    brightRed: "#FFA066",
    brightGreen: brighten("#98BB6C", 0.15),
    brightYellow: brighten("#E6C384", 0.15),
    brightBlue: brighten("#7E9CD8", 0.15),
    brightMagenta: "#D27E99",
    brightCyan: brighten("#6A9589", 0.15),
    brightWhite: "#DCD7BA",
    foreground: "#DCD7BA",
    background: "#1F1F28",
    cursorColor: "#DCD7BA",
    cursorText: "#1F1F28",
    selectionBackground: "#54546D",
    selectionForeground: "#DCD7BA"
  };
  kanagawaDragon = {
    name: "kanagawa-dragon",
    dark: true,
    black: "#0d0c0c",
    red: "#c4746e",
    green: "#87a987",
    yellow: "#c4b28a",
    blue: "#8ba4b0",
    magenta: "#8992a7",
    cyan: "#8ea4a2",
    white: "#737c73",
    brightBlack: "#282727",
    brightRed: "#b6927b",
    brightGreen: brighten("#87a987", 0.15),
    brightYellow: brighten("#c4b28a", 0.15),
    brightBlue: brighten("#8ba4b0", 0.15),
    brightMagenta: "#a292a3",
    brightCyan: brighten("#8ea4a2", 0.15),
    brightWhite: "#c5c9c5",
    foreground: "#c5c9c5",
    background: "#181616",
    cursorColor: "#c5c9c5",
    cursorText: "#181616",
    selectionBackground: "#625e5a",
    selectionForeground: "#c5c9c5"
  };
  kanagawaLotus = {
    name: "kanagawa-lotus",
    dark: false,
    black: "#e5ddb0",
    red: "#c84053",
    green: "#6f894e",
    yellow: "#de9800",
    blue: "#4d699b",
    magenta: "#624c83",
    cyan: "#597b75",
    white: "#716e61",
    brightBlack: "#dcd5ac",
    brightRed: "#cc6d00",
    brightGreen: brighten("#6f894e", 0.15),
    brightYellow: brighten("#de9800", 0.15),
    brightBlue: brighten("#4d699b", 0.15),
    brightMagenta: "#b35b79",
    brightCyan: brighten("#597b75", 0.15),
    brightWhite: "#545464",
    foreground: "#545464",
    background: "#f2ecbc",
    cursorColor: "#545464",
    cursorText: "#f2ecbc",
    selectionBackground: "#8a8980",
    selectionForeground: "#545464"
  };
});

// packages/theme/src/palettes/everforest.ts
var everforestDark, everforestLight;
var init_everforest = __esm(() => {
  everforestDark = {
    name: "everforest-dark",
    dark: true,
    black: "#232a2e",
    red: "#e67e80",
    green: "#a7c080",
    yellow: "#dbbc7f",
    blue: "#7fbbb3",
    magenta: "#d699b6",
    cyan: "#83c092",
    white: "#859289",
    brightBlack: "#343f44",
    brightRed: "#e69875",
    brightGreen: brighten("#a7c080", 0.15),
    brightYellow: brighten("#dbbc7f", 0.15),
    brightBlue: brighten("#7fbbb3", 0.15),
    brightMagenta: "#e67e80",
    brightCyan: brighten("#83c092", 0.15),
    brightWhite: "#d3c6aa",
    foreground: "#d3c6aa",
    background: "#2d353b",
    cursorColor: "#d3c6aa",
    cursorText: "#2d353b",
    selectionBackground: "#4f585e",
    selectionForeground: "#d3c6aa"
  };
  everforestLight = {
    name: "everforest-light",
    dark: false,
    black: "#efebd4",
    red: "#f85552",
    green: "#8da101",
    yellow: "#dfa000",
    blue: "#3a94c5",
    magenta: "#df69ba",
    cyan: "#35a77c",
    white: "#939f91",
    brightBlack: "#f4f0d9",
    brightRed: "#f57d26",
    brightGreen: brighten("#8da101", 0.15),
    brightYellow: brighten("#dfa000", 0.15),
    brightBlue: brighten("#3a94c5", 0.15),
    brightMagenta: "#f85552",
    brightCyan: brighten("#35a77c", 0.15),
    brightWhite: "#5c6a72",
    foreground: "#5c6a72",
    background: "#fdf6e3",
    cursorColor: "#5c6a72",
    cursorText: "#fdf6e3",
    selectionBackground: "#e0dcc7",
    selectionForeground: "#5c6a72"
  };
});

// packages/theme/src/palettes/monokai.ts
var monokai, monokaiPro;
var init_monokai = __esm(() => {
  monokai = {
    name: "monokai",
    dark: true,
    black: "#1a1a1a",
    red: "#F92672",
    green: "#A6E22E",
    yellow: "#E6DB74",
    blue: "#66D9EF",
    magenta: "#AE81FF",
    cyan: "#66D9EF",
    white: "#a59f85",
    brightBlack: "#3e3d32",
    brightRed: "#FD971F",
    brightGreen: brighten("#A6E22E", 0.15),
    brightYellow: brighten("#E6DB74", 0.15),
    brightBlue: brighten("#66D9EF", 0.15),
    brightMagenta: "#F92672",
    brightCyan: brighten("#66D9EF", 0.15),
    brightWhite: "#F8F8F2",
    foreground: "#F8F8F2",
    background: "#272822",
    cursorColor: "#F8F8F2",
    cursorText: "#272822",
    selectionBackground: "#75715E",
    selectionForeground: "#F8F8F2"
  };
  monokaiPro = {
    name: "monokai-pro",
    dark: true,
    black: "#221f22",
    red: "#ff6188",
    green: "#a9dc76",
    yellow: "#ffd866",
    blue: "#78dce8",
    magenta: "#ab9df2",
    cyan: "#78dce8",
    white: "#939293",
    brightBlack: "#403e41",
    brightRed: "#fc9867",
    brightGreen: brighten("#a9dc76", 0.15),
    brightYellow: brighten("#ffd866", 0.15),
    brightBlue: brighten("#78dce8", 0.15),
    brightMagenta: "#ff6188",
    brightCyan: brighten("#78dce8", 0.15),
    brightWhite: "#fcfcfa",
    foreground: "#fcfcfa",
    background: "#2d2a2e",
    cursorColor: "#fcfcfa",
    cursorText: "#2d2a2e",
    selectionBackground: "#727072",
    selectionForeground: "#fcfcfa"
  };
});

// packages/theme/src/palettes/snazzy.ts
var snazzy;
var init_snazzy = __esm(() => {
  snazzy = {
    name: "snazzy",
    dark: true,
    black: "#222430",
    red: "#ff5c57",
    green: "#5af78e",
    yellow: "#f3f99d",
    blue: "#57c7ff",
    magenta: "#b267e6",
    cyan: "#9aedfe",
    white: "#97979b",
    brightBlack: "#34353e",
    brightRed: "#ff9f43",
    brightGreen: brighten("#5af78e", 0.15),
    brightYellow: brighten("#f3f99d", 0.15),
    brightBlue: brighten("#57c7ff", 0.15),
    brightMagenta: "#ff6ac1",
    brightCyan: brighten("#9aedfe", 0.15),
    brightWhite: "#eff0eb",
    foreground: "#eff0eb",
    background: "#282a36",
    cursorColor: "#eff0eb",
    cursorText: "#282a36",
    selectionBackground: "#686868",
    selectionForeground: "#eff0eb"
  };
});

// packages/theme/src/palettes/material.ts
var materialDark, materialLight;
var init_material = __esm(() => {
  materialDark = {
    name: "material-dark",
    dark: true,
    black: "#171717",
    red: "#ff5370",
    green: "#c3e88d",
    yellow: "#ffcb6b",
    blue: "#82aaff",
    magenta: "#c792ea",
    cyan: "#89ddff",
    white: "#545454",
    brightBlack: "#2c2c2c",
    brightRed: "#f78c6c",
    brightGreen: brighten("#c3e88d", 0.15),
    brightYellow: brighten("#ffcb6b", 0.15),
    brightBlue: brighten("#82aaff", 0.15),
    brightMagenta: "#f07178",
    brightCyan: brighten("#89ddff", 0.15),
    brightWhite: "#eeffff",
    foreground: "#eeffff",
    background: "#212121",
    cursorColor: "#eeffff",
    cursorText: "#212121",
    selectionBackground: "#424242",
    selectionForeground: "#eeffff"
  };
  materialLight = {
    name: "material-light",
    dark: false,
    black: "#ecf0f1",
    red: "#e53935",
    green: "#91b859",
    yellow: "#ffb62c",
    blue: "#6182b8",
    magenta: "#7c4dff",
    cyan: "#39adb5",
    white: "#90a4ae",
    brightBlack: "#ebf4f3",
    brightRed: "#f76d47",
    brightGreen: brighten("#91b859", 0.15),
    brightYellow: brighten("#ffb62c", 0.15),
    brightBlue: brighten("#6182b8", 0.15),
    brightMagenta: "#ff5370",
    brightCyan: brighten("#39adb5", 0.15),
    brightWhite: "#546E7A",
    foreground: "#546E7A",
    background: "#fafafa",
    cursorColor: "#546E7A",
    cursorText: "#fafafa",
    selectionBackground: "#cfd8dc",
    selectionForeground: "#546E7A"
  };
});

// packages/theme/src/palettes/palenight.ts
var palenight;
var init_palenight = __esm(() => {
  palenight = {
    name: "palenight",
    dark: true,
    black: "#1c1f2b",
    red: "#f07178",
    green: "#c3e88d",
    yellow: "#ffcb6b",
    blue: "#82aaff",
    magenta: "#c792ea",
    cyan: "#89ddff",
    white: "#676e95",
    brightBlack: "#343b51",
    brightRed: "#f78c6c",
    brightGreen: brighten("#c3e88d", 0.15),
    brightYellow: brighten("#ffcb6b", 0.15),
    brightBlue: brighten("#82aaff", 0.15),
    brightMagenta: "#ff5370",
    brightCyan: brighten("#89ddff", 0.15),
    brightWhite: "#a6accd",
    foreground: "#a6accd",
    background: "#292d3e",
    cursorColor: "#a6accd",
    cursorText: "#292d3e",
    selectionBackground: "#4e5579",
    selectionForeground: "#a6accd"
  };
});

// packages/theme/src/palettes/ayu.ts
var ayuDark, ayuMirage, ayuLight;
var init_ayu = __esm(() => {
  ayuDark = {
    name: "ayu-dark",
    dark: true,
    black: "#05070A",
    red: "#D95757",
    green: "#AAD94C",
    yellow: "#E6B450",
    blue: "#59C2FF",
    magenta: "#D2A6FF",
    cyan: "#95E6CB",
    white: "#636A72",
    brightBlack: "#11151C",
    brightRed: "#F29668",
    brightGreen: brighten("#AAD94C", 0.15),
    brightYellow: brighten("#E6B450", 0.15),
    brightBlue: brighten("#59C2FF", 0.15),
    brightMagenta: "#F07178",
    brightCyan: brighten("#95E6CB", 0.15),
    brightWhite: "#BFBDB6",
    foreground: "#BFBDB6",
    background: "#0B0E14",
    cursorColor: "#BFBDB6",
    cursorText: "#0B0E14",
    selectionBackground: "#565B66",
    selectionForeground: "#BFBDB6"
  };
  ayuMirage = {
    name: "ayu-mirage",
    dark: true,
    black: "#101521",
    red: "#FF6666",
    green: "#D5FF80",
    yellow: "#FFCC66",
    blue: "#73D0FF",
    magenta: "#DFBFFF",
    cyan: "#95E6CB",
    white: "#6C7A8B",
    brightBlack: "#171B24",
    brightRed: "#F29E74",
    brightGreen: brighten("#D5FF80", 0.15),
    brightYellow: brighten("#FFCC66", 0.15),
    brightBlue: brighten("#73D0FF", 0.15),
    brightMagenta: "#F28779",
    brightCyan: brighten("#95E6CB", 0.15),
    brightWhite: "#CCCAC2",
    foreground: "#CCCAC2",
    background: "#1F2430",
    cursorColor: "#CCCAC2",
    cursorText: "#1F2430",
    selectionBackground: "#707A8C",
    selectionForeground: "#CCCAC2"
  };
  ayuLight = {
    name: "ayu-light",
    dark: false,
    black: "#E7EAED",
    red: "#E65050",
    green: "#86B300",
    yellow: "#FFAA33",
    blue: "#399EE6",
    magenta: "#A37ACC",
    cyan: "#4CBF99",
    white: "#ABADB1",
    brightBlack: "#F3F4F5",
    brightRed: "#ED9366",
    brightGreen: brighten("#86B300", 0.15),
    brightYellow: brighten("#FFAA33", 0.15),
    brightBlue: brighten("#399EE6", 0.15),
    brightMagenta: "#F07171",
    brightCyan: brighten("#4CBF99", 0.15),
    brightWhite: "#5C6166",
    foreground: "#5C6166",
    background: "#F8F9FA",
    cursorColor: "#5C6166",
    cursorText: "#F8F9FA",
    selectionBackground: "#8A9199",
    selectionForeground: "#5C6166"
  };
});

// packages/theme/src/palettes/nightfox.ts
var nightfox, dawnfox;
var init_nightfox = __esm(() => {
  nightfox = {
    name: "nightfox",
    dark: true,
    black: "#131A24",
    red: "#C94F6D",
    green: "#81B29A",
    yellow: "#DBC074",
    blue: "#719CD6",
    magenta: "#9D79D6",
    cyan: "#63CDCF",
    white: "#71839B",
    brightBlack: "#212E3F",
    brightRed: "#F4A261",
    brightGreen: brighten("#81B29A", 0.15),
    brightYellow: brighten("#DBC074", 0.15),
    brightBlue: brighten("#719CD6", 0.15),
    brightMagenta: "#D67AD2",
    brightCyan: brighten("#63CDCF", 0.15),
    brightWhite: "#CDCECF",
    foreground: "#CDCECF",
    background: "#192330",
    cursorColor: "#CDCECF",
    cursorText: "#192330",
    selectionBackground: "#39506D",
    selectionForeground: "#CDCECF"
  };
  dawnfox = {
    name: "dawnfox",
    dark: false,
    black: "#EBE5DF",
    red: "#B4637A",
    green: "#618774",
    yellow: "#EA9D34",
    blue: "#286983",
    magenta: "#907AA9",
    cyan: "#56949F",
    white: "#A8A3B3",
    brightBlack: "#EBE0DF",
    brightRed: "#D7827E",
    brightGreen: brighten("#618774", 0.15),
    brightYellow: brighten("#EA9D34", 0.15),
    brightBlue: brighten("#286983", 0.15),
    brightMagenta: "#D685AF",
    brightCyan: brighten("#56949F", 0.15),
    brightWhite: "#575279",
    foreground: "#575279",
    background: "#FAF4ED",
    cursorColor: "#575279",
    cursorText: "#FAF4ED",
    selectionBackground: "#BDBFC9",
    selectionForeground: "#575279"
  };
});

// packages/theme/src/palettes/horizon.ts
var horizon;
var init_horizon = __esm(() => {
  horizon = {
    name: "horizon",
    dark: true,
    black: "#16161C",
    red: "#E95678",
    green: "#29D398",
    yellow: "#FAC29A",
    blue: "#26BBD9",
    magenta: "#B877DB",
    cyan: "#59E1E3",
    white: "#6C6F93",
    brightBlack: "#232530",
    brightRed: "#FAB795",
    brightGreen: brighten("#29D398", 0.15),
    brightYellow: brighten("#FAC29A", 0.15),
    brightBlue: brighten("#26BBD9", 0.15),
    brightMagenta: "#EE64AC",
    brightCyan: brighten("#59E1E3", 0.15),
    brightWhite: "#D5D8DA",
    foreground: "#D5D8DA",
    background: "#1C1E26",
    cursorColor: "#D5D8DA",
    cursorText: "#1C1E26",
    selectionBackground: "#2E303E",
    selectionForeground: "#D5D8DA"
  };
});

// packages/theme/src/palettes/moonfly.ts
var moonfly;
var init_moonfly = __esm(() => {
  moonfly = {
    name: "moonfly",
    dark: true,
    black: "#121212",
    red: "#FF5D5D",
    green: "#8CC85F",
    yellow: "#E3C78A",
    blue: "#80A0FF",
    magenta: "#AE81FF",
    cyan: "#79DAC8",
    white: "#808080",
    brightBlack: "#1C1C1C",
    brightRed: "#DE935F",
    brightGreen: brighten("#8CC85F", 0.15),
    brightYellow: brighten("#E3C78A", 0.15),
    brightBlue: brighten("#80A0FF", 0.15),
    brightMagenta: "#FF5189",
    brightCyan: brighten("#79DAC8", 0.15),
    brightWhite: "#C6C6C6",
    foreground: "#C6C6C6",
    background: "#080808",
    cursorColor: "#C6C6C6",
    cursorText: "#080808",
    selectionBackground: "#323437",
    selectionForeground: "#C6C6C6"
  };
});

// packages/theme/src/palettes/nightfly.ts
var nightfly;
var init_nightfly = __esm(() => {
  nightfly = {
    name: "nightfly",
    dark: true,
    black: "#081E2F",
    red: "#FC514E",
    green: "#A1CD5E",
    yellow: "#E3D18A",
    blue: "#82AAFF",
    magenta: "#C792EA",
    cyan: "#7FDBCA",
    white: "#7C8F8F",
    brightBlack: "#0E293F",
    brightRed: "#F78C6C",
    brightGreen: brighten("#A1CD5E", 0.15),
    brightYellow: brighten("#E3D18A", 0.15),
    brightBlue: brighten("#82AAFF", 0.15),
    brightMagenta: "#FF5874",
    brightCyan: brighten("#7FDBCA", 0.15),
    brightWhite: "#C3CCDC",
    foreground: "#C3CCDC",
    background: "#011627",
    cursorColor: "#C3CCDC",
    cursorText: "#011627",
    selectionBackground: "#2C3043",
    selectionForeground: "#C3CCDC"
  };
});

// packages/theme/src/palettes/oxocarbon.ts
var oxocarbonDark, oxocarbonLight;
var init_oxocarbon = __esm(() => {
  oxocarbonDark = {
    name: "oxocarbon-dark",
    dark: true,
    black: "#131313",
    red: "#EE5396",
    green: "#42BE65",
    yellow: "#82CFFF",
    blue: "#78A9FF",
    magenta: "#BE95FF",
    cyan: "#08BDBA",
    white: "#5C5C5C",
    brightBlack: "#2A2A2A",
    brightRed: "#FF7EB6",
    brightGreen: brighten("#42BE65", 0.15),
    brightYellow: brighten("#82CFFF", 0.15),
    brightBlue: brighten("#78A9FF", 0.15),
    brightMagenta: "#FF7EB6",
    brightCyan: brighten("#08BDBA", 0.15),
    brightWhite: "#F3F3F3",
    foreground: "#F3F3F3",
    background: "#161616",
    cursorColor: "#F3F3F3",
    cursorText: "#161616",
    selectionBackground: "#404040",
    selectionForeground: "#F3F3F3"
  };
  oxocarbonLight = {
    name: "oxocarbon-light",
    dark: false,
    black: "#F3F3F3",
    red: "#EE5396",
    green: "#42BE65",
    yellow: "#FFAB91",
    blue: "#0F62FE",
    magenta: "#BE95FF",
    cyan: "#08BDBA",
    white: "#90A4AE",
    brightBlack: "#D5D5D5",
    brightRed: "#FF6F00",
    brightGreen: brighten("#42BE65", 0.15),
    brightYellow: brighten("#FFAB91", 0.15),
    brightBlue: brighten("#0F62FE", 0.15),
    brightMagenta: "#FF7EB6",
    brightCyan: brighten("#08BDBA", 0.15),
    brightWhite: "#37474F",
    foreground: "#37474F",
    background: "#FFFFFF",
    cursorColor: "#37474F",
    cursorText: "#FFFFFF",
    selectionBackground: "#525252",
    selectionForeground: "#37474F"
  };
});

// packages/theme/src/palettes/sonokai.ts
var sonokai;
var init_sonokai = __esm(() => {
  sonokai = {
    name: "sonokai",
    dark: true,
    black: "#181819",
    red: "#FC5D7C",
    green: "#9ED072",
    yellow: "#E7C664",
    blue: "#76CCE0",
    magenta: "#B39DF3",
    cyan: "#76CCE0",
    white: "#7F8490",
    brightBlack: "#33353F",
    brightRed: "#F39660",
    brightGreen: brighten("#9ED072", 0.15),
    brightYellow: brighten("#E7C664", 0.15),
    brightBlue: brighten("#76CCE0", 0.15),
    brightMagenta: "#FC5D7C",
    brightCyan: brighten("#76CCE0", 0.15),
    brightWhite: "#E2E2E3",
    foreground: "#E2E2E3",
    background: "#2C2E34",
    cursorColor: "#E2E2E3",
    cursorText: "#2C2E34",
    selectionBackground: "#414550",
    selectionForeground: "#E2E2E3"
  };
});

// packages/theme/src/palettes/edge.ts
var edgeDark, edgeLight;
var init_edge = __esm(() => {
  edgeDark = {
    name: "edge-dark",
    dark: true,
    black: "#202023",
    red: "#EC7279",
    green: "#A0C980",
    yellow: "#DEB974",
    blue: "#6CB6EB",
    magenta: "#D38AEA",
    cyan: "#5DBBC1",
    white: "#758094",
    brightBlack: "#33353F",
    brightRed: "#DEB974",
    brightGreen: brighten("#A0C980", 0.15),
    brightYellow: brighten("#DEB974", 0.15),
    brightBlue: brighten("#6CB6EB", 0.15),
    brightMagenta: "#EC7279",
    brightCyan: brighten("#5DBBC1", 0.15),
    brightWhite: "#C5CDD9",
    foreground: "#C5CDD9",
    background: "#2C2E34",
    cursorColor: "#C5CDD9",
    cursorText: "#2C2E34",
    selectionBackground: "#414550",
    selectionForeground: "#C5CDD9"
  };
  edgeLight = {
    name: "edge-light",
    dark: false,
    black: "#DDE2E7",
    red: "#D05858",
    green: "#608E32",
    yellow: "#BE7E05",
    blue: "#5079BE",
    magenta: "#B05CCC",
    cyan: "#3A8B84",
    white: "#8790A0",
    brightBlack: "#EEF1F4",
    brightRed: "#BE7E05",
    brightGreen: brighten("#608E32", 0.15),
    brightYellow: brighten("#BE7E05", 0.15),
    brightBlue: brighten("#5079BE", 0.15),
    brightMagenta: "#D05858",
    brightCyan: brighten("#3A8B84", 0.15),
    brightWhite: "#4B505B",
    foreground: "#4B505B",
    background: "#FAFAFA",
    cursorColor: "#4B505B",
    cursorText: "#FAFAFA",
    selectionBackground: "#DDE2E7",
    selectionForeground: "#4B505B"
  };
});

// packages/theme/src/palettes/modus.ts
var modusVivendi, modusOperandi;
var init_modus = __esm(() => {
  modusVivendi = {
    name: "modus-vivendi",
    dark: true,
    black: "#000000",
    red: "#FF5F59",
    green: "#44BC44",
    yellow: "#D0BC00",
    blue: "#2FAFFF",
    magenta: "#B6A0FF",
    cyan: "#00D3D0",
    white: "#989898",
    brightBlack: "#1E1E1E",
    brightRed: "#FEC43F",
    brightGreen: brighten("#44BC44", 0.15),
    brightYellow: brighten("#D0BC00", 0.15),
    brightBlue: brighten("#2FAFFF", 0.15),
    brightMagenta: "#FEACD0",
    brightCyan: brighten("#00D3D0", 0.15),
    brightWhite: "#FFFFFF",
    foreground: "#FFFFFF",
    background: "#000000",
    cursorColor: "#FFFFFF",
    cursorText: "#000000",
    selectionBackground: "#535353",
    selectionForeground: "#FFFFFF"
  };
  modusOperandi = {
    name: "modus-operandi",
    dark: false,
    black: "#E0E0E0",
    red: "#A60000",
    green: "#006800",
    yellow: "#6F5500",
    blue: "#0031A9",
    magenta: "#531AB6",
    cyan: "#005E8B",
    white: "#595959",
    brightBlack: "#F2F2F2",
    brightRed: "#884900",
    brightGreen: brighten("#006800", 0.15),
    brightYellow: brighten("#6F5500", 0.15),
    brightBlue: brighten("#0031A9", 0.15),
    brightMagenta: "#721045",
    brightCyan: brighten("#005E8B", 0.15),
    brightWhite: "#000000",
    foreground: "#000000",
    background: "#FFFFFF",
    cursorColor: "#000000",
    cursorText: "#FFFFFF",
    selectionBackground: "#9F9F9F",
    selectionForeground: "#000000"
  };
});

// packages/theme/src/palettes/index.ts
var defaultDarkTheme, defaultLightTheme;
var init_palettes = __esm(() => {
  init_derive();
  init_catppuccin();
  init_nord();
  init_dracula();
  init_solarized();
  init_tokyo_night();
  init_one_dark();
  init_gruvbox();
  init_rose_pine();
  init_kanagawa();
  init_everforest();
  init_monokai();
  init_snazzy();
  init_material();
  init_palenight();
  init_ayu();
  init_nightfox();
  init_horizon();
  init_moonfly();
  init_nightfly();
  init_oxocarbon();
  init_sonokai();
  init_edge();
  init_modus();
  init_catppuccin();
  init_nord();
  init_dracula();
  init_solarized();
  init_tokyo_night();
  init_one_dark();
  init_gruvbox();
  init_rose_pine();
  init_kanagawa();
  init_everforest();
  init_monokai();
  init_snazzy();
  init_material();
  init_palenight();
  init_ayu();
  init_nightfox();
  init_horizon();
  init_moonfly();
  init_nightfly();
  init_oxocarbon();
  init_sonokai();
  init_edge();
  init_modus();
  defaultDarkTheme = deriveTheme(nord);
  defaultLightTheme = deriveTheme(catppuccinLatte);
});

// packages/theme/src/state.ts
var init_state = __esm(() => {
  init_palettes();
});
// ../../node_modules/.bun/react@19.2.4/node_modules/react/cjs/react.production.js
var exports_react_production = {};
__export(exports_react_production, {
  version: () => $version,
  useTransition: () => $useTransition,
  useSyncExternalStore: () => $useSyncExternalStore,
  useState: () => $useState,
  useRef: () => $useRef,
  useReducer: () => $useReducer,
  useOptimistic: () => $useOptimistic,
  useMemo: () => $useMemo,
  useLayoutEffect: () => $useLayoutEffect,
  useInsertionEffect: () => $useInsertionEffect,
  useImperativeHandle: () => $useImperativeHandle,
  useId: () => $useId,
  useEffectEvent: () => $useEffectEvent,
  useEffect: () => $useEffect,
  useDeferredValue: () => $useDeferredValue,
  useDebugValue: () => $useDebugValue,
  useContext: () => $useContext,
  useCallback: () => $useCallback,
  useActionState: () => $useActionState,
  use: () => $use,
  unstable_useCacheRefresh: () => $unstable_useCacheRefresh,
  startTransition: () => $startTransition,
  memo: () => $memo,
  lazy: () => $lazy,
  isValidElement: () => $isValidElement,
  forwardRef: () => $forwardRef,
  createRef: () => $createRef,
  createElement: () => $createElement,
  createContext: () => $createContext,
  cloneElement: () => $cloneElement,
  cacheSignal: () => $cacheSignal,
  cache: () => $cache,
  __COMPILER_RUNTIME: () => $__COMPILER_RUNTIME,
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: () => $__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
  Suspense: () => $Suspense,
  StrictMode: () => $StrictMode,
  PureComponent: () => $PureComponent,
  Profiler: () => $Profiler,
  Fragment: () => $Fragment,
  Component: () => $Component,
  Children: () => $Children,
  Activity: () => $Activity
});
function getIteratorFn(maybeIterable) {
  if (maybeIterable === null || typeof maybeIterable !== "object")
    return null;
  maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
  return typeof maybeIterable === "function" ? maybeIterable : null;
}
function Component(props, context, updater) {
  this.props = props;
  this.context = context;
  this.refs = emptyObject;
  this.updater = updater || ReactNoopUpdateQueue;
}
function ComponentDummy() {}
function PureComponent(props, context, updater) {
  this.props = props;
  this.context = context;
  this.refs = emptyObject;
  this.updater = updater || ReactNoopUpdateQueue;
}
function noop() {}
function ReactElement(type, key, props) {
  var refProp = props.ref;
  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type,
    key,
    ref: refProp !== undefined ? refProp : null,
    props
  };
}
function cloneAndReplaceKey(oldElement, newKey) {
  return ReactElement(oldElement.type, newKey, oldElement.props);
}
function isValidElement(object) {
  return typeof object === "object" && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
}
function escape(key) {
  var escaperLookup = { "=": "=0", ":": "=2" };
  return "$" + key.replace(/[=:]/g, function(match) {
    return escaperLookup[match];
  });
}
function getElementKey(element, index) {
  return typeof element === "object" && element !== null && element.key != null ? escape("" + element.key) : index.toString(36);
}
function resolveThenable(thenable) {
  switch (thenable.status) {
    case "fulfilled":
      return thenable.value;
    case "rejected":
      throw thenable.reason;
    default:
      switch (typeof thenable.status === "string" ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(function(fulfilledValue) {
        thenable.status === "pending" && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
      }, function(error) {
        thenable.status === "pending" && (thenable.status = "rejected", thenable.reason = error);
      })), thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenable.reason;
      }
  }
  throw thenable;
}
function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
  var type = typeof children;
  if (type === "undefined" || type === "boolean")
    children = null;
  var invokeCallback = false;
  if (children === null)
    invokeCallback = true;
  else
    switch (type) {
      case "bigint":
      case "string":
      case "number":
        invokeCallback = true;
        break;
      case "object":
        switch (children.$$typeof) {
          case REACT_ELEMENT_TYPE:
          case REACT_PORTAL_TYPE:
            invokeCallback = true;
            break;
          case REACT_LAZY_TYPE:
            return invokeCallback = children._init, mapIntoArray(invokeCallback(children._payload), array, escapedPrefix, nameSoFar, callback);
        }
    }
  if (invokeCallback)
    return callback = callback(children), invokeCallback = nameSoFar === "" ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", invokeCallback != null && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
      return c;
    })) : callback != null && (isValidElement(callback) && (callback = cloneAndReplaceKey(callback, escapedPrefix + (callback.key == null || children && children.key === callback.key ? "" : ("" + callback.key).replace(userProvidedKeyEscapeRegex, "$&/") + "/") + invokeCallback)), array.push(callback)), 1;
  invokeCallback = 0;
  var nextNamePrefix = nameSoFar === "" ? "." : nameSoFar + ":";
  if (isArrayImpl(children))
    for (var i = 0;i < children.length; i++)
      nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
  else if (i = getIteratorFn(children), typeof i === "function")
    for (children = i.call(children), i = 0;!(nameSoFar = children.next()).done; )
      nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
  else if (type === "object") {
    if (typeof children.then === "function")
      return mapIntoArray(resolveThenable(children), array, escapedPrefix, nameSoFar, callback);
    array = String(children);
    throw Error("Objects are not valid as a React child (found: " + (array === "[object Object]" ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead.");
  }
  return invokeCallback;
}
function mapChildren(children, func, context) {
  if (children == null)
    return children;
  var result = [], count = 0;
  mapIntoArray(children, result, "", "", function(child) {
    return func.call(context, child, count++);
  });
  return result;
}
function lazyInitializer(payload) {
  if (payload._status === -1) {
    var ctor = payload._result;
    ctor = ctor();
    ctor.then(function(moduleObject) {
      if (payload._status === 0 || payload._status === -1)
        payload._status = 1, payload._result = moduleObject;
    }, function(error) {
      if (payload._status === 0 || payload._status === -1)
        payload._status = 2, payload._result = error;
    });
    payload._status === -1 && (payload._status = 0, payload._result = ctor);
  }
  if (payload._status === 1)
    return payload._result.default;
  throw payload._result;
}
var REACT_ELEMENT_TYPE, REACT_PORTAL_TYPE, REACT_FRAGMENT_TYPE, REACT_STRICT_MODE_TYPE, REACT_PROFILER_TYPE, REACT_CONSUMER_TYPE, REACT_CONTEXT_TYPE, REACT_FORWARD_REF_TYPE, REACT_SUSPENSE_TYPE, REACT_MEMO_TYPE, REACT_LAZY_TYPE, REACT_ACTIVITY_TYPE, MAYBE_ITERATOR_SYMBOL, ReactNoopUpdateQueue, assign, emptyObject, pureComponentPrototype, isArrayImpl, ReactSharedInternals, hasOwnProperty, userProvidedKeyEscapeRegex, reportGlobalError, Children, $Activity, $Children, $Component, $Fragment, $Profiler, $PureComponent, $StrictMode, $Suspense, $__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, $__COMPILER_RUNTIME, $cache = function(fn) {
  return function() {
    return fn.apply(null, arguments);
  };
}, $cacheSignal = function() {
  return null;
}, $cloneElement = function(element, config, children) {
  if (element === null || element === undefined)
    throw Error("The argument must be a React element, but you passed " + element + ".");
  var props = assign({}, element.props), key = element.key;
  if (config != null)
    for (propName in config.key !== undefined && (key = "" + config.key), config)
      !hasOwnProperty.call(config, propName) || propName === "key" || propName === "__self" || propName === "__source" || propName === "ref" && config.ref === undefined || (props[propName] = config[propName]);
  var propName = arguments.length - 2;
  if (propName === 1)
    props.children = children;
  else if (1 < propName) {
    for (var childArray = Array(propName), i = 0;i < propName; i++)
      childArray[i] = arguments[i + 2];
    props.children = childArray;
  }
  return ReactElement(element.type, key, props);
}, $createContext = function(defaultValue) {
  defaultValue = {
    $$typeof: REACT_CONTEXT_TYPE,
    _currentValue: defaultValue,
    _currentValue2: defaultValue,
    _threadCount: 0,
    Provider: null,
    Consumer: null
  };
  defaultValue.Provider = defaultValue;
  defaultValue.Consumer = {
    $$typeof: REACT_CONSUMER_TYPE,
    _context: defaultValue
  };
  return defaultValue;
}, $createElement = function(type, config, children) {
  var propName, props = {}, key = null;
  if (config != null)
    for (propName in config.key !== undefined && (key = "" + config.key), config)
      hasOwnProperty.call(config, propName) && propName !== "key" && propName !== "__self" && propName !== "__source" && (props[propName] = config[propName]);
  var childrenLength = arguments.length - 2;
  if (childrenLength === 1)
    props.children = children;
  else if (1 < childrenLength) {
    for (var childArray = Array(childrenLength), i = 0;i < childrenLength; i++)
      childArray[i] = arguments[i + 2];
    props.children = childArray;
  }
  if (type && type.defaultProps)
    for (propName in childrenLength = type.defaultProps, childrenLength)
      props[propName] === undefined && (props[propName] = childrenLength[propName]);
  return ReactElement(type, key, props);
}, $createRef = function() {
  return { current: null };
}, $forwardRef = function(render) {
  return { $$typeof: REACT_FORWARD_REF_TYPE, render };
}, $isValidElement, $lazy = function(ctor) {
  return {
    $$typeof: REACT_LAZY_TYPE,
    _payload: { _status: -1, _result: ctor },
    _init: lazyInitializer
  };
}, $memo = function(type, compare) {
  return {
    $$typeof: REACT_MEMO_TYPE,
    type,
    compare: compare === undefined ? null : compare
  };
}, $startTransition = function(scope) {
  var prevTransition = ReactSharedInternals.T, currentTransition = {};
  ReactSharedInternals.T = currentTransition;
  try {
    var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
    onStartTransitionFinish !== null && onStartTransitionFinish(currentTransition, returnValue);
    typeof returnValue === "object" && returnValue !== null && typeof returnValue.then === "function" && returnValue.then(noop, reportGlobalError);
  } catch (error) {
    reportGlobalError(error);
  } finally {
    prevTransition !== null && currentTransition.types !== null && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
  }
}, $unstable_useCacheRefresh = function() {
  return ReactSharedInternals.H.useCacheRefresh();
}, $use = function(usable) {
  return ReactSharedInternals.H.use(usable);
}, $useActionState = function(action, initialState, permalink) {
  return ReactSharedInternals.H.useActionState(action, initialState, permalink);
}, $useCallback = function(callback, deps) {
  return ReactSharedInternals.H.useCallback(callback, deps);
}, $useContext = function(Context) {
  return ReactSharedInternals.H.useContext(Context);
}, $useDebugValue = function() {}, $useDeferredValue = function(value, initialValue) {
  return ReactSharedInternals.H.useDeferredValue(value, initialValue);
}, $useEffect = function(create, deps) {
  return ReactSharedInternals.H.useEffect(create, deps);
}, $useEffectEvent = function(callback) {
  return ReactSharedInternals.H.useEffectEvent(callback);
}, $useId = function() {
  return ReactSharedInternals.H.useId();
}, $useImperativeHandle = function(ref, create, deps) {
  return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
}, $useInsertionEffect = function(create, deps) {
  return ReactSharedInternals.H.useInsertionEffect(create, deps);
}, $useLayoutEffect = function(create, deps) {
  return ReactSharedInternals.H.useLayoutEffect(create, deps);
}, $useMemo = function(create, deps) {
  return ReactSharedInternals.H.useMemo(create, deps);
}, $useOptimistic = function(passthrough, reducer) {
  return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
}, $useReducer = function(reducer, initialArg, init) {
  return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
}, $useRef = function(initialValue) {
  return ReactSharedInternals.H.useRef(initialValue);
}, $useState = function(initialState) {
  return ReactSharedInternals.H.useState(initialState);
}, $useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
  return ReactSharedInternals.H.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}, $useTransition = function() {
  return ReactSharedInternals.H.useTransition();
}, $version = "19.2.4";
var init_react_production = __esm(() => {
  REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
  REACT_PORTAL_TYPE = Symbol.for("react.portal");
  REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
  REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
  REACT_PROFILER_TYPE = Symbol.for("react.profiler");
  REACT_CONSUMER_TYPE = Symbol.for("react.consumer");
  REACT_CONTEXT_TYPE = Symbol.for("react.context");
  REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
  REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
  REACT_MEMO_TYPE = Symbol.for("react.memo");
  REACT_LAZY_TYPE = Symbol.for("react.lazy");
  REACT_ACTIVITY_TYPE = Symbol.for("react.activity");
  MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
  ReactNoopUpdateQueue = {
    isMounted: function() {
      return false;
    },
    enqueueForceUpdate: function() {},
    enqueueReplaceState: function() {},
    enqueueSetState: function() {}
  };
  assign = Object.assign;
  emptyObject = {};
  Component.prototype.isReactComponent = {};
  Component.prototype.setState = function(partialState, callback) {
    if (typeof partialState !== "object" && typeof partialState !== "function" && partialState != null)
      throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
    this.updater.enqueueSetState(this, partialState, callback, "setState");
  };
  Component.prototype.forceUpdate = function(callback) {
    this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
  };
  ComponentDummy.prototype = Component.prototype;
  pureComponentPrototype = PureComponent.prototype = new ComponentDummy;
  pureComponentPrototype.constructor = PureComponent;
  assign(pureComponentPrototype, Component.prototype);
  pureComponentPrototype.isPureReactComponent = true;
  isArrayImpl = Array.isArray;
  ReactSharedInternals = { H: null, A: null, T: null, S: null };
  hasOwnProperty = Object.prototype.hasOwnProperty;
  userProvidedKeyEscapeRegex = /\/+/g;
  reportGlobalError = typeof reportError === "function" ? reportError : function(error) {
    if (typeof window === "object" && typeof window.ErrorEvent === "function") {
      var event = new window.ErrorEvent("error", {
        bubbles: true,
        cancelable: true,
        message: typeof error === "object" && error !== null && typeof error.message === "string" ? String(error.message) : String(error),
        error
      });
      if (!window.dispatchEvent(event))
        return;
    } else if (typeof process === "object" && typeof process.emit === "function") {
      process.emit("uncaughtException", error);
      return;
    }
    console.error(error);
  };
  Children = {
    map: mapChildren,
    forEach: function(children, forEachFunc, forEachContext) {
      mapChildren(children, function() {
        forEachFunc.apply(this, arguments);
      }, forEachContext);
    },
    count: function(children) {
      var n = 0;
      mapChildren(children, function() {
        n++;
      });
      return n;
    },
    toArray: function(children) {
      return mapChildren(children, function(child) {
        return child;
      }) || [];
    },
    only: function(children) {
      if (!isValidElement(children))
        throw Error("React.Children.only expected to receive a single React element child.");
      return children;
    }
  };
  $Activity = REACT_ACTIVITY_TYPE;
  $Children = Children;
  $Component = Component;
  $Fragment = REACT_FRAGMENT_TYPE;
  $Profiler = REACT_PROFILER_TYPE;
  $PureComponent = PureComponent;
  $StrictMode = REACT_STRICT_MODE_TYPE;
  $Suspense = REACT_SUSPENSE_TYPE;
  $__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
  $__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(size) {
      return ReactSharedInternals.H.useMemoCache(size);
    }
  };
  $isValidElement = isValidElement;
});

// ../../node_modules/.bun/react@19.2.4/node_modules/react/index.js
var require_react = __commonJS((exports, module) => {
  init_react_production();
  if (true) {
    module.exports = exports_react_production;
  } else {}
});

// ../../node_modules/.bun/scheduler@0.27.0/node_modules/scheduler/cjs/scheduler.production.js
var exports_scheduler_production = {};
__export(exports_scheduler_production, {
  unstable_wrapCallback: () => $unstable_wrapCallback,
  unstable_shouldYield: () => $unstable_shouldYield,
  unstable_scheduleCallback: () => $unstable_scheduleCallback,
  unstable_runWithPriority: () => $unstable_runWithPriority,
  unstable_requestPaint: () => $unstable_requestPaint,
  unstable_now: () => $unstable_now,
  unstable_next: () => $unstable_next,
  unstable_getCurrentPriorityLevel: () => $unstable_getCurrentPriorityLevel,
  unstable_forceFrameRate: () => $unstable_forceFrameRate,
  unstable_cancelCallback: () => $unstable_cancelCallback,
  unstable_UserBlockingPriority: () => $unstable_UserBlockingPriority,
  unstable_Profiling: () => $unstable_Profiling,
  unstable_NormalPriority: () => $unstable_NormalPriority,
  unstable_LowPriority: () => $unstable_LowPriority,
  unstable_ImmediatePriority: () => $unstable_ImmediatePriority,
  unstable_IdlePriority: () => $unstable_IdlePriority
});
function push(heap, node) {
  var index = heap.length;
  heap.push(node);
  a:
    for (;0 < index; ) {
      var parentIndex = index - 1 >>> 1, parent = heap[parentIndex];
      if (0 < compare(parent, node))
        heap[parentIndex] = node, heap[index] = parent, index = parentIndex;
      else
        break a;
    }
}
function peek(heap) {
  return heap.length === 0 ? null : heap[0];
}
function pop(heap) {
  if (heap.length === 0)
    return null;
  var first = heap[0], last = heap.pop();
  if (last !== first) {
    heap[0] = last;
    a:
      for (var index = 0, length = heap.length, halfLength = length >>> 1;index < halfLength; ) {
        var leftIndex = 2 * (index + 1) - 1, left = heap[leftIndex], rightIndex = leftIndex + 1, right = heap[rightIndex];
        if (0 > compare(left, last))
          rightIndex < length && 0 > compare(right, left) ? (heap[index] = right, heap[rightIndex] = last, index = rightIndex) : (heap[index] = left, heap[leftIndex] = last, index = leftIndex);
        else if (rightIndex < length && 0 > compare(right, last))
          heap[index] = right, heap[rightIndex] = last, index = rightIndex;
        else
          break a;
      }
  }
  return first;
}
function compare(a, b) {
  var diff = a.sortIndex - b.sortIndex;
  return diff !== 0 ? diff : a.id - b.id;
}
function advanceTimers(currentTime) {
  for (var timer = peek(timerQueue);timer !== null; ) {
    if (timer.callback === null)
      pop(timerQueue);
    else if (timer.startTime <= currentTime)
      pop(timerQueue), timer.sortIndex = timer.expirationTime, push(taskQueue, timer);
    else
      break;
    timer = peek(timerQueue);
  }
}
function handleTimeout(currentTime) {
  isHostTimeoutScheduled = false;
  advanceTimers(currentTime);
  if (!isHostCallbackScheduled)
    if (peek(taskQueue) !== null)
      isHostCallbackScheduled = true, isMessageLoopRunning || (isMessageLoopRunning = true, schedulePerformWorkUntilDeadline());
    else {
      var firstTimer = peek(timerQueue);
      firstTimer !== null && requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
    }
}
function shouldYieldToHost() {
  return needsPaint ? true : $unstable_now() - startTime < frameInterval ? false : true;
}
function performWorkUntilDeadline() {
  needsPaint = false;
  if (isMessageLoopRunning) {
    var currentTime = $unstable_now();
    startTime = currentTime;
    var hasMoreWork = true;
    try {
      a: {
        isHostCallbackScheduled = false;
        isHostTimeoutScheduled && (isHostTimeoutScheduled = false, localClearTimeout(taskTimeoutID), taskTimeoutID = -1);
        isPerformingWork = true;
        var previousPriorityLevel = currentPriorityLevel;
        try {
          b: {
            advanceTimers(currentTime);
            for (currentTask = peek(taskQueue);currentTask !== null && !(currentTask.expirationTime > currentTime && shouldYieldToHost()); ) {
              var callback = currentTask.callback;
              if (typeof callback === "function") {
                currentTask.callback = null;
                currentPriorityLevel = currentTask.priorityLevel;
                var continuationCallback = callback(currentTask.expirationTime <= currentTime);
                currentTime = $unstable_now();
                if (typeof continuationCallback === "function") {
                  currentTask.callback = continuationCallback;
                  advanceTimers(currentTime);
                  hasMoreWork = true;
                  break b;
                }
                currentTask === peek(taskQueue) && pop(taskQueue);
                advanceTimers(currentTime);
              } else
                pop(taskQueue);
              currentTask = peek(taskQueue);
            }
            if (currentTask !== null)
              hasMoreWork = true;
            else {
              var firstTimer = peek(timerQueue);
              firstTimer !== null && requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
              hasMoreWork = false;
            }
          }
          break a;
        } finally {
          currentTask = null, currentPriorityLevel = previousPriorityLevel, isPerformingWork = false;
        }
        hasMoreWork = undefined;
      }
    } finally {
      hasMoreWork ? schedulePerformWorkUntilDeadline() : isMessageLoopRunning = false;
    }
  }
}
function requestHostTimeout(callback, ms) {
  taskTimeoutID = localSetTimeout(function() {
    callback($unstable_now());
  }, ms);
}
var $unstable_now = undefined, localPerformance, localDate, initialTime, taskQueue, timerQueue, taskIdCounter = 1, currentTask = null, currentPriorityLevel = 3, isPerformingWork = false, isHostCallbackScheduled = false, isHostTimeoutScheduled = false, needsPaint = false, localSetTimeout, localClearTimeout, localSetImmediate, isMessageLoopRunning = false, taskTimeoutID = -1, frameInterval = 5, startTime = -1, schedulePerformWorkUntilDeadline, channel, port, $unstable_IdlePriority = 5, $unstable_ImmediatePriority = 1, $unstable_LowPriority = 4, $unstable_NormalPriority = 3, $unstable_Profiling = null, $unstable_UserBlockingPriority = 2, $unstable_cancelCallback = function(task) {
  task.callback = null;
}, $unstable_forceFrameRate = function(fps) {
  0 > fps || 125 < fps ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : frameInterval = 0 < fps ? Math.floor(1000 / fps) : 5;
}, $unstable_getCurrentPriorityLevel = function() {
  return currentPriorityLevel;
}, $unstable_next = function(eventHandler) {
  switch (currentPriorityLevel) {
    case 1:
    case 2:
    case 3:
      var priorityLevel = 3;
      break;
    default:
      priorityLevel = currentPriorityLevel;
  }
  var previousPriorityLevel = currentPriorityLevel;
  currentPriorityLevel = priorityLevel;
  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
  }
}, $unstable_requestPaint = function() {
  needsPaint = true;
}, $unstable_runWithPriority = function(priorityLevel, eventHandler) {
  switch (priorityLevel) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      break;
    default:
      priorityLevel = 3;
  }
  var previousPriorityLevel = currentPriorityLevel;
  currentPriorityLevel = priorityLevel;
  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
  }
}, $unstable_scheduleCallback = function(priorityLevel, callback, options) {
  var currentTime = $unstable_now();
  typeof options === "object" && options !== null ? (options = options.delay, options = typeof options === "number" && 0 < options ? currentTime + options : currentTime) : options = currentTime;
  switch (priorityLevel) {
    case 1:
      var timeout = -1;
      break;
    case 2:
      timeout = 250;
      break;
    case 5:
      timeout = 1073741823;
      break;
    case 4:
      timeout = 1e4;
      break;
    default:
      timeout = 5000;
  }
  timeout = options + timeout;
  priorityLevel = {
    id: taskIdCounter++,
    callback,
    priorityLevel,
    startTime: options,
    expirationTime: timeout,
    sortIndex: -1
  };
  options > currentTime ? (priorityLevel.sortIndex = options, push(timerQueue, priorityLevel), peek(taskQueue) === null && priorityLevel === peek(timerQueue) && (isHostTimeoutScheduled ? (localClearTimeout(taskTimeoutID), taskTimeoutID = -1) : isHostTimeoutScheduled = true, requestHostTimeout(handleTimeout, options - currentTime))) : (priorityLevel.sortIndex = timeout, push(taskQueue, priorityLevel), isHostCallbackScheduled || isPerformingWork || (isHostCallbackScheduled = true, isMessageLoopRunning || (isMessageLoopRunning = true, schedulePerformWorkUntilDeadline())));
  return priorityLevel;
}, $unstable_shouldYield, $unstable_wrapCallback = function(callback) {
  var parentPriorityLevel = currentPriorityLevel;
  return function() {
    var previousPriorityLevel = currentPriorityLevel;
    currentPriorityLevel = parentPriorityLevel;
    try {
      return callback.apply(this, arguments);
    } finally {
      currentPriorityLevel = previousPriorityLevel;
    }
  };
};
var init_scheduler_production = __esm(() => {
  if (typeof performance === "object" && typeof performance.now === "function") {
    localPerformance = performance;
    $unstable_now = function() {
      return localPerformance.now();
    };
  } else {
    localDate = Date, initialTime = localDate.now();
    $unstable_now = function() {
      return localDate.now() - initialTime;
    };
  }
  taskQueue = [];
  timerQueue = [];
  localSetTimeout = typeof setTimeout === "function" ? setTimeout : null;
  localClearTimeout = typeof clearTimeout === "function" ? clearTimeout : null;
  localSetImmediate = typeof setImmediate !== "undefined" ? setImmediate : null;
  if (typeof localSetImmediate === "function")
    schedulePerformWorkUntilDeadline = function() {
      localSetImmediate(performWorkUntilDeadline);
    };
  else if (typeof MessageChannel !== "undefined") {
    channel = new MessageChannel, port = channel.port2;
    channel.port1.onmessage = performWorkUntilDeadline;
    schedulePerformWorkUntilDeadline = function() {
      port.postMessage(null);
    };
  } else
    schedulePerformWorkUntilDeadline = function() {
      localSetTimeout(performWorkUntilDeadline, 0);
    };
  $unstable_shouldYield = shouldYieldToHost;
});

// ../../node_modules/.bun/scheduler@0.27.0/node_modules/scheduler/index.js
var require_scheduler = __commonJS((exports, module) => {
  init_scheduler_production();
  if (true) {
    module.exports = exports_scheduler_production;
  } else {}
});

// ../../node_modules/.bun/react-reconciler@0.33.0+b1ab299f0a400331/node_modules/react-reconciler/cjs/react-reconciler.production.js
var require_react_reconciler_production = __commonJS((exports, module) => {
  var React = __toESM(require_react());
  var Scheduler = __toESM(require_scheduler());
  module.exports = function($$$config) {
    function createFiber(tag, pendingProps, key, mode) {
      return new FiberNode(tag, pendingProps, key, mode);
    }
    function noop2() {}
    function formatProdErrorMessage(code) {
      var url = "https://react.dev/errors/" + code;
      if (1 < arguments.length) {
        url += "?args[]=" + encodeURIComponent(arguments[1]);
        for (var i = 2;i < arguments.length; i++)
          url += "&args[]=" + encodeURIComponent(arguments[i]);
      }
      return "Minified React error #" + code + "; visit " + url + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
    }
    function getNearestMountedFiber(fiber) {
      var node = fiber, nearestMounted = fiber;
      if (fiber.alternate)
        for (;node.return; )
          node = node.return;
      else {
        fiber = node;
        do
          node = fiber, (node.flags & 4098) !== 0 && (nearestMounted = node.return), fiber = node.return;
        while (fiber);
      }
      return node.tag === 3 ? nearestMounted : null;
    }
    function assertIsMounted(fiber) {
      if (getNearestMountedFiber(fiber) !== fiber)
        throw Error(formatProdErrorMessage(188));
    }
    function findCurrentFiberUsingSlowPath(fiber) {
      var alternate = fiber.alternate;
      if (!alternate) {
        alternate = getNearestMountedFiber(fiber);
        if (alternate === null)
          throw Error(formatProdErrorMessage(188));
        return alternate !== fiber ? null : fiber;
      }
      for (var a = fiber, b = alternate;; ) {
        var parentA = a.return;
        if (parentA === null)
          break;
        var parentB = parentA.alternate;
        if (parentB === null) {
          b = parentA.return;
          if (b !== null) {
            a = b;
            continue;
          }
          break;
        }
        if (parentA.child === parentB.child) {
          for (parentB = parentA.child;parentB; ) {
            if (parentB === a)
              return assertIsMounted(parentA), fiber;
            if (parentB === b)
              return assertIsMounted(parentA), alternate;
            parentB = parentB.sibling;
          }
          throw Error(formatProdErrorMessage(188));
        }
        if (a.return !== b.return)
          a = parentA, b = parentB;
        else {
          for (var didFindChild = false, child$0 = parentA.child;child$0; ) {
            if (child$0 === a) {
              didFindChild = true;
              a = parentA;
              b = parentB;
              break;
            }
            if (child$0 === b) {
              didFindChild = true;
              b = parentA;
              a = parentB;
              break;
            }
            child$0 = child$0.sibling;
          }
          if (!didFindChild) {
            for (child$0 = parentB.child;child$0; ) {
              if (child$0 === a) {
                didFindChild = true;
                a = parentB;
                b = parentA;
                break;
              }
              if (child$0 === b) {
                didFindChild = true;
                b = parentB;
                a = parentA;
                break;
              }
              child$0 = child$0.sibling;
            }
            if (!didFindChild)
              throw Error(formatProdErrorMessage(189));
          }
        }
        if (a.alternate !== b)
          throw Error(formatProdErrorMessage(190));
      }
      if (a.tag !== 3)
        throw Error(formatProdErrorMessage(188));
      return a.stateNode.current === a ? fiber : alternate;
    }
    function findCurrentHostFiberImpl(node) {
      var tag = node.tag;
      if (tag === 5 || tag === 26 || tag === 27 || tag === 6)
        return node;
      for (node = node.child;node !== null; ) {
        tag = findCurrentHostFiberImpl(node);
        if (tag !== null)
          return tag;
        node = node.sibling;
      }
      return null;
    }
    function findCurrentHostFiberWithNoPortalsImpl(node) {
      var tag = node.tag;
      if (tag === 5 || tag === 26 || tag === 27 || tag === 6)
        return node;
      for (node = node.child;node !== null; ) {
        if (node.tag !== 4 && (tag = findCurrentHostFiberWithNoPortalsImpl(node), tag !== null))
          return tag;
        node = node.sibling;
      }
      return null;
    }
    function getIteratorFn2(maybeIterable) {
      if (maybeIterable === null || typeof maybeIterable !== "object")
        return null;
      maybeIterable = MAYBE_ITERATOR_SYMBOL2 && maybeIterable[MAYBE_ITERATOR_SYMBOL2] || maybeIterable["@@iterator"];
      return typeof maybeIterable === "function" ? maybeIterable : null;
    }
    function getComponentNameFromType(type) {
      if (type == null)
        return null;
      if (typeof type === "function")
        return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
      if (typeof type === "string")
        return type;
      switch (type) {
        case REACT_FRAGMENT_TYPE2:
          return "Fragment";
        case REACT_PROFILER_TYPE2:
          return "Profiler";
        case REACT_STRICT_MODE_TYPE2:
          return "StrictMode";
        case REACT_SUSPENSE_TYPE2:
          return "Suspense";
        case REACT_SUSPENSE_LIST_TYPE:
          return "SuspenseList";
        case REACT_ACTIVITY_TYPE2:
          return "Activity";
      }
      if (typeof type === "object")
        switch (type.$$typeof) {
          case REACT_PORTAL_TYPE2:
            return "Portal";
          case REACT_CONTEXT_TYPE2:
            return type.displayName || "Context";
          case REACT_CONSUMER_TYPE2:
            return (type._context.displayName || "Context") + ".Consumer";
          case REACT_FORWARD_REF_TYPE2:
            var innerType = type.render;
            type = type.displayName;
            type || (type = innerType.displayName || innerType.name || "", type = type !== "" ? "ForwardRef(" + type + ")" : "ForwardRef");
            return type;
          case REACT_MEMO_TYPE2:
            return innerType = type.displayName || null, innerType !== null ? innerType : getComponentNameFromType(type.type) || "Memo";
          case REACT_LAZY_TYPE2:
            innerType = type._payload;
            type = type._init;
            try {
              return getComponentNameFromType(type(innerType));
            } catch (x) {}
        }
      return null;
    }
    function createCursor(defaultValue) {
      return { current: defaultValue };
    }
    function pop2(cursor) {
      0 > index$jscomp$0 || (cursor.current = valueStack[index$jscomp$0], valueStack[index$jscomp$0] = null, index$jscomp$0--);
    }
    function push2(cursor, value) {
      index$jscomp$0++;
      valueStack[index$jscomp$0] = cursor.current;
      cursor.current = value;
    }
    function clz32Fallback(x) {
      x >>>= 0;
      return x === 0 ? 32 : 31 - (log$1(x) / LN2 | 0) | 0;
    }
    function getHighestPriorityLanes(lanes) {
      var pendingSyncLanes = lanes & 42;
      if (pendingSyncLanes !== 0)
        return pendingSyncLanes;
      switch (lanes & -lanes) {
        case 1:
          return 1;
        case 2:
          return 2;
        case 4:
          return 4;
        case 8:
          return 8;
        case 16:
          return 16;
        case 32:
          return 32;
        case 64:
          return 64;
        case 128:
          return 128;
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
          return lanes & 261888;
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
          return lanes & 3932160;
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
          return lanes & 62914560;
        case 67108864:
          return 67108864;
        case 134217728:
          return 134217728;
        case 268435456:
          return 268435456;
        case 536870912:
          return 536870912;
        case 1073741824:
          return 0;
        default:
          return lanes;
      }
    }
    function getNextLanes(root, wipLanes, rootHasPendingCommit) {
      var pendingLanes = root.pendingLanes;
      if (pendingLanes === 0)
        return 0;
      var nextLanes = 0, suspendedLanes = root.suspendedLanes, pingedLanes = root.pingedLanes;
      root = root.warmLanes;
      var nonIdlePendingLanes = pendingLanes & 134217727;
      nonIdlePendingLanes !== 0 ? (pendingLanes = nonIdlePendingLanes & ~suspendedLanes, pendingLanes !== 0 ? nextLanes = getHighestPriorityLanes(pendingLanes) : (pingedLanes &= nonIdlePendingLanes, pingedLanes !== 0 ? nextLanes = getHighestPriorityLanes(pingedLanes) : rootHasPendingCommit || (rootHasPendingCommit = nonIdlePendingLanes & ~root, rootHasPendingCommit !== 0 && (nextLanes = getHighestPriorityLanes(rootHasPendingCommit))))) : (nonIdlePendingLanes = pendingLanes & ~suspendedLanes, nonIdlePendingLanes !== 0 ? nextLanes = getHighestPriorityLanes(nonIdlePendingLanes) : pingedLanes !== 0 ? nextLanes = getHighestPriorityLanes(pingedLanes) : rootHasPendingCommit || (rootHasPendingCommit = pendingLanes & ~root, rootHasPendingCommit !== 0 && (nextLanes = getHighestPriorityLanes(rootHasPendingCommit))));
      return nextLanes === 0 ? 0 : wipLanes !== 0 && wipLanes !== nextLanes && (wipLanes & suspendedLanes) === 0 && (suspendedLanes = nextLanes & -nextLanes, rootHasPendingCommit = wipLanes & -wipLanes, suspendedLanes >= rootHasPendingCommit || suspendedLanes === 32 && (rootHasPendingCommit & 4194048) !== 0) ? wipLanes : nextLanes;
    }
    function checkIfRootIsPrerendering(root, renderLanes2) {
      return (root.pendingLanes & ~(root.suspendedLanes & ~root.pingedLanes) & renderLanes2) === 0;
    }
    function computeExpirationTime(lane, currentTime) {
      switch (lane) {
        case 1:
        case 2:
        case 4:
        case 8:
        case 64:
          return currentTime + 250;
        case 16:
        case 32:
        case 128:
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
          return currentTime + 5000;
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
          return -1;
        case 67108864:
        case 134217728:
        case 268435456:
        case 536870912:
        case 1073741824:
          return -1;
        default:
          return -1;
      }
    }
    function claimNextRetryLane() {
      var lane = nextRetryLane;
      nextRetryLane <<= 1;
      (nextRetryLane & 62914560) === 0 && (nextRetryLane = 4194304);
      return lane;
    }
    function createLaneMap(initial) {
      for (var laneMap = [], i = 0;31 > i; i++)
        laneMap.push(initial);
      return laneMap;
    }
    function markRootUpdated$1(root, updateLane) {
      root.pendingLanes |= updateLane;
      updateLane !== 268435456 && (root.suspendedLanes = 0, root.pingedLanes = 0, root.warmLanes = 0);
    }
    function markRootFinished(root, finishedLanes, remainingLanes, spawnedLane, updatedLanes, suspendedRetryLanes) {
      var previouslyPendingLanes = root.pendingLanes;
      root.pendingLanes = remainingLanes;
      root.suspendedLanes = 0;
      root.pingedLanes = 0;
      root.warmLanes = 0;
      root.expiredLanes &= remainingLanes;
      root.entangledLanes &= remainingLanes;
      root.errorRecoveryDisabledLanes &= remainingLanes;
      root.shellSuspendCounter = 0;
      var { entanglements, expirationTimes, hiddenUpdates } = root;
      for (remainingLanes = previouslyPendingLanes & ~remainingLanes;0 < remainingLanes; ) {
        var index$5 = 31 - clz32(remainingLanes), lane = 1 << index$5;
        entanglements[index$5] = 0;
        expirationTimes[index$5] = -1;
        var hiddenUpdatesForLane = hiddenUpdates[index$5];
        if (hiddenUpdatesForLane !== null)
          for (hiddenUpdates[index$5] = null, index$5 = 0;index$5 < hiddenUpdatesForLane.length; index$5++) {
            var update = hiddenUpdatesForLane[index$5];
            update !== null && (update.lane &= -536870913);
          }
        remainingLanes &= ~lane;
      }
      spawnedLane !== 0 && markSpawnedDeferredLane(root, spawnedLane, 0);
      suspendedRetryLanes !== 0 && updatedLanes === 0 && root.tag !== 0 && (root.suspendedLanes |= suspendedRetryLanes & ~(previouslyPendingLanes & ~finishedLanes));
    }
    function markSpawnedDeferredLane(root, spawnedLane, entangledLanes) {
      root.pendingLanes |= spawnedLane;
      root.suspendedLanes &= ~spawnedLane;
      var spawnedLaneIndex = 31 - clz32(spawnedLane);
      root.entangledLanes |= spawnedLane;
      root.entanglements[spawnedLaneIndex] = root.entanglements[spawnedLaneIndex] | 1073741824 | entangledLanes & 261930;
    }
    function markRootEntangled(root, entangledLanes) {
      var rootEntangledLanes = root.entangledLanes |= entangledLanes;
      for (root = root.entanglements;rootEntangledLanes; ) {
        var index$6 = 31 - clz32(rootEntangledLanes), lane = 1 << index$6;
        lane & entangledLanes | root[index$6] & entangledLanes && (root[index$6] |= entangledLanes);
        rootEntangledLanes &= ~lane;
      }
    }
    function getBumpedLaneForHydration(root, renderLanes2) {
      var renderLane = renderLanes2 & -renderLanes2;
      renderLane = (renderLane & 42) !== 0 ? 1 : getBumpedLaneForHydrationByLane(renderLane);
      return (renderLane & (root.suspendedLanes | renderLanes2)) !== 0 ? 0 : renderLane;
    }
    function getBumpedLaneForHydrationByLane(lane) {
      switch (lane) {
        case 2:
          lane = 1;
          break;
        case 8:
          lane = 4;
          break;
        case 32:
          lane = 16;
          break;
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
          lane = 128;
          break;
        case 268435456:
          lane = 134217728;
          break;
        default:
          lane = 0;
      }
      return lane;
    }
    function lanesToEventPriority(lanes) {
      lanes &= -lanes;
      return 2 < lanes ? 8 < lanes ? (lanes & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
    }
    function setIsStrictModeForDevtools(newIsStrictMode) {
      typeof log6 === "function" && unstable_setDisableYieldValue2(newIsStrictMode);
      if (injectedHook && typeof injectedHook.setStrictMode === "function")
        try {
          injectedHook.setStrictMode(rendererID, newIsStrictMode);
        } catch (err) {}
    }
    function is(x, y) {
      return x === y && (x !== 0 || 1 / x === 1 / y) || x !== x && y !== y;
    }
    function describeBuiltInComponentFrame(name) {
      if (prefix === undefined)
        try {
          throw Error();
        } catch (x) {
          var match = x.stack.trim().match(/\n( *(at )?)/);
          prefix = match && match[1] || "";
          suffix = -1 < x.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < x.stack.indexOf("@") ? "@unknown:0:0" : "";
        }
      return `
` + prefix + name + suffix;
    }
    function describeNativeComponentFrame(fn, construct) {
      if (!fn || reentry)
        return "";
      reentry = true;
      var previousPrepareStackTrace = Error.prepareStackTrace;
      Error.prepareStackTrace = undefined;
      try {
        var RunInRootFrame = {
          DetermineComponentFrameRoot: function() {
            try {
              if (construct) {
                var Fake = function() {
                  throw Error();
                };
                Object.defineProperty(Fake.prototype, "props", {
                  set: function() {
                    throw Error();
                  }
                });
                if (typeof Reflect === "object" && Reflect.construct) {
                  try {
                    Reflect.construct(Fake, []);
                  } catch (x) {
                    var control = x;
                  }
                  Reflect.construct(fn, [], Fake);
                } else {
                  try {
                    Fake.call();
                  } catch (x$8) {
                    control = x$8;
                  }
                  fn.call(Fake.prototype);
                }
              } else {
                try {
                  throw Error();
                } catch (x$9) {
                  control = x$9;
                }
                (Fake = fn()) && typeof Fake.catch === "function" && Fake.catch(function() {});
              }
            } catch (sample) {
              if (sample && control && typeof sample.stack === "string")
                return [sample.stack, control.stack];
            }
            return [null, null];
          }
        };
        RunInRootFrame.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
        var namePropDescriptor = Object.getOwnPropertyDescriptor(RunInRootFrame.DetermineComponentFrameRoot, "name");
        namePropDescriptor && namePropDescriptor.configurable && Object.defineProperty(RunInRootFrame.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
        var _RunInRootFrame$Deter = RunInRootFrame.DetermineComponentFrameRoot(), sampleStack = _RunInRootFrame$Deter[0], controlStack = _RunInRootFrame$Deter[1];
        if (sampleStack && controlStack) {
          var sampleLines = sampleStack.split(`
`), controlLines = controlStack.split(`
`);
          for (namePropDescriptor = RunInRootFrame = 0;RunInRootFrame < sampleLines.length && !sampleLines[RunInRootFrame].includes("DetermineComponentFrameRoot"); )
            RunInRootFrame++;
          for (;namePropDescriptor < controlLines.length && !controlLines[namePropDescriptor].includes("DetermineComponentFrameRoot"); )
            namePropDescriptor++;
          if (RunInRootFrame === sampleLines.length || namePropDescriptor === controlLines.length)
            for (RunInRootFrame = sampleLines.length - 1, namePropDescriptor = controlLines.length - 1;1 <= RunInRootFrame && 0 <= namePropDescriptor && sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]; )
              namePropDescriptor--;
          for (;1 <= RunInRootFrame && 0 <= namePropDescriptor; RunInRootFrame--, namePropDescriptor--)
            if (sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]) {
              if (RunInRootFrame !== 1 || namePropDescriptor !== 1) {
                do
                  if (RunInRootFrame--, namePropDescriptor--, 0 > namePropDescriptor || sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]) {
                    var frame = `
` + sampleLines[RunInRootFrame].replace(" at new ", " at ");
                    fn.displayName && frame.includes("<anonymous>") && (frame = frame.replace("<anonymous>", fn.displayName));
                    return frame;
                  }
                while (1 <= RunInRootFrame && 0 <= namePropDescriptor);
              }
              break;
            }
        }
      } finally {
        reentry = false, Error.prepareStackTrace = previousPrepareStackTrace;
      }
      return (previousPrepareStackTrace = fn ? fn.displayName || fn.name : "") ? describeBuiltInComponentFrame(previousPrepareStackTrace) : "";
    }
    function describeFiber(fiber, childFiber) {
      switch (fiber.tag) {
        case 26:
        case 27:
        case 5:
          return describeBuiltInComponentFrame(fiber.type);
        case 16:
          return describeBuiltInComponentFrame("Lazy");
        case 13:
          return fiber.child !== childFiber && childFiber !== null ? describeBuiltInComponentFrame("Suspense Fallback") : describeBuiltInComponentFrame("Suspense");
        case 19:
          return describeBuiltInComponentFrame("SuspenseList");
        case 0:
        case 15:
          return describeNativeComponentFrame(fiber.type, false);
        case 11:
          return describeNativeComponentFrame(fiber.type.render, false);
        case 1:
          return describeNativeComponentFrame(fiber.type, true);
        case 31:
          return describeBuiltInComponentFrame("Activity");
        default:
          return "";
      }
    }
    function getStackByFiberInDevAndProd(workInProgress2) {
      try {
        var info = "", previous = null;
        do
          info += describeFiber(workInProgress2, previous), previous = workInProgress2, workInProgress2 = workInProgress2.return;
        while (workInProgress2);
        return info;
      } catch (x) {
        return `
Error generating stack: ` + x.message + `
` + x.stack;
      }
    }
    function createCapturedValueAtFiber(value, source) {
      if (typeof value === "object" && value !== null) {
        var existing = CapturedStacks.get(value);
        if (existing !== undefined)
          return existing;
        source = {
          value,
          source,
          stack: getStackByFiberInDevAndProd(source)
        };
        CapturedStacks.set(value, source);
        return source;
      }
      return {
        value,
        source,
        stack: getStackByFiberInDevAndProd(source)
      };
    }
    function pushTreeFork(workInProgress2, totalChildren) {
      forkStack[forkStackIndex++] = treeForkCount;
      forkStack[forkStackIndex++] = treeForkProvider;
      treeForkProvider = workInProgress2;
      treeForkCount = totalChildren;
    }
    function pushTreeId(workInProgress2, totalChildren, index) {
      idStack[idStackIndex++] = treeContextId;
      idStack[idStackIndex++] = treeContextOverflow;
      idStack[idStackIndex++] = treeContextProvider;
      treeContextProvider = workInProgress2;
      var baseIdWithLeadingBit = treeContextId;
      workInProgress2 = treeContextOverflow;
      var baseLength = 32 - clz32(baseIdWithLeadingBit) - 1;
      baseIdWithLeadingBit &= ~(1 << baseLength);
      index += 1;
      var length = 32 - clz32(totalChildren) + baseLength;
      if (30 < length) {
        var numberOfOverflowBits = baseLength - baseLength % 5;
        length = (baseIdWithLeadingBit & (1 << numberOfOverflowBits) - 1).toString(32);
        baseIdWithLeadingBit >>= numberOfOverflowBits;
        baseLength -= numberOfOverflowBits;
        treeContextId = 1 << 32 - clz32(totalChildren) + baseLength | index << baseLength | baseIdWithLeadingBit;
        treeContextOverflow = length + workInProgress2;
      } else
        treeContextId = 1 << length | index << baseLength | baseIdWithLeadingBit, treeContextOverflow = workInProgress2;
    }
    function pushMaterializedTreeId(workInProgress2) {
      workInProgress2.return !== null && (pushTreeFork(workInProgress2, 1), pushTreeId(workInProgress2, 1, 0));
    }
    function popTreeContext(workInProgress2) {
      for (;workInProgress2 === treeForkProvider; )
        treeForkProvider = forkStack[--forkStackIndex], forkStack[forkStackIndex] = null, treeForkCount = forkStack[--forkStackIndex], forkStack[forkStackIndex] = null;
      for (;workInProgress2 === treeContextProvider; )
        treeContextProvider = idStack[--idStackIndex], idStack[idStackIndex] = null, treeContextOverflow = idStack[--idStackIndex], idStack[idStackIndex] = null, treeContextId = idStack[--idStackIndex], idStack[idStackIndex] = null;
    }
    function restoreSuspendedTreeContext(workInProgress2, suspendedContext) {
      idStack[idStackIndex++] = treeContextId;
      idStack[idStackIndex++] = treeContextOverflow;
      idStack[idStackIndex++] = treeContextProvider;
      treeContextId = suspendedContext.id;
      treeContextOverflow = suspendedContext.overflow;
      treeContextProvider = workInProgress2;
    }
    function pushHostContainer(fiber, nextRootInstance) {
      push2(rootInstanceStackCursor, nextRootInstance);
      push2(contextFiberStackCursor, fiber);
      push2(contextStackCursor, null);
      fiber = getRootHostContext(nextRootInstance);
      pop2(contextStackCursor);
      push2(contextStackCursor, fiber);
    }
    function popHostContainer() {
      pop2(contextStackCursor);
      pop2(contextFiberStackCursor);
      pop2(rootInstanceStackCursor);
    }
    function pushHostContext(fiber) {
      fiber.memoizedState !== null && push2(hostTransitionProviderCursor, fiber);
      var context = contextStackCursor.current, nextContext = getChildHostContext(context, fiber.type);
      context !== nextContext && (push2(contextFiberStackCursor, fiber), push2(contextStackCursor, nextContext));
    }
    function popHostContext(fiber) {
      contextFiberStackCursor.current === fiber && (pop2(contextStackCursor), pop2(contextFiberStackCursor));
      hostTransitionProviderCursor.current === fiber && (pop2(hostTransitionProviderCursor), isPrimaryRenderer ? HostTransitionContext._currentValue = NotPendingTransition : HostTransitionContext._currentValue2 = NotPendingTransition);
    }
    function throwOnHydrationMismatch(fiber) {
      var error = Error(formatProdErrorMessage(418, 1 < arguments.length && arguments[1] !== undefined && arguments[1] ? "text" : "HTML", ""));
      queueHydrationError(createCapturedValueAtFiber(error, fiber));
      throw HydrationMismatchException;
    }
    function prepareToHydrateHostInstance(fiber, hostContext) {
      if (!supportsHydration)
        throw Error(formatProdErrorMessage(175));
      hydrateInstance(fiber.stateNode, fiber.type, fiber.memoizedProps, hostContext, fiber) || throwOnHydrationMismatch(fiber, true);
    }
    function popToNextHostParent(fiber) {
      for (hydrationParentFiber = fiber.return;hydrationParentFiber; )
        switch (hydrationParentFiber.tag) {
          case 5:
          case 31:
          case 13:
            rootOrSingletonContext = false;
            return;
          case 27:
          case 3:
            rootOrSingletonContext = true;
            return;
          default:
            hydrationParentFiber = hydrationParentFiber.return;
        }
    }
    function popHydrationState(fiber) {
      if (!supportsHydration || fiber !== hydrationParentFiber)
        return false;
      if (!isHydrating)
        return popToNextHostParent(fiber), isHydrating = true, false;
      var tag = fiber.tag;
      supportsSingletons ? tag !== 3 && tag !== 27 && (tag !== 5 || shouldDeleteUnhydratedTailInstances(fiber.type) && !shouldSetTextContent(fiber.type, fiber.memoizedProps)) && nextHydratableInstance && throwOnHydrationMismatch(fiber) : tag !== 3 && (tag !== 5 || shouldDeleteUnhydratedTailInstances(fiber.type) && !shouldSetTextContent(fiber.type, fiber.memoizedProps)) && nextHydratableInstance && throwOnHydrationMismatch(fiber);
      popToNextHostParent(fiber);
      if (tag === 13) {
        if (!supportsHydration)
          throw Error(formatProdErrorMessage(316));
        fiber = fiber.memoizedState;
        fiber = fiber !== null ? fiber.dehydrated : null;
        if (!fiber)
          throw Error(formatProdErrorMessage(317));
        nextHydratableInstance = getNextHydratableInstanceAfterSuspenseInstance(fiber);
      } else if (tag === 31) {
        fiber = fiber.memoizedState;
        fiber = fiber !== null ? fiber.dehydrated : null;
        if (!fiber)
          throw Error(formatProdErrorMessage(317));
        nextHydratableInstance = getNextHydratableInstanceAfterActivityInstance(fiber);
      } else
        nextHydratableInstance = supportsSingletons && tag === 27 ? getNextHydratableSiblingAfterSingleton(fiber.type, nextHydratableInstance) : hydrationParentFiber ? getNextHydratableSibling(fiber.stateNode) : null;
      return true;
    }
    function resetHydrationState() {
      supportsHydration && (nextHydratableInstance = hydrationParentFiber = null, isHydrating = false);
    }
    function upgradeHydrationErrorsToRecoverable() {
      var queuedErrors = hydrationErrors;
      queuedErrors !== null && (workInProgressRootRecoverableErrors === null ? workInProgressRootRecoverableErrors = queuedErrors : workInProgressRootRecoverableErrors.push.apply(workInProgressRootRecoverableErrors, queuedErrors), hydrationErrors = null);
      return queuedErrors;
    }
    function queueHydrationError(error) {
      hydrationErrors === null ? hydrationErrors = [error] : hydrationErrors.push(error);
    }
    function pushProvider(providerFiber, context, nextValue) {
      isPrimaryRenderer ? (push2(valueCursor, context._currentValue), context._currentValue = nextValue) : (push2(valueCursor, context._currentValue2), context._currentValue2 = nextValue);
    }
    function popProvider(context) {
      var currentValue = valueCursor.current;
      isPrimaryRenderer ? context._currentValue = currentValue : context._currentValue2 = currentValue;
      pop2(valueCursor);
    }
    function scheduleContextWorkOnParentPath(parent, renderLanes2, propagationRoot) {
      for (;parent !== null; ) {
        var alternate = parent.alternate;
        (parent.childLanes & renderLanes2) !== renderLanes2 ? (parent.childLanes |= renderLanes2, alternate !== null && (alternate.childLanes |= renderLanes2)) : alternate !== null && (alternate.childLanes & renderLanes2) !== renderLanes2 && (alternate.childLanes |= renderLanes2);
        if (parent === propagationRoot)
          break;
        parent = parent.return;
      }
    }
    function propagateContextChanges(workInProgress2, contexts, renderLanes2, forcePropagateEntireTree) {
      var fiber = workInProgress2.child;
      fiber !== null && (fiber.return = workInProgress2);
      for (;fiber !== null; ) {
        var list = fiber.dependencies;
        if (list !== null) {
          var nextFiber = fiber.child;
          list = list.firstContext;
          a:
            for (;list !== null; ) {
              var dependency = list;
              list = fiber;
              for (var i = 0;i < contexts.length; i++)
                if (dependency.context === contexts[i]) {
                  list.lanes |= renderLanes2;
                  dependency = list.alternate;
                  dependency !== null && (dependency.lanes |= renderLanes2);
                  scheduleContextWorkOnParentPath(list.return, renderLanes2, workInProgress2);
                  forcePropagateEntireTree || (nextFiber = null);
                  break a;
                }
              list = dependency.next;
            }
        } else if (fiber.tag === 18) {
          nextFiber = fiber.return;
          if (nextFiber === null)
            throw Error(formatProdErrorMessage(341));
          nextFiber.lanes |= renderLanes2;
          list = nextFiber.alternate;
          list !== null && (list.lanes |= renderLanes2);
          scheduleContextWorkOnParentPath(nextFiber, renderLanes2, workInProgress2);
          nextFiber = null;
        } else
          nextFiber = fiber.child;
        if (nextFiber !== null)
          nextFiber.return = fiber;
        else
          for (nextFiber = fiber;nextFiber !== null; ) {
            if (nextFiber === workInProgress2) {
              nextFiber = null;
              break;
            }
            fiber = nextFiber.sibling;
            if (fiber !== null) {
              fiber.return = nextFiber.return;
              nextFiber = fiber;
              break;
            }
            nextFiber = nextFiber.return;
          }
        fiber = nextFiber;
      }
    }
    function propagateParentContextChanges(current, workInProgress2, renderLanes2, forcePropagateEntireTree) {
      current = null;
      for (var parent = workInProgress2, isInsidePropagationBailout = false;parent !== null; ) {
        if (!isInsidePropagationBailout) {
          if ((parent.flags & 524288) !== 0)
            isInsidePropagationBailout = true;
          else if ((parent.flags & 262144) !== 0)
            break;
        }
        if (parent.tag === 10) {
          var currentParent = parent.alternate;
          if (currentParent === null)
            throw Error(formatProdErrorMessage(387));
          currentParent = currentParent.memoizedProps;
          if (currentParent !== null) {
            var context = parent.type;
            objectIs(parent.pendingProps.value, currentParent.value) || (current !== null ? current.push(context) : current = [context]);
          }
        } else if (parent === hostTransitionProviderCursor.current) {
          currentParent = parent.alternate;
          if (currentParent === null)
            throw Error(formatProdErrorMessage(387));
          currentParent.memoizedState.memoizedState !== parent.memoizedState.memoizedState && (current !== null ? current.push(HostTransitionContext) : current = [HostTransitionContext]);
        }
        parent = parent.return;
      }
      current !== null && propagateContextChanges(workInProgress2, current, renderLanes2, forcePropagateEntireTree);
      workInProgress2.flags |= 262144;
    }
    function checkIfContextChanged(currentDependencies) {
      for (currentDependencies = currentDependencies.firstContext;currentDependencies !== null; ) {
        var context = currentDependencies.context;
        if (!objectIs(isPrimaryRenderer ? context._currentValue : context._currentValue2, currentDependencies.memoizedValue))
          return true;
        currentDependencies = currentDependencies.next;
      }
      return false;
    }
    function prepareToReadContext(workInProgress2) {
      currentlyRenderingFiber$1 = workInProgress2;
      lastContextDependency = null;
      workInProgress2 = workInProgress2.dependencies;
      workInProgress2 !== null && (workInProgress2.firstContext = null);
    }
    function readContext(context) {
      return readContextForConsumer(currentlyRenderingFiber$1, context);
    }
    function readContextDuringReconciliation(consumer, context) {
      currentlyRenderingFiber$1 === null && prepareToReadContext(consumer);
      return readContextForConsumer(consumer, context);
    }
    function readContextForConsumer(consumer, context) {
      var value = isPrimaryRenderer ? context._currentValue : context._currentValue2;
      context = { context, memoizedValue: value, next: null };
      if (lastContextDependency === null) {
        if (consumer === null)
          throw Error(formatProdErrorMessage(308));
        lastContextDependency = context;
        consumer.dependencies = { lanes: 0, firstContext: context };
        consumer.flags |= 524288;
      } else
        lastContextDependency = lastContextDependency.next = context;
      return value;
    }
    function createCache() {
      return {
        controller: new AbortControllerLocal,
        data: new Map,
        refCount: 0
      };
    }
    function releaseCache(cache) {
      cache.refCount--;
      cache.refCount === 0 && scheduleCallback$2(NormalPriority, function() {
        cache.controller.abort();
      });
    }
    function noop$1() {}
    function ensureRootIsScheduled(root) {
      root !== lastScheduledRoot && root.next === null && (lastScheduledRoot === null ? firstScheduledRoot = lastScheduledRoot = root : lastScheduledRoot = lastScheduledRoot.next = root);
      mightHavePendingSyncWork = true;
      didScheduleMicrotask || (didScheduleMicrotask = true, scheduleImmediateRootScheduleTask());
    }
    function flushSyncWorkAcrossRoots_impl(syncTransitionLanes, onlyLegacy) {
      if (!isFlushingWork && mightHavePendingSyncWork) {
        isFlushingWork = true;
        do {
          var didPerformSomeWork = false;
          for (var root = firstScheduledRoot;root !== null; ) {
            if (!onlyLegacy)
              if (syncTransitionLanes !== 0) {
                var pendingLanes = root.pendingLanes;
                if (pendingLanes === 0)
                  var JSCompiler_inline_result = 0;
                else {
                  var { suspendedLanes, pingedLanes } = root;
                  JSCompiler_inline_result = (1 << 31 - clz32(42 | syncTransitionLanes) + 1) - 1;
                  JSCompiler_inline_result &= pendingLanes & ~(suspendedLanes & ~pingedLanes);
                  JSCompiler_inline_result = JSCompiler_inline_result & 201326741 ? JSCompiler_inline_result & 201326741 | 1 : JSCompiler_inline_result ? JSCompiler_inline_result | 2 : 0;
                }
                JSCompiler_inline_result !== 0 && (didPerformSomeWork = true, performSyncWorkOnRoot(root, JSCompiler_inline_result));
              } else
                JSCompiler_inline_result = workInProgressRootRenderLanes, JSCompiler_inline_result = getNextLanes(root, root === workInProgressRoot ? JSCompiler_inline_result : 0, root.cancelPendingCommit !== null || root.timeoutHandle !== noTimeout), (JSCompiler_inline_result & 3) === 0 || checkIfRootIsPrerendering(root, JSCompiler_inline_result) || (didPerformSomeWork = true, performSyncWorkOnRoot(root, JSCompiler_inline_result));
            root = root.next;
          }
        } while (didPerformSomeWork);
        isFlushingWork = false;
      }
    }
    function processRootScheduleInImmediateTask() {
      processRootScheduleInMicrotask();
    }
    function processRootScheduleInMicrotask() {
      mightHavePendingSyncWork = didScheduleMicrotask = false;
      var syncTransitionLanes = 0;
      currentEventTransitionLane !== 0 && shouldAttemptEagerTransition() && (syncTransitionLanes = currentEventTransitionLane);
      for (var currentTime = now(), prev = null, root = firstScheduledRoot;root !== null; ) {
        var next = root.next, nextLanes = scheduleTaskForRootDuringMicrotask(root, currentTime);
        if (nextLanes === 0)
          root.next = null, prev === null ? firstScheduledRoot = next : prev.next = next, next === null && (lastScheduledRoot = prev);
        else if (prev = root, syncTransitionLanes !== 0 || (nextLanes & 3) !== 0)
          mightHavePendingSyncWork = true;
        root = next;
      }
      pendingEffectsStatus !== 0 && pendingEffectsStatus !== 5 || flushSyncWorkAcrossRoots_impl(syncTransitionLanes, false);
      currentEventTransitionLane !== 0 && (currentEventTransitionLane = 0);
    }
    function scheduleTaskForRootDuringMicrotask(root, currentTime) {
      for (var { suspendedLanes, pingedLanes, expirationTimes } = root, lanes = root.pendingLanes & -62914561;0 < lanes; ) {
        var index$3 = 31 - clz32(lanes), lane = 1 << index$3, expirationTime = expirationTimes[index$3];
        if (expirationTime === -1) {
          if ((lane & suspendedLanes) === 0 || (lane & pingedLanes) !== 0)
            expirationTimes[index$3] = computeExpirationTime(lane, currentTime);
        } else
          expirationTime <= currentTime && (root.expiredLanes |= lane);
        lanes &= ~lane;
      }
      currentTime = workInProgressRoot;
      suspendedLanes = workInProgressRootRenderLanes;
      suspendedLanes = getNextLanes(root, root === currentTime ? suspendedLanes : 0, root.cancelPendingCommit !== null || root.timeoutHandle !== noTimeout);
      pingedLanes = root.callbackNode;
      if (suspendedLanes === 0 || root === currentTime && (workInProgressSuspendedReason === 2 || workInProgressSuspendedReason === 9) || root.cancelPendingCommit !== null)
        return pingedLanes !== null && pingedLanes !== null && cancelCallback$1(pingedLanes), root.callbackNode = null, root.callbackPriority = 0;
      if ((suspendedLanes & 3) === 0 || checkIfRootIsPrerendering(root, suspendedLanes)) {
        currentTime = suspendedLanes & -suspendedLanes;
        if (currentTime === root.callbackPriority)
          return currentTime;
        pingedLanes !== null && cancelCallback$1(pingedLanes);
        switch (lanesToEventPriority(suspendedLanes)) {
          case 2:
          case 8:
            suspendedLanes = UserBlockingPriority;
            break;
          case 32:
            suspendedLanes = NormalPriority$1;
            break;
          case 268435456:
            suspendedLanes = IdlePriority;
            break;
          default:
            suspendedLanes = NormalPriority$1;
        }
        pingedLanes = performWorkOnRootViaSchedulerTask.bind(null, root);
        suspendedLanes = scheduleCallback$3(suspendedLanes, pingedLanes);
        root.callbackPriority = currentTime;
        root.callbackNode = suspendedLanes;
        return currentTime;
      }
      pingedLanes !== null && pingedLanes !== null && cancelCallback$1(pingedLanes);
      root.callbackPriority = 2;
      root.callbackNode = null;
      return 2;
    }
    function performWorkOnRootViaSchedulerTask(root, didTimeout) {
      if (pendingEffectsStatus !== 0 && pendingEffectsStatus !== 5)
        return root.callbackNode = null, root.callbackPriority = 0, null;
      var originalCallbackNode = root.callbackNode;
      if (flushPendingEffects() && root.callbackNode !== originalCallbackNode)
        return null;
      var workInProgressRootRenderLanes$jscomp$0 = workInProgressRootRenderLanes;
      workInProgressRootRenderLanes$jscomp$0 = getNextLanes(root, root === workInProgressRoot ? workInProgressRootRenderLanes$jscomp$0 : 0, root.cancelPendingCommit !== null || root.timeoutHandle !== noTimeout);
      if (workInProgressRootRenderLanes$jscomp$0 === 0)
        return null;
      performWorkOnRoot(root, workInProgressRootRenderLanes$jscomp$0, didTimeout);
      scheduleTaskForRootDuringMicrotask(root, now());
      return root.callbackNode != null && root.callbackNode === originalCallbackNode ? performWorkOnRootViaSchedulerTask.bind(null, root) : null;
    }
    function performSyncWorkOnRoot(root, lanes) {
      if (flushPendingEffects())
        return null;
      performWorkOnRoot(root, lanes, true);
    }
    function scheduleImmediateRootScheduleTask() {
      supportsMicrotasks ? scheduleMicrotask(function() {
        (executionContext & 6) !== 0 ? scheduleCallback$3(ImmediatePriority, processRootScheduleInImmediateTask) : processRootScheduleInMicrotask();
      }) : scheduleCallback$3(ImmediatePriority, processRootScheduleInImmediateTask);
    }
    function requestTransitionLane() {
      if (currentEventTransitionLane === 0) {
        var actionScopeLane = currentEntangledLane;
        actionScopeLane === 0 && (actionScopeLane = nextTransitionUpdateLane, nextTransitionUpdateLane <<= 1, (nextTransitionUpdateLane & 261888) === 0 && (nextTransitionUpdateLane = 256));
        currentEventTransitionLane = actionScopeLane;
      }
      return currentEventTransitionLane;
    }
    function entangleAsyncAction(transition, thenable) {
      if (currentEntangledListeners === null) {
        var entangledListeners = currentEntangledListeners = [];
        currentEntangledPendingCount = 0;
        currentEntangledLane = requestTransitionLane();
        currentEntangledActionThenable = {
          status: "pending",
          value: undefined,
          then: function(resolve2) {
            entangledListeners.push(resolve2);
          }
        };
      }
      currentEntangledPendingCount++;
      thenable.then(pingEngtangledActionScope, pingEngtangledActionScope);
      return thenable;
    }
    function pingEngtangledActionScope() {
      if (--currentEntangledPendingCount === 0 && currentEntangledListeners !== null) {
        currentEntangledActionThenable !== null && (currentEntangledActionThenable.status = "fulfilled");
        var listeners = currentEntangledListeners;
        currentEntangledListeners = null;
        currentEntangledLane = 0;
        currentEntangledActionThenable = null;
        for (var i = 0;i < listeners.length; i++)
          (0, listeners[i])();
      }
    }
    function chainThenableValue(thenable, result) {
      var listeners = [], thenableWithOverride = {
        status: "pending",
        value: null,
        reason: null,
        then: function(resolve2) {
          listeners.push(resolve2);
        }
      };
      thenable.then(function() {
        thenableWithOverride.status = "fulfilled";
        thenableWithOverride.value = result;
        for (var i = 0;i < listeners.length; i++)
          (0, listeners[i])(result);
      }, function(error) {
        thenableWithOverride.status = "rejected";
        thenableWithOverride.reason = error;
        for (error = 0;error < listeners.length; error++)
          (0, listeners[error])(undefined);
      });
      return thenableWithOverride;
    }
    function peekCacheFromPool() {
      var cacheResumedFromPreviousRender = resumedCache.current;
      return cacheResumedFromPreviousRender !== null ? cacheResumedFromPreviousRender : workInProgressRoot.pooledCache;
    }
    function pushTransition(offscreenWorkInProgress, prevCachePool) {
      prevCachePool === null ? push2(resumedCache, resumedCache.current) : push2(resumedCache, prevCachePool.pool);
    }
    function getSuspendedCache() {
      var cacheFromPool = peekCacheFromPool();
      return cacheFromPool === null ? null : {
        parent: isPrimaryRenderer ? CacheContext._currentValue : CacheContext._currentValue2,
        pool: cacheFromPool
      };
    }
    function shallowEqual(objA, objB) {
      if (objectIs(objA, objB))
        return true;
      if (typeof objA !== "object" || objA === null || typeof objB !== "object" || objB === null)
        return false;
      var keysA = Object.keys(objA), keysB = Object.keys(objB);
      if (keysA.length !== keysB.length)
        return false;
      for (keysB = 0;keysB < keysA.length; keysB++) {
        var currentKey = keysA[keysB];
        if (!hasOwnProperty2.call(objB, currentKey) || !objectIs(objA[currentKey], objB[currentKey]))
          return false;
      }
      return true;
    }
    function isThenableResolved(thenable) {
      thenable = thenable.status;
      return thenable === "fulfilled" || thenable === "rejected";
    }
    function trackUsedThenable(thenableState2, thenable, index) {
      index = thenableState2[index];
      index === undefined ? thenableState2.push(thenable) : index !== thenable && (thenable.then(noop$1, noop$1), thenable = index);
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenableState2 = thenable.reason, checkIfUseWrappedInAsyncCatch(thenableState2), thenableState2;
        default:
          if (typeof thenable.status === "string")
            thenable.then(noop$1, noop$1);
          else {
            thenableState2 = workInProgressRoot;
            if (thenableState2 !== null && 100 < thenableState2.shellSuspendCounter)
              throw Error(formatProdErrorMessage(482));
            thenableState2 = thenable;
            thenableState2.status = "pending";
            thenableState2.then(function(fulfilledValue) {
              if (thenable.status === "pending") {
                var fulfilledThenable = thenable;
                fulfilledThenable.status = "fulfilled";
                fulfilledThenable.value = fulfilledValue;
              }
            }, function(error) {
              if (thenable.status === "pending") {
                var rejectedThenable = thenable;
                rejectedThenable.status = "rejected";
                rejectedThenable.reason = error;
              }
            });
          }
          switch (thenable.status) {
            case "fulfilled":
              return thenable.value;
            case "rejected":
              throw thenableState2 = thenable.reason, checkIfUseWrappedInAsyncCatch(thenableState2), thenableState2;
          }
          suspendedThenable = thenable;
          throw SuspenseException;
      }
    }
    function resolveLazy(lazyType) {
      try {
        var init = lazyType._init;
        return init(lazyType._payload);
      } catch (x) {
        if (x !== null && typeof x === "object" && typeof x.then === "function")
          throw suspendedThenable = x, SuspenseException;
        throw x;
      }
    }
    function getSuspendedThenable() {
      if (suspendedThenable === null)
        throw Error(formatProdErrorMessage(459));
      var thenable = suspendedThenable;
      suspendedThenable = null;
      return thenable;
    }
    function checkIfUseWrappedInAsyncCatch(rejectedReason) {
      if (rejectedReason === SuspenseException || rejectedReason === SuspenseActionException)
        throw Error(formatProdErrorMessage(483));
    }
    function unwrapThenable(thenable) {
      var index = thenableIndexCounter$1;
      thenableIndexCounter$1 += 1;
      thenableState$1 === null && (thenableState$1 = []);
      return trackUsedThenable(thenableState$1, thenable, index);
    }
    function coerceRef(workInProgress2, element) {
      element = element.props.ref;
      workInProgress2.ref = element !== undefined ? element : null;
    }
    function throwOnInvalidObjectTypeImpl(returnFiber, newChild) {
      if (newChild.$$typeof === REACT_LEGACY_ELEMENT_TYPE)
        throw Error(formatProdErrorMessage(525));
      returnFiber = Object.prototype.toString.call(newChild);
      throw Error(formatProdErrorMessage(31, returnFiber === "[object Object]" ? "object with keys {" + Object.keys(newChild).join(", ") + "}" : returnFiber));
    }
    function createChildReconciler(shouldTrackSideEffects) {
      function deleteChild(returnFiber, childToDelete) {
        if (shouldTrackSideEffects) {
          var deletions = returnFiber.deletions;
          deletions === null ? (returnFiber.deletions = [childToDelete], returnFiber.flags |= 16) : deletions.push(childToDelete);
        }
      }
      function deleteRemainingChildren(returnFiber, currentFirstChild) {
        if (!shouldTrackSideEffects)
          return null;
        for (;currentFirstChild !== null; )
          deleteChild(returnFiber, currentFirstChild), currentFirstChild = currentFirstChild.sibling;
        return null;
      }
      function mapRemainingChildren(currentFirstChild) {
        for (var existingChildren = new Map;currentFirstChild !== null; )
          currentFirstChild.key !== null ? existingChildren.set(currentFirstChild.key, currentFirstChild) : existingChildren.set(currentFirstChild.index, currentFirstChild), currentFirstChild = currentFirstChild.sibling;
        return existingChildren;
      }
      function useFiber(fiber, pendingProps) {
        fiber = createWorkInProgress(fiber, pendingProps);
        fiber.index = 0;
        fiber.sibling = null;
        return fiber;
      }
      function placeChild(newFiber, lastPlacedIndex, newIndex) {
        newFiber.index = newIndex;
        if (!shouldTrackSideEffects)
          return newFiber.flags |= 1048576, lastPlacedIndex;
        newIndex = newFiber.alternate;
        if (newIndex !== null)
          return newIndex = newIndex.index, newIndex < lastPlacedIndex ? (newFiber.flags |= 67108866, lastPlacedIndex) : newIndex;
        newFiber.flags |= 67108866;
        return lastPlacedIndex;
      }
      function placeSingleChild(newFiber) {
        shouldTrackSideEffects && newFiber.alternate === null && (newFiber.flags |= 67108866);
        return newFiber;
      }
      function updateTextNode(returnFiber, current, textContent, lanes) {
        if (current === null || current.tag !== 6)
          return current = createFiberFromText(textContent, returnFiber.mode, lanes), current.return = returnFiber, current;
        current = useFiber(current, textContent);
        current.return = returnFiber;
        return current;
      }
      function updateElement(returnFiber, current, element, lanes) {
        var elementType = element.type;
        if (elementType === REACT_FRAGMENT_TYPE2)
          return updateFragment(returnFiber, current, element.props.children, lanes, element.key);
        if (current !== null && (current.elementType === elementType || typeof elementType === "object" && elementType !== null && elementType.$$typeof === REACT_LAZY_TYPE2 && resolveLazy(elementType) === current.type))
          return current = useFiber(current, element.props), coerceRef(current, element), current.return = returnFiber, current;
        current = createFiberFromTypeAndProps(element.type, element.key, element.props, null, returnFiber.mode, lanes);
        coerceRef(current, element);
        current.return = returnFiber;
        return current;
      }
      function updatePortal(returnFiber, current, portal, lanes) {
        if (current === null || current.tag !== 4 || current.stateNode.containerInfo !== portal.containerInfo || current.stateNode.implementation !== portal.implementation)
          return current = createFiberFromPortal(portal, returnFiber.mode, lanes), current.return = returnFiber, current;
        current = useFiber(current, portal.children || []);
        current.return = returnFiber;
        return current;
      }
      function updateFragment(returnFiber, current, fragment, lanes, key) {
        if (current === null || current.tag !== 7)
          return current = createFiberFromFragment(fragment, returnFiber.mode, lanes, key), current.return = returnFiber, current;
        current = useFiber(current, fragment);
        current.return = returnFiber;
        return current;
      }
      function createChild(returnFiber, newChild, lanes) {
        if (typeof newChild === "string" && newChild !== "" || typeof newChild === "number" || typeof newChild === "bigint")
          return newChild = createFiberFromText("" + newChild, returnFiber.mode, lanes), newChild.return = returnFiber, newChild;
        if (typeof newChild === "object" && newChild !== null) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE2:
              return lanes = createFiberFromTypeAndProps(newChild.type, newChild.key, newChild.props, null, returnFiber.mode, lanes), coerceRef(lanes, newChild), lanes.return = returnFiber, lanes;
            case REACT_PORTAL_TYPE2:
              return newChild = createFiberFromPortal(newChild, returnFiber.mode, lanes), newChild.return = returnFiber, newChild;
            case REACT_LAZY_TYPE2:
              return newChild = resolveLazy(newChild), createChild(returnFiber, newChild, lanes);
          }
          if (isArrayImpl2(newChild) || getIteratorFn2(newChild))
            return newChild = createFiberFromFragment(newChild, returnFiber.mode, lanes, null), newChild.return = returnFiber, newChild;
          if (typeof newChild.then === "function")
            return createChild(returnFiber, unwrapThenable(newChild), lanes);
          if (newChild.$$typeof === REACT_CONTEXT_TYPE2)
            return createChild(returnFiber, readContextDuringReconciliation(returnFiber, newChild), lanes);
          throwOnInvalidObjectTypeImpl(returnFiber, newChild);
        }
        return null;
      }
      function updateSlot(returnFiber, oldFiber, newChild, lanes) {
        var key = oldFiber !== null ? oldFiber.key : null;
        if (typeof newChild === "string" && newChild !== "" || typeof newChild === "number" || typeof newChild === "bigint")
          return key !== null ? null : updateTextNode(returnFiber, oldFiber, "" + newChild, lanes);
        if (typeof newChild === "object" && newChild !== null) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE2:
              return newChild.key === key ? updateElement(returnFiber, oldFiber, newChild, lanes) : null;
            case REACT_PORTAL_TYPE2:
              return newChild.key === key ? updatePortal(returnFiber, oldFiber, newChild, lanes) : null;
            case REACT_LAZY_TYPE2:
              return newChild = resolveLazy(newChild), updateSlot(returnFiber, oldFiber, newChild, lanes);
          }
          if (isArrayImpl2(newChild) || getIteratorFn2(newChild))
            return key !== null ? null : updateFragment(returnFiber, oldFiber, newChild, lanes, null);
          if (typeof newChild.then === "function")
            return updateSlot(returnFiber, oldFiber, unwrapThenable(newChild), lanes);
          if (newChild.$$typeof === REACT_CONTEXT_TYPE2)
            return updateSlot(returnFiber, oldFiber, readContextDuringReconciliation(returnFiber, newChild), lanes);
          throwOnInvalidObjectTypeImpl(returnFiber, newChild);
        }
        return null;
      }
      function updateFromMap(existingChildren, returnFiber, newIdx, newChild, lanes) {
        if (typeof newChild === "string" && newChild !== "" || typeof newChild === "number" || typeof newChild === "bigint")
          return existingChildren = existingChildren.get(newIdx) || null, updateTextNode(returnFiber, existingChildren, "" + newChild, lanes);
        if (typeof newChild === "object" && newChild !== null) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE2:
              return existingChildren = existingChildren.get(newChild.key === null ? newIdx : newChild.key) || null, updateElement(returnFiber, existingChildren, newChild, lanes);
            case REACT_PORTAL_TYPE2:
              return existingChildren = existingChildren.get(newChild.key === null ? newIdx : newChild.key) || null, updatePortal(returnFiber, existingChildren, newChild, lanes);
            case REACT_LAZY_TYPE2:
              return newChild = resolveLazy(newChild), updateFromMap(existingChildren, returnFiber, newIdx, newChild, lanes);
          }
          if (isArrayImpl2(newChild) || getIteratorFn2(newChild))
            return existingChildren = existingChildren.get(newIdx) || null, updateFragment(returnFiber, existingChildren, newChild, lanes, null);
          if (typeof newChild.then === "function")
            return updateFromMap(existingChildren, returnFiber, newIdx, unwrapThenable(newChild), lanes);
          if (newChild.$$typeof === REACT_CONTEXT_TYPE2)
            return updateFromMap(existingChildren, returnFiber, newIdx, readContextDuringReconciliation(returnFiber, newChild), lanes);
          throwOnInvalidObjectTypeImpl(returnFiber, newChild);
        }
        return null;
      }
      function reconcileChildrenArray(returnFiber, currentFirstChild, newChildren, lanes) {
        for (var resultingFirstChild = null, previousNewFiber = null, oldFiber = currentFirstChild, newIdx = currentFirstChild = 0, nextOldFiber = null;oldFiber !== null && newIdx < newChildren.length; newIdx++) {
          oldFiber.index > newIdx ? (nextOldFiber = oldFiber, oldFiber = null) : nextOldFiber = oldFiber.sibling;
          var newFiber = updateSlot(returnFiber, oldFiber, newChildren[newIdx], lanes);
          if (newFiber === null) {
            oldFiber === null && (oldFiber = nextOldFiber);
            break;
          }
          shouldTrackSideEffects && oldFiber && newFiber.alternate === null && deleteChild(returnFiber, oldFiber);
          currentFirstChild = placeChild(newFiber, currentFirstChild, newIdx);
          previousNewFiber === null ? resultingFirstChild = newFiber : previousNewFiber.sibling = newFiber;
          previousNewFiber = newFiber;
          oldFiber = nextOldFiber;
        }
        if (newIdx === newChildren.length)
          return deleteRemainingChildren(returnFiber, oldFiber), isHydrating && pushTreeFork(returnFiber, newIdx), resultingFirstChild;
        if (oldFiber === null) {
          for (;newIdx < newChildren.length; newIdx++)
            oldFiber = createChild(returnFiber, newChildren[newIdx], lanes), oldFiber !== null && (currentFirstChild = placeChild(oldFiber, currentFirstChild, newIdx), previousNewFiber === null ? resultingFirstChild = oldFiber : previousNewFiber.sibling = oldFiber, previousNewFiber = oldFiber);
          isHydrating && pushTreeFork(returnFiber, newIdx);
          return resultingFirstChild;
        }
        for (oldFiber = mapRemainingChildren(oldFiber);newIdx < newChildren.length; newIdx++)
          nextOldFiber = updateFromMap(oldFiber, returnFiber, newIdx, newChildren[newIdx], lanes), nextOldFiber !== null && (shouldTrackSideEffects && nextOldFiber.alternate !== null && oldFiber.delete(nextOldFiber.key === null ? newIdx : nextOldFiber.key), currentFirstChild = placeChild(nextOldFiber, currentFirstChild, newIdx), previousNewFiber === null ? resultingFirstChild = nextOldFiber : previousNewFiber.sibling = nextOldFiber, previousNewFiber = nextOldFiber);
        shouldTrackSideEffects && oldFiber.forEach(function(child) {
          return deleteChild(returnFiber, child);
        });
        isHydrating && pushTreeFork(returnFiber, newIdx);
        return resultingFirstChild;
      }
      function reconcileChildrenIterator(returnFiber, currentFirstChild, newChildren, lanes) {
        if (newChildren == null)
          throw Error(formatProdErrorMessage(151));
        for (var resultingFirstChild = null, previousNewFiber = null, oldFiber = currentFirstChild, newIdx = currentFirstChild = 0, nextOldFiber = null, step = newChildren.next();oldFiber !== null && !step.done; newIdx++, step = newChildren.next()) {
          oldFiber.index > newIdx ? (nextOldFiber = oldFiber, oldFiber = null) : nextOldFiber = oldFiber.sibling;
          var newFiber = updateSlot(returnFiber, oldFiber, step.value, lanes);
          if (newFiber === null) {
            oldFiber === null && (oldFiber = nextOldFiber);
            break;
          }
          shouldTrackSideEffects && oldFiber && newFiber.alternate === null && deleteChild(returnFiber, oldFiber);
          currentFirstChild = placeChild(newFiber, currentFirstChild, newIdx);
          previousNewFiber === null ? resultingFirstChild = newFiber : previousNewFiber.sibling = newFiber;
          previousNewFiber = newFiber;
          oldFiber = nextOldFiber;
        }
        if (step.done)
          return deleteRemainingChildren(returnFiber, oldFiber), isHydrating && pushTreeFork(returnFiber, newIdx), resultingFirstChild;
        if (oldFiber === null) {
          for (;!step.done; newIdx++, step = newChildren.next())
            step = createChild(returnFiber, step.value, lanes), step !== null && (currentFirstChild = placeChild(step, currentFirstChild, newIdx), previousNewFiber === null ? resultingFirstChild = step : previousNewFiber.sibling = step, previousNewFiber = step);
          isHydrating && pushTreeFork(returnFiber, newIdx);
          return resultingFirstChild;
        }
        for (oldFiber = mapRemainingChildren(oldFiber);!step.done; newIdx++, step = newChildren.next())
          step = updateFromMap(oldFiber, returnFiber, newIdx, step.value, lanes), step !== null && (shouldTrackSideEffects && step.alternate !== null && oldFiber.delete(step.key === null ? newIdx : step.key), currentFirstChild = placeChild(step, currentFirstChild, newIdx), previousNewFiber === null ? resultingFirstChild = step : previousNewFiber.sibling = step, previousNewFiber = step);
        shouldTrackSideEffects && oldFiber.forEach(function(child) {
          return deleteChild(returnFiber, child);
        });
        isHydrating && pushTreeFork(returnFiber, newIdx);
        return resultingFirstChild;
      }
      function reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes) {
        typeof newChild === "object" && newChild !== null && newChild.type === REACT_FRAGMENT_TYPE2 && newChild.key === null && (newChild = newChild.props.children);
        if (typeof newChild === "object" && newChild !== null) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE2:
              a: {
                for (var key = newChild.key;currentFirstChild !== null; ) {
                  if (currentFirstChild.key === key) {
                    key = newChild.type;
                    if (key === REACT_FRAGMENT_TYPE2) {
                      if (currentFirstChild.tag === 7) {
                        deleteRemainingChildren(returnFiber, currentFirstChild.sibling);
                        lanes = useFiber(currentFirstChild, newChild.props.children);
                        lanes.return = returnFiber;
                        returnFiber = lanes;
                        break a;
                      }
                    } else if (currentFirstChild.elementType === key || typeof key === "object" && key !== null && key.$$typeof === REACT_LAZY_TYPE2 && resolveLazy(key) === currentFirstChild.type) {
                      deleteRemainingChildren(returnFiber, currentFirstChild.sibling);
                      lanes = useFiber(currentFirstChild, newChild.props);
                      coerceRef(lanes, newChild);
                      lanes.return = returnFiber;
                      returnFiber = lanes;
                      break a;
                    }
                    deleteRemainingChildren(returnFiber, currentFirstChild);
                    break;
                  } else
                    deleteChild(returnFiber, currentFirstChild);
                  currentFirstChild = currentFirstChild.sibling;
                }
                newChild.type === REACT_FRAGMENT_TYPE2 ? (lanes = createFiberFromFragment(newChild.props.children, returnFiber.mode, lanes, newChild.key), lanes.return = returnFiber, returnFiber = lanes) : (lanes = createFiberFromTypeAndProps(newChild.type, newChild.key, newChild.props, null, returnFiber.mode, lanes), coerceRef(lanes, newChild), lanes.return = returnFiber, returnFiber = lanes);
              }
              return placeSingleChild(returnFiber);
            case REACT_PORTAL_TYPE2:
              a: {
                for (key = newChild.key;currentFirstChild !== null; ) {
                  if (currentFirstChild.key === key)
                    if (currentFirstChild.tag === 4 && currentFirstChild.stateNode.containerInfo === newChild.containerInfo && currentFirstChild.stateNode.implementation === newChild.implementation) {
                      deleteRemainingChildren(returnFiber, currentFirstChild.sibling);
                      lanes = useFiber(currentFirstChild, newChild.children || []);
                      lanes.return = returnFiber;
                      returnFiber = lanes;
                      break a;
                    } else {
                      deleteRemainingChildren(returnFiber, currentFirstChild);
                      break;
                    }
                  else
                    deleteChild(returnFiber, currentFirstChild);
                  currentFirstChild = currentFirstChild.sibling;
                }
                lanes = createFiberFromPortal(newChild, returnFiber.mode, lanes);
                lanes.return = returnFiber;
                returnFiber = lanes;
              }
              return placeSingleChild(returnFiber);
            case REACT_LAZY_TYPE2:
              return newChild = resolveLazy(newChild), reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes);
          }
          if (isArrayImpl2(newChild))
            return reconcileChildrenArray(returnFiber, currentFirstChild, newChild, lanes);
          if (getIteratorFn2(newChild)) {
            key = getIteratorFn2(newChild);
            if (typeof key !== "function")
              throw Error(formatProdErrorMessage(150));
            newChild = key.call(newChild);
            return reconcileChildrenIterator(returnFiber, currentFirstChild, newChild, lanes);
          }
          if (typeof newChild.then === "function")
            return reconcileChildFibersImpl(returnFiber, currentFirstChild, unwrapThenable(newChild), lanes);
          if (newChild.$$typeof === REACT_CONTEXT_TYPE2)
            return reconcileChildFibersImpl(returnFiber, currentFirstChild, readContextDuringReconciliation(returnFiber, newChild), lanes);
          throwOnInvalidObjectTypeImpl(returnFiber, newChild);
        }
        return typeof newChild === "string" && newChild !== "" || typeof newChild === "number" || typeof newChild === "bigint" ? (newChild = "" + newChild, currentFirstChild !== null && currentFirstChild.tag === 6 ? (deleteRemainingChildren(returnFiber, currentFirstChild.sibling), lanes = useFiber(currentFirstChild, newChild), lanes.return = returnFiber, returnFiber = lanes) : (deleteRemainingChildren(returnFiber, currentFirstChild), lanes = createFiberFromText(newChild, returnFiber.mode, lanes), lanes.return = returnFiber, returnFiber = lanes), placeSingleChild(returnFiber)) : deleteRemainingChildren(returnFiber, currentFirstChild);
      }
      return function(returnFiber, currentFirstChild, newChild, lanes) {
        try {
          thenableIndexCounter$1 = 0;
          var firstChildFiber = reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes);
          thenableState$1 = null;
          return firstChildFiber;
        } catch (x) {
          if (x === SuspenseException || x === SuspenseActionException)
            throw x;
          var fiber = createFiber(29, x, null, returnFiber.mode);
          fiber.lanes = lanes;
          fiber.return = returnFiber;
          return fiber;
        } finally {}
      };
    }
    function finishQueueingConcurrentUpdates() {
      for (var endIndex = concurrentQueuesIndex, i = concurrentlyUpdatedLanes = concurrentQueuesIndex = 0;i < endIndex; ) {
        var fiber = concurrentQueues[i];
        concurrentQueues[i++] = null;
        var queue = concurrentQueues[i];
        concurrentQueues[i++] = null;
        var update = concurrentQueues[i];
        concurrentQueues[i++] = null;
        var lane = concurrentQueues[i];
        concurrentQueues[i++] = null;
        if (queue !== null && update !== null) {
          var pending = queue.pending;
          pending === null ? update.next = update : (update.next = pending.next, pending.next = update);
          queue.pending = update;
        }
        lane !== 0 && markUpdateLaneFromFiberToRoot(fiber, update, lane);
      }
    }
    function enqueueUpdate$1(fiber, queue, update, lane) {
      concurrentQueues[concurrentQueuesIndex++] = fiber;
      concurrentQueues[concurrentQueuesIndex++] = queue;
      concurrentQueues[concurrentQueuesIndex++] = update;
      concurrentQueues[concurrentQueuesIndex++] = lane;
      concurrentlyUpdatedLanes |= lane;
      fiber.lanes |= lane;
      fiber = fiber.alternate;
      fiber !== null && (fiber.lanes |= lane);
    }
    function enqueueConcurrentHookUpdate(fiber, queue, update, lane) {
      enqueueUpdate$1(fiber, queue, update, lane);
      return getRootForUpdatedFiber(fiber);
    }
    function enqueueConcurrentRenderForLane(fiber, lane) {
      enqueueUpdate$1(fiber, null, null, lane);
      return getRootForUpdatedFiber(fiber);
    }
    function markUpdateLaneFromFiberToRoot(sourceFiber, update, lane) {
      sourceFiber.lanes |= lane;
      var alternate = sourceFiber.alternate;
      alternate !== null && (alternate.lanes |= lane);
      for (var isHidden = false, parent = sourceFiber.return;parent !== null; )
        parent.childLanes |= lane, alternate = parent.alternate, alternate !== null && (alternate.childLanes |= lane), parent.tag === 22 && (sourceFiber = parent.stateNode, sourceFiber === null || sourceFiber._visibility & 1 || (isHidden = true)), sourceFiber = parent, parent = parent.return;
      return sourceFiber.tag === 3 ? (parent = sourceFiber.stateNode, isHidden && update !== null && (isHidden = 31 - clz32(lane), sourceFiber = parent.hiddenUpdates, alternate = sourceFiber[isHidden], alternate === null ? sourceFiber[isHidden] = [update] : alternate.push(update), update.lane = lane | 536870912), parent) : null;
    }
    function getRootForUpdatedFiber(sourceFiber) {
      if (50 < nestedUpdateCount)
        throw nestedUpdateCount = 0, rootWithNestedUpdates = null, Error(formatProdErrorMessage(185));
      for (var parent = sourceFiber.return;parent !== null; )
        sourceFiber = parent, parent = sourceFiber.return;
      return sourceFiber.tag === 3 ? sourceFiber.stateNode : null;
    }
    function initializeUpdateQueue(fiber) {
      fiber.updateQueue = {
        baseState: fiber.memoizedState,
        firstBaseUpdate: null,
        lastBaseUpdate: null,
        shared: { pending: null, lanes: 0, hiddenCallbacks: null },
        callbacks: null
      };
    }
    function cloneUpdateQueue(current, workInProgress2) {
      current = current.updateQueue;
      workInProgress2.updateQueue === current && (workInProgress2.updateQueue = {
        baseState: current.baseState,
        firstBaseUpdate: current.firstBaseUpdate,
        lastBaseUpdate: current.lastBaseUpdate,
        shared: current.shared,
        callbacks: null
      });
    }
    function createUpdate(lane) {
      return { lane, tag: 0, payload: null, callback: null, next: null };
    }
    function enqueueUpdate(fiber, update, lane) {
      var updateQueue = fiber.updateQueue;
      if (updateQueue === null)
        return null;
      updateQueue = updateQueue.shared;
      if ((executionContext & 2) !== 0) {
        var pending = updateQueue.pending;
        pending === null ? update.next = update : (update.next = pending.next, pending.next = update);
        updateQueue.pending = update;
        update = getRootForUpdatedFiber(fiber);
        markUpdateLaneFromFiberToRoot(fiber, null, lane);
        return update;
      }
      enqueueUpdate$1(fiber, updateQueue, update, lane);
      return getRootForUpdatedFiber(fiber);
    }
    function entangleTransitions(root, fiber, lane) {
      fiber = fiber.updateQueue;
      if (fiber !== null && (fiber = fiber.shared, (lane & 4194048) !== 0)) {
        var queueLanes = fiber.lanes;
        queueLanes &= root.pendingLanes;
        lane |= queueLanes;
        fiber.lanes = lane;
        markRootEntangled(root, lane);
      }
    }
    function enqueueCapturedUpdate(workInProgress2, capturedUpdate) {
      var { updateQueue: queue, alternate: current } = workInProgress2;
      if (current !== null && (current = current.updateQueue, queue === current)) {
        var newFirst = null, newLast = null;
        queue = queue.firstBaseUpdate;
        if (queue !== null) {
          do {
            var clone = {
              lane: queue.lane,
              tag: queue.tag,
              payload: queue.payload,
              callback: null,
              next: null
            };
            newLast === null ? newFirst = newLast = clone : newLast = newLast.next = clone;
            queue = queue.next;
          } while (queue !== null);
          newLast === null ? newFirst = newLast = capturedUpdate : newLast = newLast.next = capturedUpdate;
        } else
          newFirst = newLast = capturedUpdate;
        queue = {
          baseState: current.baseState,
          firstBaseUpdate: newFirst,
          lastBaseUpdate: newLast,
          shared: current.shared,
          callbacks: current.callbacks
        };
        workInProgress2.updateQueue = queue;
        return;
      }
      workInProgress2 = queue.lastBaseUpdate;
      workInProgress2 === null ? queue.firstBaseUpdate = capturedUpdate : workInProgress2.next = capturedUpdate;
      queue.lastBaseUpdate = capturedUpdate;
    }
    function suspendIfUpdateReadFromEntangledAsyncAction() {
      if (didReadFromEntangledAsyncAction) {
        var entangledActionThenable = currentEntangledActionThenable;
        if (entangledActionThenable !== null)
          throw entangledActionThenable;
      }
    }
    function processUpdateQueue(workInProgress$jscomp$0, props, instance$jscomp$0, renderLanes2) {
      didReadFromEntangledAsyncAction = false;
      var queue = workInProgress$jscomp$0.updateQueue;
      hasForceUpdate = false;
      var { firstBaseUpdate, lastBaseUpdate } = queue, pendingQueue = queue.shared.pending;
      if (pendingQueue !== null) {
        queue.shared.pending = null;
        var lastPendingUpdate = pendingQueue, firstPendingUpdate = lastPendingUpdate.next;
        lastPendingUpdate.next = null;
        lastBaseUpdate === null ? firstBaseUpdate = firstPendingUpdate : lastBaseUpdate.next = firstPendingUpdate;
        lastBaseUpdate = lastPendingUpdate;
        var current = workInProgress$jscomp$0.alternate;
        current !== null && (current = current.updateQueue, pendingQueue = current.lastBaseUpdate, pendingQueue !== lastBaseUpdate && (pendingQueue === null ? current.firstBaseUpdate = firstPendingUpdate : pendingQueue.next = firstPendingUpdate, current.lastBaseUpdate = lastPendingUpdate));
      }
      if (firstBaseUpdate !== null) {
        var newState = queue.baseState;
        lastBaseUpdate = 0;
        current = firstPendingUpdate = lastPendingUpdate = null;
        pendingQueue = firstBaseUpdate;
        do {
          var updateLane = pendingQueue.lane & -536870913, isHiddenUpdate = updateLane !== pendingQueue.lane;
          if (isHiddenUpdate ? (workInProgressRootRenderLanes & updateLane) === updateLane : (renderLanes2 & updateLane) === updateLane) {
            updateLane !== 0 && updateLane === currentEntangledLane && (didReadFromEntangledAsyncAction = true);
            current !== null && (current = current.next = {
              lane: 0,
              tag: pendingQueue.tag,
              payload: pendingQueue.payload,
              callback: null,
              next: null
            });
            a: {
              var workInProgress2 = workInProgress$jscomp$0, update = pendingQueue;
              updateLane = props;
              var instance = instance$jscomp$0;
              switch (update.tag) {
                case 1:
                  workInProgress2 = update.payload;
                  if (typeof workInProgress2 === "function") {
                    newState = workInProgress2.call(instance, newState, updateLane);
                    break a;
                  }
                  newState = workInProgress2;
                  break a;
                case 3:
                  workInProgress2.flags = workInProgress2.flags & -65537 | 128;
                case 0:
                  workInProgress2 = update.payload;
                  updateLane = typeof workInProgress2 === "function" ? workInProgress2.call(instance, newState, updateLane) : workInProgress2;
                  if (updateLane === null || updateLane === undefined)
                    break a;
                  newState = assign2({}, newState, updateLane);
                  break a;
                case 2:
                  hasForceUpdate = true;
              }
            }
            updateLane = pendingQueue.callback;
            updateLane !== null && (workInProgress$jscomp$0.flags |= 64, isHiddenUpdate && (workInProgress$jscomp$0.flags |= 8192), isHiddenUpdate = queue.callbacks, isHiddenUpdate === null ? queue.callbacks = [updateLane] : isHiddenUpdate.push(updateLane));
          } else
            isHiddenUpdate = {
              lane: updateLane,
              tag: pendingQueue.tag,
              payload: pendingQueue.payload,
              callback: pendingQueue.callback,
              next: null
            }, current === null ? (firstPendingUpdate = current = isHiddenUpdate, lastPendingUpdate = newState) : current = current.next = isHiddenUpdate, lastBaseUpdate |= updateLane;
          pendingQueue = pendingQueue.next;
          if (pendingQueue === null)
            if (pendingQueue = queue.shared.pending, pendingQueue === null)
              break;
            else
              isHiddenUpdate = pendingQueue, pendingQueue = isHiddenUpdate.next, isHiddenUpdate.next = null, queue.lastBaseUpdate = isHiddenUpdate, queue.shared.pending = null;
        } while (1);
        current === null && (lastPendingUpdate = newState);
        queue.baseState = lastPendingUpdate;
        queue.firstBaseUpdate = firstPendingUpdate;
        queue.lastBaseUpdate = current;
        firstBaseUpdate === null && (queue.shared.lanes = 0);
        workInProgressRootSkippedLanes |= lastBaseUpdate;
        workInProgress$jscomp$0.lanes = lastBaseUpdate;
        workInProgress$jscomp$0.memoizedState = newState;
      }
    }
    function callCallback(callback, context) {
      if (typeof callback !== "function")
        throw Error(formatProdErrorMessage(191, callback));
      callback.call(context);
    }
    function commitCallbacks(updateQueue, context) {
      var callbacks = updateQueue.callbacks;
      if (callbacks !== null)
        for (updateQueue.callbacks = null, updateQueue = 0;updateQueue < callbacks.length; updateQueue++)
          callCallback(callbacks[updateQueue], context);
    }
    function pushHiddenContext(fiber, context) {
      fiber = entangledRenderLanes;
      push2(prevEntangledRenderLanesCursor, fiber);
      push2(currentTreeHiddenStackCursor, context);
      entangledRenderLanes = fiber | context.baseLanes;
    }
    function reuseHiddenContextOnStack() {
      push2(prevEntangledRenderLanesCursor, entangledRenderLanes);
      push2(currentTreeHiddenStackCursor, currentTreeHiddenStackCursor.current);
    }
    function popHiddenContext() {
      entangledRenderLanes = prevEntangledRenderLanesCursor.current;
      pop2(currentTreeHiddenStackCursor);
      pop2(prevEntangledRenderLanesCursor);
    }
    function pushPrimaryTreeSuspenseHandler(handler) {
      var current = handler.alternate;
      push2(suspenseStackCursor, suspenseStackCursor.current & 1);
      push2(suspenseHandlerStackCursor, handler);
      shellBoundary === null && (current === null || currentTreeHiddenStackCursor.current !== null ? shellBoundary = handler : current.memoizedState !== null && (shellBoundary = handler));
    }
    function pushDehydratedActivitySuspenseHandler(fiber) {
      push2(suspenseStackCursor, suspenseStackCursor.current);
      push2(suspenseHandlerStackCursor, fiber);
      shellBoundary === null && (shellBoundary = fiber);
    }
    function pushOffscreenSuspenseHandler(fiber) {
      fiber.tag === 22 ? (push2(suspenseStackCursor, suspenseStackCursor.current), push2(suspenseHandlerStackCursor, fiber), shellBoundary === null && (shellBoundary = fiber)) : reuseSuspenseHandlerOnStack(fiber);
    }
    function reuseSuspenseHandlerOnStack() {
      push2(suspenseStackCursor, suspenseStackCursor.current);
      push2(suspenseHandlerStackCursor, suspenseHandlerStackCursor.current);
    }
    function popSuspenseHandler(fiber) {
      pop2(suspenseHandlerStackCursor);
      shellBoundary === fiber && (shellBoundary = null);
      pop2(suspenseStackCursor);
    }
    function findFirstSuspended(row) {
      for (var node = row;node !== null; ) {
        if (node.tag === 13) {
          var state = node.memoizedState;
          if (state !== null && (state = state.dehydrated, state === null || isSuspenseInstancePending(state) || isSuspenseInstanceFallback(state)))
            return node;
        } else if (node.tag === 19 && (node.memoizedProps.revealOrder === "forwards" || node.memoizedProps.revealOrder === "backwards" || node.memoizedProps.revealOrder === "unstable_legacy-backwards" || node.memoizedProps.revealOrder === "together")) {
          if ((node.flags & 128) !== 0)
            return node;
        } else if (node.child !== null) {
          node.child.return = node;
          node = node.child;
          continue;
        }
        if (node === row)
          break;
        for (;node.sibling === null; ) {
          if (node.return === null || node.return === row)
            return null;
          node = node.return;
        }
        node.sibling.return = node.return;
        node = node.sibling;
      }
      return null;
    }
    function throwInvalidHookError() {
      throw Error(formatProdErrorMessage(321));
    }
    function areHookInputsEqual(nextDeps, prevDeps) {
      if (prevDeps === null)
        return false;
      for (var i = 0;i < prevDeps.length && i < nextDeps.length; i++)
        if (!objectIs(nextDeps[i], prevDeps[i]))
          return false;
      return true;
    }
    function renderWithHooks(current, workInProgress2, Component2, props, secondArg, nextRenderLanes) {
      renderLanes = nextRenderLanes;
      currentlyRenderingFiber = workInProgress2;
      workInProgress2.memoizedState = null;
      workInProgress2.updateQueue = null;
      workInProgress2.lanes = 0;
      ReactSharedInternals2.H = current === null || current.memoizedState === null ? HooksDispatcherOnMount : HooksDispatcherOnUpdate;
      shouldDoubleInvokeUserFnsInHooksDEV = false;
      nextRenderLanes = Component2(props, secondArg);
      shouldDoubleInvokeUserFnsInHooksDEV = false;
      didScheduleRenderPhaseUpdateDuringThisPass && (nextRenderLanes = renderWithHooksAgain(workInProgress2, Component2, props, secondArg));
      finishRenderingHooks(current);
      return nextRenderLanes;
    }
    function finishRenderingHooks(current) {
      ReactSharedInternals2.H = ContextOnlyDispatcher;
      var didRenderTooFewHooks = currentHook !== null && currentHook.next !== null;
      renderLanes = 0;
      workInProgressHook = currentHook = currentlyRenderingFiber = null;
      didScheduleRenderPhaseUpdate = false;
      thenableIndexCounter = 0;
      thenableState = null;
      if (didRenderTooFewHooks)
        throw Error(formatProdErrorMessage(300));
      current === null || didReceiveUpdate || (current = current.dependencies, current !== null && checkIfContextChanged(current) && (didReceiveUpdate = true));
    }
    function renderWithHooksAgain(workInProgress2, Component2, props, secondArg) {
      currentlyRenderingFiber = workInProgress2;
      var numberOfReRenders = 0;
      do {
        didScheduleRenderPhaseUpdateDuringThisPass && (thenableState = null);
        thenableIndexCounter = 0;
        didScheduleRenderPhaseUpdateDuringThisPass = false;
        if (25 <= numberOfReRenders)
          throw Error(formatProdErrorMessage(301));
        numberOfReRenders += 1;
        workInProgressHook = currentHook = null;
        if (workInProgress2.updateQueue != null) {
          var children = workInProgress2.updateQueue;
          children.lastEffect = null;
          children.events = null;
          children.stores = null;
          children.memoCache != null && (children.memoCache.index = 0);
        }
        ReactSharedInternals2.H = HooksDispatcherOnRerender;
        children = Component2(props, secondArg);
      } while (didScheduleRenderPhaseUpdateDuringThisPass);
      return children;
    }
    function TransitionAwareHostComponent() {
      var dispatcher = ReactSharedInternals2.H, maybeThenable = dispatcher.useState()[0];
      maybeThenable = typeof maybeThenable.then === "function" ? useThenable(maybeThenable) : maybeThenable;
      dispatcher = dispatcher.useState()[0];
      (currentHook !== null ? currentHook.memoizedState : null) !== dispatcher && (currentlyRenderingFiber.flags |= 1024);
      return maybeThenable;
    }
    function checkDidRenderIdHook() {
      var didRenderIdHook = localIdCounter !== 0;
      localIdCounter = 0;
      return didRenderIdHook;
    }
    function bailoutHooks(current, workInProgress2, lanes) {
      workInProgress2.updateQueue = current.updateQueue;
      workInProgress2.flags &= -2053;
      current.lanes &= ~lanes;
    }
    function resetHooksOnUnwind(workInProgress2) {
      if (didScheduleRenderPhaseUpdate) {
        for (workInProgress2 = workInProgress2.memoizedState;workInProgress2 !== null; ) {
          var queue = workInProgress2.queue;
          queue !== null && (queue.pending = null);
          workInProgress2 = workInProgress2.next;
        }
        didScheduleRenderPhaseUpdate = false;
      }
      renderLanes = 0;
      workInProgressHook = currentHook = currentlyRenderingFiber = null;
      didScheduleRenderPhaseUpdateDuringThisPass = false;
      thenableIndexCounter = localIdCounter = 0;
      thenableState = null;
    }
    function mountWorkInProgressHook() {
      var hook = {
        memoizedState: null,
        baseState: null,
        baseQueue: null,
        queue: null,
        next: null
      };
      workInProgressHook === null ? currentlyRenderingFiber.memoizedState = workInProgressHook = hook : workInProgressHook = workInProgressHook.next = hook;
      return workInProgressHook;
    }
    function updateWorkInProgressHook() {
      if (currentHook === null) {
        var nextCurrentHook = currentlyRenderingFiber.alternate;
        nextCurrentHook = nextCurrentHook !== null ? nextCurrentHook.memoizedState : null;
      } else
        nextCurrentHook = currentHook.next;
      var nextWorkInProgressHook = workInProgressHook === null ? currentlyRenderingFiber.memoizedState : workInProgressHook.next;
      if (nextWorkInProgressHook !== null)
        workInProgressHook = nextWorkInProgressHook, currentHook = nextCurrentHook;
      else {
        if (nextCurrentHook === null) {
          if (currentlyRenderingFiber.alternate === null)
            throw Error(formatProdErrorMessage(467));
          throw Error(formatProdErrorMessage(310));
        }
        currentHook = nextCurrentHook;
        nextCurrentHook = {
          memoizedState: currentHook.memoizedState,
          baseState: currentHook.baseState,
          baseQueue: currentHook.baseQueue,
          queue: currentHook.queue,
          next: null
        };
        workInProgressHook === null ? currentlyRenderingFiber.memoizedState = workInProgressHook = nextCurrentHook : workInProgressHook = workInProgressHook.next = nextCurrentHook;
      }
      return workInProgressHook;
    }
    function createFunctionComponentUpdateQueue() {
      return { lastEffect: null, events: null, stores: null, memoCache: null };
    }
    function useThenable(thenable) {
      var index = thenableIndexCounter;
      thenableIndexCounter += 1;
      thenableState === null && (thenableState = []);
      thenable = trackUsedThenable(thenableState, thenable, index);
      index = currentlyRenderingFiber;
      (workInProgressHook === null ? index.memoizedState : workInProgressHook.next) === null && (index = index.alternate, ReactSharedInternals2.H = index === null || index.memoizedState === null ? HooksDispatcherOnMount : HooksDispatcherOnUpdate);
      return thenable;
    }
    function use(usable) {
      if (usable !== null && typeof usable === "object") {
        if (typeof usable.then === "function")
          return useThenable(usable);
        if (usable.$$typeof === REACT_CONTEXT_TYPE2)
          return readContext(usable);
      }
      throw Error(formatProdErrorMessage(438, String(usable)));
    }
    function useMemoCache(size) {
      var memoCache = null, updateQueue = currentlyRenderingFiber.updateQueue;
      updateQueue !== null && (memoCache = updateQueue.memoCache);
      if (memoCache == null) {
        var current = currentlyRenderingFiber.alternate;
        current !== null && (current = current.updateQueue, current !== null && (current = current.memoCache, current != null && (memoCache = {
          data: current.data.map(function(array) {
            return array.slice();
          }),
          index: 0
        })));
      }
      memoCache == null && (memoCache = { data: [], index: 0 });
      updateQueue === null && (updateQueue = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = updateQueue);
      updateQueue.memoCache = memoCache;
      updateQueue = memoCache.data[memoCache.index];
      if (updateQueue === undefined)
        for (updateQueue = memoCache.data[memoCache.index] = Array(size), current = 0;current < size; current++)
          updateQueue[current] = REACT_MEMO_CACHE_SENTINEL;
      memoCache.index++;
      return updateQueue;
    }
    function basicStateReducer(state, action) {
      return typeof action === "function" ? action(state) : action;
    }
    function updateReducer(reducer) {
      var hook = updateWorkInProgressHook();
      return updateReducerImpl(hook, currentHook, reducer);
    }
    function updateReducerImpl(hook, current, reducer) {
      var queue = hook.queue;
      if (queue === null)
        throw Error(formatProdErrorMessage(311));
      queue.lastRenderedReducer = reducer;
      var baseQueue = hook.baseQueue, pendingQueue = queue.pending;
      if (pendingQueue !== null) {
        if (baseQueue !== null) {
          var baseFirst = baseQueue.next;
          baseQueue.next = pendingQueue.next;
          pendingQueue.next = baseFirst;
        }
        current.baseQueue = baseQueue = pendingQueue;
        queue.pending = null;
      }
      pendingQueue = hook.baseState;
      if (baseQueue === null)
        hook.memoizedState = pendingQueue;
      else {
        current = baseQueue.next;
        var newBaseQueueFirst = baseFirst = null, newBaseQueueLast = null, update = current, didReadFromEntangledAsyncAction$51 = false;
        do {
          var updateLane = update.lane & -536870913;
          if (updateLane !== update.lane ? (workInProgressRootRenderLanes & updateLane) === updateLane : (renderLanes & updateLane) === updateLane) {
            var revertLane = update.revertLane;
            if (revertLane === 0)
              newBaseQueueLast !== null && (newBaseQueueLast = newBaseQueueLast.next = {
                lane: 0,
                revertLane: 0,
                gesture: null,
                action: update.action,
                hasEagerState: update.hasEagerState,
                eagerState: update.eagerState,
                next: null
              }), updateLane === currentEntangledLane && (didReadFromEntangledAsyncAction$51 = true);
            else if ((renderLanes & revertLane) === revertLane) {
              update = update.next;
              revertLane === currentEntangledLane && (didReadFromEntangledAsyncAction$51 = true);
              continue;
            } else
              updateLane = {
                lane: 0,
                revertLane: update.revertLane,
                gesture: null,
                action: update.action,
                hasEagerState: update.hasEagerState,
                eagerState: update.eagerState,
                next: null
              }, newBaseQueueLast === null ? (newBaseQueueFirst = newBaseQueueLast = updateLane, baseFirst = pendingQueue) : newBaseQueueLast = newBaseQueueLast.next = updateLane, currentlyRenderingFiber.lanes |= revertLane, workInProgressRootSkippedLanes |= revertLane;
            updateLane = update.action;
            shouldDoubleInvokeUserFnsInHooksDEV && reducer(pendingQueue, updateLane);
            pendingQueue = update.hasEagerState ? update.eagerState : reducer(pendingQueue, updateLane);
          } else
            revertLane = {
              lane: updateLane,
              revertLane: update.revertLane,
              gesture: update.gesture,
              action: update.action,
              hasEagerState: update.hasEagerState,
              eagerState: update.eagerState,
              next: null
            }, newBaseQueueLast === null ? (newBaseQueueFirst = newBaseQueueLast = revertLane, baseFirst = pendingQueue) : newBaseQueueLast = newBaseQueueLast.next = revertLane, currentlyRenderingFiber.lanes |= updateLane, workInProgressRootSkippedLanes |= updateLane;
          update = update.next;
        } while (update !== null && update !== current);
        newBaseQueueLast === null ? baseFirst = pendingQueue : newBaseQueueLast.next = newBaseQueueFirst;
        if (!objectIs(pendingQueue, hook.memoizedState) && (didReceiveUpdate = true, didReadFromEntangledAsyncAction$51 && (reducer = currentEntangledActionThenable, reducer !== null)))
          throw reducer;
        hook.memoizedState = pendingQueue;
        hook.baseState = baseFirst;
        hook.baseQueue = newBaseQueueLast;
        queue.lastRenderedState = pendingQueue;
      }
      baseQueue === null && (queue.lanes = 0);
      return [hook.memoizedState, queue.dispatch];
    }
    function rerenderReducer(reducer) {
      var hook = updateWorkInProgressHook(), queue = hook.queue;
      if (queue === null)
        throw Error(formatProdErrorMessage(311));
      queue.lastRenderedReducer = reducer;
      var { dispatch, pending: lastRenderPhaseUpdate } = queue, newState = hook.memoizedState;
      if (lastRenderPhaseUpdate !== null) {
        queue.pending = null;
        var update = lastRenderPhaseUpdate = lastRenderPhaseUpdate.next;
        do
          newState = reducer(newState, update.action), update = update.next;
        while (update !== lastRenderPhaseUpdate);
        objectIs(newState, hook.memoizedState) || (didReceiveUpdate = true);
        hook.memoizedState = newState;
        hook.baseQueue === null && (hook.baseState = newState);
        queue.lastRenderedState = newState;
      }
      return [newState, dispatch];
    }
    function updateSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
      var fiber = currentlyRenderingFiber, hook = updateWorkInProgressHook(), isHydrating$jscomp$0 = isHydrating;
      if (isHydrating$jscomp$0) {
        if (getServerSnapshot === undefined)
          throw Error(formatProdErrorMessage(407));
        getServerSnapshot = getServerSnapshot();
      } else
        getServerSnapshot = getSnapshot();
      var snapshotChanged = !objectIs((currentHook || hook).memoizedState, getServerSnapshot);
      snapshotChanged && (hook.memoizedState = getServerSnapshot, didReceiveUpdate = true);
      hook = hook.queue;
      updateEffect(subscribeToStore.bind(null, fiber, hook, subscribe), [
        subscribe
      ]);
      if (hook.getSnapshot !== getSnapshot || snapshotChanged || workInProgressHook !== null && workInProgressHook.memoizedState.tag & 1) {
        fiber.flags |= 2048;
        pushSimpleEffect(9, { destroy: undefined }, updateStoreInstance.bind(null, fiber, hook, getServerSnapshot, getSnapshot), null);
        if (workInProgressRoot === null)
          throw Error(formatProdErrorMessage(349));
        isHydrating$jscomp$0 || (renderLanes & 127) !== 0 || pushStoreConsistencyCheck(fiber, getSnapshot, getServerSnapshot);
      }
      return getServerSnapshot;
    }
    function pushStoreConsistencyCheck(fiber, getSnapshot, renderedSnapshot) {
      fiber.flags |= 16384;
      fiber = { getSnapshot, value: renderedSnapshot };
      getSnapshot = currentlyRenderingFiber.updateQueue;
      getSnapshot === null ? (getSnapshot = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = getSnapshot, getSnapshot.stores = [fiber]) : (renderedSnapshot = getSnapshot.stores, renderedSnapshot === null ? getSnapshot.stores = [fiber] : renderedSnapshot.push(fiber));
    }
    function updateStoreInstance(fiber, inst, nextSnapshot, getSnapshot) {
      inst.value = nextSnapshot;
      inst.getSnapshot = getSnapshot;
      checkIfSnapshotChanged(inst) && forceStoreRerender(fiber);
    }
    function subscribeToStore(fiber, inst, subscribe) {
      return subscribe(function() {
        checkIfSnapshotChanged(inst) && forceStoreRerender(fiber);
      });
    }
    function checkIfSnapshotChanged(inst) {
      var latestGetSnapshot = inst.getSnapshot;
      inst = inst.value;
      try {
        var nextValue = latestGetSnapshot();
        return !objectIs(inst, nextValue);
      } catch (error) {
        return true;
      }
    }
    function forceStoreRerender(fiber) {
      var root = enqueueConcurrentRenderForLane(fiber, 2);
      root !== null && scheduleUpdateOnFiber(root, fiber, 2);
    }
    function mountStateImpl(initialState) {
      var hook = mountWorkInProgressHook();
      if (typeof initialState === "function") {
        var initialStateInitializer = initialState;
        initialState = initialStateInitializer();
        if (shouldDoubleInvokeUserFnsInHooksDEV) {
          setIsStrictModeForDevtools(true);
          try {
            initialStateInitializer();
          } finally {
            setIsStrictModeForDevtools(false);
          }
        }
      }
      hook.memoizedState = hook.baseState = initialState;
      hook.queue = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: basicStateReducer,
        lastRenderedState: initialState
      };
      return hook;
    }
    function updateOptimisticImpl(hook, current, passthrough, reducer) {
      hook.baseState = passthrough;
      return updateReducerImpl(hook, currentHook, typeof reducer === "function" ? reducer : basicStateReducer);
    }
    function dispatchActionState(fiber, actionQueue, setPendingState, setState, payload) {
      if (isRenderPhaseUpdate(fiber))
        throw Error(formatProdErrorMessage(485));
      fiber = actionQueue.action;
      if (fiber !== null) {
        var actionNode = {
          payload,
          action: fiber,
          next: null,
          isTransition: true,
          status: "pending",
          value: null,
          reason: null,
          listeners: [],
          then: function(listener) {
            actionNode.listeners.push(listener);
          }
        };
        ReactSharedInternals2.T !== null ? setPendingState(true) : actionNode.isTransition = false;
        setState(actionNode);
        setPendingState = actionQueue.pending;
        setPendingState === null ? (actionNode.next = actionQueue.pending = actionNode, runActionStateAction(actionQueue, actionNode)) : (actionNode.next = setPendingState.next, actionQueue.pending = setPendingState.next = actionNode);
      }
    }
    function runActionStateAction(actionQueue, node) {
      var { action, payload } = node, prevState = actionQueue.state;
      if (node.isTransition) {
        var prevTransition = ReactSharedInternals2.T, currentTransition = {};
        ReactSharedInternals2.T = currentTransition;
        try {
          var returnValue = action(prevState, payload), onStartTransitionFinish = ReactSharedInternals2.S;
          onStartTransitionFinish !== null && onStartTransitionFinish(currentTransition, returnValue);
          handleActionReturnValue(actionQueue, node, returnValue);
        } catch (error) {
          onActionError(actionQueue, node, error);
        } finally {
          prevTransition !== null && currentTransition.types !== null && (prevTransition.types = currentTransition.types), ReactSharedInternals2.T = prevTransition;
        }
      } else
        try {
          prevTransition = action(prevState, payload), handleActionReturnValue(actionQueue, node, prevTransition);
        } catch (error$55) {
          onActionError(actionQueue, node, error$55);
        }
    }
    function handleActionReturnValue(actionQueue, node, returnValue) {
      returnValue !== null && typeof returnValue === "object" && typeof returnValue.then === "function" ? returnValue.then(function(nextState) {
        onActionSuccess(actionQueue, node, nextState);
      }, function(error) {
        return onActionError(actionQueue, node, error);
      }) : onActionSuccess(actionQueue, node, returnValue);
    }
    function onActionSuccess(actionQueue, actionNode, nextState) {
      actionNode.status = "fulfilled";
      actionNode.value = nextState;
      notifyActionListeners(actionNode);
      actionQueue.state = nextState;
      actionNode = actionQueue.pending;
      actionNode !== null && (nextState = actionNode.next, nextState === actionNode ? actionQueue.pending = null : (nextState = nextState.next, actionNode.next = nextState, runActionStateAction(actionQueue, nextState)));
    }
    function onActionError(actionQueue, actionNode, error) {
      var last = actionQueue.pending;
      actionQueue.pending = null;
      if (last !== null) {
        last = last.next;
        do
          actionNode.status = "rejected", actionNode.reason = error, notifyActionListeners(actionNode), actionNode = actionNode.next;
        while (actionNode !== last);
      }
      actionQueue.action = null;
    }
    function notifyActionListeners(actionNode) {
      actionNode = actionNode.listeners;
      for (var i = 0;i < actionNode.length; i++)
        (0, actionNode[i])();
    }
    function actionStateReducer(oldState, newState) {
      return newState;
    }
    function mountActionState(action, initialStateProp) {
      if (isHydrating) {
        var ssrFormState = workInProgressRoot.formState;
        if (ssrFormState !== null) {
          a: {
            var JSCompiler_inline_result = currentlyRenderingFiber;
            if (isHydrating) {
              if (nextHydratableInstance) {
                var markerInstance = canHydrateFormStateMarker(nextHydratableInstance, rootOrSingletonContext);
                if (markerInstance) {
                  nextHydratableInstance = getNextHydratableSibling(markerInstance);
                  JSCompiler_inline_result = isFormStateMarkerMatching(markerInstance);
                  break a;
                }
              }
              throwOnHydrationMismatch(JSCompiler_inline_result);
            }
            JSCompiler_inline_result = false;
          }
          JSCompiler_inline_result && (initialStateProp = ssrFormState[0]);
        }
      }
      ssrFormState = mountWorkInProgressHook();
      ssrFormState.memoizedState = ssrFormState.baseState = initialStateProp;
      JSCompiler_inline_result = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: actionStateReducer,
        lastRenderedState: initialStateProp
      };
      ssrFormState.queue = JSCompiler_inline_result;
      ssrFormState = dispatchSetState.bind(null, currentlyRenderingFiber, JSCompiler_inline_result);
      JSCompiler_inline_result.dispatch = ssrFormState;
      JSCompiler_inline_result = mountStateImpl(false);
      var setPendingState = dispatchOptimisticSetState.bind(null, currentlyRenderingFiber, false, JSCompiler_inline_result.queue);
      JSCompiler_inline_result = mountWorkInProgressHook();
      markerInstance = {
        state: initialStateProp,
        dispatch: null,
        action,
        pending: null
      };
      JSCompiler_inline_result.queue = markerInstance;
      ssrFormState = dispatchActionState.bind(null, currentlyRenderingFiber, markerInstance, setPendingState, ssrFormState);
      markerInstance.dispatch = ssrFormState;
      JSCompiler_inline_result.memoizedState = action;
      return [initialStateProp, ssrFormState, false];
    }
    function updateActionState(action) {
      var stateHook = updateWorkInProgressHook();
      return updateActionStateImpl(stateHook, currentHook, action);
    }
    function updateActionStateImpl(stateHook, currentStateHook, action) {
      currentStateHook = updateReducerImpl(stateHook, currentStateHook, actionStateReducer)[0];
      stateHook = updateReducer(basicStateReducer)[0];
      if (typeof currentStateHook === "object" && currentStateHook !== null && typeof currentStateHook.then === "function")
        try {
          var state = useThenable(currentStateHook);
        } catch (x) {
          if (x === SuspenseException)
            throw SuspenseActionException;
          throw x;
        }
      else
        state = currentStateHook;
      currentStateHook = updateWorkInProgressHook();
      var actionQueue = currentStateHook.queue, dispatch = actionQueue.dispatch;
      action !== currentStateHook.memoizedState && (currentlyRenderingFiber.flags |= 2048, pushSimpleEffect(9, { destroy: undefined }, actionStateActionEffect.bind(null, actionQueue, action), null));
      return [state, dispatch, stateHook];
    }
    function actionStateActionEffect(actionQueue, action) {
      actionQueue.action = action;
    }
    function rerenderActionState(action) {
      var stateHook = updateWorkInProgressHook(), currentStateHook = currentHook;
      if (currentStateHook !== null)
        return updateActionStateImpl(stateHook, currentStateHook, action);
      updateWorkInProgressHook();
      stateHook = stateHook.memoizedState;
      currentStateHook = updateWorkInProgressHook();
      var dispatch = currentStateHook.queue.dispatch;
      currentStateHook.memoizedState = action;
      return [stateHook, dispatch, false];
    }
    function pushSimpleEffect(tag, inst, create, deps) {
      tag = { tag, create, deps, inst, next: null };
      inst = currentlyRenderingFiber.updateQueue;
      inst === null && (inst = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = inst);
      create = inst.lastEffect;
      create === null ? inst.lastEffect = tag.next = tag : (deps = create.next, create.next = tag, tag.next = deps, inst.lastEffect = tag);
      return tag;
    }
    function updateRef() {
      return updateWorkInProgressHook().memoizedState;
    }
    function mountEffectImpl(fiberFlags, hookFlags, create, deps) {
      var hook = mountWorkInProgressHook();
      currentlyRenderingFiber.flags |= fiberFlags;
      hook.memoizedState = pushSimpleEffect(1 | hookFlags, { destroy: undefined }, create, deps === undefined ? null : deps);
    }
    function updateEffectImpl(fiberFlags, hookFlags, create, deps) {
      var hook = updateWorkInProgressHook();
      deps = deps === undefined ? null : deps;
      var inst = hook.memoizedState.inst;
      currentHook !== null && deps !== null && areHookInputsEqual(deps, currentHook.memoizedState.deps) ? hook.memoizedState = pushSimpleEffect(hookFlags, inst, create, deps) : (currentlyRenderingFiber.flags |= fiberFlags, hook.memoizedState = pushSimpleEffect(1 | hookFlags, inst, create, deps));
    }
    function mountEffect(create, deps) {
      mountEffectImpl(8390656, 8, create, deps);
    }
    function updateEffect(create, deps) {
      updateEffectImpl(2048, 8, create, deps);
    }
    function useEffectEventImpl(payload) {
      currentlyRenderingFiber.flags |= 4;
      var componentUpdateQueue = currentlyRenderingFiber.updateQueue;
      if (componentUpdateQueue === null)
        componentUpdateQueue = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = componentUpdateQueue, componentUpdateQueue.events = [payload];
      else {
        var events = componentUpdateQueue.events;
        events === null ? componentUpdateQueue.events = [payload] : events.push(payload);
      }
    }
    function updateEvent(callback) {
      var ref = updateWorkInProgressHook().memoizedState;
      useEffectEventImpl({ ref, nextImpl: callback });
      return function() {
        if ((executionContext & 2) !== 0)
          throw Error(formatProdErrorMessage(440));
        return ref.impl.apply(undefined, arguments);
      };
    }
    function updateInsertionEffect(create, deps) {
      return updateEffectImpl(4, 2, create, deps);
    }
    function updateLayoutEffect(create, deps) {
      return updateEffectImpl(4, 4, create, deps);
    }
    function imperativeHandleEffect(create, ref) {
      if (typeof ref === "function") {
        create = create();
        var refCleanup = ref(create);
        return function() {
          typeof refCleanup === "function" ? refCleanup() : ref(null);
        };
      }
      if (ref !== null && ref !== undefined)
        return create = create(), ref.current = create, function() {
          ref.current = null;
        };
    }
    function updateImperativeHandle(ref, create, deps) {
      deps = deps !== null && deps !== undefined ? deps.concat([ref]) : null;
      updateEffectImpl(4, 4, imperativeHandleEffect.bind(null, create, ref), deps);
    }
    function mountDebugValue() {}
    function updateCallback(callback, deps) {
      var hook = updateWorkInProgressHook();
      deps = deps === undefined ? null : deps;
      var prevState = hook.memoizedState;
      if (deps !== null && areHookInputsEqual(deps, prevState[1]))
        return prevState[0];
      hook.memoizedState = [callback, deps];
      return callback;
    }
    function updateMemo(nextCreate, deps) {
      var hook = updateWorkInProgressHook();
      deps = deps === undefined ? null : deps;
      var prevState = hook.memoizedState;
      if (deps !== null && areHookInputsEqual(deps, prevState[1]))
        return prevState[0];
      prevState = nextCreate();
      if (shouldDoubleInvokeUserFnsInHooksDEV) {
        setIsStrictModeForDevtools(true);
        try {
          nextCreate();
        } finally {
          setIsStrictModeForDevtools(false);
        }
      }
      hook.memoizedState = [prevState, deps];
      return prevState;
    }
    function mountDeferredValueImpl(hook, value, initialValue) {
      if (initialValue === undefined || (renderLanes & 1073741824) !== 0 && (workInProgressRootRenderLanes & 261930) === 0)
        return hook.memoizedState = value;
      hook.memoizedState = initialValue;
      hook = requestDeferredLane();
      currentlyRenderingFiber.lanes |= hook;
      workInProgressRootSkippedLanes |= hook;
      return initialValue;
    }
    function updateDeferredValueImpl(hook, prevValue, value, initialValue) {
      if (objectIs(value, prevValue))
        return value;
      if (currentTreeHiddenStackCursor.current !== null)
        return hook = mountDeferredValueImpl(hook, value, initialValue), objectIs(hook, prevValue) || (didReceiveUpdate = true), hook;
      if ((renderLanes & 42) === 0 || (renderLanes & 1073741824) !== 0 && (workInProgressRootRenderLanes & 261930) === 0)
        return didReceiveUpdate = true, hook.memoizedState = value;
      hook = requestDeferredLane();
      currentlyRenderingFiber.lanes |= hook;
      workInProgressRootSkippedLanes |= hook;
      return prevValue;
    }
    function startTransition(fiber, queue, pendingState, finishedState, callback) {
      var previousPriority = getCurrentUpdatePriority();
      setCurrentUpdatePriority(previousPriority !== 0 && 8 > previousPriority ? previousPriority : 8);
      var prevTransition = ReactSharedInternals2.T, currentTransition = {};
      ReactSharedInternals2.T = currentTransition;
      dispatchOptimisticSetState(fiber, false, queue, pendingState);
      try {
        var returnValue = callback(), onStartTransitionFinish = ReactSharedInternals2.S;
        onStartTransitionFinish !== null && onStartTransitionFinish(currentTransition, returnValue);
        if (returnValue !== null && typeof returnValue === "object" && typeof returnValue.then === "function") {
          var thenableForFinishedState = chainThenableValue(returnValue, finishedState);
          dispatchSetStateInternal(fiber, queue, thenableForFinishedState, requestUpdateLane(fiber));
        } else
          dispatchSetStateInternal(fiber, queue, finishedState, requestUpdateLane(fiber));
      } catch (error) {
        dispatchSetStateInternal(fiber, queue, { then: function() {}, status: "rejected", reason: error }, requestUpdateLane());
      } finally {
        setCurrentUpdatePriority(previousPriority), prevTransition !== null && currentTransition.types !== null && (prevTransition.types = currentTransition.types), ReactSharedInternals2.T = prevTransition;
      }
    }
    function ensureFormComponentIsStateful(formFiber) {
      var existingStateHook = formFiber.memoizedState;
      if (existingStateHook !== null)
        return existingStateHook;
      existingStateHook = {
        memoizedState: NotPendingTransition,
        baseState: NotPendingTransition,
        baseQueue: null,
        queue: {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: basicStateReducer,
          lastRenderedState: NotPendingTransition
        },
        next: null
      };
      var initialResetState = {};
      existingStateHook.next = {
        memoizedState: initialResetState,
        baseState: initialResetState,
        baseQueue: null,
        queue: {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: basicStateReducer,
          lastRenderedState: initialResetState
        },
        next: null
      };
      formFiber.memoizedState = existingStateHook;
      formFiber = formFiber.alternate;
      formFiber !== null && (formFiber.memoizedState = existingStateHook);
      return existingStateHook;
    }
    function useHostTransitionStatus() {
      return readContext(HostTransitionContext);
    }
    function updateId() {
      return updateWorkInProgressHook().memoizedState;
    }
    function updateRefresh() {
      return updateWorkInProgressHook().memoizedState;
    }
    function refreshCache(fiber) {
      for (var provider = fiber.return;provider !== null; ) {
        switch (provider.tag) {
          case 24:
          case 3:
            var lane = requestUpdateLane();
            fiber = createUpdate(lane);
            var root = enqueueUpdate(provider, fiber, lane);
            root !== null && (scheduleUpdateOnFiber(root, provider, lane), entangleTransitions(root, provider, lane));
            provider = { cache: createCache() };
            fiber.payload = provider;
            return;
        }
        provider = provider.return;
      }
    }
    function dispatchReducerAction(fiber, queue, action) {
      var lane = requestUpdateLane();
      action = {
        lane,
        revertLane: 0,
        gesture: null,
        action,
        hasEagerState: false,
        eagerState: null,
        next: null
      };
      isRenderPhaseUpdate(fiber) ? enqueueRenderPhaseUpdate(queue, action) : (action = enqueueConcurrentHookUpdate(fiber, queue, action, lane), action !== null && (scheduleUpdateOnFiber(action, fiber, lane), entangleTransitionUpdate(action, queue, lane)));
    }
    function dispatchSetState(fiber, queue, action) {
      var lane = requestUpdateLane();
      dispatchSetStateInternal(fiber, queue, action, lane);
    }
    function dispatchSetStateInternal(fiber, queue, action, lane) {
      var update = {
        lane,
        revertLane: 0,
        gesture: null,
        action,
        hasEagerState: false,
        eagerState: null,
        next: null
      };
      if (isRenderPhaseUpdate(fiber))
        enqueueRenderPhaseUpdate(queue, update);
      else {
        var alternate = fiber.alternate;
        if (fiber.lanes === 0 && (alternate === null || alternate.lanes === 0) && (alternate = queue.lastRenderedReducer, alternate !== null))
          try {
            var currentState = queue.lastRenderedState, eagerState = alternate(currentState, action);
            update.hasEagerState = true;
            update.eagerState = eagerState;
            if (objectIs(eagerState, currentState))
              return enqueueUpdate$1(fiber, queue, update, 0), workInProgressRoot === null && finishQueueingConcurrentUpdates(), false;
          } catch (error) {} finally {}
        action = enqueueConcurrentHookUpdate(fiber, queue, update, lane);
        if (action !== null)
          return scheduleUpdateOnFiber(action, fiber, lane), entangleTransitionUpdate(action, queue, lane), true;
      }
      return false;
    }
    function dispatchOptimisticSetState(fiber, throwIfDuringRender, queue, action) {
      action = {
        lane: 2,
        revertLane: requestTransitionLane(),
        gesture: null,
        action,
        hasEagerState: false,
        eagerState: null,
        next: null
      };
      if (isRenderPhaseUpdate(fiber)) {
        if (throwIfDuringRender)
          throw Error(formatProdErrorMessage(479));
      } else
        throwIfDuringRender = enqueueConcurrentHookUpdate(fiber, queue, action, 2), throwIfDuringRender !== null && scheduleUpdateOnFiber(throwIfDuringRender, fiber, 2);
    }
    function isRenderPhaseUpdate(fiber) {
      var alternate = fiber.alternate;
      return fiber === currentlyRenderingFiber || alternate !== null && alternate === currentlyRenderingFiber;
    }
    function enqueueRenderPhaseUpdate(queue, update) {
      didScheduleRenderPhaseUpdateDuringThisPass = didScheduleRenderPhaseUpdate = true;
      var pending = queue.pending;
      pending === null ? update.next = update : (update.next = pending.next, pending.next = update);
      queue.pending = update;
    }
    function entangleTransitionUpdate(root, queue, lane) {
      if ((lane & 4194048) !== 0) {
        var queueLanes = queue.lanes;
        queueLanes &= root.pendingLanes;
        lane |= queueLanes;
        queue.lanes = lane;
        markRootEntangled(root, lane);
      }
    }
    function applyDerivedStateFromProps(workInProgress2, ctor, getDerivedStateFromProps, nextProps) {
      ctor = workInProgress2.memoizedState;
      getDerivedStateFromProps = getDerivedStateFromProps(nextProps, ctor);
      getDerivedStateFromProps = getDerivedStateFromProps === null || getDerivedStateFromProps === undefined ? ctor : assign2({}, ctor, getDerivedStateFromProps);
      workInProgress2.memoizedState = getDerivedStateFromProps;
      workInProgress2.lanes === 0 && (workInProgress2.updateQueue.baseState = getDerivedStateFromProps);
    }
    function checkShouldComponentUpdate(workInProgress2, ctor, oldProps, newProps, oldState, newState, nextContext) {
      workInProgress2 = workInProgress2.stateNode;
      return typeof workInProgress2.shouldComponentUpdate === "function" ? workInProgress2.shouldComponentUpdate(newProps, newState, nextContext) : ctor.prototype && ctor.prototype.isPureReactComponent ? !shallowEqual(oldProps, newProps) || !shallowEqual(oldState, newState) : true;
    }
    function callComponentWillReceiveProps(workInProgress2, instance, newProps, nextContext) {
      workInProgress2 = instance.state;
      typeof instance.componentWillReceiveProps === "function" && instance.componentWillReceiveProps(newProps, nextContext);
      typeof instance.UNSAFE_componentWillReceiveProps === "function" && instance.UNSAFE_componentWillReceiveProps(newProps, nextContext);
      instance.state !== workInProgress2 && classComponentUpdater.enqueueReplaceState(instance, instance.state, null);
    }
    function resolveClassComponentProps(Component2, baseProps) {
      var newProps = baseProps;
      if ("ref" in baseProps) {
        newProps = {};
        for (var propName in baseProps)
          propName !== "ref" && (newProps[propName] = baseProps[propName]);
      }
      if (Component2 = Component2.defaultProps) {
        newProps === baseProps && (newProps = assign2({}, newProps));
        for (var propName$57 in Component2)
          newProps[propName$57] === undefined && (newProps[propName$57] = Component2[propName$57]);
      }
      return newProps;
    }
    function logUncaughtError(root, errorInfo) {
      try {
        var onUncaughtError = root.onUncaughtError;
        onUncaughtError(errorInfo.value, { componentStack: errorInfo.stack });
      } catch (e) {
        setTimeout(function() {
          throw e;
        });
      }
    }
    function logCaughtError(root, boundary, errorInfo) {
      try {
        var onCaughtError = root.onCaughtError;
        onCaughtError(errorInfo.value, {
          componentStack: errorInfo.stack,
          errorBoundary: boundary.tag === 1 ? boundary.stateNode : null
        });
      } catch (e) {
        setTimeout(function() {
          throw e;
        });
      }
    }
    function createRootErrorUpdate(root, errorInfo, lane) {
      lane = createUpdate(lane);
      lane.tag = 3;
      lane.payload = { element: null };
      lane.callback = function() {
        logUncaughtError(root, errorInfo);
      };
      return lane;
    }
    function createClassErrorUpdate(lane) {
      lane = createUpdate(lane);
      lane.tag = 3;
      return lane;
    }
    function initializeClassErrorUpdate(update, root, fiber, errorInfo) {
      var getDerivedStateFromError = fiber.type.getDerivedStateFromError;
      if (typeof getDerivedStateFromError === "function") {
        var error = errorInfo.value;
        update.payload = function() {
          return getDerivedStateFromError(error);
        };
        update.callback = function() {
          logCaughtError(root, fiber, errorInfo);
        };
      }
      var inst = fiber.stateNode;
      inst !== null && typeof inst.componentDidCatch === "function" && (update.callback = function() {
        logCaughtError(root, fiber, errorInfo);
        typeof getDerivedStateFromError !== "function" && (legacyErrorBoundariesThatAlreadyFailed === null ? legacyErrorBoundariesThatAlreadyFailed = new Set([this]) : legacyErrorBoundariesThatAlreadyFailed.add(this));
        var stack = errorInfo.stack;
        this.componentDidCatch(errorInfo.value, {
          componentStack: stack !== null ? stack : ""
        });
      });
    }
    function throwException(root, returnFiber, sourceFiber, value, rootRenderLanes) {
      sourceFiber.flags |= 32768;
      if (value !== null && typeof value === "object" && typeof value.then === "function") {
        returnFiber = sourceFiber.alternate;
        returnFiber !== null && propagateParentContextChanges(returnFiber, sourceFiber, rootRenderLanes, true);
        sourceFiber = suspenseHandlerStackCursor.current;
        if (sourceFiber !== null) {
          switch (sourceFiber.tag) {
            case 31:
            case 13:
              return shellBoundary === null ? renderDidSuspendDelayIfPossible() : sourceFiber.alternate === null && workInProgressRootExitStatus === 0 && (workInProgressRootExitStatus = 3), sourceFiber.flags &= -257, sourceFiber.flags |= 65536, sourceFiber.lanes = rootRenderLanes, value === noopSuspenseyCommitThenable ? sourceFiber.flags |= 16384 : (returnFiber = sourceFiber.updateQueue, returnFiber === null ? sourceFiber.updateQueue = new Set([value]) : returnFiber.add(value), attachPingListener(root, value, rootRenderLanes)), false;
            case 22:
              return sourceFiber.flags |= 65536, value === noopSuspenseyCommitThenable ? sourceFiber.flags |= 16384 : (returnFiber = sourceFiber.updateQueue, returnFiber === null ? (returnFiber = {
                transitions: null,
                markerInstances: null,
                retryQueue: new Set([value])
              }, sourceFiber.updateQueue = returnFiber) : (sourceFiber = returnFiber.retryQueue, sourceFiber === null ? returnFiber.retryQueue = new Set([value]) : sourceFiber.add(value)), attachPingListener(root, value, rootRenderLanes)), false;
          }
          throw Error(formatProdErrorMessage(435, sourceFiber.tag));
        }
        attachPingListener(root, value, rootRenderLanes);
        renderDidSuspendDelayIfPossible();
        return false;
      }
      if (isHydrating)
        return returnFiber = suspenseHandlerStackCursor.current, returnFiber !== null ? ((returnFiber.flags & 65536) === 0 && (returnFiber.flags |= 256), returnFiber.flags |= 65536, returnFiber.lanes = rootRenderLanes, value !== HydrationMismatchException && (root = Error(formatProdErrorMessage(422), { cause: value }), queueHydrationError(createCapturedValueAtFiber(root, sourceFiber)))) : (value !== HydrationMismatchException && (returnFiber = Error(formatProdErrorMessage(423), {
          cause: value
        }), queueHydrationError(createCapturedValueAtFiber(returnFiber, sourceFiber))), root = root.current.alternate, root.flags |= 65536, rootRenderLanes &= -rootRenderLanes, root.lanes |= rootRenderLanes, value = createCapturedValueAtFiber(value, sourceFiber), rootRenderLanes = createRootErrorUpdate(root.stateNode, value, rootRenderLanes), enqueueCapturedUpdate(root, rootRenderLanes), workInProgressRootExitStatus !== 4 && (workInProgressRootExitStatus = 2)), false;
      var wrapperError = Error(formatProdErrorMessage(520), { cause: value });
      wrapperError = createCapturedValueAtFiber(wrapperError, sourceFiber);
      workInProgressRootConcurrentErrors === null ? workInProgressRootConcurrentErrors = [wrapperError] : workInProgressRootConcurrentErrors.push(wrapperError);
      workInProgressRootExitStatus !== 4 && (workInProgressRootExitStatus = 2);
      if (returnFiber === null)
        return true;
      value = createCapturedValueAtFiber(value, sourceFiber);
      sourceFiber = returnFiber;
      do {
        switch (sourceFiber.tag) {
          case 3:
            return sourceFiber.flags |= 65536, root = rootRenderLanes & -rootRenderLanes, sourceFiber.lanes |= root, root = createRootErrorUpdate(sourceFiber.stateNode, value, root), enqueueCapturedUpdate(sourceFiber, root), false;
          case 1:
            if (returnFiber = sourceFiber.type, wrapperError = sourceFiber.stateNode, (sourceFiber.flags & 128) === 0 && (typeof returnFiber.getDerivedStateFromError === "function" || wrapperError !== null && typeof wrapperError.componentDidCatch === "function" && (legacyErrorBoundariesThatAlreadyFailed === null || !legacyErrorBoundariesThatAlreadyFailed.has(wrapperError))))
              return sourceFiber.flags |= 65536, rootRenderLanes &= -rootRenderLanes, sourceFiber.lanes |= rootRenderLanes, rootRenderLanes = createClassErrorUpdate(rootRenderLanes), initializeClassErrorUpdate(rootRenderLanes, root, sourceFiber, value), enqueueCapturedUpdate(sourceFiber, rootRenderLanes), false;
        }
        sourceFiber = sourceFiber.return;
      } while (sourceFiber !== null);
      return false;
    }
    function reconcileChildren(current, workInProgress2, nextChildren, renderLanes2) {
      workInProgress2.child = current === null ? mountChildFibers(workInProgress2, null, nextChildren, renderLanes2) : reconcileChildFibers(workInProgress2, current.child, nextChildren, renderLanes2);
    }
    function updateForwardRef(current, workInProgress2, Component2, nextProps, renderLanes2) {
      Component2 = Component2.render;
      var ref = workInProgress2.ref;
      if ("ref" in nextProps) {
        var propsWithoutRef = {};
        for (var key in nextProps)
          key !== "ref" && (propsWithoutRef[key] = nextProps[key]);
      } else
        propsWithoutRef = nextProps;
      prepareToReadContext(workInProgress2);
      nextProps = renderWithHooks(current, workInProgress2, Component2, propsWithoutRef, ref, renderLanes2);
      key = checkDidRenderIdHook();
      if (current !== null && !didReceiveUpdate)
        return bailoutHooks(current, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
      isHydrating && key && pushMaterializedTreeId(workInProgress2);
      workInProgress2.flags |= 1;
      reconcileChildren(current, workInProgress2, nextProps, renderLanes2);
      return workInProgress2.child;
    }
    function updateMemoComponent(current, workInProgress2, Component2, nextProps, renderLanes2) {
      if (current === null) {
        var type = Component2.type;
        if (typeof type === "function" && !shouldConstruct(type) && type.defaultProps === undefined && Component2.compare === null)
          return workInProgress2.tag = 15, workInProgress2.type = type, updateSimpleMemoComponent(current, workInProgress2, type, nextProps, renderLanes2);
        current = createFiberFromTypeAndProps(Component2.type, null, nextProps, workInProgress2, workInProgress2.mode, renderLanes2);
        current.ref = workInProgress2.ref;
        current.return = workInProgress2;
        return workInProgress2.child = current;
      }
      type = current.child;
      if (!checkScheduledUpdateOrContext(current, renderLanes2)) {
        var prevProps = type.memoizedProps;
        Component2 = Component2.compare;
        Component2 = Component2 !== null ? Component2 : shallowEqual;
        if (Component2(prevProps, nextProps) && current.ref === workInProgress2.ref)
          return bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
      }
      workInProgress2.flags |= 1;
      current = createWorkInProgress(type, nextProps);
      current.ref = workInProgress2.ref;
      current.return = workInProgress2;
      return workInProgress2.child = current;
    }
    function updateSimpleMemoComponent(current, workInProgress2, Component2, nextProps, renderLanes2) {
      if (current !== null) {
        var prevProps = current.memoizedProps;
        if (shallowEqual(prevProps, nextProps) && current.ref === workInProgress2.ref)
          if (didReceiveUpdate = false, workInProgress2.pendingProps = nextProps = prevProps, checkScheduledUpdateOrContext(current, renderLanes2))
            (current.flags & 131072) !== 0 && (didReceiveUpdate = true);
          else
            return workInProgress2.lanes = current.lanes, bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
      }
      return updateFunctionComponent(current, workInProgress2, Component2, nextProps, renderLanes2);
    }
    function updateOffscreenComponent(current, workInProgress2, renderLanes2, nextProps) {
      var nextChildren = nextProps.children, prevState = current !== null ? current.memoizedState : null;
      current === null && workInProgress2.stateNode === null && (workInProgress2.stateNode = {
        _visibility: 1,
        _pendingMarkers: null,
        _retryCache: null,
        _transitions: null
      });
      if (nextProps.mode === "hidden") {
        if ((workInProgress2.flags & 128) !== 0) {
          prevState = prevState !== null ? prevState.baseLanes | renderLanes2 : renderLanes2;
          if (current !== null) {
            nextProps = workInProgress2.child = current.child;
            for (nextChildren = 0;nextProps !== null; )
              nextChildren = nextChildren | nextProps.lanes | nextProps.childLanes, nextProps = nextProps.sibling;
            nextProps = nextChildren & ~prevState;
          } else
            nextProps = 0, workInProgress2.child = null;
          return deferHiddenOffscreenComponent(current, workInProgress2, prevState, renderLanes2, nextProps);
        }
        if ((renderLanes2 & 536870912) !== 0)
          workInProgress2.memoizedState = { baseLanes: 0, cachePool: null }, current !== null && pushTransition(workInProgress2, prevState !== null ? prevState.cachePool : null), prevState !== null ? pushHiddenContext(workInProgress2, prevState) : reuseHiddenContextOnStack(), pushOffscreenSuspenseHandler(workInProgress2);
        else
          return nextProps = workInProgress2.lanes = 536870912, deferHiddenOffscreenComponent(current, workInProgress2, prevState !== null ? prevState.baseLanes | renderLanes2 : renderLanes2, renderLanes2, nextProps);
      } else
        prevState !== null ? (pushTransition(workInProgress2, prevState.cachePool), pushHiddenContext(workInProgress2, prevState), reuseSuspenseHandlerOnStack(workInProgress2), workInProgress2.memoizedState = null) : (current !== null && pushTransition(workInProgress2, null), reuseHiddenContextOnStack(), reuseSuspenseHandlerOnStack(workInProgress2));
      reconcileChildren(current, workInProgress2, nextChildren, renderLanes2);
      return workInProgress2.child;
    }
    function bailoutOffscreenComponent(current, workInProgress2) {
      current !== null && current.tag === 22 || workInProgress2.stateNode !== null || (workInProgress2.stateNode = {
        _visibility: 1,
        _pendingMarkers: null,
        _retryCache: null,
        _transitions: null
      });
      return workInProgress2.sibling;
    }
    function deferHiddenOffscreenComponent(current, workInProgress2, nextBaseLanes, renderLanes2, remainingChildLanes) {
      var JSCompiler_inline_result = peekCacheFromPool();
      JSCompiler_inline_result = JSCompiler_inline_result === null ? null : {
        parent: isPrimaryRenderer ? CacheContext._currentValue : CacheContext._currentValue2,
        pool: JSCompiler_inline_result
      };
      workInProgress2.memoizedState = {
        baseLanes: nextBaseLanes,
        cachePool: JSCompiler_inline_result
      };
      current !== null && pushTransition(workInProgress2, null);
      reuseHiddenContextOnStack();
      pushOffscreenSuspenseHandler(workInProgress2);
      current !== null && propagateParentContextChanges(current, workInProgress2, renderLanes2, true);
      workInProgress2.childLanes = remainingChildLanes;
      return null;
    }
    function mountActivityChildren(workInProgress2, nextProps) {
      nextProps = mountWorkInProgressOffscreenFiber({ mode: nextProps.mode, children: nextProps.children }, workInProgress2.mode);
      nextProps.ref = workInProgress2.ref;
      workInProgress2.child = nextProps;
      nextProps.return = workInProgress2;
      return nextProps;
    }
    function retryActivityComponentWithoutHydrating(current, workInProgress2, renderLanes2) {
      reconcileChildFibers(workInProgress2, current.child, null, renderLanes2);
      current = mountActivityChildren(workInProgress2, workInProgress2.pendingProps);
      current.flags |= 2;
      popSuspenseHandler(workInProgress2);
      workInProgress2.memoizedState = null;
      return current;
    }
    function updateActivityComponent(current, workInProgress2, renderLanes2) {
      var nextProps = workInProgress2.pendingProps, didSuspend = (workInProgress2.flags & 128) !== 0;
      workInProgress2.flags &= -129;
      if (current === null) {
        if (isHydrating) {
          if (nextProps.mode === "hidden")
            return current = mountActivityChildren(workInProgress2, nextProps), workInProgress2.lanes = 536870912, bailoutOffscreenComponent(null, current);
          pushDehydratedActivitySuspenseHandler(workInProgress2);
          (current = nextHydratableInstance) ? (current = canHydrateActivityInstance(current, rootOrSingletonContext), current !== null && (workInProgress2.memoizedState = {
            dehydrated: current,
            treeContext: treeContextProvider !== null ? { id: treeContextId, overflow: treeContextOverflow } : null,
            retryLane: 536870912,
            hydrationErrors: null
          }, renderLanes2 = createFiberFromDehydratedFragment(current), renderLanes2.return = workInProgress2, workInProgress2.child = renderLanes2, hydrationParentFiber = workInProgress2, nextHydratableInstance = null)) : current = null;
          if (current === null)
            throw throwOnHydrationMismatch(workInProgress2);
          workInProgress2.lanes = 536870912;
          return null;
        }
        return mountActivityChildren(workInProgress2, nextProps);
      }
      var prevState = current.memoizedState;
      if (prevState !== null) {
        var dehydrated = prevState.dehydrated;
        pushDehydratedActivitySuspenseHandler(workInProgress2);
        if (didSuspend)
          if (workInProgress2.flags & 256)
            workInProgress2.flags &= -257, workInProgress2 = retryActivityComponentWithoutHydrating(current, workInProgress2, renderLanes2);
          else if (workInProgress2.memoizedState !== null)
            workInProgress2.child = current.child, workInProgress2.flags |= 128, workInProgress2 = null;
          else
            throw Error(formatProdErrorMessage(558));
        else if (didReceiveUpdate || propagateParentContextChanges(current, workInProgress2, renderLanes2, false), didSuspend = (renderLanes2 & current.childLanes) !== 0, didReceiveUpdate || didSuspend) {
          nextProps = workInProgressRoot;
          if (nextProps !== null && (dehydrated = getBumpedLaneForHydration(nextProps, renderLanes2), dehydrated !== 0 && dehydrated !== prevState.retryLane))
            throw prevState.retryLane = dehydrated, enqueueConcurrentRenderForLane(current, dehydrated), scheduleUpdateOnFiber(nextProps, current, dehydrated), SelectiveHydrationException;
          renderDidSuspendDelayIfPossible();
          workInProgress2 = retryActivityComponentWithoutHydrating(current, workInProgress2, renderLanes2);
        } else
          current = prevState.treeContext, supportsHydration && (nextHydratableInstance = getFirstHydratableChildWithinActivityInstance(dehydrated), hydrationParentFiber = workInProgress2, isHydrating = true, hydrationErrors = null, rootOrSingletonContext = false, current !== null && restoreSuspendedTreeContext(workInProgress2, current)), workInProgress2 = mountActivityChildren(workInProgress2, nextProps), workInProgress2.flags |= 4096;
        return workInProgress2;
      }
      current = createWorkInProgress(current.child, {
        mode: nextProps.mode,
        children: nextProps.children
      });
      current.ref = workInProgress2.ref;
      workInProgress2.child = current;
      current.return = workInProgress2;
      return current;
    }
    function markRef(current, workInProgress2) {
      var ref = workInProgress2.ref;
      if (ref === null)
        current !== null && current.ref !== null && (workInProgress2.flags |= 4194816);
      else {
        if (typeof ref !== "function" && typeof ref !== "object")
          throw Error(formatProdErrorMessage(284));
        if (current === null || current.ref !== ref)
          workInProgress2.flags |= 4194816;
      }
    }
    function updateFunctionComponent(current, workInProgress2, Component2, nextProps, renderLanes2) {
      prepareToReadContext(workInProgress2);
      Component2 = renderWithHooks(current, workInProgress2, Component2, nextProps, undefined, renderLanes2);
      nextProps = checkDidRenderIdHook();
      if (current !== null && !didReceiveUpdate)
        return bailoutHooks(current, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
      isHydrating && nextProps && pushMaterializedTreeId(workInProgress2);
      workInProgress2.flags |= 1;
      reconcileChildren(current, workInProgress2, Component2, renderLanes2);
      return workInProgress2.child;
    }
    function replayFunctionComponent(current, workInProgress2, nextProps, Component2, secondArg, renderLanes2) {
      prepareToReadContext(workInProgress2);
      workInProgress2.updateQueue = null;
      nextProps = renderWithHooksAgain(workInProgress2, Component2, nextProps, secondArg);
      finishRenderingHooks(current);
      Component2 = checkDidRenderIdHook();
      if (current !== null && !didReceiveUpdate)
        return bailoutHooks(current, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
      isHydrating && Component2 && pushMaterializedTreeId(workInProgress2);
      workInProgress2.flags |= 1;
      reconcileChildren(current, workInProgress2, nextProps, renderLanes2);
      return workInProgress2.child;
    }
    function updateClassComponent(current, workInProgress2, Component2, nextProps, renderLanes2) {
      prepareToReadContext(workInProgress2);
      if (workInProgress2.stateNode === null) {
        var context = emptyContextObject, contextType = Component2.contextType;
        typeof contextType === "object" && contextType !== null && (context = readContext(contextType));
        context = new Component2(nextProps, context);
        workInProgress2.memoizedState = context.state !== null && context.state !== undefined ? context.state : null;
        context.updater = classComponentUpdater;
        workInProgress2.stateNode = context;
        context._reactInternals = workInProgress2;
        context = workInProgress2.stateNode;
        context.props = nextProps;
        context.state = workInProgress2.memoizedState;
        context.refs = {};
        initializeUpdateQueue(workInProgress2);
        contextType = Component2.contextType;
        context.context = typeof contextType === "object" && contextType !== null ? readContext(contextType) : emptyContextObject;
        context.state = workInProgress2.memoizedState;
        contextType = Component2.getDerivedStateFromProps;
        typeof contextType === "function" && (applyDerivedStateFromProps(workInProgress2, Component2, contextType, nextProps), context.state = workInProgress2.memoizedState);
        typeof Component2.getDerivedStateFromProps === "function" || typeof context.getSnapshotBeforeUpdate === "function" || typeof context.UNSAFE_componentWillMount !== "function" && typeof context.componentWillMount !== "function" || (contextType = context.state, typeof context.componentWillMount === "function" && context.componentWillMount(), typeof context.UNSAFE_componentWillMount === "function" && context.UNSAFE_componentWillMount(), contextType !== context.state && classComponentUpdater.enqueueReplaceState(context, context.state, null), processUpdateQueue(workInProgress2, nextProps, context, renderLanes2), suspendIfUpdateReadFromEntangledAsyncAction(), context.state = workInProgress2.memoizedState);
        typeof context.componentDidMount === "function" && (workInProgress2.flags |= 4194308);
        nextProps = true;
      } else if (current === null) {
        context = workInProgress2.stateNode;
        var unresolvedOldProps = workInProgress2.memoizedProps, oldProps = resolveClassComponentProps(Component2, unresolvedOldProps);
        context.props = oldProps;
        var oldContext = context.context, contextType$jscomp$0 = Component2.contextType;
        contextType = emptyContextObject;
        typeof contextType$jscomp$0 === "object" && contextType$jscomp$0 !== null && (contextType = readContext(contextType$jscomp$0));
        var getDerivedStateFromProps = Component2.getDerivedStateFromProps;
        contextType$jscomp$0 = typeof getDerivedStateFromProps === "function" || typeof context.getSnapshotBeforeUpdate === "function";
        unresolvedOldProps = workInProgress2.pendingProps !== unresolvedOldProps;
        contextType$jscomp$0 || typeof context.UNSAFE_componentWillReceiveProps !== "function" && typeof context.componentWillReceiveProps !== "function" || (unresolvedOldProps || oldContext !== contextType) && callComponentWillReceiveProps(workInProgress2, context, nextProps, contextType);
        hasForceUpdate = false;
        var oldState = workInProgress2.memoizedState;
        context.state = oldState;
        processUpdateQueue(workInProgress2, nextProps, context, renderLanes2);
        suspendIfUpdateReadFromEntangledAsyncAction();
        oldContext = workInProgress2.memoizedState;
        unresolvedOldProps || oldState !== oldContext || hasForceUpdate ? (typeof getDerivedStateFromProps === "function" && (applyDerivedStateFromProps(workInProgress2, Component2, getDerivedStateFromProps, nextProps), oldContext = workInProgress2.memoizedState), (oldProps = hasForceUpdate || checkShouldComponentUpdate(workInProgress2, Component2, oldProps, nextProps, oldState, oldContext, contextType)) ? (contextType$jscomp$0 || typeof context.UNSAFE_componentWillMount !== "function" && typeof context.componentWillMount !== "function" || (typeof context.componentWillMount === "function" && context.componentWillMount(), typeof context.UNSAFE_componentWillMount === "function" && context.UNSAFE_componentWillMount()), typeof context.componentDidMount === "function" && (workInProgress2.flags |= 4194308)) : (typeof context.componentDidMount === "function" && (workInProgress2.flags |= 4194308), workInProgress2.memoizedProps = nextProps, workInProgress2.memoizedState = oldContext), context.props = nextProps, context.state = oldContext, context.context = contextType, nextProps = oldProps) : (typeof context.componentDidMount === "function" && (workInProgress2.flags |= 4194308), nextProps = false);
      } else {
        context = workInProgress2.stateNode;
        cloneUpdateQueue(current, workInProgress2);
        contextType = workInProgress2.memoizedProps;
        contextType$jscomp$0 = resolveClassComponentProps(Component2, contextType);
        context.props = contextType$jscomp$0;
        getDerivedStateFromProps = workInProgress2.pendingProps;
        oldState = context.context;
        oldContext = Component2.contextType;
        oldProps = emptyContextObject;
        typeof oldContext === "object" && oldContext !== null && (oldProps = readContext(oldContext));
        unresolvedOldProps = Component2.getDerivedStateFromProps;
        (oldContext = typeof unresolvedOldProps === "function" || typeof context.getSnapshotBeforeUpdate === "function") || typeof context.UNSAFE_componentWillReceiveProps !== "function" && typeof context.componentWillReceiveProps !== "function" || (contextType !== getDerivedStateFromProps || oldState !== oldProps) && callComponentWillReceiveProps(workInProgress2, context, nextProps, oldProps);
        hasForceUpdate = false;
        oldState = workInProgress2.memoizedState;
        context.state = oldState;
        processUpdateQueue(workInProgress2, nextProps, context, renderLanes2);
        suspendIfUpdateReadFromEntangledAsyncAction();
        var newState = workInProgress2.memoizedState;
        contextType !== getDerivedStateFromProps || oldState !== newState || hasForceUpdate || current !== null && current.dependencies !== null && checkIfContextChanged(current.dependencies) ? (typeof unresolvedOldProps === "function" && (applyDerivedStateFromProps(workInProgress2, Component2, unresolvedOldProps, nextProps), newState = workInProgress2.memoizedState), (contextType$jscomp$0 = hasForceUpdate || checkShouldComponentUpdate(workInProgress2, Component2, contextType$jscomp$0, nextProps, oldState, newState, oldProps) || current !== null && current.dependencies !== null && checkIfContextChanged(current.dependencies)) ? (oldContext || typeof context.UNSAFE_componentWillUpdate !== "function" && typeof context.componentWillUpdate !== "function" || (typeof context.componentWillUpdate === "function" && context.componentWillUpdate(nextProps, newState, oldProps), typeof context.UNSAFE_componentWillUpdate === "function" && context.UNSAFE_componentWillUpdate(nextProps, newState, oldProps)), typeof context.componentDidUpdate === "function" && (workInProgress2.flags |= 4), typeof context.getSnapshotBeforeUpdate === "function" && (workInProgress2.flags |= 1024)) : (typeof context.componentDidUpdate !== "function" || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 4), typeof context.getSnapshotBeforeUpdate !== "function" || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 1024), workInProgress2.memoizedProps = nextProps, workInProgress2.memoizedState = newState), context.props = nextProps, context.state = newState, context.context = oldProps, nextProps = contextType$jscomp$0) : (typeof context.componentDidUpdate !== "function" || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 4), typeof context.getSnapshotBeforeUpdate !== "function" || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 1024), nextProps = false);
      }
      context = nextProps;
      markRef(current, workInProgress2);
      nextProps = (workInProgress2.flags & 128) !== 0;
      context || nextProps ? (context = workInProgress2.stateNode, Component2 = nextProps && typeof Component2.getDerivedStateFromError !== "function" ? null : context.render(), workInProgress2.flags |= 1, current !== null && nextProps ? (workInProgress2.child = reconcileChildFibers(workInProgress2, current.child, null, renderLanes2), workInProgress2.child = reconcileChildFibers(workInProgress2, null, Component2, renderLanes2)) : reconcileChildren(current, workInProgress2, Component2, renderLanes2), workInProgress2.memoizedState = context.state, current = workInProgress2.child) : current = bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
      return current;
    }
    function mountHostRootWithoutHydrating(current, workInProgress2, nextChildren, renderLanes2) {
      resetHydrationState();
      workInProgress2.flags |= 256;
      reconcileChildren(current, workInProgress2, nextChildren, renderLanes2);
      return workInProgress2.child;
    }
    function mountSuspenseOffscreenState(renderLanes2) {
      return { baseLanes: renderLanes2, cachePool: getSuspendedCache() };
    }
    function getRemainingWorkInPrimaryTree(current, primaryTreeDidDefer, renderLanes2) {
      current = current !== null ? current.childLanes & ~renderLanes2 : 0;
      primaryTreeDidDefer && (current |= workInProgressDeferredLane);
      return current;
    }
    function updateSuspenseComponent(current, workInProgress2, renderLanes2) {
      var nextProps = workInProgress2.pendingProps, showFallback = false, didSuspend = (workInProgress2.flags & 128) !== 0, JSCompiler_temp;
      (JSCompiler_temp = didSuspend) || (JSCompiler_temp = current !== null && current.memoizedState === null ? false : (suspenseStackCursor.current & 2) !== 0);
      JSCompiler_temp && (showFallback = true, workInProgress2.flags &= -129);
      JSCompiler_temp = (workInProgress2.flags & 32) !== 0;
      workInProgress2.flags &= -33;
      if (current === null) {
        if (isHydrating) {
          showFallback ? pushPrimaryTreeSuspenseHandler(workInProgress2) : reuseSuspenseHandlerOnStack(workInProgress2);
          (current = nextHydratableInstance) ? (current = canHydrateSuspenseInstance(current, rootOrSingletonContext), current !== null && (workInProgress2.memoizedState = {
            dehydrated: current,
            treeContext: treeContextProvider !== null ? { id: treeContextId, overflow: treeContextOverflow } : null,
            retryLane: 536870912,
            hydrationErrors: null
          }, renderLanes2 = createFiberFromDehydratedFragment(current), renderLanes2.return = workInProgress2, workInProgress2.child = renderLanes2, hydrationParentFiber = workInProgress2, nextHydratableInstance = null)) : current = null;
          if (current === null)
            throw throwOnHydrationMismatch(workInProgress2);
          isSuspenseInstanceFallback(current) ? workInProgress2.lanes = 32 : workInProgress2.lanes = 536870912;
          return null;
        }
        var nextPrimaryChildren = nextProps.children;
        nextProps = nextProps.fallback;
        if (showFallback)
          return reuseSuspenseHandlerOnStack(workInProgress2), showFallback = workInProgress2.mode, nextPrimaryChildren = mountWorkInProgressOffscreenFiber({ mode: "hidden", children: nextPrimaryChildren }, showFallback), nextProps = createFiberFromFragment(nextProps, showFallback, renderLanes2, null), nextPrimaryChildren.return = workInProgress2, nextProps.return = workInProgress2, nextPrimaryChildren.sibling = nextProps, workInProgress2.child = nextPrimaryChildren, nextProps = workInProgress2.child, nextProps.memoizedState = mountSuspenseOffscreenState(renderLanes2), nextProps.childLanes = getRemainingWorkInPrimaryTree(current, JSCompiler_temp, renderLanes2), workInProgress2.memoizedState = SUSPENDED_MARKER, bailoutOffscreenComponent(null, nextProps);
        pushPrimaryTreeSuspenseHandler(workInProgress2);
        return mountSuspensePrimaryChildren(workInProgress2, nextPrimaryChildren);
      }
      var prevState = current.memoizedState;
      if (prevState !== null && (nextPrimaryChildren = prevState.dehydrated, nextPrimaryChildren !== null)) {
        if (didSuspend)
          workInProgress2.flags & 256 ? (pushPrimaryTreeSuspenseHandler(workInProgress2), workInProgress2.flags &= -257, workInProgress2 = retrySuspenseComponentWithoutHydrating(current, workInProgress2, renderLanes2)) : workInProgress2.memoizedState !== null ? (reuseSuspenseHandlerOnStack(workInProgress2), workInProgress2.child = current.child, workInProgress2.flags |= 128, workInProgress2 = null) : (reuseSuspenseHandlerOnStack(workInProgress2), nextPrimaryChildren = nextProps.fallback, showFallback = workInProgress2.mode, nextProps = mountWorkInProgressOffscreenFiber({ mode: "visible", children: nextProps.children }, showFallback), nextPrimaryChildren = createFiberFromFragment(nextPrimaryChildren, showFallback, renderLanes2, null), nextPrimaryChildren.flags |= 2, nextProps.return = workInProgress2, nextPrimaryChildren.return = workInProgress2, nextProps.sibling = nextPrimaryChildren, workInProgress2.child = nextProps, reconcileChildFibers(workInProgress2, current.child, null, renderLanes2), nextProps = workInProgress2.child, nextProps.memoizedState = mountSuspenseOffscreenState(renderLanes2), nextProps.childLanes = getRemainingWorkInPrimaryTree(current, JSCompiler_temp, renderLanes2), workInProgress2.memoizedState = SUSPENDED_MARKER, workInProgress2 = bailoutOffscreenComponent(null, nextProps));
        else if (pushPrimaryTreeSuspenseHandler(workInProgress2), isSuspenseInstanceFallback(nextPrimaryChildren))
          JSCompiler_temp = getSuspenseInstanceFallbackErrorDetails(nextPrimaryChildren).digest, nextProps = Error(formatProdErrorMessage(419)), nextProps.stack = "", nextProps.digest = JSCompiler_temp, queueHydrationError({ value: nextProps, source: null, stack: null }), workInProgress2 = retrySuspenseComponentWithoutHydrating(current, workInProgress2, renderLanes2);
        else if (didReceiveUpdate || propagateParentContextChanges(current, workInProgress2, renderLanes2, false), JSCompiler_temp = (renderLanes2 & current.childLanes) !== 0, didReceiveUpdate || JSCompiler_temp) {
          JSCompiler_temp = workInProgressRoot;
          if (JSCompiler_temp !== null && (nextProps = getBumpedLaneForHydration(JSCompiler_temp, renderLanes2), nextProps !== 0 && nextProps !== prevState.retryLane))
            throw prevState.retryLane = nextProps, enqueueConcurrentRenderForLane(current, nextProps), scheduleUpdateOnFiber(JSCompiler_temp, current, nextProps), SelectiveHydrationException;
          isSuspenseInstancePending(nextPrimaryChildren) || renderDidSuspendDelayIfPossible();
          workInProgress2 = retrySuspenseComponentWithoutHydrating(current, workInProgress2, renderLanes2);
        } else
          isSuspenseInstancePending(nextPrimaryChildren) ? (workInProgress2.flags |= 192, workInProgress2.child = current.child, workInProgress2 = null) : (current = prevState.treeContext, supportsHydration && (nextHydratableInstance = getFirstHydratableChildWithinSuspenseInstance(nextPrimaryChildren), hydrationParentFiber = workInProgress2, isHydrating = true, hydrationErrors = null, rootOrSingletonContext = false, current !== null && restoreSuspendedTreeContext(workInProgress2, current)), workInProgress2 = mountSuspensePrimaryChildren(workInProgress2, nextProps.children), workInProgress2.flags |= 4096);
        return workInProgress2;
      }
      if (showFallback)
        return reuseSuspenseHandlerOnStack(workInProgress2), nextPrimaryChildren = nextProps.fallback, showFallback = workInProgress2.mode, prevState = current.child, didSuspend = prevState.sibling, nextProps = createWorkInProgress(prevState, {
          mode: "hidden",
          children: nextProps.children
        }), nextProps.subtreeFlags = prevState.subtreeFlags & 65011712, didSuspend !== null ? nextPrimaryChildren = createWorkInProgress(didSuspend, nextPrimaryChildren) : (nextPrimaryChildren = createFiberFromFragment(nextPrimaryChildren, showFallback, renderLanes2, null), nextPrimaryChildren.flags |= 2), nextPrimaryChildren.return = workInProgress2, nextProps.return = workInProgress2, nextProps.sibling = nextPrimaryChildren, workInProgress2.child = nextProps, bailoutOffscreenComponent(null, nextProps), nextProps = workInProgress2.child, nextPrimaryChildren = current.child.memoizedState, nextPrimaryChildren === null ? nextPrimaryChildren = mountSuspenseOffscreenState(renderLanes2) : (showFallback = nextPrimaryChildren.cachePool, showFallback !== null ? (prevState = isPrimaryRenderer ? CacheContext._currentValue : CacheContext._currentValue2, showFallback = showFallback.parent !== prevState ? { parent: prevState, pool: prevState } : showFallback) : showFallback = getSuspendedCache(), nextPrimaryChildren = {
          baseLanes: nextPrimaryChildren.baseLanes | renderLanes2,
          cachePool: showFallback
        }), nextProps.memoizedState = nextPrimaryChildren, nextProps.childLanes = getRemainingWorkInPrimaryTree(current, JSCompiler_temp, renderLanes2), workInProgress2.memoizedState = SUSPENDED_MARKER, bailoutOffscreenComponent(current.child, nextProps);
      pushPrimaryTreeSuspenseHandler(workInProgress2);
      renderLanes2 = current.child;
      current = renderLanes2.sibling;
      renderLanes2 = createWorkInProgress(renderLanes2, {
        mode: "visible",
        children: nextProps.children
      });
      renderLanes2.return = workInProgress2;
      renderLanes2.sibling = null;
      current !== null && (JSCompiler_temp = workInProgress2.deletions, JSCompiler_temp === null ? (workInProgress2.deletions = [current], workInProgress2.flags |= 16) : JSCompiler_temp.push(current));
      workInProgress2.child = renderLanes2;
      workInProgress2.memoizedState = null;
      return renderLanes2;
    }
    function mountSuspensePrimaryChildren(workInProgress2, primaryChildren) {
      primaryChildren = mountWorkInProgressOffscreenFiber({ mode: "visible", children: primaryChildren }, workInProgress2.mode);
      primaryChildren.return = workInProgress2;
      return workInProgress2.child = primaryChildren;
    }
    function mountWorkInProgressOffscreenFiber(offscreenProps, mode) {
      offscreenProps = createFiber(22, offscreenProps, null, mode);
      offscreenProps.lanes = 0;
      return offscreenProps;
    }
    function retrySuspenseComponentWithoutHydrating(current, workInProgress2, renderLanes2) {
      reconcileChildFibers(workInProgress2, current.child, null, renderLanes2);
      current = mountSuspensePrimaryChildren(workInProgress2, workInProgress2.pendingProps.children);
      current.flags |= 2;
      workInProgress2.memoizedState = null;
      return current;
    }
    function scheduleSuspenseWorkOnFiber(fiber, renderLanes2, propagationRoot) {
      fiber.lanes |= renderLanes2;
      var alternate = fiber.alternate;
      alternate !== null && (alternate.lanes |= renderLanes2);
      scheduleContextWorkOnParentPath(fiber.return, renderLanes2, propagationRoot);
    }
    function initSuspenseListRenderState(workInProgress2, isBackwards, tail, lastContentRow, tailMode, treeForkCount2) {
      var renderState = workInProgress2.memoizedState;
      renderState === null ? workInProgress2.memoizedState = {
        isBackwards,
        rendering: null,
        renderingStartTime: 0,
        last: lastContentRow,
        tail,
        tailMode,
        treeForkCount: treeForkCount2
      } : (renderState.isBackwards = isBackwards, renderState.rendering = null, renderState.renderingStartTime = 0, renderState.last = lastContentRow, renderState.tail = tail, renderState.tailMode = tailMode, renderState.treeForkCount = treeForkCount2);
    }
    function updateSuspenseListComponent(current, workInProgress2, renderLanes2) {
      var nextProps = workInProgress2.pendingProps, revealOrder = nextProps.revealOrder, tailMode = nextProps.tail;
      nextProps = nextProps.children;
      var suspenseContext = suspenseStackCursor.current, shouldForceFallback = (suspenseContext & 2) !== 0;
      shouldForceFallback ? (suspenseContext = suspenseContext & 1 | 2, workInProgress2.flags |= 128) : suspenseContext &= 1;
      push2(suspenseStackCursor, suspenseContext);
      reconcileChildren(current, workInProgress2, nextProps, renderLanes2);
      nextProps = isHydrating ? treeForkCount : 0;
      if (!shouldForceFallback && current !== null && (current.flags & 128) !== 0)
        a:
          for (current = workInProgress2.child;current !== null; ) {
            if (current.tag === 13)
              current.memoizedState !== null && scheduleSuspenseWorkOnFiber(current, renderLanes2, workInProgress2);
            else if (current.tag === 19)
              scheduleSuspenseWorkOnFiber(current, renderLanes2, workInProgress2);
            else if (current.child !== null) {
              current.child.return = current;
              current = current.child;
              continue;
            }
            if (current === workInProgress2)
              break a;
            for (;current.sibling === null; ) {
              if (current.return === null || current.return === workInProgress2)
                break a;
              current = current.return;
            }
            current.sibling.return = current.return;
            current = current.sibling;
          }
      switch (revealOrder) {
        case "forwards":
          renderLanes2 = workInProgress2.child;
          for (revealOrder = null;renderLanes2 !== null; )
            current = renderLanes2.alternate, current !== null && findFirstSuspended(current) === null && (revealOrder = renderLanes2), renderLanes2 = renderLanes2.sibling;
          renderLanes2 = revealOrder;
          renderLanes2 === null ? (revealOrder = workInProgress2.child, workInProgress2.child = null) : (revealOrder = renderLanes2.sibling, renderLanes2.sibling = null);
          initSuspenseListRenderState(workInProgress2, false, revealOrder, renderLanes2, tailMode, nextProps);
          break;
        case "backwards":
        case "unstable_legacy-backwards":
          renderLanes2 = null;
          revealOrder = workInProgress2.child;
          for (workInProgress2.child = null;revealOrder !== null; ) {
            current = revealOrder.alternate;
            if (current !== null && findFirstSuspended(current) === null) {
              workInProgress2.child = revealOrder;
              break;
            }
            current = revealOrder.sibling;
            revealOrder.sibling = renderLanes2;
            renderLanes2 = revealOrder;
            revealOrder = current;
          }
          initSuspenseListRenderState(workInProgress2, true, renderLanes2, null, tailMode, nextProps);
          break;
        case "together":
          initSuspenseListRenderState(workInProgress2, false, null, null, undefined, nextProps);
          break;
        default:
          workInProgress2.memoizedState = null;
      }
      return workInProgress2.child;
    }
    function bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2) {
      current !== null && (workInProgress2.dependencies = current.dependencies);
      workInProgressRootSkippedLanes |= workInProgress2.lanes;
      if ((renderLanes2 & workInProgress2.childLanes) === 0)
        if (current !== null) {
          if (propagateParentContextChanges(current, workInProgress2, renderLanes2, false), (renderLanes2 & workInProgress2.childLanes) === 0)
            return null;
        } else
          return null;
      if (current !== null && workInProgress2.child !== current.child)
        throw Error(formatProdErrorMessage(153));
      if (workInProgress2.child !== null) {
        current = workInProgress2.child;
        renderLanes2 = createWorkInProgress(current, current.pendingProps);
        workInProgress2.child = renderLanes2;
        for (renderLanes2.return = workInProgress2;current.sibling !== null; )
          current = current.sibling, renderLanes2 = renderLanes2.sibling = createWorkInProgress(current, current.pendingProps), renderLanes2.return = workInProgress2;
        renderLanes2.sibling = null;
      }
      return workInProgress2.child;
    }
    function checkScheduledUpdateOrContext(current, renderLanes2) {
      if ((current.lanes & renderLanes2) !== 0)
        return true;
      current = current.dependencies;
      return current !== null && checkIfContextChanged(current) ? true : false;
    }
    function attemptEarlyBailoutIfNoScheduledUpdate(current, workInProgress2, renderLanes2) {
      switch (workInProgress2.tag) {
        case 3:
          pushHostContainer(workInProgress2, workInProgress2.stateNode.containerInfo);
          pushProvider(workInProgress2, CacheContext, current.memoizedState.cache);
          resetHydrationState();
          break;
        case 27:
        case 5:
          pushHostContext(workInProgress2);
          break;
        case 4:
          pushHostContainer(workInProgress2, workInProgress2.stateNode.containerInfo);
          break;
        case 10:
          pushProvider(workInProgress2, workInProgress2.type, workInProgress2.memoizedProps.value);
          break;
        case 31:
          if (workInProgress2.memoizedState !== null)
            return workInProgress2.flags |= 128, pushDehydratedActivitySuspenseHandler(workInProgress2), null;
          break;
        case 13:
          var state$82 = workInProgress2.memoizedState;
          if (state$82 !== null) {
            if (state$82.dehydrated !== null)
              return pushPrimaryTreeSuspenseHandler(workInProgress2), workInProgress2.flags |= 128, null;
            if ((renderLanes2 & workInProgress2.child.childLanes) !== 0)
              return updateSuspenseComponent(current, workInProgress2, renderLanes2);
            pushPrimaryTreeSuspenseHandler(workInProgress2);
            current = bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
            return current !== null ? current.sibling : null;
          }
          pushPrimaryTreeSuspenseHandler(workInProgress2);
          break;
        case 19:
          var didSuspendBefore = (current.flags & 128) !== 0;
          state$82 = (renderLanes2 & workInProgress2.childLanes) !== 0;
          state$82 || (propagateParentContextChanges(current, workInProgress2, renderLanes2, false), state$82 = (renderLanes2 & workInProgress2.childLanes) !== 0);
          if (didSuspendBefore) {
            if (state$82)
              return updateSuspenseListComponent(current, workInProgress2, renderLanes2);
            workInProgress2.flags |= 128;
          }
          didSuspendBefore = workInProgress2.memoizedState;
          didSuspendBefore !== null && (didSuspendBefore.rendering = null, didSuspendBefore.tail = null, didSuspendBefore.lastEffect = null);
          push2(suspenseStackCursor, suspenseStackCursor.current);
          if (state$82)
            break;
          else
            return null;
        case 22:
          return workInProgress2.lanes = 0, updateOffscreenComponent(current, workInProgress2, renderLanes2, workInProgress2.pendingProps);
        case 24:
          pushProvider(workInProgress2, CacheContext, current.memoizedState.cache);
      }
      return bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
    }
    function beginWork(current, workInProgress2, renderLanes2) {
      if (current !== null)
        if (current.memoizedProps !== workInProgress2.pendingProps)
          didReceiveUpdate = true;
        else {
          if (!checkScheduledUpdateOrContext(current, renderLanes2) && (workInProgress2.flags & 128) === 0)
            return didReceiveUpdate = false, attemptEarlyBailoutIfNoScheduledUpdate(current, workInProgress2, renderLanes2);
          didReceiveUpdate = (current.flags & 131072) !== 0 ? true : false;
        }
      else
        didReceiveUpdate = false, isHydrating && (workInProgress2.flags & 1048576) !== 0 && pushTreeId(workInProgress2, treeForkCount, workInProgress2.index);
      workInProgress2.lanes = 0;
      switch (workInProgress2.tag) {
        case 16:
          a: {
            var props = workInProgress2.pendingProps;
            current = resolveLazy(workInProgress2.elementType);
            workInProgress2.type = current;
            if (typeof current === "function")
              shouldConstruct(current) ? (props = resolveClassComponentProps(current, props), workInProgress2.tag = 1, workInProgress2 = updateClassComponent(null, workInProgress2, current, props, renderLanes2)) : (workInProgress2.tag = 0, workInProgress2 = updateFunctionComponent(null, workInProgress2, current, props, renderLanes2));
            else {
              if (current !== undefined && current !== null) {
                var $$typeof = current.$$typeof;
                if ($$typeof === REACT_FORWARD_REF_TYPE2) {
                  workInProgress2.tag = 11;
                  workInProgress2 = updateForwardRef(null, workInProgress2, current, props, renderLanes2);
                  break a;
                } else if ($$typeof === REACT_MEMO_TYPE2) {
                  workInProgress2.tag = 14;
                  workInProgress2 = updateMemoComponent(null, workInProgress2, current, props, renderLanes2);
                  break a;
                }
              }
              workInProgress2 = getComponentNameFromType(current) || current;
              throw Error(formatProdErrorMessage(306, workInProgress2, ""));
            }
          }
          return workInProgress2;
        case 0:
          return updateFunctionComponent(current, workInProgress2, workInProgress2.type, workInProgress2.pendingProps, renderLanes2);
        case 1:
          return props = workInProgress2.type, $$typeof = resolveClassComponentProps(props, workInProgress2.pendingProps), updateClassComponent(current, workInProgress2, props, $$typeof, renderLanes2);
        case 3:
          a: {
            pushHostContainer(workInProgress2, workInProgress2.stateNode.containerInfo);
            if (current === null)
              throw Error(formatProdErrorMessage(387));
            var nextProps = workInProgress2.pendingProps;
            $$typeof = workInProgress2.memoizedState;
            props = $$typeof.element;
            cloneUpdateQueue(current, workInProgress2);
            processUpdateQueue(workInProgress2, nextProps, null, renderLanes2);
            var nextState = workInProgress2.memoizedState;
            nextProps = nextState.cache;
            pushProvider(workInProgress2, CacheContext, nextProps);
            nextProps !== $$typeof.cache && propagateContextChanges(workInProgress2, [CacheContext], renderLanes2, true);
            suspendIfUpdateReadFromEntangledAsyncAction();
            nextProps = nextState.element;
            if (supportsHydration && $$typeof.isDehydrated)
              if ($$typeof = {
                element: nextProps,
                isDehydrated: false,
                cache: nextState.cache
              }, workInProgress2.updateQueue.baseState = $$typeof, workInProgress2.memoizedState = $$typeof, workInProgress2.flags & 256) {
                workInProgress2 = mountHostRootWithoutHydrating(current, workInProgress2, nextProps, renderLanes2);
                break a;
              } else if (nextProps !== props) {
                props = createCapturedValueAtFiber(Error(formatProdErrorMessage(424)), workInProgress2);
                queueHydrationError(props);
                workInProgress2 = mountHostRootWithoutHydrating(current, workInProgress2, nextProps, renderLanes2);
                break a;
              } else
                for (supportsHydration && (nextHydratableInstance = getFirstHydratableChildWithinContainer(workInProgress2.stateNode.containerInfo), hydrationParentFiber = workInProgress2, isHydrating = true, hydrationErrors = null, rootOrSingletonContext = true), renderLanes2 = mountChildFibers(workInProgress2, null, nextProps, renderLanes2), workInProgress2.child = renderLanes2;renderLanes2; )
                  renderLanes2.flags = renderLanes2.flags & -3 | 4096, renderLanes2 = renderLanes2.sibling;
            else {
              resetHydrationState();
              if (nextProps === props) {
                workInProgress2 = bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
                break a;
              }
              reconcileChildren(current, workInProgress2, nextProps, renderLanes2);
            }
            workInProgress2 = workInProgress2.child;
          }
          return workInProgress2;
        case 26:
          if (supportsResources)
            return markRef(current, workInProgress2), current === null ? (renderLanes2 = getResource(workInProgress2.type, null, workInProgress2.pendingProps, null)) ? workInProgress2.memoizedState = renderLanes2 : isHydrating || (workInProgress2.stateNode = createHoistableInstance(workInProgress2.type, workInProgress2.pendingProps, rootInstanceStackCursor.current, workInProgress2)) : workInProgress2.memoizedState = getResource(workInProgress2.type, current.memoizedProps, workInProgress2.pendingProps, current.memoizedState), null;
        case 27:
          if (supportsSingletons)
            return pushHostContext(workInProgress2), current === null && supportsSingletons && isHydrating && (props = workInProgress2.stateNode = resolveSingletonInstance(workInProgress2.type, workInProgress2.pendingProps, rootInstanceStackCursor.current, contextStackCursor.current, false), hydrationParentFiber = workInProgress2, rootOrSingletonContext = true, nextHydratableInstance = getFirstHydratableChildWithinSingleton(workInProgress2.type, props, nextHydratableInstance)), reconcileChildren(current, workInProgress2, workInProgress2.pendingProps.children, renderLanes2), markRef(current, workInProgress2), current === null && (workInProgress2.flags |= 4194304), workInProgress2.child;
        case 5:
          if (current === null && isHydrating) {
            validateHydratableInstance(workInProgress2.type, workInProgress2.pendingProps, contextStackCursor.current);
            if ($$typeof = props = nextHydratableInstance)
              props = canHydrateInstance(props, workInProgress2.type, workInProgress2.pendingProps, rootOrSingletonContext), props !== null ? (workInProgress2.stateNode = props, hydrationParentFiber = workInProgress2, nextHydratableInstance = getFirstHydratableChild(props), rootOrSingletonContext = false, $$typeof = true) : $$typeof = false;
            $$typeof || throwOnHydrationMismatch(workInProgress2);
          }
          pushHostContext(workInProgress2);
          $$typeof = workInProgress2.type;
          nextProps = workInProgress2.pendingProps;
          nextState = current !== null ? current.memoizedProps : null;
          props = nextProps.children;
          shouldSetTextContent($$typeof, nextProps) ? props = null : nextState !== null && shouldSetTextContent($$typeof, nextState) && (workInProgress2.flags |= 32);
          workInProgress2.memoizedState !== null && ($$typeof = renderWithHooks(current, workInProgress2, TransitionAwareHostComponent, null, null, renderLanes2), isPrimaryRenderer ? HostTransitionContext._currentValue = $$typeof : HostTransitionContext._currentValue2 = $$typeof);
          markRef(current, workInProgress2);
          reconcileChildren(current, workInProgress2, props, renderLanes2);
          return workInProgress2.child;
        case 6:
          if (current === null && isHydrating) {
            validateHydratableTextInstance(workInProgress2.pendingProps, contextStackCursor.current);
            if (current = renderLanes2 = nextHydratableInstance)
              renderLanes2 = canHydrateTextInstance(renderLanes2, workInProgress2.pendingProps, rootOrSingletonContext), renderLanes2 !== null ? (workInProgress2.stateNode = renderLanes2, hydrationParentFiber = workInProgress2, nextHydratableInstance = null, current = true) : current = false;
            current || throwOnHydrationMismatch(workInProgress2);
          }
          return null;
        case 13:
          return updateSuspenseComponent(current, workInProgress2, renderLanes2);
        case 4:
          return pushHostContainer(workInProgress2, workInProgress2.stateNode.containerInfo), props = workInProgress2.pendingProps, current === null ? workInProgress2.child = reconcileChildFibers(workInProgress2, null, props, renderLanes2) : reconcileChildren(current, workInProgress2, props, renderLanes2), workInProgress2.child;
        case 11:
          return updateForwardRef(current, workInProgress2, workInProgress2.type, workInProgress2.pendingProps, renderLanes2);
        case 7:
          return reconcileChildren(current, workInProgress2, workInProgress2.pendingProps, renderLanes2), workInProgress2.child;
        case 8:
          return reconcileChildren(current, workInProgress2, workInProgress2.pendingProps.children, renderLanes2), workInProgress2.child;
        case 12:
          return reconcileChildren(current, workInProgress2, workInProgress2.pendingProps.children, renderLanes2), workInProgress2.child;
        case 10:
          return props = workInProgress2.pendingProps, pushProvider(workInProgress2, workInProgress2.type, props.value), reconcileChildren(current, workInProgress2, props.children, renderLanes2), workInProgress2.child;
        case 9:
          return $$typeof = workInProgress2.type._context, props = workInProgress2.pendingProps.children, prepareToReadContext(workInProgress2), $$typeof = readContext($$typeof), props = props($$typeof), workInProgress2.flags |= 1, reconcileChildren(current, workInProgress2, props, renderLanes2), workInProgress2.child;
        case 14:
          return updateMemoComponent(current, workInProgress2, workInProgress2.type, workInProgress2.pendingProps, renderLanes2);
        case 15:
          return updateSimpleMemoComponent(current, workInProgress2, workInProgress2.type, workInProgress2.pendingProps, renderLanes2);
        case 19:
          return updateSuspenseListComponent(current, workInProgress2, renderLanes2);
        case 31:
          return updateActivityComponent(current, workInProgress2, renderLanes2);
        case 22:
          return updateOffscreenComponent(current, workInProgress2, renderLanes2, workInProgress2.pendingProps);
        case 24:
          return prepareToReadContext(workInProgress2), props = readContext(CacheContext), current === null ? ($$typeof = peekCacheFromPool(), $$typeof === null && ($$typeof = workInProgressRoot, nextProps = createCache(), $$typeof.pooledCache = nextProps, nextProps.refCount++, nextProps !== null && ($$typeof.pooledCacheLanes |= renderLanes2), $$typeof = nextProps), workInProgress2.memoizedState = {
            parent: props,
            cache: $$typeof
          }, initializeUpdateQueue(workInProgress2), pushProvider(workInProgress2, CacheContext, $$typeof)) : ((current.lanes & renderLanes2) !== 0 && (cloneUpdateQueue(current, workInProgress2), processUpdateQueue(workInProgress2, null, null, renderLanes2), suspendIfUpdateReadFromEntangledAsyncAction()), $$typeof = current.memoizedState, nextProps = workInProgress2.memoizedState, $$typeof.parent !== props ? ($$typeof = { parent: props, cache: props }, workInProgress2.memoizedState = $$typeof, workInProgress2.lanes === 0 && (workInProgress2.memoizedState = workInProgress2.updateQueue.baseState = $$typeof), pushProvider(workInProgress2, CacheContext, props)) : (props = nextProps.cache, pushProvider(workInProgress2, CacheContext, props), props !== $$typeof.cache && propagateContextChanges(workInProgress2, [CacheContext], renderLanes2, true))), reconcileChildren(current, workInProgress2, workInProgress2.pendingProps.children, renderLanes2), workInProgress2.child;
        case 29:
          throw workInProgress2.pendingProps;
      }
      throw Error(formatProdErrorMessage(156, workInProgress2.tag));
    }
    function markUpdate(workInProgress2) {
      workInProgress2.flags |= 4;
    }
    function markCloned(workInProgress2) {
      supportsPersistence && (workInProgress2.flags |= 8);
    }
    function doesRequireClone(current, completedWork) {
      if (current !== null && current.child === completedWork.child)
        return false;
      if ((completedWork.flags & 16) !== 0)
        return true;
      for (current = completedWork.child;current !== null; ) {
        if ((current.flags & 8218) !== 0 || (current.subtreeFlags & 8218) !== 0)
          return true;
        current = current.sibling;
      }
      return false;
    }
    function appendAllChildren(parent, workInProgress2, needsVisibilityToggle, isHidden) {
      if (supportsMutation)
        for (needsVisibilityToggle = workInProgress2.child;needsVisibilityToggle !== null; ) {
          if (needsVisibilityToggle.tag === 5 || needsVisibilityToggle.tag === 6)
            appendInitialChild(parent, needsVisibilityToggle.stateNode);
          else if (!(needsVisibilityToggle.tag === 4 || supportsSingletons && needsVisibilityToggle.tag === 27) && needsVisibilityToggle.child !== null) {
            needsVisibilityToggle.child.return = needsVisibilityToggle;
            needsVisibilityToggle = needsVisibilityToggle.child;
            continue;
          }
          if (needsVisibilityToggle === workInProgress2)
            break;
          for (;needsVisibilityToggle.sibling === null; ) {
            if (needsVisibilityToggle.return === null || needsVisibilityToggle.return === workInProgress2)
              return;
            needsVisibilityToggle = needsVisibilityToggle.return;
          }
          needsVisibilityToggle.sibling.return = needsVisibilityToggle.return;
          needsVisibilityToggle = needsVisibilityToggle.sibling;
        }
      else if (supportsPersistence)
        for (var node$85 = workInProgress2.child;node$85 !== null; ) {
          if (node$85.tag === 5) {
            var instance = node$85.stateNode;
            needsVisibilityToggle && isHidden && (instance = cloneHiddenInstance(instance, node$85.type, node$85.memoizedProps));
            appendInitialChild(parent, instance);
          } else if (node$85.tag === 6)
            instance = node$85.stateNode, needsVisibilityToggle && isHidden && (instance = cloneHiddenTextInstance(instance, node$85.memoizedProps)), appendInitialChild(parent, instance);
          else if (node$85.tag !== 4) {
            if (node$85.tag === 22 && node$85.memoizedState !== null)
              instance = node$85.child, instance !== null && (instance.return = node$85), appendAllChildren(parent, node$85, true, true);
            else if (node$85.child !== null) {
              node$85.child.return = node$85;
              node$85 = node$85.child;
              continue;
            }
          }
          if (node$85 === workInProgress2)
            break;
          for (;node$85.sibling === null; ) {
            if (node$85.return === null || node$85.return === workInProgress2)
              return;
            node$85 = node$85.return;
          }
          node$85.sibling.return = node$85.return;
          node$85 = node$85.sibling;
        }
    }
    function appendAllChildrenToContainer(containerChildSet, workInProgress2, needsVisibilityToggle, isHidden) {
      var hasOffscreenComponentChild = false;
      if (supportsPersistence)
        for (var node = workInProgress2.child;node !== null; ) {
          if (node.tag === 5) {
            var instance = node.stateNode;
            needsVisibilityToggle && isHidden && (instance = cloneHiddenInstance(instance, node.type, node.memoizedProps));
            appendChildToContainerChildSet(containerChildSet, instance);
          } else if (node.tag === 6)
            instance = node.stateNode, needsVisibilityToggle && isHidden && (instance = cloneHiddenTextInstance(instance, node.memoizedProps)), appendChildToContainerChildSet(containerChildSet, instance);
          else if (node.tag !== 4) {
            if (node.tag === 22 && node.memoizedState !== null)
              hasOffscreenComponentChild = node.child, hasOffscreenComponentChild !== null && (hasOffscreenComponentChild.return = node), appendAllChildrenToContainer(containerChildSet, node, true, true), hasOffscreenComponentChild = true;
            else if (node.child !== null) {
              node.child.return = node;
              node = node.child;
              continue;
            }
          }
          if (node === workInProgress2)
            break;
          for (;node.sibling === null; ) {
            if (node.return === null || node.return === workInProgress2)
              return hasOffscreenComponentChild;
            node = node.return;
          }
          node.sibling.return = node.return;
          node = node.sibling;
        }
      return hasOffscreenComponentChild;
    }
    function updateHostContainer(current, workInProgress2) {
      if (supportsPersistence && doesRequireClone(current, workInProgress2)) {
        current = workInProgress2.stateNode;
        var container = current.containerInfo, newChildSet = createContainerChildSet();
        appendAllChildrenToContainer(newChildSet, workInProgress2, false, false);
        current.pendingChildren = newChildSet;
        markUpdate(workInProgress2);
        finalizeContainerChildren(container, newChildSet);
      }
    }
    function updateHostComponent(current, workInProgress2, type, newProps) {
      if (supportsMutation)
        current.memoizedProps !== newProps && markUpdate(workInProgress2);
      else if (supportsPersistence) {
        var { stateNode: currentInstance, memoizedProps: oldProps$88 } = current;
        if ((current = doesRequireClone(current, workInProgress2)) || oldProps$88 !== newProps) {
          var currentHostContext = contextStackCursor.current;
          oldProps$88 = cloneInstance(currentInstance, type, oldProps$88, newProps, !current, null);
          oldProps$88 === currentInstance ? workInProgress2.stateNode = currentInstance : (markCloned(workInProgress2), finalizeInitialChildren(oldProps$88, type, newProps, currentHostContext) && markUpdate(workInProgress2), workInProgress2.stateNode = oldProps$88, current && appendAllChildren(oldProps$88, workInProgress2, false, false));
        } else
          workInProgress2.stateNode = currentInstance;
      }
    }
    function preloadInstanceAndSuspendIfNeeded(workInProgress2, type, oldProps, newProps, renderLanes2) {
      if ((workInProgress2.mode & 32) !== 0 && (oldProps === null ? maySuspendCommit(type, newProps) : maySuspendCommitOnUpdate(type, oldProps, newProps))) {
        if (workInProgress2.flags |= 16777216, (renderLanes2 & 335544128) === renderLanes2 || maySuspendCommitInSyncRender(type, newProps))
          if (preloadInstance(workInProgress2.stateNode, type, newProps))
            workInProgress2.flags |= 8192;
          else if (shouldRemainOnPreviousScreen())
            workInProgress2.flags |= 8192;
          else
            throw suspendedThenable = noopSuspenseyCommitThenable, SuspenseyCommitException;
      } else
        workInProgress2.flags &= -16777217;
    }
    function preloadResourceAndSuspendIfNeeded(workInProgress2, resource) {
      if (mayResourceSuspendCommit(resource)) {
        if (workInProgress2.flags |= 16777216, !preloadResource(resource))
          if (shouldRemainOnPreviousScreen())
            workInProgress2.flags |= 8192;
          else
            throw suspendedThenable = noopSuspenseyCommitThenable, SuspenseyCommitException;
      } else
        workInProgress2.flags &= -16777217;
    }
    function scheduleRetryEffect(workInProgress2, retryQueue) {
      retryQueue !== null && (workInProgress2.flags |= 4);
      workInProgress2.flags & 16384 && (retryQueue = workInProgress2.tag !== 22 ? claimNextRetryLane() : 536870912, workInProgress2.lanes |= retryQueue, workInProgressSuspendedRetryLanes |= retryQueue);
    }
    function cutOffTailIfNeeded(renderState, hasRenderedATailFallback) {
      if (!isHydrating)
        switch (renderState.tailMode) {
          case "hidden":
            hasRenderedATailFallback = renderState.tail;
            for (var lastTailNode = null;hasRenderedATailFallback !== null; )
              hasRenderedATailFallback.alternate !== null && (lastTailNode = hasRenderedATailFallback), hasRenderedATailFallback = hasRenderedATailFallback.sibling;
            lastTailNode === null ? renderState.tail = null : lastTailNode.sibling = null;
            break;
          case "collapsed":
            lastTailNode = renderState.tail;
            for (var lastTailNode$90 = null;lastTailNode !== null; )
              lastTailNode.alternate !== null && (lastTailNode$90 = lastTailNode), lastTailNode = lastTailNode.sibling;
            lastTailNode$90 === null ? hasRenderedATailFallback || renderState.tail === null ? renderState.tail = null : renderState.tail.sibling = null : lastTailNode$90.sibling = null;
        }
    }
    function bubbleProperties(completedWork) {
      var didBailout = completedWork.alternate !== null && completedWork.alternate.child === completedWork.child, newChildLanes = 0, subtreeFlags = 0;
      if (didBailout)
        for (var child$91 = completedWork.child;child$91 !== null; )
          newChildLanes |= child$91.lanes | child$91.childLanes, subtreeFlags |= child$91.subtreeFlags & 65011712, subtreeFlags |= child$91.flags & 65011712, child$91.return = completedWork, child$91 = child$91.sibling;
      else
        for (child$91 = completedWork.child;child$91 !== null; )
          newChildLanes |= child$91.lanes | child$91.childLanes, subtreeFlags |= child$91.subtreeFlags, subtreeFlags |= child$91.flags, child$91.return = completedWork, child$91 = child$91.sibling;
      completedWork.subtreeFlags |= subtreeFlags;
      completedWork.childLanes = newChildLanes;
      return didBailout;
    }
    function completeWork(current, workInProgress2, renderLanes2) {
      var newProps = workInProgress2.pendingProps;
      popTreeContext(workInProgress2);
      switch (workInProgress2.tag) {
        case 16:
        case 15:
        case 0:
        case 11:
        case 7:
        case 8:
        case 12:
        case 9:
        case 14:
          return bubbleProperties(workInProgress2), null;
        case 1:
          return bubbleProperties(workInProgress2), null;
        case 3:
          renderLanes2 = workInProgress2.stateNode;
          newProps = null;
          current !== null && (newProps = current.memoizedState.cache);
          workInProgress2.memoizedState.cache !== newProps && (workInProgress2.flags |= 2048);
          popProvider(CacheContext);
          popHostContainer();
          renderLanes2.pendingContext && (renderLanes2.context = renderLanes2.pendingContext, renderLanes2.pendingContext = null);
          if (current === null || current.child === null)
            popHydrationState(workInProgress2) ? markUpdate(workInProgress2) : current === null || current.memoizedState.isDehydrated && (workInProgress2.flags & 256) === 0 || (workInProgress2.flags |= 1024, upgradeHydrationErrorsToRecoverable());
          updateHostContainer(current, workInProgress2);
          bubbleProperties(workInProgress2);
          return null;
        case 26:
          if (supportsResources) {
            var { type, memoizedState: nextResource } = workInProgress2;
            current === null ? (markUpdate(workInProgress2), nextResource !== null ? (bubbleProperties(workInProgress2), preloadResourceAndSuspendIfNeeded(workInProgress2, nextResource)) : (bubbleProperties(workInProgress2), preloadInstanceAndSuspendIfNeeded(workInProgress2, type, null, newProps, renderLanes2))) : nextResource ? nextResource !== current.memoizedState ? (markUpdate(workInProgress2), bubbleProperties(workInProgress2), preloadResourceAndSuspendIfNeeded(workInProgress2, nextResource)) : (bubbleProperties(workInProgress2), workInProgress2.flags &= -16777217) : (nextResource = current.memoizedProps, supportsMutation ? nextResource !== newProps && markUpdate(workInProgress2) : updateHostComponent(current, workInProgress2, type, newProps), bubbleProperties(workInProgress2), preloadInstanceAndSuspendIfNeeded(workInProgress2, type, nextResource, newProps, renderLanes2));
            return null;
          }
        case 27:
          if (supportsSingletons) {
            popHostContext(workInProgress2);
            renderLanes2 = rootInstanceStackCursor.current;
            type = workInProgress2.type;
            if (current !== null && workInProgress2.stateNode != null)
              supportsMutation ? current.memoizedProps !== newProps && markUpdate(workInProgress2) : updateHostComponent(current, workInProgress2, type, newProps);
            else {
              if (!newProps) {
                if (workInProgress2.stateNode === null)
                  throw Error(formatProdErrorMessage(166));
                bubbleProperties(workInProgress2);
                return null;
              }
              current = contextStackCursor.current;
              popHydrationState(workInProgress2) ? prepareToHydrateHostInstance(workInProgress2, current) : (current = resolveSingletonInstance(type, newProps, renderLanes2, current, true), workInProgress2.stateNode = current, markUpdate(workInProgress2));
            }
            bubbleProperties(workInProgress2);
            return null;
          }
        case 5:
          popHostContext(workInProgress2);
          type = workInProgress2.type;
          if (current !== null && workInProgress2.stateNode != null)
            updateHostComponent(current, workInProgress2, type, newProps);
          else {
            if (!newProps) {
              if (workInProgress2.stateNode === null)
                throw Error(formatProdErrorMessage(166));
              bubbleProperties(workInProgress2);
              return null;
            }
            nextResource = contextStackCursor.current;
            if (popHydrationState(workInProgress2))
              prepareToHydrateHostInstance(workInProgress2, nextResource), finalizeHydratedChildren(workInProgress2.stateNode, type, newProps, nextResource) && (workInProgress2.flags |= 64);
            else {
              var instance$101 = createInstance(type, newProps, rootInstanceStackCursor.current, nextResource, workInProgress2);
              markCloned(workInProgress2);
              appendAllChildren(instance$101, workInProgress2, false, false);
              workInProgress2.stateNode = instance$101;
              finalizeInitialChildren(instance$101, type, newProps, nextResource) && markUpdate(workInProgress2);
            }
          }
          bubbleProperties(workInProgress2);
          preloadInstanceAndSuspendIfNeeded(workInProgress2, workInProgress2.type, current === null ? null : current.memoizedProps, workInProgress2.pendingProps, renderLanes2);
          return null;
        case 6:
          if (current && workInProgress2.stateNode != null)
            renderLanes2 = current.memoizedProps, supportsMutation ? renderLanes2 !== newProps && markUpdate(workInProgress2) : supportsPersistence && (renderLanes2 !== newProps ? (current = rootInstanceStackCursor.current, renderLanes2 = contextStackCursor.current, markCloned(workInProgress2), workInProgress2.stateNode = createTextInstance(newProps, current, renderLanes2, workInProgress2)) : workInProgress2.stateNode = current.stateNode);
          else {
            if (typeof newProps !== "string" && workInProgress2.stateNode === null)
              throw Error(formatProdErrorMessage(166));
            current = rootInstanceStackCursor.current;
            renderLanes2 = contextStackCursor.current;
            if (popHydrationState(workInProgress2)) {
              if (!supportsHydration)
                throw Error(formatProdErrorMessage(176));
              current = workInProgress2.stateNode;
              renderLanes2 = workInProgress2.memoizedProps;
              newProps = null;
              type = hydrationParentFiber;
              if (type !== null)
                switch (type.tag) {
                  case 27:
                  case 5:
                    newProps = type.memoizedProps;
                }
              hydrateTextInstance(current, renderLanes2, workInProgress2, newProps) || throwOnHydrationMismatch(workInProgress2, true);
            } else
              markCloned(workInProgress2), workInProgress2.stateNode = createTextInstance(newProps, current, renderLanes2, workInProgress2);
          }
          bubbleProperties(workInProgress2);
          return null;
        case 31:
          renderLanes2 = workInProgress2.memoizedState;
          if (current === null || current.memoizedState !== null) {
            newProps = popHydrationState(workInProgress2);
            if (renderLanes2 !== null) {
              if (current === null) {
                if (!newProps)
                  throw Error(formatProdErrorMessage(318));
                if (!supportsHydration)
                  throw Error(formatProdErrorMessage(556));
                current = workInProgress2.memoizedState;
                current = current !== null ? current.dehydrated : null;
                if (!current)
                  throw Error(formatProdErrorMessage(557));
                hydrateActivityInstance(current, workInProgress2);
              } else
                resetHydrationState(), (workInProgress2.flags & 128) === 0 && (workInProgress2.memoizedState = null), workInProgress2.flags |= 4;
              bubbleProperties(workInProgress2);
              current = false;
            } else
              renderLanes2 = upgradeHydrationErrorsToRecoverable(), current !== null && current.memoizedState !== null && (current.memoizedState.hydrationErrors = renderLanes2), current = true;
            if (!current) {
              if (workInProgress2.flags & 256)
                return popSuspenseHandler(workInProgress2), workInProgress2;
              popSuspenseHandler(workInProgress2);
              return null;
            }
            if ((workInProgress2.flags & 128) !== 0)
              throw Error(formatProdErrorMessage(558));
          }
          bubbleProperties(workInProgress2);
          return null;
        case 13:
          newProps = workInProgress2.memoizedState;
          if (current === null || current.memoizedState !== null && current.memoizedState.dehydrated !== null) {
            type = popHydrationState(workInProgress2);
            if (newProps !== null && newProps.dehydrated !== null) {
              if (current === null) {
                if (!type)
                  throw Error(formatProdErrorMessage(318));
                if (!supportsHydration)
                  throw Error(formatProdErrorMessage(344));
                type = workInProgress2.memoizedState;
                type = type !== null ? type.dehydrated : null;
                if (!type)
                  throw Error(formatProdErrorMessage(317));
                hydrateSuspenseInstance(type, workInProgress2);
              } else
                resetHydrationState(), (workInProgress2.flags & 128) === 0 && (workInProgress2.memoizedState = null), workInProgress2.flags |= 4;
              bubbleProperties(workInProgress2);
              type = false;
            } else
              type = upgradeHydrationErrorsToRecoverable(), current !== null && current.memoizedState !== null && (current.memoizedState.hydrationErrors = type), type = true;
            if (!type) {
              if (workInProgress2.flags & 256)
                return popSuspenseHandler(workInProgress2), workInProgress2;
              popSuspenseHandler(workInProgress2);
              return null;
            }
          }
          popSuspenseHandler(workInProgress2);
          if ((workInProgress2.flags & 128) !== 0)
            return workInProgress2.lanes = renderLanes2, workInProgress2;
          renderLanes2 = newProps !== null;
          current = current !== null && current.memoizedState !== null;
          renderLanes2 && (newProps = workInProgress2.child, type = null, newProps.alternate !== null && newProps.alternate.memoizedState !== null && newProps.alternate.memoizedState.cachePool !== null && (type = newProps.alternate.memoizedState.cachePool.pool), nextResource = null, newProps.memoizedState !== null && newProps.memoizedState.cachePool !== null && (nextResource = newProps.memoizedState.cachePool.pool), nextResource !== type && (newProps.flags |= 2048));
          renderLanes2 !== current && renderLanes2 && (workInProgress2.child.flags |= 8192);
          scheduleRetryEffect(workInProgress2, workInProgress2.updateQueue);
          bubbleProperties(workInProgress2);
          return null;
        case 4:
          return popHostContainer(), updateHostContainer(current, workInProgress2), current === null && preparePortalMount(workInProgress2.stateNode.containerInfo), bubbleProperties(workInProgress2), null;
        case 10:
          return popProvider(workInProgress2.type), bubbleProperties(workInProgress2), null;
        case 19:
          pop2(suspenseStackCursor);
          newProps = workInProgress2.memoizedState;
          if (newProps === null)
            return bubbleProperties(workInProgress2), null;
          type = (workInProgress2.flags & 128) !== 0;
          nextResource = newProps.rendering;
          if (nextResource === null)
            if (type)
              cutOffTailIfNeeded(newProps, false);
            else {
              if (workInProgressRootExitStatus !== 0 || current !== null && (current.flags & 128) !== 0)
                for (current = workInProgress2.child;current !== null; ) {
                  nextResource = findFirstSuspended(current);
                  if (nextResource !== null) {
                    workInProgress2.flags |= 128;
                    cutOffTailIfNeeded(newProps, false);
                    current = nextResource.updateQueue;
                    workInProgress2.updateQueue = current;
                    scheduleRetryEffect(workInProgress2, current);
                    workInProgress2.subtreeFlags = 0;
                    current = renderLanes2;
                    for (renderLanes2 = workInProgress2.child;renderLanes2 !== null; )
                      resetWorkInProgress(renderLanes2, current), renderLanes2 = renderLanes2.sibling;
                    push2(suspenseStackCursor, suspenseStackCursor.current & 1 | 2);
                    isHydrating && pushTreeFork(workInProgress2, newProps.treeForkCount);
                    return workInProgress2.child;
                  }
                  current = current.sibling;
                }
              newProps.tail !== null && now() > workInProgressRootRenderTargetTime && (workInProgress2.flags |= 128, type = true, cutOffTailIfNeeded(newProps, false), workInProgress2.lanes = 4194304);
            }
          else {
            if (!type)
              if (current = findFirstSuspended(nextResource), current !== null) {
                if (workInProgress2.flags |= 128, type = true, current = current.updateQueue, workInProgress2.updateQueue = current, scheduleRetryEffect(workInProgress2, current), cutOffTailIfNeeded(newProps, true), newProps.tail === null && newProps.tailMode === "hidden" && !nextResource.alternate && !isHydrating)
                  return bubbleProperties(workInProgress2), null;
              } else
                2 * now() - newProps.renderingStartTime > workInProgressRootRenderTargetTime && renderLanes2 !== 536870912 && (workInProgress2.flags |= 128, type = true, cutOffTailIfNeeded(newProps, false), workInProgress2.lanes = 4194304);
            newProps.isBackwards ? (nextResource.sibling = workInProgress2.child, workInProgress2.child = nextResource) : (current = newProps.last, current !== null ? current.sibling = nextResource : workInProgress2.child = nextResource, newProps.last = nextResource);
          }
          if (newProps.tail !== null)
            return current = newProps.tail, newProps.rendering = current, newProps.tail = current.sibling, newProps.renderingStartTime = now(), current.sibling = null, renderLanes2 = suspenseStackCursor.current, push2(suspenseStackCursor, type ? renderLanes2 & 1 | 2 : renderLanes2 & 1), isHydrating && pushTreeFork(workInProgress2, newProps.treeForkCount), current;
          bubbleProperties(workInProgress2);
          return null;
        case 22:
        case 23:
          return popSuspenseHandler(workInProgress2), popHiddenContext(), newProps = workInProgress2.memoizedState !== null, current !== null ? current.memoizedState !== null !== newProps && (workInProgress2.flags |= 8192) : newProps && (workInProgress2.flags |= 8192), newProps ? (renderLanes2 & 536870912) !== 0 && (workInProgress2.flags & 128) === 0 && (bubbleProperties(workInProgress2), workInProgress2.subtreeFlags & 6 && (workInProgress2.flags |= 8192)) : bubbleProperties(workInProgress2), renderLanes2 = workInProgress2.updateQueue, renderLanes2 !== null && scheduleRetryEffect(workInProgress2, renderLanes2.retryQueue), renderLanes2 = null, current !== null && current.memoizedState !== null && current.memoizedState.cachePool !== null && (renderLanes2 = current.memoizedState.cachePool.pool), newProps = null, workInProgress2.memoizedState !== null && workInProgress2.memoizedState.cachePool !== null && (newProps = workInProgress2.memoizedState.cachePool.pool), newProps !== renderLanes2 && (workInProgress2.flags |= 2048), current !== null && pop2(resumedCache), null;
        case 24:
          return renderLanes2 = null, current !== null && (renderLanes2 = current.memoizedState.cache), workInProgress2.memoizedState.cache !== renderLanes2 && (workInProgress2.flags |= 2048), popProvider(CacheContext), bubbleProperties(workInProgress2), null;
        case 25:
          return null;
        case 30:
          return null;
      }
      throw Error(formatProdErrorMessage(156, workInProgress2.tag));
    }
    function unwindWork(current, workInProgress2) {
      popTreeContext(workInProgress2);
      switch (workInProgress2.tag) {
        case 1:
          return current = workInProgress2.flags, current & 65536 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
        case 3:
          return popProvider(CacheContext), popHostContainer(), current = workInProgress2.flags, (current & 65536) !== 0 && (current & 128) === 0 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
        case 26:
        case 27:
        case 5:
          return popHostContext(workInProgress2), null;
        case 31:
          if (workInProgress2.memoizedState !== null) {
            popSuspenseHandler(workInProgress2);
            if (workInProgress2.alternate === null)
              throw Error(formatProdErrorMessage(340));
            resetHydrationState();
          }
          current = workInProgress2.flags;
          return current & 65536 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
        case 13:
          popSuspenseHandler(workInProgress2);
          current = workInProgress2.memoizedState;
          if (current !== null && current.dehydrated !== null) {
            if (workInProgress2.alternate === null)
              throw Error(formatProdErrorMessage(340));
            resetHydrationState();
          }
          current = workInProgress2.flags;
          return current & 65536 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
        case 19:
          return pop2(suspenseStackCursor), null;
        case 4:
          return popHostContainer(), null;
        case 10:
          return popProvider(workInProgress2.type), null;
        case 22:
        case 23:
          return popSuspenseHandler(workInProgress2), popHiddenContext(), current !== null && pop2(resumedCache), current = workInProgress2.flags, current & 65536 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
        case 24:
          return popProvider(CacheContext), null;
        case 25:
          return null;
        default:
          return null;
      }
    }
    function unwindInterruptedWork(current, interruptedWork) {
      popTreeContext(interruptedWork);
      switch (interruptedWork.tag) {
        case 3:
          popProvider(CacheContext);
          popHostContainer();
          break;
        case 26:
        case 27:
        case 5:
          popHostContext(interruptedWork);
          break;
        case 4:
          popHostContainer();
          break;
        case 31:
          interruptedWork.memoizedState !== null && popSuspenseHandler(interruptedWork);
          break;
        case 13:
          popSuspenseHandler(interruptedWork);
          break;
        case 19:
          pop2(suspenseStackCursor);
          break;
        case 10:
          popProvider(interruptedWork.type);
          break;
        case 22:
        case 23:
          popSuspenseHandler(interruptedWork);
          popHiddenContext();
          current !== null && pop2(resumedCache);
          break;
        case 24:
          popProvider(CacheContext);
      }
    }
    function commitHookEffectListMount(flags, finishedWork) {
      try {
        var updateQueue = finishedWork.updateQueue, lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;
        if (lastEffect !== null) {
          var firstEffect = lastEffect.next;
          updateQueue = firstEffect;
          do {
            if ((updateQueue.tag & flags) === flags) {
              lastEffect = undefined;
              var { create, inst } = updateQueue;
              lastEffect = create();
              inst.destroy = lastEffect;
            }
            updateQueue = updateQueue.next;
          } while (updateQueue !== firstEffect);
        }
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function commitHookEffectListUnmount(flags, finishedWork, nearestMountedAncestor$jscomp$0) {
      try {
        var updateQueue = finishedWork.updateQueue, lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;
        if (lastEffect !== null) {
          var firstEffect = lastEffect.next;
          updateQueue = firstEffect;
          do {
            if ((updateQueue.tag & flags) === flags) {
              var inst = updateQueue.inst, destroy = inst.destroy;
              if (destroy !== undefined) {
                inst.destroy = undefined;
                lastEffect = finishedWork;
                var nearestMountedAncestor = nearestMountedAncestor$jscomp$0, destroy_ = destroy;
                try {
                  destroy_();
                } catch (error) {
                  captureCommitPhaseError(lastEffect, nearestMountedAncestor, error);
                }
              }
            }
            updateQueue = updateQueue.next;
          } while (updateQueue !== firstEffect);
        }
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function commitClassCallbacks(finishedWork) {
      var updateQueue = finishedWork.updateQueue;
      if (updateQueue !== null) {
        var instance = finishedWork.stateNode;
        try {
          commitCallbacks(updateQueue, instance);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
    }
    function safelyCallComponentWillUnmount(current, nearestMountedAncestor, instance) {
      instance.props = resolveClassComponentProps(current.type, current.memoizedProps);
      instance.state = current.memoizedState;
      try {
        instance.componentWillUnmount();
      } catch (error) {
        captureCommitPhaseError(current, nearestMountedAncestor, error);
      }
    }
    function safelyAttachRef(current, nearestMountedAncestor) {
      try {
        var ref = current.ref;
        if (ref !== null) {
          switch (current.tag) {
            case 26:
            case 27:
            case 5:
              var instanceToUse = getPublicInstance(current.stateNode);
              break;
            case 30:
              instanceToUse = current.stateNode;
              break;
            default:
              instanceToUse = current.stateNode;
          }
          typeof ref === "function" ? current.refCleanup = ref(instanceToUse) : ref.current = instanceToUse;
        }
      } catch (error) {
        captureCommitPhaseError(current, nearestMountedAncestor, error);
      }
    }
    function safelyDetachRef(current, nearestMountedAncestor) {
      var { ref, refCleanup } = current;
      if (ref !== null)
        if (typeof refCleanup === "function")
          try {
            refCleanup();
          } catch (error) {
            captureCommitPhaseError(current, nearestMountedAncestor, error);
          } finally {
            current.refCleanup = null, current = current.alternate, current != null && (current.refCleanup = null);
          }
        else if (typeof ref === "function")
          try {
            ref(null);
          } catch (error$124) {
            captureCommitPhaseError(current, nearestMountedAncestor, error$124);
          }
        else
          ref.current = null;
    }
    function commitHostMount(finishedWork) {
      var { type, memoizedProps: props, stateNode: instance } = finishedWork;
      try {
        commitMount(instance, type, props, finishedWork);
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function commitHostUpdate(finishedWork, newProps, oldProps) {
      try {
        commitUpdate(finishedWork.stateNode, finishedWork.type, oldProps, newProps, finishedWork);
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function isHostParent(fiber) {
      return fiber.tag === 5 || fiber.tag === 3 || (supportsResources ? fiber.tag === 26 : false) || (supportsSingletons ? fiber.tag === 27 && isSingletonScope(fiber.type) : false) || fiber.tag === 4;
    }
    function getHostSibling(fiber) {
      a:
        for (;; ) {
          for (;fiber.sibling === null; ) {
            if (fiber.return === null || isHostParent(fiber.return))
              return null;
            fiber = fiber.return;
          }
          fiber.sibling.return = fiber.return;
          for (fiber = fiber.sibling;fiber.tag !== 5 && fiber.tag !== 6 && fiber.tag !== 18; ) {
            if (supportsSingletons && fiber.tag === 27 && isSingletonScope(fiber.type))
              continue a;
            if (fiber.flags & 2)
              continue a;
            if (fiber.child === null || fiber.tag === 4)
              continue a;
            else
              fiber.child.return = fiber, fiber = fiber.child;
          }
          if (!(fiber.flags & 2))
            return fiber.stateNode;
        }
    }
    function insertOrAppendPlacementNodeIntoContainer(node, before, parent) {
      var tag = node.tag;
      if (tag === 5 || tag === 6)
        node = node.stateNode, before ? insertInContainerBefore(parent, node, before) : appendChildToContainer(parent, node);
      else if (tag !== 4 && (supportsSingletons && tag === 27 && isSingletonScope(node.type) && (parent = node.stateNode, before = null), node = node.child, node !== null))
        for (insertOrAppendPlacementNodeIntoContainer(node, before, parent), node = node.sibling;node !== null; )
          insertOrAppendPlacementNodeIntoContainer(node, before, parent), node = node.sibling;
    }
    function insertOrAppendPlacementNode(node, before, parent) {
      var tag = node.tag;
      if (tag === 5 || tag === 6)
        node = node.stateNode, before ? insertBefore(parent, node, before) : appendChild(parent, node);
      else if (tag !== 4 && (supportsSingletons && tag === 27 && isSingletonScope(node.type) && (parent = node.stateNode), node = node.child, node !== null))
        for (insertOrAppendPlacementNode(node, before, parent), node = node.sibling;node !== null; )
          insertOrAppendPlacementNode(node, before, parent), node = node.sibling;
    }
    function commitHostPortalContainerChildren(portal, finishedWork, pendingChildren) {
      portal = portal.containerInfo;
      try {
        replaceContainerChildren(portal, pendingChildren);
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function commitHostSingletonAcquisition(finishedWork) {
      var { stateNode: singleton, memoizedProps: props } = finishedWork;
      try {
        acquireSingletonInstance(finishedWork.type, props, singleton, finishedWork);
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function commitBeforeMutationEffects(root, firstChild) {
      prepareForCommit(root.containerInfo);
      for (nextEffect = firstChild;nextEffect !== null; )
        if (root = nextEffect, firstChild = root.child, (root.subtreeFlags & 1028) !== 0 && firstChild !== null)
          firstChild.return = root, nextEffect = firstChild;
        else
          for (;nextEffect !== null; ) {
            root = nextEffect;
            var current = root.alternate;
            firstChild = root.flags;
            switch (root.tag) {
              case 0:
                if ((firstChild & 4) !== 0 && (firstChild = root.updateQueue, firstChild = firstChild !== null ? firstChild.events : null, firstChild !== null))
                  for (var ii = 0;ii < firstChild.length; ii++) {
                    var _eventPayloads$ii = firstChild[ii];
                    _eventPayloads$ii.ref.impl = _eventPayloads$ii.nextImpl;
                  }
                break;
              case 11:
              case 15:
                break;
              case 1:
                if ((firstChild & 1024) !== 0 && current !== null) {
                  firstChild = undefined;
                  ii = root;
                  _eventPayloads$ii = current.memoizedProps;
                  current = current.memoizedState;
                  var instance = ii.stateNode;
                  try {
                    var resolvedPrevProps = resolveClassComponentProps(ii.type, _eventPayloads$ii);
                    firstChild = instance.getSnapshotBeforeUpdate(resolvedPrevProps, current);
                    instance.__reactInternalSnapshotBeforeUpdate = firstChild;
                  } catch (error) {
                    captureCommitPhaseError(ii, ii.return, error);
                  }
                }
                break;
              case 3:
                (firstChild & 1024) !== 0 && supportsMutation && clearContainer(root.stateNode.containerInfo);
                break;
              case 5:
              case 26:
              case 27:
              case 6:
              case 4:
              case 17:
                break;
              default:
                if ((firstChild & 1024) !== 0)
                  throw Error(formatProdErrorMessage(163));
            }
            firstChild = root.sibling;
            if (firstChild !== null) {
              firstChild.return = root.return;
              nextEffect = firstChild;
              break;
            }
            nextEffect = root.return;
          }
    }
    function commitLayoutEffectOnFiber(finishedRoot, current, finishedWork) {
      var flags = finishedWork.flags;
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 15:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          flags & 4 && commitHookEffectListMount(5, finishedWork);
          break;
        case 1:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          if (flags & 4)
            if (finishedRoot = finishedWork.stateNode, current === null)
              try {
                finishedRoot.componentDidMount();
              } catch (error) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error);
              }
            else {
              var prevProps = resolveClassComponentProps(finishedWork.type, current.memoizedProps);
              current = current.memoizedState;
              try {
                finishedRoot.componentDidUpdate(prevProps, current, finishedRoot.__reactInternalSnapshotBeforeUpdate);
              } catch (error$123) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error$123);
              }
            }
          flags & 64 && commitClassCallbacks(finishedWork);
          flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
          break;
        case 3:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          if (flags & 64 && (flags = finishedWork.updateQueue, flags !== null)) {
            finishedRoot = null;
            if (finishedWork.child !== null)
              switch (finishedWork.child.tag) {
                case 27:
                case 5:
                  finishedRoot = getPublicInstance(finishedWork.child.stateNode);
                  break;
                case 1:
                  finishedRoot = finishedWork.child.stateNode;
              }
            try {
              commitCallbacks(flags, finishedRoot);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
          break;
        case 27:
          supportsSingletons && current === null && flags & 4 && commitHostSingletonAcquisition(finishedWork);
        case 26:
        case 5:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          if (current === null) {
            if (flags & 4)
              commitHostMount(finishedWork);
            else if (flags & 64) {
              finishedRoot = finishedWork.type;
              current = finishedWork.memoizedProps;
              prevProps = finishedWork.stateNode;
              try {
                commitHydratedInstance(prevProps, finishedRoot, current, finishedWork);
              } catch (error) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error);
              }
            }
          }
          flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
          break;
        case 12:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          break;
        case 31:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          flags & 4 && commitActivityHydrationCallbacks(finishedRoot, finishedWork);
          break;
        case 13:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          flags & 4 && commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
          flags & 64 && (flags = finishedWork.memoizedState, flags !== null && (flags = flags.dehydrated, flags !== null && (finishedWork = retryDehydratedSuspenseBoundary.bind(null, finishedWork), registerSuspenseInstanceRetry(flags, finishedWork))));
          break;
        case 22:
          flags = finishedWork.memoizedState !== null || offscreenSubtreeIsHidden;
          if (!flags) {
            current = current !== null && current.memoizedState !== null || offscreenSubtreeWasHidden;
            prevProps = offscreenSubtreeIsHidden;
            var prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
            offscreenSubtreeIsHidden = flags;
            (offscreenSubtreeWasHidden = current) && !prevOffscreenSubtreeWasHidden ? recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, (finishedWork.subtreeFlags & 8772) !== 0) : recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
            offscreenSubtreeIsHidden = prevProps;
            offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
          }
          break;
        case 30:
          break;
        default:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
      }
    }
    function detachFiberAfterEffects(fiber) {
      var alternate = fiber.alternate;
      alternate !== null && (fiber.alternate = null, detachFiberAfterEffects(alternate));
      fiber.child = null;
      fiber.deletions = null;
      fiber.sibling = null;
      fiber.tag === 5 && (alternate = fiber.stateNode, alternate !== null && detachDeletedInstance(alternate));
      fiber.stateNode = null;
      fiber.return = null;
      fiber.dependencies = null;
      fiber.memoizedProps = null;
      fiber.memoizedState = null;
      fiber.pendingProps = null;
      fiber.stateNode = null;
      fiber.updateQueue = null;
    }
    function recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, parent) {
      for (parent = parent.child;parent !== null; )
        commitDeletionEffectsOnFiber(finishedRoot, nearestMountedAncestor, parent), parent = parent.sibling;
    }
    function commitDeletionEffectsOnFiber(finishedRoot, nearestMountedAncestor, deletedFiber) {
      if (injectedHook && typeof injectedHook.onCommitFiberUnmount === "function")
        try {
          injectedHook.onCommitFiberUnmount(rendererID, deletedFiber);
        } catch (err) {}
      switch (deletedFiber.tag) {
        case 26:
          if (supportsResources) {
            offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
            recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
            deletedFiber.memoizedState ? releaseResource(deletedFiber.memoizedState) : deletedFiber.stateNode && unmountHoistable(deletedFiber.stateNode);
            break;
          }
        case 27:
          if (supportsSingletons) {
            offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
            var prevHostParent = hostParent, prevHostParentIsContainer = hostParentIsContainer;
            isSingletonScope(deletedFiber.type) && (hostParent = deletedFiber.stateNode, hostParentIsContainer = false);
            recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
            releaseSingletonInstance(deletedFiber.stateNode);
            hostParent = prevHostParent;
            hostParentIsContainer = prevHostParentIsContainer;
            break;
          }
        case 5:
          offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
        case 6:
          if (supportsMutation) {
            if (prevHostParent = hostParent, prevHostParentIsContainer = hostParentIsContainer, hostParent = null, recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber), hostParent = prevHostParent, hostParentIsContainer = prevHostParentIsContainer, hostParent !== null)
              if (hostParentIsContainer)
                try {
                  removeChildFromContainer(hostParent, deletedFiber.stateNode);
                } catch (error) {
                  captureCommitPhaseError(deletedFiber, nearestMountedAncestor, error);
                }
              else
                try {
                  removeChild(hostParent, deletedFiber.stateNode);
                } catch (error) {
                  captureCommitPhaseError(deletedFiber, nearestMountedAncestor, error);
                }
          } else
            recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
          break;
        case 18:
          supportsMutation && hostParent !== null && (hostParentIsContainer ? clearSuspenseBoundaryFromContainer(hostParent, deletedFiber.stateNode) : clearSuspenseBoundary(hostParent, deletedFiber.stateNode));
          break;
        case 4:
          supportsMutation ? (prevHostParent = hostParent, prevHostParentIsContainer = hostParentIsContainer, hostParent = deletedFiber.stateNode.containerInfo, hostParentIsContainer = true, recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber), hostParent = prevHostParent, hostParentIsContainer = prevHostParentIsContainer) : (supportsPersistence && commitHostPortalContainerChildren(deletedFiber.stateNode, deletedFiber, createContainerChildSet()), recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber));
          break;
        case 0:
        case 11:
        case 14:
        case 15:
          commitHookEffectListUnmount(2, deletedFiber, nearestMountedAncestor);
          offscreenSubtreeWasHidden || commitHookEffectListUnmount(4, deletedFiber, nearestMountedAncestor);
          recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
          break;
        case 1:
          offscreenSubtreeWasHidden || (safelyDetachRef(deletedFiber, nearestMountedAncestor), prevHostParent = deletedFiber.stateNode, typeof prevHostParent.componentWillUnmount === "function" && safelyCallComponentWillUnmount(deletedFiber, nearestMountedAncestor, prevHostParent));
          recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
          break;
        case 21:
          recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
          break;
        case 22:
          offscreenSubtreeWasHidden = (prevHostParent = offscreenSubtreeWasHidden) || deletedFiber.memoizedState !== null;
          recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
          offscreenSubtreeWasHidden = prevHostParent;
          break;
        default:
          recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
      }
    }
    function commitActivityHydrationCallbacks(finishedRoot, finishedWork) {
      if (supportsHydration && finishedWork.memoizedState === null && (finishedRoot = finishedWork.alternate, finishedRoot !== null && (finishedRoot = finishedRoot.memoizedState, finishedRoot !== null))) {
        finishedRoot = finishedRoot.dehydrated;
        try {
          commitHydratedActivityInstance(finishedRoot);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
    }
    function commitSuspenseHydrationCallbacks(finishedRoot, finishedWork) {
      if (supportsHydration && finishedWork.memoizedState === null && (finishedRoot = finishedWork.alternate, finishedRoot !== null && (finishedRoot = finishedRoot.memoizedState, finishedRoot !== null && (finishedRoot = finishedRoot.dehydrated, finishedRoot !== null))))
        try {
          commitHydratedSuspenseInstance(finishedRoot);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
    }
    function getRetryCache(finishedWork) {
      switch (finishedWork.tag) {
        case 31:
        case 13:
        case 19:
          var retryCache = finishedWork.stateNode;
          retryCache === null && (retryCache = finishedWork.stateNode = new PossiblyWeakSet);
          return retryCache;
        case 22:
          return finishedWork = finishedWork.stateNode, retryCache = finishedWork._retryCache, retryCache === null && (retryCache = finishedWork._retryCache = new PossiblyWeakSet), retryCache;
        default:
          throw Error(formatProdErrorMessage(435, finishedWork.tag));
      }
    }
    function attachSuspenseRetryListeners(finishedWork, wakeables) {
      var retryCache = getRetryCache(finishedWork);
      wakeables.forEach(function(wakeable) {
        if (!retryCache.has(wakeable)) {
          retryCache.add(wakeable);
          var retry = resolveRetryWakeable.bind(null, finishedWork, wakeable);
          wakeable.then(retry, retry);
        }
      });
    }
    function recursivelyTraverseMutationEffects(root$jscomp$0, parentFiber) {
      var deletions = parentFiber.deletions;
      if (deletions !== null)
        for (var i = 0;i < deletions.length; i++) {
          var childToDelete = deletions[i], root = root$jscomp$0, returnFiber = parentFiber;
          if (supportsMutation) {
            var parent = returnFiber;
            a:
              for (;parent !== null; ) {
                switch (parent.tag) {
                  case 27:
                    if (supportsSingletons) {
                      if (isSingletonScope(parent.type)) {
                        hostParent = parent.stateNode;
                        hostParentIsContainer = false;
                        break a;
                      }
                      break;
                    }
                  case 5:
                    hostParent = parent.stateNode;
                    hostParentIsContainer = false;
                    break a;
                  case 3:
                  case 4:
                    hostParent = parent.stateNode.containerInfo;
                    hostParentIsContainer = true;
                    break a;
                }
                parent = parent.return;
              }
            if (hostParent === null)
              throw Error(formatProdErrorMessage(160));
            commitDeletionEffectsOnFiber(root, returnFiber, childToDelete);
            hostParent = null;
            hostParentIsContainer = false;
          } else
            commitDeletionEffectsOnFiber(root, returnFiber, childToDelete);
          root = childToDelete.alternate;
          root !== null && (root.return = null);
          childToDelete.return = null;
        }
      if (parentFiber.subtreeFlags & 13886)
        for (parentFiber = parentFiber.child;parentFiber !== null; )
          commitMutationEffectsOnFiber(parentFiber, root$jscomp$0), parentFiber = parentFiber.sibling;
    }
    function commitMutationEffectsOnFiber(finishedWork, root) {
      var { alternate: current, flags } = finishedWork;
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          recursivelyTraverseMutationEffects(root, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 4 && (commitHookEffectListUnmount(3, finishedWork, finishedWork.return), commitHookEffectListMount(3, finishedWork), commitHookEffectListUnmount(5, finishedWork, finishedWork.return));
          break;
        case 1:
          recursivelyTraverseMutationEffects(root, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 512 && (offscreenSubtreeWasHidden || current === null || safelyDetachRef(current, current.return));
          flags & 64 && offscreenSubtreeIsHidden && (finishedWork = finishedWork.updateQueue, finishedWork !== null && (flags = finishedWork.callbacks, flags !== null && (current = finishedWork.shared.hiddenCallbacks, finishedWork.shared.hiddenCallbacks = current === null ? flags : current.concat(flags))));
          break;
        case 26:
          if (supportsResources) {
            var hoistableRoot = currentHoistableRoot;
            recursivelyTraverseMutationEffects(root, finishedWork);
            commitReconciliationEffects(finishedWork);
            flags & 512 && (offscreenSubtreeWasHidden || current === null || safelyDetachRef(current, current.return));
            if (flags & 4) {
              flags = current !== null ? current.memoizedState : null;
              var newResource = finishedWork.memoizedState;
              current === null ? newResource === null ? finishedWork.stateNode === null ? finishedWork.stateNode = hydrateHoistable(hoistableRoot, finishedWork.type, finishedWork.memoizedProps, finishedWork) : mountHoistable(hoistableRoot, finishedWork.type, finishedWork.stateNode) : finishedWork.stateNode = acquireResource(hoistableRoot, newResource, finishedWork.memoizedProps) : flags !== newResource ? (flags === null ? current.stateNode !== null && unmountHoistable(current.stateNode) : releaseResource(flags), newResource === null ? mountHoistable(hoistableRoot, finishedWork.type, finishedWork.stateNode) : acquireResource(hoistableRoot, newResource, finishedWork.memoizedProps)) : newResource === null && finishedWork.stateNode !== null && commitHostUpdate(finishedWork, finishedWork.memoizedProps, current.memoizedProps);
            }
            break;
          }
        case 27:
          if (supportsSingletons) {
            recursivelyTraverseMutationEffects(root, finishedWork);
            commitReconciliationEffects(finishedWork);
            flags & 512 && (offscreenSubtreeWasHidden || current === null || safelyDetachRef(current, current.return));
            current !== null && flags & 4 && commitHostUpdate(finishedWork, finishedWork.memoizedProps, current.memoizedProps);
            break;
          }
        case 5:
          recursivelyTraverseMutationEffects(root, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 512 && (offscreenSubtreeWasHidden || current === null || safelyDetachRef(current, current.return));
          if (supportsMutation) {
            if (finishedWork.flags & 32) {
              hoistableRoot = finishedWork.stateNode;
              try {
                resetTextContent(hoistableRoot);
              } catch (error) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error);
              }
            }
            flags & 4 && finishedWork.stateNode != null && (hoistableRoot = finishedWork.memoizedProps, commitHostUpdate(finishedWork, hoistableRoot, current !== null ? current.memoizedProps : hoistableRoot));
            flags & 1024 && (needsFormReset = true);
          } else
            supportsPersistence && finishedWork.alternate !== null && (finishedWork.alternate.stateNode = finishedWork.stateNode);
          break;
        case 6:
          recursivelyTraverseMutationEffects(root, finishedWork);
          commitReconciliationEffects(finishedWork);
          if (flags & 4 && supportsMutation) {
            if (finishedWork.stateNode === null)
              throw Error(formatProdErrorMessage(162));
            flags = finishedWork.memoizedProps;
            current = current !== null ? current.memoizedProps : flags;
            hoistableRoot = finishedWork.stateNode;
            try {
              commitTextUpdate(hoistableRoot, current, flags);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
          break;
        case 3:
          supportsResources ? (prepareToCommitHoistables(), hoistableRoot = currentHoistableRoot, currentHoistableRoot = getHoistableRoot(root.containerInfo), recursivelyTraverseMutationEffects(root, finishedWork), currentHoistableRoot = hoistableRoot) : recursivelyTraverseMutationEffects(root, finishedWork);
          commitReconciliationEffects(finishedWork);
          if (flags & 4) {
            if (supportsMutation && supportsHydration && current !== null && current.memoizedState.isDehydrated)
              try {
                commitHydratedContainer(root.containerInfo);
              } catch (error) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error);
              }
            if (supportsPersistence) {
              flags = root.containerInfo;
              current = root.pendingChildren;
              try {
                replaceContainerChildren(flags, current);
              } catch (error) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error);
              }
            }
          }
          needsFormReset && (needsFormReset = false, recursivelyResetForms(finishedWork));
          break;
        case 4:
          supportsResources ? (current = currentHoistableRoot, currentHoistableRoot = getHoistableRoot(finishedWork.stateNode.containerInfo), recursivelyTraverseMutationEffects(root, finishedWork), commitReconciliationEffects(finishedWork), currentHoistableRoot = current) : (recursivelyTraverseMutationEffects(root, finishedWork), commitReconciliationEffects(finishedWork));
          flags & 4 && supportsPersistence && commitHostPortalContainerChildren(finishedWork.stateNode, finishedWork, finishedWork.stateNode.pendingChildren);
          break;
        case 12:
          recursivelyTraverseMutationEffects(root, finishedWork);
          commitReconciliationEffects(finishedWork);
          break;
        case 31:
          recursivelyTraverseMutationEffects(root, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 4 && (flags = finishedWork.updateQueue, flags !== null && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
          break;
        case 13:
          recursivelyTraverseMutationEffects(root, finishedWork);
          commitReconciliationEffects(finishedWork);
          finishedWork.child.flags & 8192 && finishedWork.memoizedState !== null !== (current !== null && current.memoizedState !== null) && (globalMostRecentFallbackTime = now());
          flags & 4 && (flags = finishedWork.updateQueue, flags !== null && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
          break;
        case 22:
          hoistableRoot = finishedWork.memoizedState !== null;
          var wasHidden = current !== null && current.memoizedState !== null, prevOffscreenSubtreeIsHidden = offscreenSubtreeIsHidden, prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
          offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden || hoistableRoot;
          offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden || wasHidden;
          recursivelyTraverseMutationEffects(root, finishedWork);
          offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
          offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden;
          commitReconciliationEffects(finishedWork);
          if (flags & 8192 && (root = finishedWork.stateNode, root._visibility = hoistableRoot ? root._visibility & -2 : root._visibility | 1, hoistableRoot && (current === null || wasHidden || offscreenSubtreeIsHidden || offscreenSubtreeWasHidden || recursivelyTraverseDisappearLayoutEffects(finishedWork)), supportsMutation))
            a:
              if (current = null, supportsMutation)
                for (root = finishedWork;; ) {
                  if (root.tag === 5 || supportsResources && root.tag === 26) {
                    if (current === null) {
                      wasHidden = current = root;
                      try {
                        newResource = wasHidden.stateNode, hoistableRoot ? hideInstance(newResource) : unhideInstance(wasHidden.stateNode, wasHidden.memoizedProps);
                      } catch (error) {
                        captureCommitPhaseError(wasHidden, wasHidden.return, error);
                      }
                    }
                  } else if (root.tag === 6) {
                    if (current === null) {
                      wasHidden = root;
                      try {
                        var instance = wasHidden.stateNode;
                        hoistableRoot ? hideTextInstance(instance) : unhideTextInstance(instance, wasHidden.memoizedProps);
                      } catch (error) {
                        captureCommitPhaseError(wasHidden, wasHidden.return, error);
                      }
                    }
                  } else if (root.tag === 18) {
                    if (current === null) {
                      wasHidden = root;
                      try {
                        var instance$jscomp$0 = wasHidden.stateNode;
                        hoistableRoot ? hideDehydratedBoundary(instance$jscomp$0) : unhideDehydratedBoundary(wasHidden.stateNode);
                      } catch (error) {
                        captureCommitPhaseError(wasHidden, wasHidden.return, error);
                      }
                    }
                  } else if ((root.tag !== 22 && root.tag !== 23 || root.memoizedState === null || root === finishedWork) && root.child !== null) {
                    root.child.return = root;
                    root = root.child;
                    continue;
                  }
                  if (root === finishedWork)
                    break a;
                  for (;root.sibling === null; ) {
                    if (root.return === null || root.return === finishedWork)
                      break a;
                    current === root && (current = null);
                    root = root.return;
                  }
                  current === root && (current = null);
                  root.sibling.return = root.return;
                  root = root.sibling;
                }
          flags & 4 && (flags = finishedWork.updateQueue, flags !== null && (current = flags.retryQueue, current !== null && (flags.retryQueue = null, attachSuspenseRetryListeners(finishedWork, current))));
          break;
        case 19:
          recursivelyTraverseMutationEffects(root, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 4 && (flags = finishedWork.updateQueue, flags !== null && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
          break;
        case 30:
          break;
        case 21:
          break;
        default:
          recursivelyTraverseMutationEffects(root, finishedWork), commitReconciliationEffects(finishedWork);
      }
    }
    function commitReconciliationEffects(finishedWork) {
      var flags = finishedWork.flags;
      if (flags & 2) {
        try {
          for (var hostParentFiber, parentFiber = finishedWork.return;parentFiber !== null; ) {
            if (isHostParent(parentFiber)) {
              hostParentFiber = parentFiber;
              break;
            }
            parentFiber = parentFiber.return;
          }
          if (supportsMutation) {
            if (hostParentFiber == null)
              throw Error(formatProdErrorMessage(160));
            switch (hostParentFiber.tag) {
              case 27:
                if (supportsSingletons) {
                  var parent = hostParentFiber.stateNode, before = getHostSibling(finishedWork);
                  insertOrAppendPlacementNode(finishedWork, before, parent);
                  break;
                }
              case 5:
                var parent$125 = hostParentFiber.stateNode;
                hostParentFiber.flags & 32 && (resetTextContent(parent$125), hostParentFiber.flags &= -33);
                var before$126 = getHostSibling(finishedWork);
                insertOrAppendPlacementNode(finishedWork, before$126, parent$125);
                break;
              case 3:
              case 4:
                var parent$127 = hostParentFiber.stateNode.containerInfo, before$128 = getHostSibling(finishedWork);
                insertOrAppendPlacementNodeIntoContainer(finishedWork, before$128, parent$127);
                break;
              default:
                throw Error(formatProdErrorMessage(161));
            }
          }
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
        finishedWork.flags &= -3;
      }
      flags & 4096 && (finishedWork.flags &= -4097);
    }
    function recursivelyResetForms(parentFiber) {
      if (parentFiber.subtreeFlags & 1024)
        for (parentFiber = parentFiber.child;parentFiber !== null; ) {
          var fiber = parentFiber;
          recursivelyResetForms(fiber);
          fiber.tag === 5 && fiber.flags & 1024 && resetFormInstance(fiber.stateNode);
          parentFiber = parentFiber.sibling;
        }
    }
    function recursivelyTraverseLayoutEffects(root, parentFiber) {
      if (parentFiber.subtreeFlags & 8772)
        for (parentFiber = parentFiber.child;parentFiber !== null; )
          commitLayoutEffectOnFiber(root, parentFiber.alternate, parentFiber), parentFiber = parentFiber.sibling;
    }
    function recursivelyTraverseDisappearLayoutEffects(parentFiber) {
      for (parentFiber = parentFiber.child;parentFiber !== null; ) {
        var finishedWork = parentFiber;
        switch (finishedWork.tag) {
          case 0:
          case 11:
          case 14:
          case 15:
            commitHookEffectListUnmount(4, finishedWork, finishedWork.return);
            recursivelyTraverseDisappearLayoutEffects(finishedWork);
            break;
          case 1:
            safelyDetachRef(finishedWork, finishedWork.return);
            var instance = finishedWork.stateNode;
            typeof instance.componentWillUnmount === "function" && safelyCallComponentWillUnmount(finishedWork, finishedWork.return, instance);
            recursivelyTraverseDisappearLayoutEffects(finishedWork);
            break;
          case 27:
            supportsSingletons && releaseSingletonInstance(finishedWork.stateNode);
          case 26:
          case 5:
            safelyDetachRef(finishedWork, finishedWork.return);
            recursivelyTraverseDisappearLayoutEffects(finishedWork);
            break;
          case 22:
            finishedWork.memoizedState === null && recursivelyTraverseDisappearLayoutEffects(finishedWork);
            break;
          case 30:
            recursivelyTraverseDisappearLayoutEffects(finishedWork);
            break;
          default:
            recursivelyTraverseDisappearLayoutEffects(finishedWork);
        }
        parentFiber = parentFiber.sibling;
      }
    }
    function recursivelyTraverseReappearLayoutEffects(finishedRoot$jscomp$0, parentFiber, includeWorkInProgressEffects) {
      includeWorkInProgressEffects = includeWorkInProgressEffects && (parentFiber.subtreeFlags & 8772) !== 0;
      for (parentFiber = parentFiber.child;parentFiber !== null; ) {
        var current = parentFiber.alternate, finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, flags = finishedWork.flags;
        switch (finishedWork.tag) {
          case 0:
          case 11:
          case 15:
            recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
            commitHookEffectListMount(4, finishedWork);
            break;
          case 1:
            recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
            current = finishedWork;
            finishedRoot = current.stateNode;
            if (typeof finishedRoot.componentDidMount === "function")
              try {
                finishedRoot.componentDidMount();
              } catch (error) {
                captureCommitPhaseError(current, current.return, error);
              }
            current = finishedWork;
            finishedRoot = current.updateQueue;
            if (finishedRoot !== null) {
              var instance = current.stateNode;
              try {
                var hiddenCallbacks = finishedRoot.shared.hiddenCallbacks;
                if (hiddenCallbacks !== null)
                  for (finishedRoot.shared.hiddenCallbacks = null, finishedRoot = 0;finishedRoot < hiddenCallbacks.length; finishedRoot++)
                    callCallback(hiddenCallbacks[finishedRoot], instance);
              } catch (error) {
                captureCommitPhaseError(current, current.return, error);
              }
            }
            includeWorkInProgressEffects && flags & 64 && commitClassCallbacks(finishedWork);
            safelyAttachRef(finishedWork, finishedWork.return);
            break;
          case 27:
            supportsSingletons && commitHostSingletonAcquisition(finishedWork);
          case 26:
          case 5:
            recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
            includeWorkInProgressEffects && current === null && flags & 4 && commitHostMount(finishedWork);
            safelyAttachRef(finishedWork, finishedWork.return);
            break;
          case 12:
            recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
            break;
          case 31:
            recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
            includeWorkInProgressEffects && flags & 4 && commitActivityHydrationCallbacks(finishedRoot, finishedWork);
            break;
          case 13:
            recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
            includeWorkInProgressEffects && flags & 4 && commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
            break;
          case 22:
            finishedWork.memoizedState === null && recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
            safelyAttachRef(finishedWork, finishedWork.return);
            break;
          case 30:
            break;
          default:
            recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
        }
        parentFiber = parentFiber.sibling;
      }
    }
    function commitOffscreenPassiveMountEffects(current, finishedWork) {
      var previousCache = null;
      current !== null && current.memoizedState !== null && current.memoizedState.cachePool !== null && (previousCache = current.memoizedState.cachePool.pool);
      current = null;
      finishedWork.memoizedState !== null && finishedWork.memoizedState.cachePool !== null && (current = finishedWork.memoizedState.cachePool.pool);
      current !== previousCache && (current != null && current.refCount++, previousCache != null && releaseCache(previousCache));
    }
    function commitCachePassiveMountEffect(current, finishedWork) {
      current = null;
      finishedWork.alternate !== null && (current = finishedWork.alternate.memoizedState.cache);
      finishedWork = finishedWork.memoizedState.cache;
      finishedWork !== current && (finishedWork.refCount++, current != null && releaseCache(current));
    }
    function recursivelyTraversePassiveMountEffects(root, parentFiber, committedLanes, committedTransitions) {
      if (parentFiber.subtreeFlags & 10256)
        for (parentFiber = parentFiber.child;parentFiber !== null; )
          commitPassiveMountOnFiber(root, parentFiber, committedLanes, committedTransitions), parentFiber = parentFiber.sibling;
    }
    function commitPassiveMountOnFiber(finishedRoot, finishedWork, committedLanes, committedTransitions) {
      var flags = finishedWork.flags;
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 15:
          recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
          flags & 2048 && commitHookEffectListMount(9, finishedWork);
          break;
        case 1:
          recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
          break;
        case 3:
          recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
          flags & 2048 && (finishedRoot = null, finishedWork.alternate !== null && (finishedRoot = finishedWork.alternate.memoizedState.cache), finishedWork = finishedWork.memoizedState.cache, finishedWork !== finishedRoot && (finishedWork.refCount++, finishedRoot != null && releaseCache(finishedRoot)));
          break;
        case 12:
          if (flags & 2048) {
            recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
            finishedRoot = finishedWork.stateNode;
            try {
              var _finishedWork$memoize2 = finishedWork.memoizedProps, id = _finishedWork$memoize2.id, onPostCommit = _finishedWork$memoize2.onPostCommit;
              typeof onPostCommit === "function" && onPostCommit(id, finishedWork.alternate === null ? "mount" : "update", finishedRoot.passiveEffectDuration, -0);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          } else
            recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
          break;
        case 31:
          recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
          break;
        case 13:
          recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
          break;
        case 23:
          break;
        case 22:
          _finishedWork$memoize2 = finishedWork.stateNode;
          id = finishedWork.alternate;
          finishedWork.memoizedState !== null ? _finishedWork$memoize2._visibility & 2 ? recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions) : recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork) : _finishedWork$memoize2._visibility & 2 ? recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions) : (_finishedWork$memoize2._visibility |= 2, recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, (finishedWork.subtreeFlags & 10256) !== 0 || false));
          flags & 2048 && commitOffscreenPassiveMountEffects(id, finishedWork);
          break;
        case 24:
          recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
          flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
          break;
        default:
          recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
      }
    }
    function recursivelyTraverseReconnectPassiveEffects(finishedRoot$jscomp$0, parentFiber, committedLanes$jscomp$0, committedTransitions$jscomp$0, includeWorkInProgressEffects) {
      includeWorkInProgressEffects = includeWorkInProgressEffects && ((parentFiber.subtreeFlags & 10256) !== 0 || false);
      for (parentFiber = parentFiber.child;parentFiber !== null; ) {
        var finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, committedLanes = committedLanes$jscomp$0, committedTransitions = committedTransitions$jscomp$0, flags = finishedWork.flags;
        switch (finishedWork.tag) {
          case 0:
          case 11:
          case 15:
            recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects);
            commitHookEffectListMount(8, finishedWork);
            break;
          case 23:
            break;
          case 22:
            var instance = finishedWork.stateNode;
            finishedWork.memoizedState !== null ? instance._visibility & 2 ? recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects) : recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork) : (instance._visibility |= 2, recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects));
            includeWorkInProgressEffects && flags & 2048 && commitOffscreenPassiveMountEffects(finishedWork.alternate, finishedWork);
            break;
          case 24:
            recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects);
            includeWorkInProgressEffects && flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
            break;
          default:
            recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects);
        }
        parentFiber = parentFiber.sibling;
      }
    }
    function recursivelyTraverseAtomicPassiveEffects(finishedRoot$jscomp$0, parentFiber) {
      if (parentFiber.subtreeFlags & 10256)
        for (parentFiber = parentFiber.child;parentFiber !== null; ) {
          var finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, flags = finishedWork.flags;
          switch (finishedWork.tag) {
            case 22:
              recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
              flags & 2048 && commitOffscreenPassiveMountEffects(finishedWork.alternate, finishedWork);
              break;
            case 24:
              recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
              flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
              break;
            default:
              recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
          }
          parentFiber = parentFiber.sibling;
        }
    }
    function recursivelyAccumulateSuspenseyCommit(parentFiber, committedLanes, suspendedState) {
      if (parentFiber.subtreeFlags & suspenseyCommitFlag)
        for (parentFiber = parentFiber.child;parentFiber !== null; )
          accumulateSuspenseyCommitOnFiber(parentFiber, committedLanes, suspendedState), parentFiber = parentFiber.sibling;
    }
    function accumulateSuspenseyCommitOnFiber(fiber, committedLanes, suspendedState) {
      switch (fiber.tag) {
        case 26:
          recursivelyAccumulateSuspenseyCommit(fiber, committedLanes, suspendedState);
          if (fiber.flags & suspenseyCommitFlag)
            if (fiber.memoizedState !== null)
              suspendResource(suspendedState, currentHoistableRoot, fiber.memoizedState, fiber.memoizedProps);
            else {
              var { stateNode: instance, type } = fiber;
              fiber = fiber.memoizedProps;
              ((committedLanes & 335544128) === committedLanes || maySuspendCommitInSyncRender(type, fiber)) && suspendInstance(suspendedState, instance, type, fiber);
            }
          break;
        case 5:
          recursivelyAccumulateSuspenseyCommit(fiber, committedLanes, suspendedState);
          fiber.flags & suspenseyCommitFlag && (instance = fiber.stateNode, type = fiber.type, fiber = fiber.memoizedProps, ((committedLanes & 335544128) === committedLanes || maySuspendCommitInSyncRender(type, fiber)) && suspendInstance(suspendedState, instance, type, fiber));
          break;
        case 3:
        case 4:
          supportsResources ? (instance = currentHoistableRoot, currentHoistableRoot = getHoistableRoot(fiber.stateNode.containerInfo), recursivelyAccumulateSuspenseyCommit(fiber, committedLanes, suspendedState), currentHoistableRoot = instance) : recursivelyAccumulateSuspenseyCommit(fiber, committedLanes, suspendedState);
          break;
        case 22:
          fiber.memoizedState === null && (instance = fiber.alternate, instance !== null && instance.memoizedState !== null ? (instance = suspenseyCommitFlag, suspenseyCommitFlag = 16777216, recursivelyAccumulateSuspenseyCommit(fiber, committedLanes, suspendedState), suspenseyCommitFlag = instance) : recursivelyAccumulateSuspenseyCommit(fiber, committedLanes, suspendedState));
          break;
        default:
          recursivelyAccumulateSuspenseyCommit(fiber, committedLanes, suspendedState);
      }
    }
    function detachAlternateSiblings(parentFiber) {
      var previousFiber = parentFiber.alternate;
      if (previousFiber !== null && (parentFiber = previousFiber.child, parentFiber !== null)) {
        previousFiber.child = null;
        do
          previousFiber = parentFiber.sibling, parentFiber.sibling = null, parentFiber = previousFiber;
        while (parentFiber !== null);
      }
    }
    function recursivelyTraversePassiveUnmountEffects(parentFiber) {
      var deletions = parentFiber.deletions;
      if ((parentFiber.flags & 16) !== 0) {
        if (deletions !== null)
          for (var i = 0;i < deletions.length; i++) {
            var childToDelete = deletions[i];
            nextEffect = childToDelete;
            commitPassiveUnmountEffectsInsideOfDeletedTree_begin(childToDelete, parentFiber);
          }
        detachAlternateSiblings(parentFiber);
      }
      if (parentFiber.subtreeFlags & 10256)
        for (parentFiber = parentFiber.child;parentFiber !== null; )
          commitPassiveUnmountOnFiber(parentFiber), parentFiber = parentFiber.sibling;
    }
    function commitPassiveUnmountOnFiber(finishedWork) {
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 15:
          recursivelyTraversePassiveUnmountEffects(finishedWork);
          finishedWork.flags & 2048 && commitHookEffectListUnmount(9, finishedWork, finishedWork.return);
          break;
        case 3:
          recursivelyTraversePassiveUnmountEffects(finishedWork);
          break;
        case 12:
          recursivelyTraversePassiveUnmountEffects(finishedWork);
          break;
        case 22:
          var instance = finishedWork.stateNode;
          finishedWork.memoizedState !== null && instance._visibility & 2 && (finishedWork.return === null || finishedWork.return.tag !== 13) ? (instance._visibility &= -3, recursivelyTraverseDisconnectPassiveEffects(finishedWork)) : recursivelyTraversePassiveUnmountEffects(finishedWork);
          break;
        default:
          recursivelyTraversePassiveUnmountEffects(finishedWork);
      }
    }
    function recursivelyTraverseDisconnectPassiveEffects(parentFiber) {
      var deletions = parentFiber.deletions;
      if ((parentFiber.flags & 16) !== 0) {
        if (deletions !== null)
          for (var i = 0;i < deletions.length; i++) {
            var childToDelete = deletions[i];
            nextEffect = childToDelete;
            commitPassiveUnmountEffectsInsideOfDeletedTree_begin(childToDelete, parentFiber);
          }
        detachAlternateSiblings(parentFiber);
      }
      for (parentFiber = parentFiber.child;parentFiber !== null; ) {
        deletions = parentFiber;
        switch (deletions.tag) {
          case 0:
          case 11:
          case 15:
            commitHookEffectListUnmount(8, deletions, deletions.return);
            recursivelyTraverseDisconnectPassiveEffects(deletions);
            break;
          case 22:
            i = deletions.stateNode;
            i._visibility & 2 && (i._visibility &= -3, recursivelyTraverseDisconnectPassiveEffects(deletions));
            break;
          default:
            recursivelyTraverseDisconnectPassiveEffects(deletions);
        }
        parentFiber = parentFiber.sibling;
      }
    }
    function commitPassiveUnmountEffectsInsideOfDeletedTree_begin(deletedSubtreeRoot, nearestMountedAncestor) {
      for (;nextEffect !== null; ) {
        var fiber = nextEffect;
        switch (fiber.tag) {
          case 0:
          case 11:
          case 15:
            commitHookEffectListUnmount(8, fiber, nearestMountedAncestor);
            break;
          case 23:
          case 22:
            if (fiber.memoizedState !== null && fiber.memoizedState.cachePool !== null) {
              var cache = fiber.memoizedState.cachePool.pool;
              cache != null && cache.refCount++;
            }
            break;
          case 24:
            releaseCache(fiber.memoizedState.cache);
        }
        cache = fiber.child;
        if (cache !== null)
          cache.return = fiber, nextEffect = cache;
        else
          a:
            for (fiber = deletedSubtreeRoot;nextEffect !== null; ) {
              cache = nextEffect;
              var { sibling, return: returnFiber } = cache;
              detachFiberAfterEffects(cache);
              if (cache === fiber) {
                nextEffect = null;
                break a;
              }
              if (sibling !== null) {
                sibling.return = returnFiber;
                nextEffect = sibling;
                break a;
              }
              nextEffect = returnFiber;
            }
      }
    }
    function findFiberRootForHostRoot(hostRoot) {
      var maybeFiber = getInstanceFromNode(hostRoot);
      if (maybeFiber != null) {
        if (typeof maybeFiber.memoizedProps["data-testname"] !== "string")
          throw Error(formatProdErrorMessage(364));
        return maybeFiber;
      }
      hostRoot = findFiberRoot(hostRoot);
      if (hostRoot === null)
        throw Error(formatProdErrorMessage(362));
      return hostRoot.stateNode.current;
    }
    function matchSelector(fiber$jscomp$0, selector) {
      var tag = fiber$jscomp$0.tag;
      switch (selector.$$typeof) {
        case COMPONENT_TYPE:
          if (fiber$jscomp$0.type === selector.value)
            return true;
          break;
        case HAS_PSEUDO_CLASS_TYPE:
          a: {
            selector = selector.value;
            fiber$jscomp$0 = [fiber$jscomp$0, 0];
            for (tag = 0;tag < fiber$jscomp$0.length; ) {
              var fiber = fiber$jscomp$0[tag++], tag$jscomp$0 = fiber.tag, selectorIndex = fiber$jscomp$0[tag++], selector$jscomp$0 = selector[selectorIndex];
              if (tag$jscomp$0 !== 5 && tag$jscomp$0 !== 26 && tag$jscomp$0 !== 27 || !isHiddenSubtree(fiber)) {
                for (;selector$jscomp$0 != null && matchSelector(fiber, selector$jscomp$0); )
                  selectorIndex++, selector$jscomp$0 = selector[selectorIndex];
                if (selectorIndex === selector.length) {
                  selector = true;
                  break a;
                } else
                  for (fiber = fiber.child;fiber !== null; )
                    fiber$jscomp$0.push(fiber, selectorIndex), fiber = fiber.sibling;
              }
            }
            selector = false;
          }
          return selector;
        case ROLE_TYPE:
          if ((tag === 5 || tag === 26 || tag === 27) && matchAccessibilityRole(fiber$jscomp$0.stateNode, selector.value))
            return true;
          break;
        case TEXT_TYPE:
          if (tag === 5 || tag === 6 || tag === 26 || tag === 27) {
            if (fiber$jscomp$0 = getTextContent(fiber$jscomp$0), fiber$jscomp$0 !== null && 0 <= fiber$jscomp$0.indexOf(selector.value))
              return true;
          }
          break;
        case TEST_NAME_TYPE:
          if (tag === 5 || tag === 26 || tag === 27) {
            if (fiber$jscomp$0 = fiber$jscomp$0.memoizedProps["data-testname"], typeof fiber$jscomp$0 === "string" && fiber$jscomp$0.toLowerCase() === selector.value.toLowerCase())
              return true;
          }
          break;
        default:
          throw Error(formatProdErrorMessage(365));
      }
      return false;
    }
    function selectorToString(selector) {
      switch (selector.$$typeof) {
        case COMPONENT_TYPE:
          return "<" + (getComponentNameFromType(selector.value) || "Unknown") + ">";
        case HAS_PSEUDO_CLASS_TYPE:
          return ":has(" + (selectorToString(selector) || "") + ")";
        case ROLE_TYPE:
          return '[role="' + selector.value + '"]';
        case TEXT_TYPE:
          return '"' + selector.value + '"';
        case TEST_NAME_TYPE:
          return '[data-testname="' + selector.value + '"]';
        default:
          throw Error(formatProdErrorMessage(365));
      }
    }
    function findPaths(root, selectors) {
      var matchingFibers = [];
      root = [root, 0];
      for (var index = 0;index < root.length; ) {
        var fiber = root[index++], tag = fiber.tag, selectorIndex = root[index++], selector = selectors[selectorIndex];
        if (tag !== 5 && tag !== 26 && tag !== 27 || !isHiddenSubtree(fiber)) {
          for (;selector != null && matchSelector(fiber, selector); )
            selectorIndex++, selector = selectors[selectorIndex];
          if (selectorIndex === selectors.length)
            matchingFibers.push(fiber);
          else
            for (fiber = fiber.child;fiber !== null; )
              root.push(fiber, selectorIndex), fiber = fiber.sibling;
        }
      }
      return matchingFibers;
    }
    function findAllNodes(hostRoot, selectors) {
      if (!supportsTestSelectors)
        throw Error(formatProdErrorMessage(363));
      hostRoot = findFiberRootForHostRoot(hostRoot);
      hostRoot = findPaths(hostRoot, selectors);
      selectors = [];
      hostRoot = Array.from(hostRoot);
      for (var index = 0;index < hostRoot.length; ) {
        var node = hostRoot[index++], tag = node.tag;
        if (tag === 5 || tag === 26 || tag === 27)
          isHiddenSubtree(node) || selectors.push(node.stateNode);
        else
          for (node = node.child;node !== null; )
            hostRoot.push(node), node = node.sibling;
      }
      return selectors;
    }
    function requestUpdateLane() {
      return (executionContext & 2) !== 0 && workInProgressRootRenderLanes !== 0 ? workInProgressRootRenderLanes & -workInProgressRootRenderLanes : ReactSharedInternals2.T !== null ? requestTransitionLane() : resolveUpdatePriority();
    }
    function requestDeferredLane() {
      if (workInProgressDeferredLane === 0)
        if ((workInProgressRootRenderLanes & 536870912) === 0 || isHydrating) {
          var lane = nextTransitionDeferredLane;
          nextTransitionDeferredLane <<= 1;
          (nextTransitionDeferredLane & 3932160) === 0 && (nextTransitionDeferredLane = 262144);
          workInProgressDeferredLane = lane;
        } else
          workInProgressDeferredLane = 536870912;
      lane = suspenseHandlerStackCursor.current;
      lane !== null && (lane.flags |= 32);
      return workInProgressDeferredLane;
    }
    function scheduleUpdateOnFiber(root, fiber, lane) {
      if (root === workInProgressRoot && (workInProgressSuspendedReason === 2 || workInProgressSuspendedReason === 9) || root.cancelPendingCommit !== null)
        prepareFreshStack(root, 0), markRootSuspended(root, workInProgressRootRenderLanes, workInProgressDeferredLane, false);
      markRootUpdated$1(root, lane);
      if ((executionContext & 2) === 0 || root !== workInProgressRoot)
        root === workInProgressRoot && ((executionContext & 2) === 0 && (workInProgressRootInterleavedUpdatedLanes |= lane), workInProgressRootExitStatus === 4 && markRootSuspended(root, workInProgressRootRenderLanes, workInProgressDeferredLane, false)), ensureRootIsScheduled(root);
    }
    function performWorkOnRoot(root$jscomp$0, lanes, forceSync) {
      if ((executionContext & 6) !== 0)
        throw Error(formatProdErrorMessage(327));
      var shouldTimeSlice = !forceSync && (lanes & 127) === 0 && (lanes & root$jscomp$0.expiredLanes) === 0 || checkIfRootIsPrerendering(root$jscomp$0, lanes), exitStatus = shouldTimeSlice ? renderRootConcurrent(root$jscomp$0, lanes) : renderRootSync(root$jscomp$0, lanes, true), renderWasConcurrent = shouldTimeSlice;
      do {
        if (exitStatus === 0) {
          workInProgressRootIsPrerendering && !shouldTimeSlice && markRootSuspended(root$jscomp$0, lanes, 0, false);
          break;
        } else {
          forceSync = root$jscomp$0.current.alternate;
          if (renderWasConcurrent && !isRenderConsistentWithExternalStores(forceSync)) {
            exitStatus = renderRootSync(root$jscomp$0, lanes, false);
            renderWasConcurrent = false;
            continue;
          }
          if (exitStatus === 2) {
            renderWasConcurrent = lanes;
            if (root$jscomp$0.errorRecoveryDisabledLanes & renderWasConcurrent)
              var JSCompiler_inline_result = 0;
            else
              JSCompiler_inline_result = root$jscomp$0.pendingLanes & -536870913, JSCompiler_inline_result = JSCompiler_inline_result !== 0 ? JSCompiler_inline_result : JSCompiler_inline_result & 536870912 ? 536870912 : 0;
            if (JSCompiler_inline_result !== 0) {
              lanes = JSCompiler_inline_result;
              a: {
                var root = root$jscomp$0;
                exitStatus = workInProgressRootConcurrentErrors;
                var wasRootDehydrated = supportsHydration && root.current.memoizedState.isDehydrated;
                wasRootDehydrated && (prepareFreshStack(root, JSCompiler_inline_result).flags |= 256);
                JSCompiler_inline_result = renderRootSync(root, JSCompiler_inline_result, false);
                if (JSCompiler_inline_result !== 2) {
                  if (workInProgressRootDidAttachPingListener && !wasRootDehydrated) {
                    root.errorRecoveryDisabledLanes |= renderWasConcurrent;
                    workInProgressRootInterleavedUpdatedLanes |= renderWasConcurrent;
                    exitStatus = 4;
                    break a;
                  }
                  renderWasConcurrent = workInProgressRootRecoverableErrors;
                  workInProgressRootRecoverableErrors = exitStatus;
                  renderWasConcurrent !== null && (workInProgressRootRecoverableErrors === null ? workInProgressRootRecoverableErrors = renderWasConcurrent : workInProgressRootRecoverableErrors.push.apply(workInProgressRootRecoverableErrors, renderWasConcurrent));
                }
                exitStatus = JSCompiler_inline_result;
              }
              renderWasConcurrent = false;
              if (exitStatus !== 2)
                continue;
            }
          }
          if (exitStatus === 1) {
            prepareFreshStack(root$jscomp$0, 0);
            markRootSuspended(root$jscomp$0, lanes, 0, true);
            break;
          }
          a: {
            shouldTimeSlice = root$jscomp$0;
            renderWasConcurrent = exitStatus;
            switch (renderWasConcurrent) {
              case 0:
              case 1:
                throw Error(formatProdErrorMessage(345));
              case 4:
                if ((lanes & 4194048) !== lanes)
                  break;
              case 6:
                markRootSuspended(shouldTimeSlice, lanes, workInProgressDeferredLane, !workInProgressRootDidSkipSuspendedSiblings);
                break a;
              case 2:
                workInProgressRootRecoverableErrors = null;
                break;
              case 3:
              case 5:
                break;
              default:
                throw Error(formatProdErrorMessage(329));
            }
            if ((lanes & 62914560) === lanes && (exitStatus = globalMostRecentFallbackTime + 300 - now(), 10 < exitStatus)) {
              markRootSuspended(shouldTimeSlice, lanes, workInProgressDeferredLane, !workInProgressRootDidSkipSuspendedSiblings);
              if (getNextLanes(shouldTimeSlice, 0, true) !== 0)
                break a;
              pendingEffectsLanes = lanes;
              shouldTimeSlice.timeoutHandle = scheduleTimeout(commitRootWhenReady.bind(null, shouldTimeSlice, forceSync, workInProgressRootRecoverableErrors, workInProgressTransitions, workInProgressRootDidIncludeRecursiveRenderUpdate, lanes, workInProgressDeferredLane, workInProgressRootInterleavedUpdatedLanes, workInProgressSuspendedRetryLanes, workInProgressRootDidSkipSuspendedSiblings, renderWasConcurrent, "Throttled", -0, 0), exitStatus);
              break a;
            }
            commitRootWhenReady(shouldTimeSlice, forceSync, workInProgressRootRecoverableErrors, workInProgressTransitions, workInProgressRootDidIncludeRecursiveRenderUpdate, lanes, workInProgressDeferredLane, workInProgressRootInterleavedUpdatedLanes, workInProgressSuspendedRetryLanes, workInProgressRootDidSkipSuspendedSiblings, renderWasConcurrent, null, -0, 0);
          }
        }
        break;
      } while (1);
      ensureRootIsScheduled(root$jscomp$0);
    }
    function commitRootWhenReady(root, finishedWork, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, lanes, spawnedLane, updatedLanes, suspendedRetryLanes, didSkipSuspendedSiblings, exitStatus, suspendedCommitReason, completedRenderStartTime, completedRenderEndTime) {
      root.timeoutHandle = noTimeout;
      suspendedCommitReason = finishedWork.subtreeFlags;
      if (suspendedCommitReason & 8192 || (suspendedCommitReason & 16785408) === 16785408) {
        suspendedCommitReason = startSuspendingCommit();
        accumulateSuspenseyCommitOnFiber(finishedWork, lanes, suspendedCommitReason);
        var timeoutOffset = (lanes & 62914560) === lanes ? globalMostRecentFallbackTime - now() : (lanes & 4194048) === lanes ? globalMostRecentTransitionTime - now() : 0;
        timeoutOffset = waitForCommitToBeReady(suspendedCommitReason, timeoutOffset);
        if (timeoutOffset !== null) {
          pendingEffectsLanes = lanes;
          root.cancelPendingCommit = timeoutOffset(commitRoot.bind(null, root, finishedWork, lanes, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, spawnedLane, updatedLanes, suspendedRetryLanes, exitStatus, suspendedCommitReason, null, completedRenderStartTime, completedRenderEndTime));
          markRootSuspended(root, lanes, spawnedLane, !didSkipSuspendedSiblings);
          return;
        }
      }
      commitRoot(root, finishedWork, lanes, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, spawnedLane, updatedLanes, suspendedRetryLanes);
    }
    function isRenderConsistentWithExternalStores(finishedWork) {
      for (var node = finishedWork;; ) {
        var tag = node.tag;
        if ((tag === 0 || tag === 11 || tag === 15) && node.flags & 16384 && (tag = node.updateQueue, tag !== null && (tag = tag.stores, tag !== null)))
          for (var i = 0;i < tag.length; i++) {
            var check = tag[i], getSnapshot = check.getSnapshot;
            check = check.value;
            try {
              if (!objectIs(getSnapshot(), check))
                return false;
            } catch (error) {
              return false;
            }
          }
        tag = node.child;
        if (node.subtreeFlags & 16384 && tag !== null)
          tag.return = node, node = tag;
        else {
          if (node === finishedWork)
            break;
          for (;node.sibling === null; ) {
            if (node.return === null || node.return === finishedWork)
              return true;
            node = node.return;
          }
          node.sibling.return = node.return;
          node = node.sibling;
        }
      }
      return true;
    }
    function markRootSuspended(root, suspendedLanes, spawnedLane, didAttemptEntireTree) {
      suspendedLanes &= ~workInProgressRootPingedLanes;
      suspendedLanes &= ~workInProgressRootInterleavedUpdatedLanes;
      root.suspendedLanes |= suspendedLanes;
      root.pingedLanes &= ~suspendedLanes;
      didAttemptEntireTree && (root.warmLanes |= suspendedLanes);
      didAttemptEntireTree = root.expirationTimes;
      for (var lanes = suspendedLanes;0 < lanes; ) {
        var index$4 = 31 - clz32(lanes), lane = 1 << index$4;
        didAttemptEntireTree[index$4] = -1;
        lanes &= ~lane;
      }
      spawnedLane !== 0 && markSpawnedDeferredLane(root, spawnedLane, suspendedLanes);
    }
    function flushSyncWork() {
      return (executionContext & 6) === 0 ? (flushSyncWorkAcrossRoots_impl(0, false), false) : true;
    }
    function resetWorkInProgressStack() {
      if (workInProgress !== null) {
        if (workInProgressSuspendedReason === 0)
          var interruptedWork = workInProgress.return;
        else
          interruptedWork = workInProgress, lastContextDependency = currentlyRenderingFiber$1 = null, resetHooksOnUnwind(interruptedWork), thenableState$1 = null, thenableIndexCounter$1 = 0, interruptedWork = workInProgress;
        for (;interruptedWork !== null; )
          unwindInterruptedWork(interruptedWork.alternate, interruptedWork), interruptedWork = interruptedWork.return;
        workInProgress = null;
      }
    }
    function prepareFreshStack(root, lanes) {
      var timeoutHandle = root.timeoutHandle;
      timeoutHandle !== noTimeout && (root.timeoutHandle = noTimeout, cancelTimeout(timeoutHandle));
      timeoutHandle = root.cancelPendingCommit;
      timeoutHandle !== null && (root.cancelPendingCommit = null, timeoutHandle());
      pendingEffectsLanes = 0;
      resetWorkInProgressStack();
      workInProgressRoot = root;
      workInProgress = timeoutHandle = createWorkInProgress(root.current, null);
      workInProgressRootRenderLanes = lanes;
      workInProgressSuspendedReason = 0;
      workInProgressThrownValue = null;
      workInProgressRootDidSkipSuspendedSiblings = false;
      workInProgressRootIsPrerendering = checkIfRootIsPrerendering(root, lanes);
      workInProgressRootDidAttachPingListener = false;
      workInProgressSuspendedRetryLanes = workInProgressDeferredLane = workInProgressRootPingedLanes = workInProgressRootInterleavedUpdatedLanes = workInProgressRootSkippedLanes = workInProgressRootExitStatus = 0;
      workInProgressRootRecoverableErrors = workInProgressRootConcurrentErrors = null;
      workInProgressRootDidIncludeRecursiveRenderUpdate = false;
      (lanes & 8) !== 0 && (lanes |= lanes & 32);
      var allEntangledLanes = root.entangledLanes;
      if (allEntangledLanes !== 0)
        for (root = root.entanglements, allEntangledLanes &= lanes;0 < allEntangledLanes; ) {
          var index$2 = 31 - clz32(allEntangledLanes), lane = 1 << index$2;
          lanes |= root[index$2];
          allEntangledLanes &= ~lane;
        }
      entangledRenderLanes = lanes;
      finishQueueingConcurrentUpdates();
      return timeoutHandle;
    }
    function handleThrow(root, thrownValue) {
      currentlyRenderingFiber = null;
      ReactSharedInternals2.H = ContextOnlyDispatcher;
      thrownValue === SuspenseException || thrownValue === SuspenseActionException ? (thrownValue = getSuspendedThenable(), workInProgressSuspendedReason = 3) : thrownValue === SuspenseyCommitException ? (thrownValue = getSuspendedThenable(), workInProgressSuspendedReason = 4) : workInProgressSuspendedReason = thrownValue === SelectiveHydrationException ? 8 : thrownValue !== null && typeof thrownValue === "object" && typeof thrownValue.then === "function" ? 6 : 1;
      workInProgressThrownValue = thrownValue;
      workInProgress === null && (workInProgressRootExitStatus = 1, logUncaughtError(root, createCapturedValueAtFiber(thrownValue, root.current)));
    }
    function shouldRemainOnPreviousScreen() {
      var handler = suspenseHandlerStackCursor.current;
      return handler === null ? true : (workInProgressRootRenderLanes & 4194048) === workInProgressRootRenderLanes ? shellBoundary === null ? true : false : (workInProgressRootRenderLanes & 62914560) === workInProgressRootRenderLanes || (workInProgressRootRenderLanes & 536870912) !== 0 ? handler === shellBoundary : false;
    }
    function pushDispatcher() {
      var prevDispatcher = ReactSharedInternals2.H;
      ReactSharedInternals2.H = ContextOnlyDispatcher;
      return prevDispatcher === null ? ContextOnlyDispatcher : prevDispatcher;
    }
    function pushAsyncDispatcher() {
      var prevAsyncDispatcher = ReactSharedInternals2.A;
      ReactSharedInternals2.A = DefaultAsyncDispatcher;
      return prevAsyncDispatcher;
    }
    function renderDidSuspendDelayIfPossible() {
      workInProgressRootExitStatus = 4;
      workInProgressRootDidSkipSuspendedSiblings || (workInProgressRootRenderLanes & 4194048) !== workInProgressRootRenderLanes && suspenseHandlerStackCursor.current !== null || (workInProgressRootIsPrerendering = true);
      (workInProgressRootSkippedLanes & 134217727) === 0 && (workInProgressRootInterleavedUpdatedLanes & 134217727) === 0 || workInProgressRoot === null || markRootSuspended(workInProgressRoot, workInProgressRootRenderLanes, workInProgressDeferredLane, false);
    }
    function renderRootSync(root, lanes, shouldYieldForPrerendering) {
      var prevExecutionContext = executionContext;
      executionContext |= 2;
      var prevDispatcher = pushDispatcher(), prevAsyncDispatcher = pushAsyncDispatcher();
      if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes)
        workInProgressTransitions = null, prepareFreshStack(root, lanes);
      lanes = false;
      var exitStatus = workInProgressRootExitStatus;
      a:
        do
          try {
            if (workInProgressSuspendedReason !== 0 && workInProgress !== null) {
              var unitOfWork = workInProgress, thrownValue = workInProgressThrownValue;
              switch (workInProgressSuspendedReason) {
                case 8:
                  resetWorkInProgressStack();
                  exitStatus = 6;
                  break a;
                case 3:
                case 2:
                case 9:
                case 6:
                  suspenseHandlerStackCursor.current === null && (lanes = true);
                  var reason = workInProgressSuspendedReason;
                  workInProgressSuspendedReason = 0;
                  workInProgressThrownValue = null;
                  throwAndUnwindWorkLoop(root, unitOfWork, thrownValue, reason);
                  if (shouldYieldForPrerendering && workInProgressRootIsPrerendering) {
                    exitStatus = 0;
                    break a;
                  }
                  break;
                default:
                  reason = workInProgressSuspendedReason, workInProgressSuspendedReason = 0, workInProgressThrownValue = null, throwAndUnwindWorkLoop(root, unitOfWork, thrownValue, reason);
              }
            }
            workLoopSync();
            exitStatus = workInProgressRootExitStatus;
            break;
          } catch (thrownValue$152) {
            handleThrow(root, thrownValue$152);
          }
        while (1);
      lanes && root.shellSuspendCounter++;
      lastContextDependency = currentlyRenderingFiber$1 = null;
      executionContext = prevExecutionContext;
      ReactSharedInternals2.H = prevDispatcher;
      ReactSharedInternals2.A = prevAsyncDispatcher;
      workInProgress === null && (workInProgressRoot = null, workInProgressRootRenderLanes = 0, finishQueueingConcurrentUpdates());
      return exitStatus;
    }
    function workLoopSync() {
      for (;workInProgress !== null; )
        performUnitOfWork(workInProgress);
    }
    function renderRootConcurrent(root, lanes) {
      var prevExecutionContext = executionContext;
      executionContext |= 2;
      var prevDispatcher = pushDispatcher(), prevAsyncDispatcher = pushAsyncDispatcher();
      workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes ? (workInProgressTransitions = null, workInProgressRootRenderTargetTime = now() + 500, prepareFreshStack(root, lanes)) : workInProgressRootIsPrerendering = checkIfRootIsPrerendering(root, lanes);
      a:
        do
          try {
            if (workInProgressSuspendedReason !== 0 && workInProgress !== null) {
              lanes = workInProgress;
              var thrownValue = workInProgressThrownValue;
              b:
                switch (workInProgressSuspendedReason) {
                  case 1:
                    workInProgressSuspendedReason = 0;
                    workInProgressThrownValue = null;
                    throwAndUnwindWorkLoop(root, lanes, thrownValue, 1);
                    break;
                  case 2:
                  case 9:
                    if (isThenableResolved(thrownValue)) {
                      workInProgressSuspendedReason = 0;
                      workInProgressThrownValue = null;
                      replaySuspendedUnitOfWork(lanes);
                      break;
                    }
                    lanes = function() {
                      workInProgressSuspendedReason !== 2 && workInProgressSuspendedReason !== 9 || workInProgressRoot !== root || (workInProgressSuspendedReason = 7);
                      ensureRootIsScheduled(root);
                    };
                    thrownValue.then(lanes, lanes);
                    break a;
                  case 3:
                    workInProgressSuspendedReason = 7;
                    break a;
                  case 4:
                    workInProgressSuspendedReason = 5;
                    break a;
                  case 7:
                    isThenableResolved(thrownValue) ? (workInProgressSuspendedReason = 0, workInProgressThrownValue = null, replaySuspendedUnitOfWork(lanes)) : (workInProgressSuspendedReason = 0, workInProgressThrownValue = null, throwAndUnwindWorkLoop(root, lanes, thrownValue, 7));
                    break;
                  case 5:
                    var resource = null;
                    switch (workInProgress.tag) {
                      case 26:
                        resource = workInProgress.memoizedState;
                      case 5:
                      case 27:
                        var hostFiber = workInProgress, type = hostFiber.type, props = hostFiber.pendingProps;
                        if (resource ? preloadResource(resource) : preloadInstance(hostFiber.stateNode, type, props)) {
                          workInProgressSuspendedReason = 0;
                          workInProgressThrownValue = null;
                          var sibling = hostFiber.sibling;
                          if (sibling !== null)
                            workInProgress = sibling;
                          else {
                            var returnFiber = hostFiber.return;
                            returnFiber !== null ? (workInProgress = returnFiber, completeUnitOfWork(returnFiber)) : workInProgress = null;
                          }
                          break b;
                        }
                    }
                    workInProgressSuspendedReason = 0;
                    workInProgressThrownValue = null;
                    throwAndUnwindWorkLoop(root, lanes, thrownValue, 5);
                    break;
                  case 6:
                    workInProgressSuspendedReason = 0;
                    workInProgressThrownValue = null;
                    throwAndUnwindWorkLoop(root, lanes, thrownValue, 6);
                    break;
                  case 8:
                    resetWorkInProgressStack();
                    workInProgressRootExitStatus = 6;
                    break a;
                  default:
                    throw Error(formatProdErrorMessage(462));
                }
            }
            workLoopConcurrentByScheduler();
            break;
          } catch (thrownValue$154) {
            handleThrow(root, thrownValue$154);
          }
        while (1);
      lastContextDependency = currentlyRenderingFiber$1 = null;
      ReactSharedInternals2.H = prevDispatcher;
      ReactSharedInternals2.A = prevAsyncDispatcher;
      executionContext = prevExecutionContext;
      if (workInProgress !== null)
        return 0;
      workInProgressRoot = null;
      workInProgressRootRenderLanes = 0;
      finishQueueingConcurrentUpdates();
      return workInProgressRootExitStatus;
    }
    function workLoopConcurrentByScheduler() {
      for (;workInProgress !== null && !shouldYield(); )
        performUnitOfWork(workInProgress);
    }
    function performUnitOfWork(unitOfWork) {
      var next = beginWork(unitOfWork.alternate, unitOfWork, entangledRenderLanes);
      unitOfWork.memoizedProps = unitOfWork.pendingProps;
      next === null ? completeUnitOfWork(unitOfWork) : workInProgress = next;
    }
    function replaySuspendedUnitOfWork(unitOfWork) {
      var next = unitOfWork;
      var current = next.alternate;
      switch (next.tag) {
        case 15:
        case 0:
          next = replayFunctionComponent(current, next, next.pendingProps, next.type, undefined, workInProgressRootRenderLanes);
          break;
        case 11:
          next = replayFunctionComponent(current, next, next.pendingProps, next.type.render, next.ref, workInProgressRootRenderLanes);
          break;
        case 5:
          resetHooksOnUnwind(next);
        default:
          unwindInterruptedWork(current, next), next = workInProgress = resetWorkInProgress(next, entangledRenderLanes), next = beginWork(current, next, entangledRenderLanes);
      }
      unitOfWork.memoizedProps = unitOfWork.pendingProps;
      next === null ? completeUnitOfWork(unitOfWork) : workInProgress = next;
    }
    function throwAndUnwindWorkLoop(root, unitOfWork, thrownValue, suspendedReason) {
      lastContextDependency = currentlyRenderingFiber$1 = null;
      resetHooksOnUnwind(unitOfWork);
      thenableState$1 = null;
      thenableIndexCounter$1 = 0;
      var returnFiber = unitOfWork.return;
      try {
        if (throwException(root, returnFiber, unitOfWork, thrownValue, workInProgressRootRenderLanes)) {
          workInProgressRootExitStatus = 1;
          logUncaughtError(root, createCapturedValueAtFiber(thrownValue, root.current));
          workInProgress = null;
          return;
        }
      } catch (error) {
        if (returnFiber !== null)
          throw workInProgress = returnFiber, error;
        workInProgressRootExitStatus = 1;
        logUncaughtError(root, createCapturedValueAtFiber(thrownValue, root.current));
        workInProgress = null;
        return;
      }
      if (unitOfWork.flags & 32768) {
        if (isHydrating || suspendedReason === 1)
          root = true;
        else if (workInProgressRootIsPrerendering || (workInProgressRootRenderLanes & 536870912) !== 0)
          root = false;
        else if (workInProgressRootDidSkipSuspendedSiblings = root = true, suspendedReason === 2 || suspendedReason === 9 || suspendedReason === 3 || suspendedReason === 6)
          suspendedReason = suspenseHandlerStackCursor.current, suspendedReason !== null && suspendedReason.tag === 13 && (suspendedReason.flags |= 16384);
        unwindUnitOfWork(unitOfWork, root);
      } else
        completeUnitOfWork(unitOfWork);
    }
    function completeUnitOfWork(unitOfWork) {
      var completedWork = unitOfWork;
      do {
        if ((completedWork.flags & 32768) !== 0) {
          unwindUnitOfWork(completedWork, workInProgressRootDidSkipSuspendedSiblings);
          return;
        }
        unitOfWork = completedWork.return;
        var next = completeWork(completedWork.alternate, completedWork, entangledRenderLanes);
        if (next !== null) {
          workInProgress = next;
          return;
        }
        completedWork = completedWork.sibling;
        if (completedWork !== null) {
          workInProgress = completedWork;
          return;
        }
        workInProgress = completedWork = unitOfWork;
      } while (completedWork !== null);
      workInProgressRootExitStatus === 0 && (workInProgressRootExitStatus = 5);
    }
    function unwindUnitOfWork(unitOfWork, skipSiblings) {
      do {
        var next = unwindWork(unitOfWork.alternate, unitOfWork);
        if (next !== null) {
          next.flags &= 32767;
          workInProgress = next;
          return;
        }
        next = unitOfWork.return;
        next !== null && (next.flags |= 32768, next.subtreeFlags = 0, next.deletions = null);
        if (!skipSiblings && (unitOfWork = unitOfWork.sibling, unitOfWork !== null)) {
          workInProgress = unitOfWork;
          return;
        }
        workInProgress = unitOfWork = next;
      } while (unitOfWork !== null);
      workInProgressRootExitStatus = 6;
      workInProgress = null;
    }
    function commitRoot(root, finishedWork, lanes, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, spawnedLane, updatedLanes, suspendedRetryLanes) {
      root.cancelPendingCommit = null;
      do
        flushPendingEffects();
      while (pendingEffectsStatus !== 0);
      if ((executionContext & 6) !== 0)
        throw Error(formatProdErrorMessage(327));
      if (finishedWork !== null) {
        if (finishedWork === root.current)
          throw Error(formatProdErrorMessage(177));
        didIncludeRenderPhaseUpdate = finishedWork.lanes | finishedWork.childLanes;
        didIncludeRenderPhaseUpdate |= concurrentlyUpdatedLanes;
        markRootFinished(root, lanes, didIncludeRenderPhaseUpdate, spawnedLane, updatedLanes, suspendedRetryLanes);
        root === workInProgressRoot && (workInProgress = workInProgressRoot = null, workInProgressRootRenderLanes = 0);
        pendingFinishedWork = finishedWork;
        pendingEffectsRoot = root;
        pendingEffectsLanes = lanes;
        pendingEffectsRemainingLanes = didIncludeRenderPhaseUpdate;
        pendingPassiveTransitions = transitions;
        pendingRecoverableErrors = recoverableErrors;
        (finishedWork.subtreeFlags & 10256) !== 0 || (finishedWork.flags & 10256) !== 0 ? (root.callbackNode = null, root.callbackPriority = 0, scheduleCallback(NormalPriority$1, function() {
          flushPassiveEffects();
          return null;
        })) : (root.callbackNode = null, root.callbackPriority = 0);
        recoverableErrors = (finishedWork.flags & 13878) !== 0;
        if ((finishedWork.subtreeFlags & 13878) !== 0 || recoverableErrors) {
          recoverableErrors = ReactSharedInternals2.T;
          ReactSharedInternals2.T = null;
          transitions = getCurrentUpdatePriority();
          setCurrentUpdatePriority(2);
          spawnedLane = executionContext;
          executionContext |= 4;
          try {
            commitBeforeMutationEffects(root, finishedWork, lanes);
          } finally {
            executionContext = spawnedLane, setCurrentUpdatePriority(transitions), ReactSharedInternals2.T = recoverableErrors;
          }
        }
        pendingEffectsStatus = 1;
        flushMutationEffects();
        flushLayoutEffects();
        flushSpawnedWork();
      }
    }
    function flushMutationEffects() {
      if (pendingEffectsStatus === 1) {
        pendingEffectsStatus = 0;
        var root = pendingEffectsRoot, finishedWork = pendingFinishedWork, rootMutationHasEffect = (finishedWork.flags & 13878) !== 0;
        if ((finishedWork.subtreeFlags & 13878) !== 0 || rootMutationHasEffect) {
          rootMutationHasEffect = ReactSharedInternals2.T;
          ReactSharedInternals2.T = null;
          var previousPriority = getCurrentUpdatePriority();
          setCurrentUpdatePriority(2);
          var prevExecutionContext = executionContext;
          executionContext |= 4;
          try {
            commitMutationEffectsOnFiber(finishedWork, root), resetAfterCommit(root.containerInfo);
          } finally {
            executionContext = prevExecutionContext, setCurrentUpdatePriority(previousPriority), ReactSharedInternals2.T = rootMutationHasEffect;
          }
        }
        root.current = finishedWork;
        pendingEffectsStatus = 2;
      }
    }
    function flushLayoutEffects() {
      if (pendingEffectsStatus === 2) {
        pendingEffectsStatus = 0;
        var root = pendingEffectsRoot, finishedWork = pendingFinishedWork, rootHasLayoutEffect = (finishedWork.flags & 8772) !== 0;
        if ((finishedWork.subtreeFlags & 8772) !== 0 || rootHasLayoutEffect) {
          rootHasLayoutEffect = ReactSharedInternals2.T;
          ReactSharedInternals2.T = null;
          var previousPriority = getCurrentUpdatePriority();
          setCurrentUpdatePriority(2);
          var prevExecutionContext = executionContext;
          executionContext |= 4;
          try {
            commitLayoutEffectOnFiber(root, finishedWork.alternate, finishedWork);
          } finally {
            executionContext = prevExecutionContext, setCurrentUpdatePriority(previousPriority), ReactSharedInternals2.T = rootHasLayoutEffect;
          }
        }
        pendingEffectsStatus = 3;
      }
    }
    function flushSpawnedWork() {
      if (pendingEffectsStatus === 4 || pendingEffectsStatus === 3) {
        pendingEffectsStatus = 0;
        requestPaint();
        var root = pendingEffectsRoot, finishedWork = pendingFinishedWork, lanes = pendingEffectsLanes, recoverableErrors = pendingRecoverableErrors;
        (finishedWork.subtreeFlags & 10256) !== 0 || (finishedWork.flags & 10256) !== 0 ? pendingEffectsStatus = 5 : (pendingEffectsStatus = 0, pendingFinishedWork = pendingEffectsRoot = null, releaseRootPooledCache(root, root.pendingLanes));
        var remainingLanes = root.pendingLanes;
        remainingLanes === 0 && (legacyErrorBoundariesThatAlreadyFailed = null);
        lanesToEventPriority(lanes);
        finishedWork = finishedWork.stateNode;
        if (injectedHook && typeof injectedHook.onCommitFiberRoot === "function")
          try {
            injectedHook.onCommitFiberRoot(rendererID, finishedWork, undefined, (finishedWork.current.flags & 128) === 128);
          } catch (err) {}
        if (recoverableErrors !== null) {
          finishedWork = ReactSharedInternals2.T;
          remainingLanes = getCurrentUpdatePriority();
          setCurrentUpdatePriority(2);
          ReactSharedInternals2.T = null;
          try {
            for (var onRecoverableError = root.onRecoverableError, i = 0;i < recoverableErrors.length; i++) {
              var recoverableError = recoverableErrors[i];
              onRecoverableError(recoverableError.value, {
                componentStack: recoverableError.stack
              });
            }
          } finally {
            ReactSharedInternals2.T = finishedWork, setCurrentUpdatePriority(remainingLanes);
          }
        }
        (pendingEffectsLanes & 3) !== 0 && flushPendingEffects();
        ensureRootIsScheduled(root);
        remainingLanes = root.pendingLanes;
        (lanes & 261930) !== 0 && (remainingLanes & 42) !== 0 ? root === rootWithNestedUpdates ? nestedUpdateCount++ : (nestedUpdateCount = 0, rootWithNestedUpdates = root) : nestedUpdateCount = 0;
        supportsHydration && flushHydrationEvents();
        flushSyncWorkAcrossRoots_impl(0, false);
      }
    }
    function releaseRootPooledCache(root, remainingLanes) {
      (root.pooledCacheLanes &= remainingLanes) === 0 && (remainingLanes = root.pooledCache, remainingLanes != null && (root.pooledCache = null, releaseCache(remainingLanes)));
    }
    function flushPendingEffects() {
      flushMutationEffects();
      flushLayoutEffects();
      flushSpawnedWork();
      return flushPassiveEffects();
    }
    function flushPassiveEffects() {
      if (pendingEffectsStatus !== 5)
        return false;
      var root = pendingEffectsRoot, remainingLanes = pendingEffectsRemainingLanes;
      pendingEffectsRemainingLanes = 0;
      var renderPriority = lanesToEventPriority(pendingEffectsLanes), priority = 32 > renderPriority ? 32 : renderPriority;
      renderPriority = ReactSharedInternals2.T;
      var previousPriority = getCurrentUpdatePriority();
      try {
        setCurrentUpdatePriority(priority);
        ReactSharedInternals2.T = null;
        priority = pendingPassiveTransitions;
        pendingPassiveTransitions = null;
        var root$jscomp$0 = pendingEffectsRoot, lanes = pendingEffectsLanes;
        pendingEffectsStatus = 0;
        pendingFinishedWork = pendingEffectsRoot = null;
        pendingEffectsLanes = 0;
        if ((executionContext & 6) !== 0)
          throw Error(formatProdErrorMessage(331));
        var prevExecutionContext = executionContext;
        executionContext |= 4;
        commitPassiveUnmountOnFiber(root$jscomp$0.current);
        commitPassiveMountOnFiber(root$jscomp$0, root$jscomp$0.current, lanes, priority);
        executionContext = prevExecutionContext;
        flushSyncWorkAcrossRoots_impl(0, false);
        if (injectedHook && typeof injectedHook.onPostCommitFiberRoot === "function")
          try {
            injectedHook.onPostCommitFiberRoot(rendererID, root$jscomp$0);
          } catch (err) {}
        return true;
      } finally {
        setCurrentUpdatePriority(previousPriority), ReactSharedInternals2.T = renderPriority, releaseRootPooledCache(root, remainingLanes);
      }
    }
    function captureCommitPhaseErrorOnRoot(rootFiber, sourceFiber, error) {
      sourceFiber = createCapturedValueAtFiber(error, sourceFiber);
      sourceFiber = createRootErrorUpdate(rootFiber.stateNode, sourceFiber, 2);
      rootFiber = enqueueUpdate(rootFiber, sourceFiber, 2);
      rootFiber !== null && (markRootUpdated$1(rootFiber, 2), ensureRootIsScheduled(rootFiber));
    }
    function captureCommitPhaseError(sourceFiber, nearestMountedAncestor, error) {
      if (sourceFiber.tag === 3)
        captureCommitPhaseErrorOnRoot(sourceFiber, sourceFiber, error);
      else
        for (;nearestMountedAncestor !== null; ) {
          if (nearestMountedAncestor.tag === 3) {
            captureCommitPhaseErrorOnRoot(nearestMountedAncestor, sourceFiber, error);
            break;
          } else if (nearestMountedAncestor.tag === 1) {
            var instance = nearestMountedAncestor.stateNode;
            if (typeof nearestMountedAncestor.type.getDerivedStateFromError === "function" || typeof instance.componentDidCatch === "function" && (legacyErrorBoundariesThatAlreadyFailed === null || !legacyErrorBoundariesThatAlreadyFailed.has(instance))) {
              sourceFiber = createCapturedValueAtFiber(error, sourceFiber);
              error = createClassErrorUpdate(2);
              instance = enqueueUpdate(nearestMountedAncestor, error, 2);
              instance !== null && (initializeClassErrorUpdate(error, instance, nearestMountedAncestor, sourceFiber), markRootUpdated$1(instance, 2), ensureRootIsScheduled(instance));
              break;
            }
          }
          nearestMountedAncestor = nearestMountedAncestor.return;
        }
    }
    function attachPingListener(root, wakeable, lanes) {
      var pingCache = root.pingCache;
      if (pingCache === null) {
        pingCache = root.pingCache = new PossiblyWeakMap;
        var threadIDs = new Set;
        pingCache.set(wakeable, threadIDs);
      } else
        threadIDs = pingCache.get(wakeable), threadIDs === undefined && (threadIDs = new Set, pingCache.set(wakeable, threadIDs));
      threadIDs.has(lanes) || (workInProgressRootDidAttachPingListener = true, threadIDs.add(lanes), root = pingSuspendedRoot.bind(null, root, wakeable, lanes), wakeable.then(root, root));
    }
    function pingSuspendedRoot(root, wakeable, pingedLanes) {
      var pingCache = root.pingCache;
      pingCache !== null && pingCache.delete(wakeable);
      root.pingedLanes |= root.suspendedLanes & pingedLanes;
      root.warmLanes &= ~pingedLanes;
      workInProgressRoot === root && (workInProgressRootRenderLanes & pingedLanes) === pingedLanes && (workInProgressRootExitStatus === 4 || workInProgressRootExitStatus === 3 && (workInProgressRootRenderLanes & 62914560) === workInProgressRootRenderLanes && 300 > now() - globalMostRecentFallbackTime ? (executionContext & 2) === 0 && prepareFreshStack(root, 0) : workInProgressRootPingedLanes |= pingedLanes, workInProgressSuspendedRetryLanes === workInProgressRootRenderLanes && (workInProgressSuspendedRetryLanes = 0));
      ensureRootIsScheduled(root);
    }
    function retryTimedOutBoundary(boundaryFiber, retryLane) {
      retryLane === 0 && (retryLane = claimNextRetryLane());
      boundaryFiber = enqueueConcurrentRenderForLane(boundaryFiber, retryLane);
      boundaryFiber !== null && (markRootUpdated$1(boundaryFiber, retryLane), ensureRootIsScheduled(boundaryFiber));
    }
    function retryDehydratedSuspenseBoundary(boundaryFiber) {
      var suspenseState = boundaryFiber.memoizedState, retryLane = 0;
      suspenseState !== null && (retryLane = suspenseState.retryLane);
      retryTimedOutBoundary(boundaryFiber, retryLane);
    }
    function resolveRetryWakeable(boundaryFiber, wakeable) {
      var retryLane = 0;
      switch (boundaryFiber.tag) {
        case 31:
        case 13:
          var retryCache = boundaryFiber.stateNode;
          var suspenseState = boundaryFiber.memoizedState;
          suspenseState !== null && (retryLane = suspenseState.retryLane);
          break;
        case 19:
          retryCache = boundaryFiber.stateNode;
          break;
        case 22:
          retryCache = boundaryFiber.stateNode._retryCache;
          break;
        default:
          throw Error(formatProdErrorMessage(314));
      }
      retryCache !== null && retryCache.delete(wakeable);
      retryTimedOutBoundary(boundaryFiber, retryLane);
    }
    function scheduleCallback(priorityLevel, callback) {
      return scheduleCallback$3(priorityLevel, callback);
    }
    function FiberNode(tag, pendingProps, key, mode) {
      this.tag = tag;
      this.key = key;
      this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null;
      this.index = 0;
      this.refCleanup = this.ref = null;
      this.pendingProps = pendingProps;
      this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null;
      this.mode = mode;
      this.subtreeFlags = this.flags = 0;
      this.deletions = null;
      this.childLanes = this.lanes = 0;
      this.alternate = null;
    }
    function shouldConstruct(Component2) {
      Component2 = Component2.prototype;
      return !(!Component2 || !Component2.isReactComponent);
    }
    function createWorkInProgress(current, pendingProps) {
      var workInProgress2 = current.alternate;
      workInProgress2 === null ? (workInProgress2 = createFiber(current.tag, pendingProps, current.key, current.mode), workInProgress2.elementType = current.elementType, workInProgress2.type = current.type, workInProgress2.stateNode = current.stateNode, workInProgress2.alternate = current, current.alternate = workInProgress2) : (workInProgress2.pendingProps = pendingProps, workInProgress2.type = current.type, workInProgress2.flags = 0, workInProgress2.subtreeFlags = 0, workInProgress2.deletions = null);
      workInProgress2.flags = current.flags & 65011712;
      workInProgress2.childLanes = current.childLanes;
      workInProgress2.lanes = current.lanes;
      workInProgress2.child = current.child;
      workInProgress2.memoizedProps = current.memoizedProps;
      workInProgress2.memoizedState = current.memoizedState;
      workInProgress2.updateQueue = current.updateQueue;
      pendingProps = current.dependencies;
      workInProgress2.dependencies = pendingProps === null ? null : {
        lanes: pendingProps.lanes,
        firstContext: pendingProps.firstContext
      };
      workInProgress2.sibling = current.sibling;
      workInProgress2.index = current.index;
      workInProgress2.ref = current.ref;
      workInProgress2.refCleanup = current.refCleanup;
      return workInProgress2;
    }
    function resetWorkInProgress(workInProgress2, renderLanes2) {
      workInProgress2.flags &= 65011714;
      var current = workInProgress2.alternate;
      current === null ? (workInProgress2.childLanes = 0, workInProgress2.lanes = renderLanes2, workInProgress2.child = null, workInProgress2.subtreeFlags = 0, workInProgress2.memoizedProps = null, workInProgress2.memoizedState = null, workInProgress2.updateQueue = null, workInProgress2.dependencies = null, workInProgress2.stateNode = null) : (workInProgress2.childLanes = current.childLanes, workInProgress2.lanes = current.lanes, workInProgress2.child = current.child, workInProgress2.subtreeFlags = 0, workInProgress2.deletions = null, workInProgress2.memoizedProps = current.memoizedProps, workInProgress2.memoizedState = current.memoizedState, workInProgress2.updateQueue = current.updateQueue, workInProgress2.type = current.type, renderLanes2 = current.dependencies, workInProgress2.dependencies = renderLanes2 === null ? null : {
        lanes: renderLanes2.lanes,
        firstContext: renderLanes2.firstContext
      });
      return workInProgress2;
    }
    function createFiberFromTypeAndProps(type, key, pendingProps, owner, mode, lanes) {
      var fiberTag = 0;
      owner = type;
      if (typeof type === "function")
        shouldConstruct(type) && (fiberTag = 1);
      else if (typeof type === "string")
        fiberTag = supportsResources && supportsSingletons ? isHostHoistableType(type, pendingProps, contextStackCursor.current) ? 26 : isHostSingletonType(type) ? 27 : 5 : supportsResources ? isHostHoistableType(type, pendingProps, contextStackCursor.current) ? 26 : 5 : supportsSingletons ? isHostSingletonType(type) ? 27 : 5 : 5;
      else
        a:
          switch (type) {
            case REACT_ACTIVITY_TYPE2:
              return type = createFiber(31, pendingProps, key, mode), type.elementType = REACT_ACTIVITY_TYPE2, type.lanes = lanes, type;
            case REACT_FRAGMENT_TYPE2:
              return createFiberFromFragment(pendingProps.children, mode, lanes, key);
            case REACT_STRICT_MODE_TYPE2:
              fiberTag = 8;
              mode |= 24;
              break;
            case REACT_PROFILER_TYPE2:
              return type = createFiber(12, pendingProps, key, mode | 2), type.elementType = REACT_PROFILER_TYPE2, type.lanes = lanes, type;
            case REACT_SUSPENSE_TYPE2:
              return type = createFiber(13, pendingProps, key, mode), type.elementType = REACT_SUSPENSE_TYPE2, type.lanes = lanes, type;
            case REACT_SUSPENSE_LIST_TYPE:
              return type = createFiber(19, pendingProps, key, mode), type.elementType = REACT_SUSPENSE_LIST_TYPE, type.lanes = lanes, type;
            default:
              if (typeof type === "object" && type !== null)
                switch (type.$$typeof) {
                  case REACT_CONTEXT_TYPE2:
                    fiberTag = 10;
                    break a;
                  case REACT_CONSUMER_TYPE2:
                    fiberTag = 9;
                    break a;
                  case REACT_FORWARD_REF_TYPE2:
                    fiberTag = 11;
                    break a;
                  case REACT_MEMO_TYPE2:
                    fiberTag = 14;
                    break a;
                  case REACT_LAZY_TYPE2:
                    fiberTag = 16;
                    owner = null;
                    break a;
                }
              fiberTag = 29;
              pendingProps = Error(formatProdErrorMessage(130, type === null ? "null" : typeof type, ""));
              owner = null;
          }
      key = createFiber(fiberTag, pendingProps, key, mode);
      key.elementType = type;
      key.type = owner;
      key.lanes = lanes;
      return key;
    }
    function createFiberFromFragment(elements, mode, lanes, key) {
      elements = createFiber(7, elements, key, mode);
      elements.lanes = lanes;
      return elements;
    }
    function createFiberFromText(content, mode, lanes) {
      content = createFiber(6, content, null, mode);
      content.lanes = lanes;
      return content;
    }
    function createFiberFromDehydratedFragment(dehydratedNode) {
      var fiber = createFiber(18, null, null, 0);
      fiber.stateNode = dehydratedNode;
      return fiber;
    }
    function createFiberFromPortal(portal, mode, lanes) {
      mode = createFiber(4, portal.children !== null ? portal.children : [], portal.key, mode);
      mode.lanes = lanes;
      mode.stateNode = {
        containerInfo: portal.containerInfo,
        pendingChildren: null,
        implementation: portal.implementation
      };
      return mode;
    }
    function FiberRootNode(containerInfo, tag, hydrate, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator, formState) {
      this.tag = 1;
      this.containerInfo = containerInfo;
      this.pingCache = this.current = this.pendingChildren = null;
      this.timeoutHandle = noTimeout;
      this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null;
      this.callbackPriority = 0;
      this.expirationTimes = createLaneMap(-1);
      this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0;
      this.entanglements = createLaneMap(0);
      this.hiddenUpdates = createLaneMap(null);
      this.identifierPrefix = identifierPrefix;
      this.onUncaughtError = onUncaughtError;
      this.onCaughtError = onCaughtError;
      this.onRecoverableError = onRecoverableError;
      this.pooledCache = null;
      this.pooledCacheLanes = 0;
      this.formState = formState;
      this.incompleteTransitions = new Map;
    }
    function createFiberRoot(containerInfo, tag, hydrate, initialChildren, hydrationCallbacks, isStrictMode, identifierPrefix, formState, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator) {
      containerInfo = new FiberRootNode(containerInfo, tag, hydrate, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator, formState);
      tag = 1;
      isStrictMode === true && (tag |= 24);
      isStrictMode = createFiber(3, null, null, tag);
      containerInfo.current = isStrictMode;
      isStrictMode.stateNode = containerInfo;
      tag = createCache();
      tag.refCount++;
      containerInfo.pooledCache = tag;
      tag.refCount++;
      isStrictMode.memoizedState = {
        element: initialChildren,
        isDehydrated: hydrate,
        cache: tag
      };
      initializeUpdateQueue(isStrictMode);
      return containerInfo;
    }
    function getContextForSubtree(parentComponent) {
      if (!parentComponent)
        return emptyContextObject;
      parentComponent = emptyContextObject;
      return parentComponent;
    }
    function findHostInstance(component) {
      var fiber = component._reactInternals;
      if (fiber === undefined) {
        if (typeof component.render === "function")
          throw Error(formatProdErrorMessage(188));
        component = Object.keys(component).join(",");
        throw Error(formatProdErrorMessage(268, component));
      }
      component = findCurrentFiberUsingSlowPath(fiber);
      component = component !== null ? findCurrentHostFiberImpl(component) : null;
      return component === null ? null : getPublicInstance(component.stateNode);
    }
    function updateContainerImpl(rootFiber, lane, element, container, parentComponent, callback) {
      parentComponent = getContextForSubtree(parentComponent);
      container.context === null ? container.context = parentComponent : container.pendingContext = parentComponent;
      container = createUpdate(lane);
      container.payload = { element };
      callback = callback === undefined ? null : callback;
      callback !== null && (container.callback = callback);
      element = enqueueUpdate(rootFiber, container, lane);
      element !== null && (scheduleUpdateOnFiber(element, rootFiber, lane), entangleTransitions(element, rootFiber, lane));
    }
    function markRetryLaneImpl(fiber, retryLane) {
      fiber = fiber.memoizedState;
      if (fiber !== null && fiber.dehydrated !== null) {
        var a = fiber.retryLane;
        fiber.retryLane = a !== 0 && a < retryLane ? a : retryLane;
      }
    }
    function markRetryLaneIfNotHydrated(fiber, retryLane) {
      markRetryLaneImpl(fiber, retryLane);
      (fiber = fiber.alternate) && markRetryLaneImpl(fiber, retryLane);
    }
    var exports2 = {};
    var assign2 = Object.assign, REACT_LEGACY_ELEMENT_TYPE = Symbol.for("react.element"), REACT_ELEMENT_TYPE2 = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE2 = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE2 = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE2 = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE2 = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE2 = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE2 = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE2 = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE2 = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE2 = Symbol.for("react.memo"), REACT_LAZY_TYPE2 = Symbol.for("react.lazy");
    Symbol.for("react.scope");
    var REACT_ACTIVITY_TYPE2 = Symbol.for("react.activity");
    Symbol.for("react.legacy_hidden");
    Symbol.for("react.tracing_marker");
    var REACT_MEMO_CACHE_SENTINEL = Symbol.for("react.memo_cache_sentinel");
    Symbol.for("react.view_transition");
    var MAYBE_ITERATOR_SYMBOL2 = Symbol.iterator, REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), isArrayImpl2 = Array.isArray, ReactSharedInternals2 = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, rendererVersion = $$$config.rendererVersion, rendererPackageName = $$$config.rendererPackageName, extraDevToolsConfig = $$$config.extraDevToolsConfig, getPublicInstance = $$$config.getPublicInstance, getRootHostContext = $$$config.getRootHostContext, getChildHostContext = $$$config.getChildHostContext, prepareForCommit = $$$config.prepareForCommit, resetAfterCommit = $$$config.resetAfterCommit, createInstance = $$$config.createInstance;
    $$$config.cloneMutableInstance;
    var { appendInitialChild, finalizeInitialChildren, shouldSetTextContent, createTextInstance } = $$$config;
    $$$config.cloneMutableTextInstance;
    var { scheduleTimeout, cancelTimeout, noTimeout, isPrimaryRenderer } = $$$config;
    $$$config.warnsIfNotActing;
    var { supportsMutation, supportsPersistence, supportsHydration, getInstanceFromNode } = $$$config;
    $$$config.beforeActiveInstanceBlur;
    var preparePortalMount = $$$config.preparePortalMount;
    $$$config.prepareScopeUpdate;
    $$$config.getInstanceFromScope;
    var { setCurrentUpdatePriority, getCurrentUpdatePriority, resolveUpdatePriority } = $$$config;
    $$$config.trackSchedulerEvent;
    $$$config.resolveEventType;
    $$$config.resolveEventTimeStamp;
    var { shouldAttemptEagerTransition, detachDeletedInstance } = $$$config;
    $$$config.requestPostPaintCallback;
    var { maySuspendCommit, maySuspendCommitOnUpdate, maySuspendCommitInSyncRender, preloadInstance, startSuspendingCommit, suspendInstance } = $$$config;
    $$$config.suspendOnActiveViewTransition;
    var waitForCommitToBeReady = $$$config.waitForCommitToBeReady;
    $$$config.getSuspendedCommitReason;
    var { NotPendingTransition, HostTransitionContext, resetFormInstance } = $$$config;
    $$$config.bindToConsole;
    var { supportsMicrotasks, scheduleMicrotask, supportsTestSelectors, findFiberRoot, getBoundingRect, getTextContent, isHiddenSubtree, matchAccessibilityRole, setFocusIfFocusable, setupIntersectionObserver, appendChild, appendChildToContainer, commitTextUpdate, commitMount, commitUpdate, insertBefore, insertInContainerBefore, removeChild, removeChildFromContainer, resetTextContent, hideInstance, hideTextInstance, unhideInstance, unhideTextInstance } = $$$config;
    $$$config.cancelViewTransitionName;
    $$$config.cancelRootViewTransitionName;
    $$$config.restoreRootViewTransitionName;
    $$$config.cloneRootViewTransitionContainer;
    $$$config.removeRootViewTransitionClone;
    $$$config.measureClonedInstance;
    $$$config.hasInstanceChanged;
    $$$config.hasInstanceAffectedParent;
    $$$config.startViewTransition;
    $$$config.startGestureTransition;
    $$$config.stopViewTransition;
    $$$config.getCurrentGestureOffset;
    $$$config.createViewTransitionInstance;
    var clearContainer = $$$config.clearContainer;
    $$$config.createFragmentInstance;
    $$$config.updateFragmentInstanceFiber;
    $$$config.commitNewChildToFragmentInstance;
    $$$config.deleteChildFromFragmentInstance;
    var { cloneInstance, createContainerChildSet, appendChildToContainerChildSet, finalizeContainerChildren, replaceContainerChildren, cloneHiddenInstance, cloneHiddenTextInstance, isSuspenseInstancePending, isSuspenseInstanceFallback, getSuspenseInstanceFallbackErrorDetails, registerSuspenseInstanceRetry, canHydrateFormStateMarker, isFormStateMarkerMatching, getNextHydratableSibling, getNextHydratableSiblingAfterSingleton, getFirstHydratableChild, getFirstHydratableChildWithinContainer, getFirstHydratableChildWithinActivityInstance, getFirstHydratableChildWithinSuspenseInstance, getFirstHydratableChildWithinSingleton, canHydrateInstance, canHydrateTextInstance, canHydrateActivityInstance, canHydrateSuspenseInstance, hydrateInstance, hydrateTextInstance, hydrateActivityInstance, hydrateSuspenseInstance, getNextHydratableInstanceAfterActivityInstance, getNextHydratableInstanceAfterSuspenseInstance, commitHydratedInstance, commitHydratedContainer, commitHydratedActivityInstance, commitHydratedSuspenseInstance, finalizeHydratedChildren, flushHydrationEvents } = $$$config;
    $$$config.clearActivityBoundary;
    var clearSuspenseBoundary = $$$config.clearSuspenseBoundary;
    $$$config.clearActivityBoundaryFromContainer;
    var { clearSuspenseBoundaryFromContainer, hideDehydratedBoundary, unhideDehydratedBoundary, shouldDeleteUnhydratedTailInstances } = $$$config;
    $$$config.diffHydratedPropsForDevWarnings;
    $$$config.diffHydratedTextForDevWarnings;
    $$$config.describeHydratableInstanceForDevWarnings;
    var { validateHydratableInstance, validateHydratableTextInstance, supportsResources, isHostHoistableType, getHoistableRoot, getResource, acquireResource, releaseResource, hydrateHoistable, mountHoistable, unmountHoistable, createHoistableInstance, prepareToCommitHoistables, mayResourceSuspendCommit, preloadResource, suspendResource, supportsSingletons, resolveSingletonInstance, acquireSingletonInstance, releaseSingletonInstance, isHostSingletonType, isSingletonScope } = $$$config, valueStack = [], index$jscomp$0 = -1, emptyContextObject = {}, clz32 = Math.clz32 ? Math.clz32 : clz32Fallback, log$1 = Math.log, LN2 = Math.LN2, nextTransitionUpdateLane = 256, nextTransitionDeferredLane = 262144, nextRetryLane = 4194304, scheduleCallback$3 = Scheduler.unstable_scheduleCallback, cancelCallback$1 = Scheduler.unstable_cancelCallback, shouldYield = Scheduler.unstable_shouldYield, requestPaint = Scheduler.unstable_requestPaint, now = Scheduler.unstable_now, ImmediatePriority = Scheduler.unstable_ImmediatePriority, UserBlockingPriority = Scheduler.unstable_UserBlockingPriority, NormalPriority$1 = Scheduler.unstable_NormalPriority, IdlePriority = Scheduler.unstable_IdlePriority, log6 = Scheduler.log, unstable_setDisableYieldValue2 = Scheduler.unstable_setDisableYieldValue, rendererID = null, injectedHook = null, objectIs = typeof Object.is === "function" ? Object.is : is, reportGlobalError2 = typeof reportError === "function" ? reportError : function(error) {
      if (typeof window === "object" && typeof window.ErrorEvent === "function") {
        var event = new window.ErrorEvent("error", {
          bubbles: true,
          cancelable: true,
          message: typeof error === "object" && error !== null && typeof error.message === "string" ? String(error.message) : String(error),
          error
        });
        if (!window.dispatchEvent(event))
          return;
      } else if (typeof process === "object" && typeof process.emit === "function") {
        process.emit("uncaughtException", error);
        return;
      }
      console.error(error);
    }, hasOwnProperty2 = Object.prototype.hasOwnProperty, prefix, suffix, reentry = false, CapturedStacks = new WeakMap, forkStack = [], forkStackIndex = 0, treeForkProvider = null, treeForkCount = 0, idStack = [], idStackIndex = 0, treeContextProvider = null, treeContextId = 1, treeContextOverflow = "", contextStackCursor = createCursor(null), contextFiberStackCursor = createCursor(null), rootInstanceStackCursor = createCursor(null), hostTransitionProviderCursor = createCursor(null), hydrationParentFiber = null, nextHydratableInstance = null, isHydrating = false, hydrationErrors = null, rootOrSingletonContext = false, HydrationMismatchException = Error(formatProdErrorMessage(519)), valueCursor = createCursor(null), currentlyRenderingFiber$1 = null, lastContextDependency = null, AbortControllerLocal = typeof AbortController !== "undefined" ? AbortController : function() {
      var listeners = [], signal = this.signal = {
        aborted: false,
        addEventListener: function(type, listener) {
          listeners.push(listener);
        }
      };
      this.abort = function() {
        signal.aborted = true;
        listeners.forEach(function(listener) {
          return listener();
        });
      };
    }, scheduleCallback$2 = Scheduler.unstable_scheduleCallback, NormalPriority = Scheduler.unstable_NormalPriority, CacheContext = {
      $$typeof: REACT_CONTEXT_TYPE2,
      Consumer: null,
      Provider: null,
      _currentValue: null,
      _currentValue2: null,
      _threadCount: 0
    }, firstScheduledRoot = null, lastScheduledRoot = null, didScheduleMicrotask = false, mightHavePendingSyncWork = false, isFlushingWork = false, currentEventTransitionLane = 0, currentEntangledListeners = null, currentEntangledPendingCount = 0, currentEntangledLane = 0, currentEntangledActionThenable = null, prevOnStartTransitionFinish = ReactSharedInternals2.S;
    ReactSharedInternals2.S = function(transition, returnValue) {
      globalMostRecentTransitionTime = now();
      typeof returnValue === "object" && returnValue !== null && typeof returnValue.then === "function" && entangleAsyncAction(transition, returnValue);
      prevOnStartTransitionFinish !== null && prevOnStartTransitionFinish(transition, returnValue);
    };
    var resumedCache = createCursor(null), SuspenseException = Error(formatProdErrorMessage(460)), SuspenseyCommitException = Error(formatProdErrorMessage(474)), SuspenseActionException = Error(formatProdErrorMessage(542)), noopSuspenseyCommitThenable = { then: function() {} }, suspendedThenable = null, thenableState$1 = null, thenableIndexCounter$1 = 0, reconcileChildFibers = createChildReconciler(true), mountChildFibers = createChildReconciler(false), concurrentQueues = [], concurrentQueuesIndex = 0, concurrentlyUpdatedLanes = 0, hasForceUpdate = false, didReadFromEntangledAsyncAction = false, currentTreeHiddenStackCursor = createCursor(null), prevEntangledRenderLanesCursor = createCursor(0), suspenseHandlerStackCursor = createCursor(null), shellBoundary = null, suspenseStackCursor = createCursor(0), renderLanes = 0, currentlyRenderingFiber = null, currentHook = null, workInProgressHook = null, didScheduleRenderPhaseUpdate = false, didScheduleRenderPhaseUpdateDuringThisPass = false, shouldDoubleInvokeUserFnsInHooksDEV = false, localIdCounter = 0, thenableIndexCounter = 0, thenableState = null, globalClientIdCounter = 0, ContextOnlyDispatcher = {
      readContext,
      use,
      useCallback: throwInvalidHookError,
      useContext: throwInvalidHookError,
      useEffect: throwInvalidHookError,
      useImperativeHandle: throwInvalidHookError,
      useLayoutEffect: throwInvalidHookError,
      useInsertionEffect: throwInvalidHookError,
      useMemo: throwInvalidHookError,
      useReducer: throwInvalidHookError,
      useRef: throwInvalidHookError,
      useState: throwInvalidHookError,
      useDebugValue: throwInvalidHookError,
      useDeferredValue: throwInvalidHookError,
      useTransition: throwInvalidHookError,
      useSyncExternalStore: throwInvalidHookError,
      useId: throwInvalidHookError,
      useHostTransitionStatus: throwInvalidHookError,
      useFormState: throwInvalidHookError,
      useActionState: throwInvalidHookError,
      useOptimistic: throwInvalidHookError,
      useMemoCache: throwInvalidHookError,
      useCacheRefresh: throwInvalidHookError
    };
    ContextOnlyDispatcher.useEffectEvent = throwInvalidHookError;
    var HooksDispatcherOnMount = {
      readContext,
      use,
      useCallback: function(callback, deps) {
        mountWorkInProgressHook().memoizedState = [
          callback,
          deps === undefined ? null : deps
        ];
        return callback;
      },
      useContext: readContext,
      useEffect: mountEffect,
      useImperativeHandle: function(ref, create, deps) {
        deps = deps !== null && deps !== undefined ? deps.concat([ref]) : null;
        mountEffectImpl(4194308, 4, imperativeHandleEffect.bind(null, create, ref), deps);
      },
      useLayoutEffect: function(create, deps) {
        return mountEffectImpl(4194308, 4, create, deps);
      },
      useInsertionEffect: function(create, deps) {
        mountEffectImpl(4, 2, create, deps);
      },
      useMemo: function(nextCreate, deps) {
        var hook = mountWorkInProgressHook();
        deps = deps === undefined ? null : deps;
        var nextValue = nextCreate();
        if (shouldDoubleInvokeUserFnsInHooksDEV) {
          setIsStrictModeForDevtools(true);
          try {
            nextCreate();
          } finally {
            setIsStrictModeForDevtools(false);
          }
        }
        hook.memoizedState = [nextValue, deps];
        return nextValue;
      },
      useReducer: function(reducer, initialArg, init) {
        var hook = mountWorkInProgressHook();
        if (init !== undefined) {
          var initialState = init(initialArg);
          if (shouldDoubleInvokeUserFnsInHooksDEV) {
            setIsStrictModeForDevtools(true);
            try {
              init(initialArg);
            } finally {
              setIsStrictModeForDevtools(false);
            }
          }
        } else
          initialState = initialArg;
        hook.memoizedState = hook.baseState = initialState;
        reducer = {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: reducer,
          lastRenderedState: initialState
        };
        hook.queue = reducer;
        reducer = reducer.dispatch = dispatchReducerAction.bind(null, currentlyRenderingFiber, reducer);
        return [hook.memoizedState, reducer];
      },
      useRef: function(initialValue) {
        var hook = mountWorkInProgressHook();
        initialValue = { current: initialValue };
        return hook.memoizedState = initialValue;
      },
      useState: function(initialState) {
        initialState = mountStateImpl(initialState);
        var queue = initialState.queue, dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
        queue.dispatch = dispatch;
        return [initialState.memoizedState, dispatch];
      },
      useDebugValue: mountDebugValue,
      useDeferredValue: function(value, initialValue) {
        var hook = mountWorkInProgressHook();
        return mountDeferredValueImpl(hook, value, initialValue);
      },
      useTransition: function() {
        var stateHook = mountStateImpl(false);
        stateHook = startTransition.bind(null, currentlyRenderingFiber, stateHook.queue, true, false);
        mountWorkInProgressHook().memoizedState = stateHook;
        return [false, stateHook];
      },
      useSyncExternalStore: function(subscribe, getSnapshot, getServerSnapshot) {
        var fiber = currentlyRenderingFiber, hook = mountWorkInProgressHook();
        if (isHydrating) {
          if (getServerSnapshot === undefined)
            throw Error(formatProdErrorMessage(407));
          getServerSnapshot = getServerSnapshot();
        } else {
          getServerSnapshot = getSnapshot();
          if (workInProgressRoot === null)
            throw Error(formatProdErrorMessage(349));
          (workInProgressRootRenderLanes & 127) !== 0 || pushStoreConsistencyCheck(fiber, getSnapshot, getServerSnapshot);
        }
        hook.memoizedState = getServerSnapshot;
        var inst = { value: getServerSnapshot, getSnapshot };
        hook.queue = inst;
        mountEffect(subscribeToStore.bind(null, fiber, inst, subscribe), [
          subscribe
        ]);
        fiber.flags |= 2048;
        pushSimpleEffect(9, { destroy: undefined }, updateStoreInstance.bind(null, fiber, inst, getServerSnapshot, getSnapshot), null);
        return getServerSnapshot;
      },
      useId: function() {
        var hook = mountWorkInProgressHook(), identifierPrefix = workInProgressRoot.identifierPrefix;
        if (isHydrating) {
          var JSCompiler_inline_result = treeContextOverflow;
          var idWithLeadingBit = treeContextId;
          JSCompiler_inline_result = (idWithLeadingBit & ~(1 << 32 - clz32(idWithLeadingBit) - 1)).toString(32) + JSCompiler_inline_result;
          identifierPrefix = "_" + identifierPrefix + "R_" + JSCompiler_inline_result;
          JSCompiler_inline_result = localIdCounter++;
          0 < JSCompiler_inline_result && (identifierPrefix += "H" + JSCompiler_inline_result.toString(32));
          identifierPrefix += "_";
        } else
          JSCompiler_inline_result = globalClientIdCounter++, identifierPrefix = "_" + identifierPrefix + "r_" + JSCompiler_inline_result.toString(32) + "_";
        return hook.memoizedState = identifierPrefix;
      },
      useHostTransitionStatus,
      useFormState: mountActionState,
      useActionState: mountActionState,
      useOptimistic: function(passthrough) {
        var hook = mountWorkInProgressHook();
        hook.memoizedState = hook.baseState = passthrough;
        var queue = {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: null,
          lastRenderedState: null
        };
        hook.queue = queue;
        hook = dispatchOptimisticSetState.bind(null, currentlyRenderingFiber, true, queue);
        queue.dispatch = hook;
        return [passthrough, hook];
      },
      useMemoCache,
      useCacheRefresh: function() {
        return mountWorkInProgressHook().memoizedState = refreshCache.bind(null, currentlyRenderingFiber);
      },
      useEffectEvent: function(callback) {
        var hook = mountWorkInProgressHook(), ref = { impl: callback };
        hook.memoizedState = ref;
        return function() {
          if ((executionContext & 2) !== 0)
            throw Error(formatProdErrorMessage(440));
          return ref.impl.apply(undefined, arguments);
        };
      }
    }, HooksDispatcherOnUpdate = {
      readContext,
      use,
      useCallback: updateCallback,
      useContext: readContext,
      useEffect: updateEffect,
      useImperativeHandle: updateImperativeHandle,
      useInsertionEffect: updateInsertionEffect,
      useLayoutEffect: updateLayoutEffect,
      useMemo: updateMemo,
      useReducer: updateReducer,
      useRef: updateRef,
      useState: function() {
        return updateReducer(basicStateReducer);
      },
      useDebugValue: mountDebugValue,
      useDeferredValue: function(value, initialValue) {
        var hook = updateWorkInProgressHook();
        return updateDeferredValueImpl(hook, currentHook.memoizedState, value, initialValue);
      },
      useTransition: function() {
        var booleanOrThenable = updateReducer(basicStateReducer)[0], start = updateWorkInProgressHook().memoizedState;
        return [
          typeof booleanOrThenable === "boolean" ? booleanOrThenable : useThenable(booleanOrThenable),
          start
        ];
      },
      useSyncExternalStore: updateSyncExternalStore,
      useId: updateId,
      useHostTransitionStatus,
      useFormState: updateActionState,
      useActionState: updateActionState,
      useOptimistic: function(passthrough, reducer) {
        var hook = updateWorkInProgressHook();
        return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
      },
      useMemoCache,
      useCacheRefresh: updateRefresh
    };
    HooksDispatcherOnUpdate.useEffectEvent = updateEvent;
    var HooksDispatcherOnRerender = {
      readContext,
      use,
      useCallback: updateCallback,
      useContext: readContext,
      useEffect: updateEffect,
      useImperativeHandle: updateImperativeHandle,
      useInsertionEffect: updateInsertionEffect,
      useLayoutEffect: updateLayoutEffect,
      useMemo: updateMemo,
      useReducer: rerenderReducer,
      useRef: updateRef,
      useState: function() {
        return rerenderReducer(basicStateReducer);
      },
      useDebugValue: mountDebugValue,
      useDeferredValue: function(value, initialValue) {
        var hook = updateWorkInProgressHook();
        return currentHook === null ? mountDeferredValueImpl(hook, value, initialValue) : updateDeferredValueImpl(hook, currentHook.memoizedState, value, initialValue);
      },
      useTransition: function() {
        var booleanOrThenable = rerenderReducer(basicStateReducer)[0], start = updateWorkInProgressHook().memoizedState;
        return [
          typeof booleanOrThenable === "boolean" ? booleanOrThenable : useThenable(booleanOrThenable),
          start
        ];
      },
      useSyncExternalStore: updateSyncExternalStore,
      useId: updateId,
      useHostTransitionStatus,
      useFormState: rerenderActionState,
      useActionState: rerenderActionState,
      useOptimistic: function(passthrough, reducer) {
        var hook = updateWorkInProgressHook();
        if (currentHook !== null)
          return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
        hook.baseState = passthrough;
        return [passthrough, hook.queue.dispatch];
      },
      useMemoCache,
      useCacheRefresh: updateRefresh
    };
    HooksDispatcherOnRerender.useEffectEvent = updateEvent;
    var classComponentUpdater = {
      enqueueSetState: function(inst, payload, callback) {
        inst = inst._reactInternals;
        var lane = requestUpdateLane(), update = createUpdate(lane);
        update.payload = payload;
        callback !== undefined && callback !== null && (update.callback = callback);
        payload = enqueueUpdate(inst, update, lane);
        payload !== null && (scheduleUpdateOnFiber(payload, inst, lane), entangleTransitions(payload, inst, lane));
      },
      enqueueReplaceState: function(inst, payload, callback) {
        inst = inst._reactInternals;
        var lane = requestUpdateLane(), update = createUpdate(lane);
        update.tag = 1;
        update.payload = payload;
        callback !== undefined && callback !== null && (update.callback = callback);
        payload = enqueueUpdate(inst, update, lane);
        payload !== null && (scheduleUpdateOnFiber(payload, inst, lane), entangleTransitions(payload, inst, lane));
      },
      enqueueForceUpdate: function(inst, callback) {
        inst = inst._reactInternals;
        var lane = requestUpdateLane(), update = createUpdate(lane);
        update.tag = 2;
        callback !== undefined && callback !== null && (update.callback = callback);
        callback = enqueueUpdate(inst, update, lane);
        callback !== null && (scheduleUpdateOnFiber(callback, inst, lane), entangleTransitions(callback, inst, lane));
      }
    }, SelectiveHydrationException = Error(formatProdErrorMessage(461)), didReceiveUpdate = false, SUSPENDED_MARKER = {
      dehydrated: null,
      treeContext: null,
      retryLane: 0,
      hydrationErrors: null
    }, offscreenSubtreeIsHidden = false, offscreenSubtreeWasHidden = false, needsFormReset = false, PossiblyWeakSet = typeof WeakSet === "function" ? WeakSet : Set, nextEffect = null, hostParent = null, hostParentIsContainer = false, currentHoistableRoot = null, suspenseyCommitFlag = 8192, DefaultAsyncDispatcher = {
      getCacheForType: function(resourceType) {
        var cache = readContext(CacheContext), cacheForType = cache.data.get(resourceType);
        cacheForType === undefined && (cacheForType = resourceType(), cache.data.set(resourceType, cacheForType));
        return cacheForType;
      },
      cacheSignal: function() {
        return readContext(CacheContext).controller.signal;
      }
    }, COMPONENT_TYPE = 0, HAS_PSEUDO_CLASS_TYPE = 1, ROLE_TYPE = 2, TEST_NAME_TYPE = 3, TEXT_TYPE = 4;
    if (typeof Symbol === "function" && Symbol.for) {
      var symbolFor = Symbol.for;
      COMPONENT_TYPE = symbolFor("selector.component");
      HAS_PSEUDO_CLASS_TYPE = symbolFor("selector.has_pseudo_class");
      ROLE_TYPE = symbolFor("selector.role");
      TEST_NAME_TYPE = symbolFor("selector.test_id");
      TEXT_TYPE = symbolFor("selector.text");
    }
    var PossiblyWeakMap = typeof WeakMap === "function" ? WeakMap : Map, executionContext = 0, workInProgressRoot = null, workInProgress = null, workInProgressRootRenderLanes = 0, workInProgressSuspendedReason = 0, workInProgressThrownValue = null, workInProgressRootDidSkipSuspendedSiblings = false, workInProgressRootIsPrerendering = false, workInProgressRootDidAttachPingListener = false, entangledRenderLanes = 0, workInProgressRootExitStatus = 0, workInProgressRootSkippedLanes = 0, workInProgressRootInterleavedUpdatedLanes = 0, workInProgressRootPingedLanes = 0, workInProgressDeferredLane = 0, workInProgressSuspendedRetryLanes = 0, workInProgressRootConcurrentErrors = null, workInProgressRootRecoverableErrors = null, workInProgressRootDidIncludeRecursiveRenderUpdate = false, globalMostRecentFallbackTime = 0, globalMostRecentTransitionTime = 0, workInProgressRootRenderTargetTime = Infinity, workInProgressTransitions = null, legacyErrorBoundariesThatAlreadyFailed = null, pendingEffectsStatus = 0, pendingEffectsRoot = null, pendingFinishedWork = null, pendingEffectsLanes = 0, pendingEffectsRemainingLanes = 0, pendingPassiveTransitions = null, pendingRecoverableErrors = null, nestedUpdateCount = 0, rootWithNestedUpdates = null;
    exports2.attemptContinuousHydration = function(fiber) {
      if (fiber.tag === 13 || fiber.tag === 31) {
        var root = enqueueConcurrentRenderForLane(fiber, 67108864);
        root !== null && scheduleUpdateOnFiber(root, fiber, 67108864);
        markRetryLaneIfNotHydrated(fiber, 67108864);
      }
    };
    exports2.attemptHydrationAtCurrentPriority = function(fiber) {
      if (fiber.tag === 13 || fiber.tag === 31) {
        var lane = requestUpdateLane();
        lane = getBumpedLaneForHydrationByLane(lane);
        var root = enqueueConcurrentRenderForLane(fiber, lane);
        root !== null && scheduleUpdateOnFiber(root, fiber, lane);
        markRetryLaneIfNotHydrated(fiber, lane);
      }
    };
    exports2.attemptSynchronousHydration = function(fiber) {
      switch (fiber.tag) {
        case 3:
          fiber = fiber.stateNode;
          if (fiber.current.memoizedState.isDehydrated) {
            var lanes = getHighestPriorityLanes(fiber.pendingLanes);
            if (lanes !== 0) {
              fiber.pendingLanes |= 2;
              for (fiber.entangledLanes |= 2;lanes; ) {
                var lane = 1 << 31 - clz32(lanes);
                fiber.entanglements[1] |= lane;
                lanes &= ~lane;
              }
              ensureRootIsScheduled(fiber);
              (executionContext & 6) === 0 && (workInProgressRootRenderTargetTime = now() + 500, flushSyncWorkAcrossRoots_impl(0, false));
            }
          }
          break;
        case 31:
        case 13:
          lanes = enqueueConcurrentRenderForLane(fiber, 2), lanes !== null && scheduleUpdateOnFiber(lanes, fiber, 2), flushSyncWork(), markRetryLaneIfNotHydrated(fiber, 2);
      }
    };
    exports2.batchedUpdates = function(fn, a) {
      return fn(a);
    };
    exports2.createComponentSelector = function(component) {
      return { $$typeof: COMPONENT_TYPE, value: component };
    };
    exports2.createContainer = function(containerInfo, tag, hydrationCallbacks, isStrictMode, concurrentUpdatesByDefaultOverride, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator) {
      return createFiberRoot(containerInfo, tag, false, null, hydrationCallbacks, isStrictMode, identifierPrefix, null, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator);
    };
    exports2.createHasPseudoClassSelector = function(selectors) {
      return { $$typeof: HAS_PSEUDO_CLASS_TYPE, value: selectors };
    };
    exports2.createHydrationContainer = function(initialChildren, callback, containerInfo, tag, hydrationCallbacks, isStrictMode, concurrentUpdatesByDefaultOverride, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator, transitionCallbacks, formState) {
      initialChildren = createFiberRoot(containerInfo, tag, true, initialChildren, hydrationCallbacks, isStrictMode, identifierPrefix, formState, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator);
      initialChildren.context = getContextForSubtree(null);
      containerInfo = initialChildren.current;
      tag = requestUpdateLane();
      tag = getBumpedLaneForHydrationByLane(tag);
      hydrationCallbacks = createUpdate(tag);
      hydrationCallbacks.callback = callback !== undefined && callback !== null ? callback : null;
      enqueueUpdate(containerInfo, hydrationCallbacks, tag);
      callback = tag;
      initialChildren.current.lanes = callback;
      markRootUpdated$1(initialChildren, callback);
      ensureRootIsScheduled(initialChildren);
      return initialChildren;
    };
    exports2.createPortal = function(children, containerInfo, implementation) {
      var key = 3 < arguments.length && arguments[3] !== undefined ? arguments[3] : null;
      return {
        $$typeof: REACT_PORTAL_TYPE2,
        key: key == null ? null : "" + key,
        children,
        containerInfo,
        implementation
      };
    };
    exports2.createRoleSelector = function(role) {
      return { $$typeof: ROLE_TYPE, value: role };
    };
    exports2.createTestNameSelector = function(id) {
      return { $$typeof: TEST_NAME_TYPE, value: id };
    };
    exports2.createTextSelector = function(text) {
      return { $$typeof: TEXT_TYPE, value: text };
    };
    exports2.defaultOnCaughtError = function(error) {
      console.error(error);
    };
    exports2.defaultOnRecoverableError = function(error) {
      reportGlobalError2(error);
    };
    exports2.defaultOnUncaughtError = function(error) {
      reportGlobalError2(error);
    };
    exports2.deferredUpdates = function(fn) {
      var prevTransition = ReactSharedInternals2.T, previousPriority = getCurrentUpdatePriority();
      try {
        return setCurrentUpdatePriority(32), ReactSharedInternals2.T = null, fn();
      } finally {
        setCurrentUpdatePriority(previousPriority), ReactSharedInternals2.T = prevTransition;
      }
    };
    exports2.discreteUpdates = function(fn, a, b, c, d) {
      var prevTransition = ReactSharedInternals2.T, previousPriority = getCurrentUpdatePriority();
      try {
        return setCurrentUpdatePriority(2), ReactSharedInternals2.T = null, fn(a, b, c, d);
      } finally {
        setCurrentUpdatePriority(previousPriority), ReactSharedInternals2.T = prevTransition, executionContext === 0 && (workInProgressRootRenderTargetTime = now() + 500);
      }
    };
    exports2.findAllNodes = findAllNodes;
    exports2.findBoundingRects = function(hostRoot, selectors) {
      if (!supportsTestSelectors)
        throw Error(formatProdErrorMessage(363));
      selectors = findAllNodes(hostRoot, selectors);
      hostRoot = [];
      for (var i = 0;i < selectors.length; i++)
        hostRoot.push(getBoundingRect(selectors[i]));
      for (selectors = hostRoot.length - 1;0 < selectors; selectors--) {
        i = hostRoot[selectors];
        for (var targetLeft = i.x, targetRight = targetLeft + i.width, targetTop = i.y, targetBottom = targetTop + i.height, j = selectors - 1;0 <= j; j--)
          if (selectors !== j) {
            var otherRect = hostRoot[j], otherLeft = otherRect.x, otherRight = otherLeft + otherRect.width, otherTop = otherRect.y, otherBottom = otherTop + otherRect.height;
            if (targetLeft >= otherLeft && targetTop >= otherTop && targetRight <= otherRight && targetBottom <= otherBottom) {
              hostRoot.splice(selectors, 1);
              break;
            } else if (!(targetLeft !== otherLeft || i.width !== otherRect.width || otherBottom < targetTop || otherTop > targetBottom)) {
              otherTop > targetTop && (otherRect.height += otherTop - targetTop, otherRect.y = targetTop);
              otherBottom < targetBottom && (otherRect.height = targetBottom - otherTop);
              hostRoot.splice(selectors, 1);
              break;
            } else if (!(targetTop !== otherTop || i.height !== otherRect.height || otherRight < targetLeft || otherLeft > targetRight)) {
              otherLeft > targetLeft && (otherRect.width += otherLeft - targetLeft, otherRect.x = targetLeft);
              otherRight < targetRight && (otherRect.width = targetRight - otherLeft);
              hostRoot.splice(selectors, 1);
              break;
            }
          }
      }
      return hostRoot;
    };
    exports2.findHostInstance = findHostInstance;
    exports2.findHostInstanceWithNoPortals = function(fiber) {
      fiber = findCurrentFiberUsingSlowPath(fiber);
      fiber = fiber !== null ? findCurrentHostFiberWithNoPortalsImpl(fiber) : null;
      return fiber === null ? null : getPublicInstance(fiber.stateNode);
    };
    exports2.findHostInstanceWithWarning = function(component) {
      return findHostInstance(component);
    };
    exports2.flushPassiveEffects = flushPendingEffects;
    exports2.flushSyncFromReconciler = function(fn) {
      var prevExecutionContext = executionContext;
      executionContext |= 1;
      var prevTransition = ReactSharedInternals2.T, previousPriority = getCurrentUpdatePriority();
      try {
        if (setCurrentUpdatePriority(2), ReactSharedInternals2.T = null, fn)
          return fn();
      } finally {
        setCurrentUpdatePriority(previousPriority), ReactSharedInternals2.T = prevTransition, executionContext = prevExecutionContext, (executionContext & 6) === 0 && flushSyncWorkAcrossRoots_impl(0, false);
      }
    };
    exports2.flushSyncWork = flushSyncWork;
    exports2.focusWithin = function(hostRoot, selectors) {
      if (!supportsTestSelectors)
        throw Error(formatProdErrorMessage(363));
      hostRoot = findFiberRootForHostRoot(hostRoot);
      selectors = findPaths(hostRoot, selectors);
      selectors = Array.from(selectors);
      for (hostRoot = 0;hostRoot < selectors.length; ) {
        var fiber = selectors[hostRoot++], tag = fiber.tag;
        if (!isHiddenSubtree(fiber)) {
          if ((tag === 5 || tag === 26 || tag === 27) && setFocusIfFocusable(fiber.stateNode))
            return true;
          for (fiber = fiber.child;fiber !== null; )
            selectors.push(fiber), fiber = fiber.sibling;
        }
      }
      return false;
    };
    exports2.getFindAllNodesFailureDescription = function(hostRoot, selectors) {
      if (!supportsTestSelectors)
        throw Error(formatProdErrorMessage(363));
      var maxSelectorIndex = 0, matchedNames = [];
      hostRoot = [findFiberRootForHostRoot(hostRoot), 0];
      for (var index = 0;index < hostRoot.length; ) {
        var fiber = hostRoot[index++], tag = fiber.tag, selectorIndex = hostRoot[index++], selector = selectors[selectorIndex];
        if (tag !== 5 && tag !== 26 && tag !== 27 || !isHiddenSubtree(fiber)) {
          if (matchSelector(fiber, selector) && (matchedNames.push(selectorToString(selector)), selectorIndex++, selectorIndex > maxSelectorIndex && (maxSelectorIndex = selectorIndex)), selectorIndex < selectors.length)
            for (fiber = fiber.child;fiber !== null; )
              hostRoot.push(fiber, selectorIndex), fiber = fiber.sibling;
        }
      }
      if (maxSelectorIndex < selectors.length) {
        for (hostRoot = [];maxSelectorIndex < selectors.length; maxSelectorIndex++)
          hostRoot.push(selectorToString(selectors[maxSelectorIndex]));
        return `findAllNodes was able to match part of the selector:
  ` + (matchedNames.join(" > ") + `

No matching component was found for:
  `) + hostRoot.join(" > ");
      }
      return null;
    };
    exports2.getPublicRootInstance = function(container) {
      container = container.current;
      if (!container.child)
        return null;
      switch (container.child.tag) {
        case 27:
        case 5:
          return getPublicInstance(container.child.stateNode);
        default:
          return container.child.stateNode;
      }
    };
    exports2.injectIntoDevTools = function() {
      var internals = {
        bundleType: 0,
        version: rendererVersion,
        rendererPackageName,
        currentDispatcherRef: ReactSharedInternals2,
        reconcilerVersion: "19.2.0"
      };
      extraDevToolsConfig !== null && (internals.rendererConfig = extraDevToolsConfig);
      if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined")
        internals = false;
      else {
        var hook = __REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (hook.isDisabled || !hook.supportsFiber)
          internals = true;
        else {
          try {
            rendererID = hook.inject(internals), injectedHook = hook;
          } catch (err) {}
          internals = hook.checkDCE ? true : false;
        }
      }
      return internals;
    };
    exports2.isAlreadyRendering = function() {
      return (executionContext & 6) !== 0;
    };
    exports2.observeVisibleRects = function(hostRoot, selectors, callback, options) {
      if (!supportsTestSelectors)
        throw Error(formatProdErrorMessage(363));
      hostRoot = findAllNodes(hostRoot, selectors);
      var disconnect = setupIntersectionObserver(hostRoot, callback, options).disconnect;
      return {
        disconnect: function() {
          disconnect();
        }
      };
    };
    exports2.shouldError = function() {
      return null;
    };
    exports2.shouldSuspend = function() {
      return false;
    };
    exports2.startHostTransition = function(formFiber, pendingState, action, formData) {
      if (formFiber.tag !== 5)
        throw Error(formatProdErrorMessage(476));
      var queue = ensureFormComponentIsStateful(formFiber).queue;
      startTransition(formFiber, queue, pendingState, NotPendingTransition, action === null ? noop2 : function() {
        var stateHook = ensureFormComponentIsStateful(formFiber);
        stateHook.next === null && (stateHook = formFiber.alternate.memoizedState);
        dispatchSetStateInternal(formFiber, stateHook.next.queue, {}, requestUpdateLane());
        return action(formData);
      });
    };
    exports2.updateContainer = function(element, container, parentComponent, callback) {
      var current = container.current, lane = requestUpdateLane();
      updateContainerImpl(current, lane, element, container, parentComponent, callback);
      return lane;
    };
    exports2.updateContainerSync = function(element, container, parentComponent, callback) {
      updateContainerImpl(container.current, 2, element, container, parentComponent, callback);
      return 2;
    };
    return exports2;
  };
  module.exports.default = module.exports;
  Object.defineProperty(module.exports, "__esModule", { value: true });
});

// ../../node_modules/.bun/react-reconciler@0.33.0+b1ab299f0a400331/node_modules/react-reconciler/index.js
var require_react_reconciler = __commonJS((exports, module) => {
  if (true) {
    module.exports = require_react_reconciler_production();
  } else {}
});

// ../../node_modules/.bun/react-reconciler@0.33.0+b1ab299f0a400331/node_modules/react-reconciler/cjs/react-reconciler-constants.production.js
var require_react_reconciler_constants_production = __commonJS((exports) => {
  exports.ConcurrentRoot = 1;
  exports.ContinuousEventPriority = 8;
  exports.DefaultEventPriority = 32;
  exports.DiscreteEventPriority = 2;
  exports.IdleEventPriority = 268435456;
  exports.LegacyRoot = 0;
  exports.NoEventPriority = 0;
});

// ../../node_modules/.bun/react-reconciler@0.33.0+b1ab299f0a400331/node_modules/react-reconciler/constants.js
var require_constants = __commonJS((exports, module) => {
  if (true) {
    module.exports = require_react_reconciler_constants_production();
  } else {}
});

// ../../node_modules/.bun/react@19.2.4/node_modules/react/cjs/react-jsx-runtime.production.js
var exports_react_jsx_runtime_production = {};
__export(exports_react_jsx_runtime_production, {
  jsxs: () => $jsxs,
  jsx: () => $jsx,
  Fragment: () => $Fragment2
});
function jsxProd(type, config, maybeKey) {
  var key = null;
  maybeKey !== undefined && (key = "" + maybeKey);
  config.key !== undefined && (key = "" + config.key);
  if ("key" in config) {
    maybeKey = {};
    for (var propName in config)
      propName !== "key" && (maybeKey[propName] = config[propName]);
  } else
    maybeKey = config;
  config = maybeKey.ref;
  return {
    $$typeof: REACT_ELEMENT_TYPE2,
    type,
    key,
    ref: config !== undefined ? config : null,
    props: maybeKey
  };
}
var REACT_ELEMENT_TYPE2, REACT_FRAGMENT_TYPE2, $Fragment2, $jsx, $jsxs;
var init_react_jsx_runtime_production = __esm(() => {
  REACT_ELEMENT_TYPE2 = Symbol.for("react.transitional.element");
  REACT_FRAGMENT_TYPE2 = Symbol.for("react.fragment");
  $Fragment2 = REACT_FRAGMENT_TYPE2;
  $jsx = jsxProd;
  $jsxs = jsxProd;
});

// ../../node_modules/.bun/react@19.2.4/node_modules/react/jsx-runtime.js
var require_jsx_runtime = __commonJS((exports, module) => {
  init_react_jsx_runtime_production();
  if (true) {
    module.exports = exports_react_jsx_runtime_production;
  } else {}
});

// packages/ag-term/src/adapters/canvas-adapter.ts
var DEFAULT_CONFIG = {
  fontSize: 14,
  fontFamily: "monospace",
  lineHeight: 1.2,
  backgroundColor: "#1e1e1e",
  foregroundColor: "#d4d4d4"
};
var BORDER_CHARS = {
  single: {
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    horizontal: "─",
    vertical: "│"
  },
  double: {
    topLeft: "╔",
    topRight: "╗",
    bottomLeft: "╚",
    bottomRight: "╝",
    horizontal: "═",
    vertical: "║"
  },
  round: {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│"
  },
  bold: {
    topLeft: "┏",
    topRight: "┓",
    bottomLeft: "┗",
    bottomRight: "┛",
    horizontal: "━",
    vertical: "┃"
  }
};
function createCanvasMeasurer(_config) {
  return {
    measureText(text, _style) {
      return {
        width: text.length,
        height: 1
      };
    },
    getLineHeight(_style) {
      return 1;
    }
  };
}
var ANSI_COLORS = {
  black: "#000000",
  red: "#cd0000",
  green: "#00cd00",
  yellow: "#cdcd00",
  blue: "#0000ee",
  magenta: "#cd00cd",
  cyan: "#00cdcd",
  white: "#e5e5e5",
  gray: "#7f7f7f",
  grey: "#7f7f7f",
  brightBlack: "#7f7f7f",
  brightRed: "#ff0000",
  brightGreen: "#00ff00",
  brightYellow: "#ffff00",
  brightBlue: "#5c5cff",
  brightMagenta: "#ff00ff",
  brightCyan: "#00ffff",
  brightWhite: "#ffffff"
};
function resolveColor(color, fallback) {
  if (!color)
    return fallback;
  if (color.startsWith("#") || color.startsWith("rgb")) {
    return color;
  }
  const named = ANSI_COLORS[color.toLowerCase()];
  if (named)
    return named;
  return color;
}

class CanvasRenderBuffer {
  width;
  height;
  canvas;
  ctx;
  config;
  charWidth;
  cellHeight;
  constructor(width, height, config) {
    this.width = width;
    this.height = height;
    this.config = config;
    this.charWidth = config.fontSize * 0.6;
    this.cellHeight = config.fontSize * config.lineHeight;
    const pixelWidth = width * this.charWidth;
    const pixelHeight = height * this.cellHeight;
    if (typeof OffscreenCanvas !== "undefined") {
      this.canvas = new OffscreenCanvas(pixelWidth, pixelHeight);
    } else if (typeof document !== "undefined") {
      this.canvas = document.createElement("canvas");
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    } else {
      throw new Error("Canvas not available");
    }
    const ctx = this.canvas.getContext("2d");
    if (!ctx)
      throw new Error("Could not get 2d context");
    this.ctx = ctx;
    this.ctx.fillStyle = config.backgroundColor;
    this.ctx.fillRect(0, 0, pixelWidth, pixelHeight);
  }
  fillRect(x, y, width, height, style) {
    if (style.bg) {
      const px = x * this.charWidth;
      const py = y * this.cellHeight;
      const pw = width * this.charWidth;
      const ph = height * this.cellHeight;
      this.ctx.fillStyle = resolveColor(style.bg, this.config.backgroundColor);
      this.ctx.fillRect(px, py, pw, ph);
    }
  }
  drawText(x, y, text, style) {
    const px = x * this.charWidth;
    const py = y * this.cellHeight;
    const attrs = style.attrs ?? {};
    const weight = attrs.bold ? "bold" : "normal";
    const fontStyle = attrs.italic ? "italic" : "normal";
    this.ctx.font = `${fontStyle} ${weight} ${this.config.fontSize}px ${this.config.fontFamily}`;
    this.ctx.fillStyle = resolveColor(style.fg, this.config.foregroundColor);
    this.ctx.textBaseline = "top";
    this.ctx.fillText(text, px, py);
    if (attrs.underline) {
      this.drawUnderline(px, py, text, style);
    }
    if (attrs.strikethrough) {
      const metrics = this.ctx.measureText(text);
      const textWidth = metrics.width;
      const strikeY = py + this.config.fontSize * 0.5;
      this.ctx.strokeStyle = resolveColor(style.fg, this.config.foregroundColor);
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(px, strikeY);
      this.ctx.lineTo(px + textWidth, strikeY);
      this.ctx.stroke();
    }
  }
  drawUnderline(px, py, text, style) {
    const attrs = style.attrs ?? {};
    const metrics = this.ctx.measureText(text);
    const textWidth = metrics.width;
    const underlineY = py + this.config.fontSize * 0.9;
    const underlineColor = resolveColor(attrs.underlineColor ?? style.fg, this.config.foregroundColor);
    this.ctx.strokeStyle = underlineColor;
    this.ctx.lineWidth = 1;
    const underlineStyle = attrs.underlineStyle ?? "single";
    switch (underlineStyle) {
      case "double":
        this.ctx.beginPath();
        this.ctx.moveTo(px, underlineY - 1);
        this.ctx.lineTo(px + textWidth, underlineY - 1);
        this.ctx.moveTo(px, underlineY + 1);
        this.ctx.lineTo(px + textWidth, underlineY + 1);
        this.ctx.stroke();
        break;
      case "curly":
        this.ctx.beginPath();
        this.ctx.moveTo(px, underlineY);
        const waveLength = 4;
        const amplitude = 2;
        for (let wx = 0;wx < textWidth; wx += waveLength * 2) {
          this.ctx.quadraticCurveTo(px + wx + waveLength / 2, underlineY - amplitude, px + wx + waveLength, underlineY);
          this.ctx.quadraticCurveTo(px + wx + waveLength * 3 / 2, underlineY + amplitude, px + wx + waveLength * 2, underlineY);
        }
        this.ctx.stroke();
        break;
      case "dotted":
        this.ctx.setLineDash([2, 2]);
        this.ctx.beginPath();
        this.ctx.moveTo(px, underlineY);
        this.ctx.lineTo(px + textWidth, underlineY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        break;
      case "dashed":
        this.ctx.setLineDash([4, 2]);
        this.ctx.beginPath();
        this.ctx.moveTo(px, underlineY);
        this.ctx.lineTo(px + textWidth, underlineY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        break;
      default:
        this.ctx.beginPath();
        this.ctx.moveTo(px, underlineY);
        this.ctx.lineTo(px + textWidth, underlineY);
        this.ctx.stroke();
    }
  }
  drawChar(x, y, char, style) {
    this.drawText(x, y, char, style);
  }
  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }
}
function createCanvasAdapter(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const measurer = createCanvasMeasurer(cfg);
  return {
    name: "canvas",
    measurer,
    createBuffer(width, height) {
      return new CanvasRenderBuffer(width, height, cfg);
    },
    flush(_buffer, _prevBuffer) {},
    getBorderChars(style) {
      return BORDER_CHARS[style] ?? BORDER_CHARS.single;
    }
  };
}

// packages/ag-term/src/browser-renderer.ts
await init_flexily_zero_adapter();

// packages/ag-term/src/layout-engine.ts
var layoutEngine = null;
function setLayoutEngine(engine) {
  layoutEngine = engine;
}
function getLayoutEngine() {
  if (!layoutEngine) {
    throw new Error("Layout engine not initialized. Call setLayoutEngine() or initYoga()/initFlexily() first.");
  }
  return layoutEngine;
}
function getConstants() {
  return getLayoutEngine().constants;
}

// packages/ag-term/src/pipeline/index.ts
init_index_browser();
init_unicode();

// packages/ag-term/src/ag.ts
init_index_browser();
init_buffer();
init_unicode();

// packages/ag-term/src/pipeline/measure-phase.ts
init_unicode();

// packages/ag-term/src/pipeline/collect-text.ts
function collectPlainText(node) {
  if (node.textContent !== undefined)
    return node.textContent;
  let result = "";
  for (let i = 0;i < node.children.length; i++) {
    const child = node.children[i];
    let childText = collectPlainText(child);
    if (childText.length > 0 && child.props.internal_transform) {
      childText = child.props.internal_transform(childText, i);
    }
    result += childText;
  }
  return result;
}
function collectPlainTextSkipHidden(node) {
  if (node.textContent !== undefined)
    return node.textContent;
  let result = "";
  for (let i = 0;i < node.children.length; i++) {
    const child = node.children[i];
    if (child.hidden)
      continue;
    let childText = collectPlainTextSkipHidden(child);
    if (childText.length > 0 && child.props.internal_transform) {
      childText = child.props.internal_transform(childText, i);
    }
    result += childText;
  }
  return result;
}

// packages/ag-term/src/pipeline/helpers.ts
function getPadding(props) {
  return {
    top: props.paddingTop ?? props.paddingY ?? props.padding ?? 0,
    bottom: props.paddingBottom ?? props.paddingY ?? props.padding ?? 0,
    left: props.paddingLeft ?? props.paddingX ?? props.padding ?? 0,
    right: props.paddingRight ?? props.paddingX ?? props.padding ?? 0
  };
}
function getBorderSize(props) {
  if (!props.borderStyle) {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
  return {
    top: props.borderTop !== false ? 1 : 0,
    bottom: props.borderBottom !== false ? 1 : 0,
    left: props.borderLeft !== false ? 1 : 0,
    right: props.borderRight !== false ? 1 : 0
  };
}

// packages/ag-term/src/pipeline/measure-phase.ts
function measurePhase(root, ctx) {
  traverseTree(root, (node) => {
    if (!node.layoutNode)
      return;
    const props = node.props;
    if (props.width === "fit-content" || props.height === "fit-content") {
      let availableWidth;
      if (props.height === "fit-content" && props.width !== "fit-content" && typeof props.width === "number") {
        const padding = getPadding(props);
        availableWidth = props.width - padding.left - padding.right;
        if (props.borderStyle) {
          const border = getBorderSize(props);
          availableWidth -= border.left + border.right;
        }
        if (availableWidth < 1)
          availableWidth = 1;
      }
      const intrinsicSize = measureIntrinsicSize(node, ctx, availableWidth);
      if (props.width === "fit-content") {
        node.layoutNode.setWidth(intrinsicSize.width);
      }
      if (props.height === "fit-content") {
        node.layoutNode.setHeight(intrinsicSize.height);
      }
    }
  });
}
function measureIntrinsicSize(node, ctx, availableWidth) {
  const props = node.props;
  if (props.display === "none") {
    return { width: 0, height: 0 };
  }
  if (node.type === "silvery-text") {
    const textProps = props;
    const text = collectPlainText(node);
    const transform = textProps.internal_transform;
    let lines;
    if (availableWidth !== undefined && availableWidth > 0 && isWrapEnabled(textProps.wrap)) {
      lines = ctx ? ctx.measurer.wrapText(text, availableWidth, true, true) : wrapText(text, availableWidth, true, true);
    } else {
      lines = text.split(`
`);
    }
    if (transform) {
      lines = lines.map((line, index) => transform(line, index));
    }
    const width2 = Math.max(...lines.map((line) => getTextWidth(line, ctx)));
    return {
      width: width2,
      height: lines.length
    };
  }
  const isRow = props.flexDirection === "row" || props.flexDirection === "row-reverse";
  let width = 0;
  let height = 0;
  let childCount = 0;
  for (const child of node.children) {
    const childSize = measureIntrinsicSize(child, ctx, availableWidth);
    childCount++;
    if (isRow) {
      width += childSize.width;
      height = Math.max(height, childSize.height);
    } else {
      width = Math.max(width, childSize.width);
      height += childSize.height;
    }
  }
  const gap = props.gap ?? 0;
  if (gap > 0 && childCount > 1) {
    const totalGap = gap * (childCount - 1);
    if (isRow) {
      width += totalGap;
    } else {
      height += totalGap;
    }
  }
  const padding = getPadding(props);
  width += padding.left + padding.right;
  height += padding.top + padding.bottom;
  if (props.borderStyle) {
    const border = getBorderSize(props);
    width += border.left + border.right;
    height += border.top + border.bottom;
  }
  return { width, height };
}
function isWrapEnabled(wrap2) {
  return wrap2 === "wrap" || wrap2 === true || wrap2 === undefined;
}
function traverseTree(node, callback) {
  callback(node);
  for (const child of node.children) {
    traverseTree(child, callback);
  }
}
function getTextWidth(text, ctx) {
  if (ctx)
    return ctx.measurer.displayWidthAnsi(text);
  return displayWidthAnsi(text);
}

// packages/ag-term/src/pipeline/layout-phase.ts
init_index_browser();

// packages/ag-term/src/pipeline/measure-stats.ts
var measureStats = {
  calls: 0,
  cacheHits: 0,
  textCollects: 0,
  displayWidthCalls: 0,
  reset() {
    this.calls = 0;
    this.cacheHits = 0;
    this.textCollects = 0;
    this.displayWidthCalls = 0;
  }
};

// packages/ag/src/types.ts
function rectEqual(a, b) {
  if (a === b)
    return true;
  if (!a || !b)
    return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

// packages/ag-term/src/pipeline/layout-phase.ts
var log2 = createLogger("silvery:layout");
function layoutPhase(root, width, height) {
  const prevLayout = root.contentRect;
  const dimensionsChanged = prevLayout && (prevLayout.width !== width || prevLayout.height !== height);
  if (!dimensionsChanged && !hasLayoutDirtyNodes(root)) {
    return;
  }
  if (root.layoutNode) {
    const nodeCount = countNodes2(root);
    measureStats.reset();
    const t0 = Date.now();
    root.layoutNode.calculateLayout(width, height);
    const elapsed = Date.now() - t0;
    log2.debug?.(`calculateLayout: ${elapsed}ms (${nodeCount} nodes) measure: calls=${measureStats.calls} hits=${measureStats.cacheHits} collects=${measureStats.textCollects} displayWidth=${measureStats.displayWidthCalls}`);
  }
  propagateLayout(root, 0, 0);
}
function countNodes2(node) {
  let count = 1;
  for (const child of node.children) {
    count += countNodes2(child);
  }
  return count;
}
function hasLayoutDirtyNodes(node, path = "root") {
  if (node.layoutDirty) {
    const props = node.props;
    log2.debug?.(`dirty node found: ${path} (id=${props.id ?? "?"}, type=${node.type})`);
    return true;
  }
  for (let i = 0;i < node.children.length; i++) {
    if (hasLayoutDirtyNodes(node.children[i], `${path}[${i}]`))
      return true;
  }
  return false;
}
function propagateLayout(node, parentX, parentY) {
  node.prevLayout = node.contentRect;
  if (!node.layoutNode) {
    const rect2 = {
      x: parentX,
      y: parentY,
      width: 0,
      height: 0
    };
    node.contentRect = rect2;
    node.layoutDirty = false;
    for (const child of node.children) {
      propagateLayout(child, parentX, parentY);
    }
    return;
  }
  const rect = {
    x: parentX + node.layoutNode.getComputedLeft(),
    y: parentY + node.layoutNode.getComputedTop(),
    width: node.layoutNode.getComputedWidth(),
    height: node.layoutNode.getComputedHeight()
  };
  node.contentRect = rect;
  node.layoutDirty = false;
  node.layoutChangedThisFrame = !!(node.prevLayout && !rectEqual(node.prevLayout, node.contentRect));
  if (process.env.SILVERY_STRICT && node.layoutChangedThisFrame) {
    if (rectEqual(node.prevLayout, node.contentRect)) {
      const props = node.props;
      throw new Error(`[SILVERY_STRICT] layoutChangedThisFrame=true but prevLayout equals contentRect ` + `(node: ${props.id ?? node.type}, rect: ${JSON.stringify(node.contentRect)})`);
    }
  }
  if (node.layoutChangedThisFrame) {
    let ancestor = node.parent;
    while (ancestor && !ancestor.subtreeDirty) {
      ancestor.subtreeDirty = true;
      ancestor = ancestor.parent;
    }
  }
  for (const child of node.children) {
    propagateLayout(child, rect.x, rect.y);
  }
}
function notifyLayoutSubscribers(node) {
  const contentChanged = !rectEqual(node.prevLayout, node.contentRect);
  const screenChanged = !rectEqual(node.prevScreenRect, node.screenRect);
  const renderChanged = !rectEqual(node.prevRenderRect, node.renderRect);
  if (contentChanged || screenChanged || renderChanged) {
    for (const subscriber of node.layoutSubscribers) {
      subscriber();
    }
  }
  for (const child of node.children) {
    notifyLayoutSubscribers(child);
  }
}
function scrollPhase(root, options = {}) {
  const { skipStateUpdates = false } = options;
  traverseTree2(root, (node) => {
    const props = node.props;
    if (props.overflow !== "scroll")
      return;
    calculateScrollState(node, props, skipStateUpdates);
  });
}
function calculateScrollState(node, props, skipStateUpdates) {
  const layout = node.contentRect;
  if (!layout || !node.layoutNode)
    return;
  const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 };
  const padding = getPadding(props);
  const rawViewportHeight = layout.height - border.top - border.bottom - padding.top - padding.bottom;
  let contentHeight = 0;
  const childPositions = [];
  for (let i = 0;i < node.children.length; i++) {
    const child = node.children[i];
    if (!child.layoutNode || !child.contentRect)
      continue;
    const childTop = child.contentRect.y - layout.y - border.top - padding.top;
    const childBottom = childTop + child.contentRect.height;
    const childProps = child.props;
    childPositions.push({
      child,
      top: childTop,
      bottom: childBottom,
      index: i,
      isSticky: childProps.position === "sticky",
      stickyTop: childProps.stickyTop,
      stickyBottom: childProps.stickyBottom
    });
    contentHeight = Math.max(contentHeight, childBottom);
  }
  const viewportHeight = rawViewportHeight;
  const showBorderlessIndicator = props.overflowIndicator === true && !props.borderStyle;
  const hasOverflow = contentHeight > rawViewportHeight;
  const indicatorReserve = showBorderlessIndicator && hasOverflow ? 1 : 0;
  const prevOffset = node.scrollState?.offset;
  const explicitOffset = props.scrollOffset;
  let scrollOffset = explicitOffset ?? prevOffset ?? 0;
  const scrollTo = props.scrollTo;
  if (scrollTo !== undefined && scrollTo >= 0 && scrollTo < childPositions.length) {
    const target = childPositions.find((c) => c.index === scrollTo);
    if (target) {
      const effectiveHeight = viewportHeight - indicatorReserve;
      const visibleTop2 = scrollOffset;
      const visibleBottom2 = scrollOffset + effectiveHeight;
      if (target.top < visibleTop2) {
        scrollOffset = target.top;
      } else if (target.bottom > visibleBottom2) {
        scrollOffset = target.bottom - effectiveHeight;
      }
      scrollOffset = Math.max(0, scrollOffset);
      scrollOffset = Math.min(scrollOffset, Math.max(0, contentHeight - viewportHeight));
    }
  }
  const visibleTop = scrollOffset;
  const visibleBottom = scrollOffset + viewportHeight - indicatorReserve;
  let firstVisible = -1;
  let lastVisible = -1;
  let hiddenAbove = 0;
  let hiddenBelow = 0;
  for (const cp of childPositions) {
    if (cp.isSticky) {
      if (firstVisible === -1)
        firstVisible = cp.index;
      lastVisible = Math.max(lastVisible, cp.index);
      continue;
    }
    if (cp.top === cp.bottom) {
      continue;
    }
    if (cp.bottom <= visibleTop) {
      hiddenAbove++;
    } else if (cp.top >= visibleBottom) {
      hiddenBelow++;
    } else if (cp.top < visibleTop) {
      if (firstVisible === -1)
        firstVisible = cp.index;
      lastVisible = Math.max(lastVisible, cp.index);
    } else if (cp.bottom > visibleBottom) {
      if (firstVisible === -1)
        firstVisible = cp.index;
      lastVisible = cp.index;
      if (indicatorReserve > 0) {
        hiddenBelow++;
      }
    } else {
      if (firstVisible === -1)
        firstVisible = cp.index;
      lastVisible = cp.index;
    }
  }
  const stickyChildren = [];
  for (const cp of childPositions) {
    if (!cp.isSticky)
      continue;
    const childHeight = cp.bottom - cp.top;
    const stickyTop = cp.stickyTop ?? 0;
    const stickyBottom = cp.stickyBottom;
    const naturalRenderY = cp.top - scrollOffset;
    let renderOffset;
    if (stickyBottom !== undefined) {
      const bottomPinPosition = viewportHeight - stickyBottom - childHeight;
      renderOffset = Math.min(naturalRenderY, bottomPinPosition);
    } else if (naturalRenderY >= stickyTop) {
      renderOffset = naturalRenderY;
    } else if (childHeight > viewportHeight) {
      renderOffset = Math.max(viewportHeight - childHeight, naturalRenderY);
    } else {
      renderOffset = stickyTop;
    }
    const isSticking = renderOffset !== naturalRenderY;
    if (isSticking) {
      if (childHeight > viewportHeight) {
        renderOffset = Math.max(viewportHeight - childHeight, renderOffset);
      } else {
        renderOffset = Math.max(0, Math.min(renderOffset, viewportHeight - childHeight));
      }
    }
    if (renderOffset + childHeight <= 0 || renderOffset >= viewportHeight)
      continue;
    stickyChildren.push({
      index: cp.index,
      renderOffset,
      naturalTop: cp.top,
      height: childHeight
    });
  }
  if (skipStateUpdates)
    return;
  const prevFirstVisible = node.scrollState?.firstVisibleChild ?? firstVisible;
  const prevLastVisible = node.scrollState?.lastVisibleChild ?? lastVisible;
  if (scrollOffset !== prevOffset || firstVisible !== prevFirstVisible || lastVisible !== prevLastVisible) {
    node.subtreeDirty = true;
  }
  node.scrollState = {
    offset: scrollOffset,
    prevOffset: prevOffset ?? scrollOffset,
    contentHeight,
    viewportHeight,
    firstVisibleChild: firstVisible,
    lastVisibleChild: lastVisible,
    prevFirstVisibleChild: prevFirstVisible,
    prevLastVisibleChild: prevLastVisible,
    hiddenAbove,
    hiddenBelow,
    stickyChildren: stickyChildren.length > 0 ? stickyChildren : undefined
  };
}
function stickyPhase(root) {
  traverseTree2(root, (node) => {
    const props = node.props;
    if (props.overflow === "scroll")
      return;
    let hasStickyChildren = false;
    for (const child of node.children) {
      const childProps = child.props;
      if (childProps.position === "sticky" && childProps.stickyBottom !== undefined) {
        hasStickyChildren = true;
        break;
      }
    }
    if (!hasStickyChildren) {
      if (node.stickyChildren !== undefined) {
        node.stickyChildren = undefined;
        node.subtreeDirty = true;
      }
      return;
    }
    const layout = node.contentRect;
    if (!layout || !node.layoutNode)
      return;
    const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 };
    const padding = getPadding(props);
    const parentContentHeight = layout.height - border.top - border.bottom - padding.top - padding.bottom;
    const newStickyChildren = [];
    for (let i = 0;i < node.children.length; i++) {
      const child = node.children[i];
      const childProps = child.props;
      if (childProps.position !== "sticky")
        continue;
      if (childProps.stickyBottom === undefined)
        continue;
      if (!child.contentRect)
        continue;
      const naturalY = child.contentRect.y - layout.y - border.top - padding.top;
      const childHeight = child.contentRect.height;
      const stickyBottom = childProps.stickyBottom;
      const bottomPin = parentContentHeight - stickyBottom - childHeight;
      const renderOffset = Math.max(naturalY, bottomPin);
      newStickyChildren.push({
        index: i,
        renderOffset,
        naturalTop: naturalY,
        height: childHeight
      });
    }
    const prev = node.stickyChildren;
    const next = newStickyChildren.length > 0 ? newStickyChildren : undefined;
    const changed = !stickyChildrenEqual(prev, next);
    node.stickyChildren = next;
    if (changed) {
      node.subtreeDirty = true;
    }
  });
}
function stickyChildrenEqual(a, b) {
  if (a === b)
    return true;
  if (!a || !b)
    return false;
  if (a.length !== b.length)
    return false;
  for (let i = 0;i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    if (ai.index !== bi.index || ai.renderOffset !== bi.renderOffset || ai.naturalTop !== bi.naturalTop || ai.height !== bi.height) {
      return false;
    }
  }
  return true;
}
function traverseTree2(node, callback) {
  callback(node);
  for (const child of node.children) {
    traverseTree2(child, callback);
  }
}
function screenRectPhase(root) {
  propagateScreenRect(root, 0);
}
function propagateScreenRect(node, ancestorScrollOffset) {
  node.prevScreenRect = node.screenRect;
  node.prevRenderRect = node.renderRect;
  const content = node.contentRect;
  if (!content) {
    node.screenRect = null;
    node.renderRect = null;
    for (const child of node.children) {
      propagateScreenRect(child, ancestorScrollOffset);
    }
    return;
  }
  node.screenRect = {
    x: content.x,
    y: content.y - ancestorScrollOffset,
    width: content.width,
    height: content.height
  };
  node.renderRect = node.screenRect;
  const scrollOffset = node.scrollState?.offset ?? 0;
  const childScrollOffset = ancestorScrollOffset + scrollOffset;
  computeStickyRenderRects(node);
  for (const child of node.children) {
    propagateScreenRect(child, childScrollOffset);
  }
}
function computeStickyRenderRects(parent) {
  const stickyList = parent.scrollState?.stickyChildren ?? parent.stickyChildren;
  if (!stickyList || stickyList.length === 0)
    return;
  const parentScreenRect = parent.screenRect;
  if (!parentScreenRect)
    return;
  const props = parent.props;
  const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 };
  const padding = getPadding(props);
  const contentOriginY = parentScreenRect.y + border.top + padding.top;
  for (const sticky of stickyList) {
    const child = parent.children[sticky.index];
    if (!child?.screenRect)
      continue;
    child.renderRect = {
      x: child.screenRect.x,
      y: contentOriginY + sticky.renderOffset,
      width: child.screenRect.width,
      height: child.screenRect.height
    };
  }
}

// packages/ag-term/src/pipeline/render-phase.ts
init_index_browser();
init_buffer();

// packages/ag-term/src/pipeline/render-helpers.ts
init_buffer();
init_state();
init_unicode();
function getTextWidth2(text, ctx) {
  if (ctx)
    return ctx.measurer.displayWidthAnsi(text);
  return displayWidthAnsi(text);
}

// packages/ag-term/src/pipeline/render-text.ts
init_buffer();
init_unicode();
var bgConflictMode = (() => {
  const env = process.env.SILVERY_BG_CONFLICT?.toLowerCase();
  if (env === "ignore" || env === "warn" || env === "throw")
    return env;
  return "throw";
})();
var warnedBgConflicts = new Set;
function clearBgConflictWarnings() {
  warnedBgConflicts.clear();
}
function formatTextLines(text, width, wrap2, ctx, trim = true) {
  if (width <= 0) {
    return [];
  }
  const normalizedText = text.replace(/\t/g, "    ");
  const lines = normalizedText.split(`
`);
  if (wrap2 === "clip") {
    const sliceFn = ctx ? ctx.measurer.sliceByWidth : sliceByWidth;
    return lines.map((line) => {
      if (getTextWidth2(line, ctx) <= width)
        return line;
      return sliceFn(line, width);
    });
  }
  if (wrap2 === false || wrap2 === "truncate-end" || wrap2 === "truncate") {
    return lines.map((line) => truncateText(line, width, "end", ctx));
  }
  if (wrap2 === "truncate-start") {
    return lines.map((line) => truncateText(line, width, "start", ctx));
  }
  if (wrap2 === "truncate-middle") {
    return lines.map((line) => truncateText(line, width, "middle", ctx));
  }
  if (ctx)
    return ctx.measurer.wrapText(normalizedText, width, true, trim);
  return wrapText(normalizedText, width, true, trim);
}
function truncateText(text, width, mode, ctx) {
  const textWidth = getTextWidth2(text, ctx);
  if (textWidth <= width)
    return text;
  const ellipsis = "…";
  const availableWidth = width - 1;
  if (availableWidth <= 0) {
    return width > 0 ? ellipsis : "";
  }
  const sliceFn = ctx ? ctx.measurer.sliceByWidth : sliceByWidth;
  const sliceEndFn = ctx ? ctx.measurer.sliceByWidthFromEnd : sliceByWidthFromEnd;
  if (mode === "end") {
    return sliceFn(text, availableWidth) + ellipsis;
  }
  if (mode === "start") {
    return ellipsis + sliceEndFn(text, availableWidth);
  }
  const halfWidth = Math.floor(availableWidth / 2);
  const startPart = sliceFn(text, halfWidth);
  const endPart = sliceEndFn(text, availableWidth - halfWidth);
  return startPart + ellipsis + endPart;
}

// packages/ag-term/src/pipeline/render-phase.ts
init_state();
var contentLog = createLogger("silvery:content");
var traceLog = createLogger("silvery:content:trace");
var cellLog = createLogger("silvery:content:cell");
var _instrumentEnabled = typeof process !== "undefined" && !!(process.env?.SILVERY_STRICT || process.env?.SILVERY_INSTRUMENT);
var _nodeTraceEnabled = typeof process !== "undefined" && !!process.env?.SILVERY_STRICT;

// packages/ag-term/src/ag.ts
var log3 = createLogger("silvery:pipeline");
var baseLog = createLogger("@silvery/ag-react");
// packages/ag-term/src/render-adapter.ts
var currentAdapter = null;
function setRenderAdapter(adapter) {
  currentAdapter = adapter;
}
function getRenderAdapter() {
  if (!currentAdapter) {
    throw new Error("No render adapter set. Call setRenderAdapter() first.");
  }
  return currentAdapter;
}
function hasRenderAdapter() {
  return currentAdapter !== null;
}

// packages/ag-term/src/pipeline/render-phase-adapter.ts
init_unicode();
function renderPhaseAdapter(root) {
  if (!hasRenderAdapter()) {
    throw new Error("renderPhaseAdapter called without a render adapter set");
  }
  const layout = root.contentRect;
  if (!layout) {
    throw new Error("renderPhaseAdapter called before layout phase");
  }
  const adapter = getRenderAdapter();
  const buffer = adapter.createBuffer(layout.width, layout.height);
  renderNodeToBuffer(root, buffer);
  return buffer;
}
function renderNodeToBuffer(node, buffer, scrollOffset = 0, clipBounds) {
  const layout = node.contentRect;
  if (!layout)
    return;
  if (!node.layoutNode)
    return;
  if (node.hidden)
    return;
  const props = node.props;
  if (props.display === "none")
    return;
  const isScrollContainer = props.overflow === "scroll" && node.scrollState;
  if (node.type === "silvery-box") {
    renderBox2(node, buffer, layout, props, clipBounds, scrollOffset);
    if (isScrollContainer && node.scrollState) {
      renderScrollIndicators2(node, buffer, layout, props, node.scrollState);
    }
  } else if (node.type === "silvery-text") {
    renderText2(node, buffer, layout, props, scrollOffset, clipBounds);
  }
  if (isScrollContainer && node.scrollState) {
    renderScrollContainerChildren(node, buffer, props, clipBounds);
  } else {
    renderNormalChildren(node, buffer, scrollOffset, props, clipBounds);
  }
  if (node.type === "silvery-box" && props.outlineStyle) {
    const { x, width, height } = layout;
    const outlineY = layout.y - scrollOffset;
    renderOutlineAdapter(buffer, x, outlineY, width, height, props, clipBounds);
  }
  node.contentDirty = false;
}
function renderBox2(_node, buffer, layout, props, clipBounds, scrollOffset = 0) {
  const { x, width, height } = layout;
  const y = layout.y - scrollOffset;
  if (clipBounds) {
    if (y + height <= clipBounds.top || y >= clipBounds.bottom)
      return;
    if (clipBounds.left !== undefined && clipBounds.right !== undefined) {
      if (x + width <= clipBounds.left || x >= clipBounds.right)
        return;
    }
  }
  if (props.backgroundColor) {
    const style = { bg: props.backgroundColor };
    if (clipBounds) {
      const clippedY = Math.max(y, clipBounds.top);
      const clippedHeight = Math.min(y + height, clipBounds.bottom) - clippedY;
      const clippedX = clipBounds.left !== undefined ? Math.max(x, clipBounds.left) : x;
      const clippedWidth = clipBounds.right !== undefined ? Math.min(x + width, clipBounds.right) - clippedX : width - (clippedX - x);
      if (clippedHeight > 0 && clippedWidth > 0) {
        buffer.fillRect(clippedX, clippedY, clippedWidth, clippedHeight, style);
      }
    } else {
      buffer.fillRect(x, y, width, height, style);
    }
  }
  if (props.borderStyle) {
    renderBorder(buffer, x, y, width, height, props, clipBounds);
  }
}
function renderBorder(buffer, x, y, width, height, props, clipBounds) {
  const adapter = getRenderAdapter();
  const chars = adapter.getBorderChars(props.borderStyle ?? "single");
  const style = props.borderColor ? { fg: props.borderColor } : {};
  const showTop = props.borderTop !== false;
  const showBottom = props.borderBottom !== false;
  const showLeft = props.borderLeft !== false;
  const showRight = props.borderRight !== false;
  const isRowVisible = (row) => clipBounds ? row >= clipBounds.top && row < clipBounds.bottom && buffer.inBounds(0, row) : buffer.inBounds(0, row);
  if (showTop && isRowVisible(y)) {
    renderHorizontalBorder(buffer, x, y, width, showLeft, showRight, chars.topLeft, chars.topRight, chars.horizontal, style, clipBounds);
  }
  const rightVertical = chars.rightVertical ?? chars.vertical;
  const sideStart = showTop ? y + 1 : y;
  const sideEnd = showBottom ? y + height - 1 : y + height;
  renderSideBorders(buffer, x, width, sideStart, sideEnd, showLeft, showRight, chars.vertical, rightVertical, style, isRowVisible, clipBounds);
  const bottomHorizontal = chars.bottomHorizontal ?? chars.horizontal;
  const bottomY = y + height - 1;
  if (showBottom && isRowVisible(bottomY)) {
    renderHorizontalBorder(buffer, x, bottomY, width, showLeft, showRight, chars.bottomLeft, chars.bottomRight, bottomHorizontal, style, clipBounds);
  }
}
function renderHorizontalBorder(buffer, x, row, width, showLeft, showRight, leftCorner, rightCorner, horizontal, style, clipBounds) {
  const clipLeft = clipBounds?.left ?? -Infinity;
  const clipRight = clipBounds?.right ?? Infinity;
  if (showLeft && x >= clipLeft && x < clipRight)
    buffer.drawChar(x, row, leftCorner, style);
  for (let col = x + 1;col < x + width - 1; col++) {
    if (col >= clipLeft && col < clipRight && buffer.inBounds(col, row)) {
      buffer.drawChar(col, row, horizontal, style);
    }
  }
  const rightCol = x + width - 1;
  if (showRight && rightCol >= clipLeft && rightCol < clipRight && buffer.inBounds(rightCol, row)) {
    buffer.drawChar(rightCol, row, rightCorner, style);
  }
}
function renderSideBorders(buffer, x, width, startRow, endRow, showLeft, showRight, leftVertical, rightVertical, style, isRowVisible, clipBounds) {
  const clipLeft = clipBounds?.left ?? -Infinity;
  const clipRight = clipBounds?.right ?? Infinity;
  for (let row = startRow;row < endRow; row++) {
    if (!isRowVisible(row))
      continue;
    if (showLeft && x >= clipLeft && x < clipRight)
      buffer.drawChar(x, row, leftVertical, style);
    const rightCol = x + width - 1;
    if (showRight && rightCol >= clipLeft && rightCol < clipRight && buffer.inBounds(rightCol, row)) {
      buffer.drawChar(rightCol, row, rightVertical, style);
    }
  }
}
function renderOutlineAdapter(buffer, x, y, width, height, props, clipBounds) {
  const adapter = getRenderAdapter();
  const chars = adapter.getBorderChars(props.outlineStyle ?? "single");
  const style = {};
  if (props.outlineColor)
    style.fg = props.outlineColor;
  if (props.outlineDimColor)
    style.attrs = { dim: true };
  const showTop = props.outlineTop !== false;
  const showBottom = props.outlineBottom !== false;
  const showLeft = props.outlineLeft !== false;
  const showRight = props.outlineRight !== false;
  const isRowVisible = (row) => clipBounds ? row >= clipBounds.top && row < clipBounds.bottom && buffer.inBounds(0, row) : buffer.inBounds(0, row);
  if (showTop && isRowVisible(y)) {
    renderHorizontalBorder(buffer, x, y, width, showLeft, showRight, chars.topLeft, chars.topRight, chars.horizontal, style, clipBounds);
  }
  const outRightVertical = chars.rightVertical ?? chars.vertical;
  const sideStart = showTop ? y + 1 : y;
  const sideEnd = showBottom ? y + height - 1 : y + height;
  renderSideBorders(buffer, x, width, sideStart, sideEnd, showLeft, showRight, chars.vertical, outRightVertical, style, isRowVisible, clipBounds);
  const outBottomHorizontal = chars.bottomHorizontal ?? chars.horizontal;
  const bottomY = y + height - 1;
  if (showBottom && isRowVisible(bottomY)) {
    renderHorizontalBorder(buffer, x, bottomY, width, showLeft, showRight, chars.bottomLeft, chars.bottomRight, outBottomHorizontal, style, clipBounds);
  }
}
function findAncestorBg(node) {
  let current = node.parent;
  while (current) {
    const bg = current.props.backgroundColor;
    if (bg)
      return bg;
    current = current.parent;
  }
  return;
}
function mergeAdapterStyleContext(parent, childProps) {
  return {
    color: childProps.color ?? parent.color,
    bold: childProps.bold ?? parent.bold,
    dim: childProps.dim ?? childProps.dimColor ?? parent.dim,
    italic: childProps.italic ?? parent.italic,
    underline: childProps.underline ?? parent.underline,
    underlineStyle: childProps.underlineStyle ?? parent.underlineStyle,
    underlineColor: childProps.underlineColor ?? parent.underlineColor,
    inverse: childProps.inverse ?? parent.inverse,
    strikethrough: childProps.strikethrough ?? parent.strikethrough
  };
}
function contextToRenderStyle(ctx, bg) {
  return {
    fg: ctx.color ?? undefined,
    bg: bg ?? undefined,
    attrs: {
      bold: ctx.bold,
      dim: ctx.dim,
      italic: ctx.italic,
      underline: ctx.underline,
      underlineStyle: ctx.underlineStyle,
      underlineColor: ctx.underlineColor,
      strikethrough: ctx.strikethrough,
      inverse: ctx.inverse
    }
  };
}
function collectStyledSegments(node, parentContext, inheritedBg, segments) {
  if (node.textContent !== undefined) {
    if (node.textContent.length > 0) {
      segments.push({
        text: node.textContent,
        style: contextToRenderStyle(parentContext, inheritedBg)
      });
    }
    return;
  }
  for (let i = 0;i < node.children.length; i++) {
    const child = node.children[i];
    const childProps = child.props;
    if (childProps?.display === "none")
      continue;
    if (child.hidden)
      continue;
    if (child.type === "silvery-text" && child.props && !child.layoutNode) {
      const childContext = mergeAdapterStyleContext(parentContext, childProps);
      const childTransform = childProps.internal_transform;
      if (childTransform) {
        const plainText = collectPlainTextAdapter(child);
        if (plainText.length > 0) {
          const transformed = childTransform(plainText, i);
          if (transformed.length > 0) {
            segments.push({
              text: transformed,
              style: contextToRenderStyle(childContext, inheritedBg)
            });
          }
        }
      } else {
        collectStyledSegments(child, childContext, inheritedBg, segments);
      }
    } else {
      collectStyledSegments(child, parentContext, inheritedBg, segments);
    }
  }
}
function collectPlainTextAdapter(node) {
  if (node.textContent !== undefined)
    return node.textContent;
  let result = "";
  for (let i = 0;i < node.children.length; i++) {
    const child = node.children[i];
    const childProps = child.props;
    if (childProps?.display === "none")
      continue;
    if (child.hidden)
      continue;
    let childText = collectPlainTextAdapter(child);
    if (childText.length > 0 && child.props?.internal_transform) {
      childText = child.props.internal_transform(childText, i);
    }
    result += childText;
  }
  return result;
}
function renderText2(node, buffer, layout, props, scrollOffset = 0, clipBounds) {
  const { x, width: layoutWidth } = layout;
  const y = layout.y - scrollOffset;
  const rootContext = {
    color: props.color ?? undefined,
    bold: props.bold,
    dim: props.dim,
    italic: props.italic,
    underline: props.underline,
    underlineStyle: props.underlineStyle,
    underlineColor: props.underlineColor ?? undefined,
    inverse: props.inverse,
    strikethrough: props.strikethrough
  };
  const inheritedBg = props.backgroundColor ?? findAncestorBg(node);
  const segments = [];
  collectStyledSegments(node, rootContext, inheritedBg, segments);
  const text = segments.map((s) => s.text).join("");
  if (!text)
    return;
  if (clipBounds && (y < clipBounds.top || y >= clipBounds.bottom)) {
    return;
  }
  let maxCol = x + layoutWidth;
  if (clipBounds?.right !== undefined) {
    maxCol = Math.min(maxCol, clipBounds.right);
  }
  let startCol = x;
  if (clipBounds?.left !== undefined) {
    startCol = Math.max(startCol, clipBounds.left);
  }
  if (startCol >= maxCol)
    return;
  const availableWidth = maxCol - x;
  const lines = formatTextLines(text, availableWidth, props.wrap);
  if (segments.length <= 1) {
    const style = segments.length === 1 ? segments[0].style : contextToRenderStyle(rootContext, inheritedBg);
    for (let i = 0;i < lines.length; i++) {
      const lineY = y + i;
      if (clipBounds && (lineY < clipBounds.top || lineY >= clipBounds.bottom))
        continue;
      if (!buffer.inBounds(0, lineY))
        continue;
      const truncated = truncateToWidth(lines[i], availableWidth);
      if (truncated) {
        buffer.drawText(x, lineY, truncated, style);
      }
    }
    return;
  }
  const segmentForChar = new Array(text.length);
  let charIdx = 0;
  for (let s = 0;s < segments.length; s++) {
    const segText = segments[s].text;
    for (let j = 0;j < segText.length; j++) {
      segmentForChar[charIdx++] = s;
    }
  }
  let flatOffset = 0;
  for (let i = 0;i < lines.length; i++) {
    const lineY = y + i;
    if (clipBounds && (lineY < clipBounds.top || lineY >= clipBounds.bottom)) {
      flatOffset = advanceFlatOffset(text, flatOffset, lines[i]);
      continue;
    }
    if (!buffer.inBounds(0, lineY)) {
      flatOffset = advanceFlatOffset(text, flatOffset, lines[i]);
      continue;
    }
    const line = lines[i];
    const truncated = truncateToWidth(line, availableWidth);
    if (!truncated) {
      flatOffset = advanceFlatOffset(text, flatOffset, line);
      continue;
    }
    let col = x;
    const lineStartOffset = flatOffset;
    let lineCharIdx = 0;
    for (const char of truncated) {
      if (col >= maxCol)
        break;
      const srcIdx = lineStartOffset + lineCharIdx;
      const segIdx = srcIdx < segmentForChar.length ? segmentForChar[srcIdx] : 0;
      const style = segments[segIdx].style;
      const charWidth = displayWidth(char);
      if (col + charWidth <= maxCol) {
        buffer.drawChar(col, lineY, char, style);
        for (let w = 1;w < charWidth; w++) {
          if (buffer.inBounds(col + w, lineY)) {
            buffer.drawChar(col + w, lineY, "", style);
          }
        }
      }
      col += charWidth;
      lineCharIdx += char.length;
    }
    flatOffset = advanceFlatOffset(text, flatOffset, line);
  }
}
function advanceFlatOffset(flatText, offset, line) {
  while (offset < flatText.length && (flatText[offset] === " " || flatText[offset] === `
`)) {
    if (line.length > 0 && line[0] === flatText[offset])
      break;
    offset++;
  }
  let lineIdx = 0;
  while (lineIdx < line.length && offset < flatText.length) {
    if (line[lineIdx] === "…") {
      lineIdx++;
      continue;
    }
    if (line[lineIdx] === flatText[offset]) {
      lineIdx++;
      offset++;
    } else {
      offset++;
    }
  }
  return offset;
}
function truncateToWidth(text, maxWidth) {
  if (maxWidth <= 0)
    return "";
  const textWidth = displayWidth(text);
  if (textWidth <= maxWidth)
    return text;
  let width = 0;
  let end = 0;
  for (const char of text) {
    const charWidth = displayWidth(char);
    if (width + charWidth > maxWidth)
      break;
    width += charWidth;
    end += char.length;
  }
  return text.slice(0, end);
}
function renderScrollIndicators2(_node, buffer, layout, props, scrollState) {
  const { x, width, height } = layout;
  const y = layout.y;
  const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, right: 0 };
  const canScrollUp = scrollState.offset > 0;
  const canScrollDown = scrollState.offset + scrollState.viewportHeight < scrollState.contentHeight;
  const indicatorX = x + width - border.right - 1;
  const style = { fg: props.borderColor ?? "#808080" };
  if (canScrollUp) {
    const indicatorY = y + border.top;
    if (buffer.inBounds(indicatorX, indicatorY)) {
      buffer.drawChar(indicatorX, indicatorY, "▲", style);
    }
  }
  if (canScrollDown) {
    const indicatorY = y + height - border.bottom - 1;
    if (buffer.inBounds(indicatorX, indicatorY)) {
      buffer.drawChar(indicatorX, indicatorY, "▼", style);
    }
  }
}
function renderScrollContainerChildren(node, buffer, props, clipBounds) {
  const layout = node.contentRect;
  const ss = node.scrollState;
  if (!layout || !ss)
    return;
  const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 };
  const padding = getPadding(props);
  const nodeClip = {
    top: layout.y + border.top + padding.top,
    bottom: layout.y + layout.height - border.bottom - padding.bottom,
    left: layout.x + border.left + padding.left,
    right: layout.x + layout.width - border.right - padding.right
  };
  const childClipBounds = clipBounds ? {
    top: Math.max(clipBounds.top, nodeClip.top),
    bottom: Math.min(clipBounds.bottom, nodeClip.bottom),
    left: Math.max(clipBounds.left ?? nodeClip.left, nodeClip.left),
    right: Math.min(clipBounds.right ?? nodeClip.right, nodeClip.right)
  } : nodeClip;
  for (let i = 0;i < node.children.length; i++) {
    const child = node.children[i];
    if (!child)
      continue;
    const childProps = child.props;
    if (childProps.position === "sticky")
      continue;
    if (i < ss.firstVisibleChild || i > ss.lastVisibleChild)
      continue;
    renderNodeToBuffer(child, buffer, ss.offset, childClipBounds);
  }
  if (ss.stickyChildren) {
    for (const sticky of ss.stickyChildren) {
      const child = node.children[sticky.index];
      if (!child?.contentRect)
        continue;
      const stickyScrollOffset = sticky.naturalTop - sticky.renderOffset;
      renderNodeToBuffer(child, buffer, stickyScrollOffset, childClipBounds);
    }
  }
}
function renderNormalChildren(node, buffer, scrollOffset, props, clipBounds) {
  const layout = node.contentRect;
  if (!layout)
    return;
  let effectiveClipBounds = clipBounds;
  if (props.overflow === "hidden") {
    const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 };
    const padding = getPadding(props);
    const adjustedY = layout.y - scrollOffset;
    const nodeClip = {
      top: adjustedY + border.top + padding.top,
      bottom: adjustedY + layout.height - border.bottom - padding.bottom,
      left: layout.x + border.left + padding.left,
      right: layout.x + layout.width - border.right - padding.right
    };
    effectiveClipBounds = clipBounds ? {
      top: Math.max(clipBounds.top, nodeClip.top),
      bottom: Math.min(clipBounds.bottom, nodeClip.bottom),
      left: Math.max(clipBounds.left ?? nodeClip.left, nodeClip.left),
      right: Math.min(clipBounds.right ?? nodeClip.right, nodeClip.right)
    } : nodeClip;
  }
  const hasStickyChildren = !!(node.stickyChildren && node.stickyChildren.length > 0);
  let hasAbsoluteChildren = false;
  for (const child of node.children) {
    const childProps = child.props;
    if (childProps.position === "absolute") {
      hasAbsoluteChildren = true;
      continue;
    }
    if (hasStickyChildren && childProps.position === "sticky")
      continue;
    renderNodeToBuffer(child, buffer, scrollOffset, effectiveClipBounds);
  }
  if (node.stickyChildren) {
    for (const sticky of node.stickyChildren) {
      const child = node.children[sticky.index];
      if (!child?.contentRect)
        continue;
      const stickyScrollOffset = sticky.naturalTop - sticky.renderOffset;
      renderNodeToBuffer(child, buffer, stickyScrollOffset, effectiveClipBounds);
    }
  }
  if (hasAbsoluteChildren) {
    for (const child of node.children) {
      const childProps = child.props;
      if (childProps.position !== "absolute")
        continue;
      renderNodeToBuffer(child, buffer, scrollOffset, effectiveClipBounds);
    }
  }
}

// packages/ag-term/src/pipeline/index.ts
init_output_phase();
init_output_phase();
var log4 = createLogger("silvery:pipeline");
var baseLog2 = createLogger("@silvery/ag-react");
function executeRenderAdapter(root, width, height, prevBuffer, options = "fullscreen") {
  let __stack8 = [];
  try {
    if (!hasRenderAdapter()) {
      throw new Error("executeRenderAdapter called without a render adapter set");
    }
    const opts = typeof options === "string" ? { mode: options } : options;
    const { skipLayoutNotifications = false } = opts;
    const start = Date.now();
    const adapter = getRenderAdapter();
    const render = __using(__stack8, baseLog2.span("pipeline-adapter", {
      width,
      height,
      adapter: adapter.name
    }), 0);
    clearBgConflictWarnings();
    {
      let __stack = [];
      try {
        const _measure = __using(__stack, render.span("measure"), 0);
        const t1 = Date.now();
        measurePhase(root);
        log4.debug?.(`measure: ${Date.now() - t1}ms`);
      } catch (_catch) {
        var _err = _catch, _hasErr = 1;
      } finally {
        __callDispose(__stack, _err, _hasErr);
      }
    }
    {
      let __stack2 = [];
      try {
        const _layout = __using(__stack2, render.span("layout"), 0);
        const t2 = Date.now();
        layoutPhase(root, width, height);
        log4.debug?.(`layout: ${Date.now() - t2}ms`);
      } catch (_catch2) {
        var _err2 = _catch2, _hasErr2 = 1;
      } finally {
        __callDispose(__stack2, _err2, _hasErr2);
      }
    }
    {
      let __stack3 = [];
      try {
        const _scroll = __using(__stack3, render.span("scroll"), 0);
        scrollPhase(root);
      } catch (_catch3) {
        var _err3 = _catch3, _hasErr3 = 1;
      } finally {
        __callDispose(__stack3, _err3, _hasErr3);
      }
    }
    stickyPhase(root);
    {
      let __stack4 = [];
      try {
        const _screenRect = __using(__stack4, render.span("screenRect"), 0);
        screenRectPhase(root);
      } catch (_catch4) {
        var _err4 = _catch4, _hasErr4 = 1;
      } finally {
        __callDispose(__stack4, _err4, _hasErr4);
      }
    }
    if (!skipLayoutNotifications) {
      let __stack5 = [];
      try {
        const _notify = __using(__stack5, render.span("notify"), 0);
        notifyLayoutSubscribers(root);
      } catch (_catch5) {
        var _err5 = _catch5, _hasErr5 = 1;
      } finally {
        __callDispose(__stack5, _err5, _hasErr5);
      }
    }
    let buffer;
    {
      let __stack6 = [];
      try {
        const _content = __using(__stack6, render.span("content"), 0);
        const t3 = Date.now();
        buffer = renderPhaseAdapter(root);
        log4.debug?.(`content: ${Date.now() - t3}ms`);
      } catch (_catch6) {
        var _err6 = _catch6, _hasErr6 = 1;
      } finally {
        __callDispose(__stack6, _err6, _hasErr6);
      }
    }
    let output;
    {
      let __stack7 = [];
      try {
        const outputSpan = __using(__stack7, render.span("output"), 0);
        const t4 = Date.now();
        output = adapter.flush(buffer, prevBuffer);
        if (typeof output === "string") {
          outputSpan.spanData.bytes = output.length;
        }
        log4.debug?.(`output: ${Date.now() - t4}ms`);
      } catch (_catch7) {
        var _err7 = _catch7, _hasErr7 = 1;
      } finally {
        __callDispose(__stack7, _err7, _hasErr7);
      }
    }
    log4.debug?.(`total pipeline: ${Date.now() - start}ms`);
    return { output, buffer };
  } catch (_catch8) {
    var _err8 = _catch8, _hasErr8 = 1;
  } finally {
    __callDispose(__stack8, _err8, _hasErr8);
  }
}
// packages/ag-react/src/reconciler/index.ts
var import_react_reconciler = __toESM(require_react_reconciler(), 1);

// packages/ag-react/src/reconciler/host-config.ts
var import_react = __toESM(require_react(), 1);
var import_constants5 = __toESM(require_constants(), 1);

// packages/ag-react/src/reconciler/helpers.ts
var LAYOUT_PROPS = new Set([
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "flexDirection",
  "flexWrap",
  "justifyContent",
  "alignItems",
  "alignContent",
  "alignSelf",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "padding",
  "paddingX",
  "paddingY",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "margin",
  "marginX",
  "marginY",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "gap",
  "columnGap",
  "rowGap",
  "borderStyle",
  "borderTop",
  "borderBottom",
  "borderLeft",
  "borderRight",
  "display",
  "position",
  "top",
  "left",
  "bottom",
  "right",
  "aspectRatio",
  "overflow",
  "overflowX",
  "overflowY"
]);
function layoutPropsChanged(oldProps, newProps) {
  for (const prop of LAYOUT_PROPS) {
    if (oldProps[prop] !== newProps[prop]) {
      return true;
    }
  }
  return false;
}
function contentPropsChanged(oldProps, newProps) {
  const oldChildren = oldProps.children;
  const newChildren = newProps.children;
  if (oldChildren !== newChildren) {
    const oldIsPrimitive = typeof oldChildren === "string" || typeof oldChildren === "number";
    const newIsPrimitive = typeof newChildren === "string" || typeof newChildren === "number";
    if (oldIsPrimitive || newIsPrimitive) {
      return "text";
    }
  }
  const contentProps = ["wrap", "internal_transform"];
  for (const prop of contentProps) {
    if (oldProps[prop] !== newProps[prop]) {
      return "text";
    }
  }
  const styleProps = [
    "color",
    "backgroundColor",
    "bold",
    "dim",
    "dimColor",
    "italic",
    "underline",
    "underlineStyle",
    "underlineColor",
    "strikethrough",
    "inverse",
    "borderColor",
    "borderStyle",
    "outlineStyle",
    "outlineColor",
    "outlineDimColor",
    "outlineTop",
    "outlineBottom",
    "outlineLeft",
    "outlineRight",
    "theme"
  ];
  for (const prop of styleProps) {
    if (oldProps[prop] !== newProps[prop]) {
      return "style";
    }
  }
  return false;
}
function propsEqual(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const key of keysA) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

// packages/ag-react/src/reconciler/nodes.ts
init_index_browser();
init_unicode();
var measureLog = createLogger("silvery:measure");
function createNode(type, props, measurer) {
  const layoutNode2 = getLayoutEngine().createNode();
  const node = {
    type,
    props,
    children: [],
    parent: null,
    layoutNode: layoutNode2,
    contentRect: null,
    screenRect: null,
    renderRect: null,
    prevLayout: null,
    prevScreenRect: null,
    prevRenderRect: null,
    layoutChangedThisFrame: false,
    layoutDirty: true,
    contentDirty: true,
    stylePropsDirty: true,
    bgDirty: true,
    subtreeDirty: true,
    childrenDirty: true,
    layoutSubscribers: new Set
  };
  if (type === "silvery-box") {
    applyBoxProps(layoutNode2, props);
  }
  if (type === "silvery-text") {
    let cachedText = null;
    const measureCache = new Map;
    layoutNode2.setMeasureFunc((width, widthMode, height, heightMode) => {
      measureStats.calls++;
      measureLog.debug?.(`measure "${collectPlainTextSkipHidden(node).slice(0, 40)}" width=${width} widthMode=${widthMode} height=${height} heightMode=${heightMode}`);
      const cacheKey = `${width}|${widthMode}|${height}|${heightMode}`;
      const cached = measureCache.get(cacheKey);
      if (cached && cachedText !== null && !node.contentDirty) {
        measureStats.cacheHits++;
        return cached;
      }
      let text;
      if (cachedText !== null && !node.contentDirty) {
        text = cachedText;
      } else {
        measureStats.textCollects++;
        const newText = collectPlainTextSkipHidden(node);
        if (newText !== cachedText) {
          measureCache.clear();
        }
        text = newText;
        cachedText = text;
        node.contentDirty = false;
      }
      if (!text) {
        return { width: 0, height: 0 };
      }
      const cachedAfterCollect = measureCache.get(cacheKey);
      if (cachedAfterCollect) {
        measureStats.cacheHits++;
        return cachedAfterCollect;
      }
      const lines = text.split(`
`);
      const maxWidth = widthMode === "undefined" || Number.isNaN(width) ? Number.POSITIVE_INFINITY : width;
      const { wrap: wrap2 } = node.props;
      const isTruncate = wrap2 === "truncate" || wrap2 === "truncate-start" || wrap2 === "truncate-middle" || wrap2 === "truncate-end" || wrap2 === "clip" || wrap2 === false;
      let totalHeight = 0;
      let actualWidth = 0;
      const dw = measurer ? measurer.displayWidth.bind(measurer) : displayWidth;
      const wt = measurer ? measurer.wrapText.bind(measurer) : wrapText;
      for (const line of lines) {
        measureStats.displayWidthCalls++;
        const lineWidth = dw(line);
        if (isTruncate || lineWidth <= maxWidth) {
          totalHeight += 1;
          actualWidth = Math.max(actualWidth, isTruncate ? Math.min(lineWidth, maxWidth) : lineWidth);
        } else {
          const wrapped = wt(line, maxWidth, false, true);
          totalHeight += wrapped.length;
          for (const wl of wrapped) {
            actualWidth = Math.max(actualWidth, dw(wl));
          }
        }
      }
      let resultHeight = Math.max(1, totalHeight);
      if (heightMode === "exactly" && Number.isFinite(height)) {
        resultHeight = height;
      } else if (heightMode === "at-most" && Number.isFinite(height)) {
        resultHeight = Math.min(resultHeight, height);
      }
      const result = {
        width: Math.min(actualWidth, maxWidth),
        height: resultHeight
      };
      measureCache.set(cacheKey, result);
      return result;
    });
  }
  return node;
}
function createRootNode() {
  const node = createNode("silvery-root", {});
  const c = getConstants();
  node.layoutNode.setFlexDirection(c.FLEX_DIRECTION_COLUMN);
  return node;
}
function createVirtualTextNode(props) {
  return {
    type: "silvery-text",
    props,
    children: [],
    parent: null,
    layoutNode: null,
    contentRect: null,
    screenRect: null,
    renderRect: null,
    prevLayout: null,
    prevScreenRect: null,
    prevRenderRect: null,
    layoutChangedThisFrame: false,
    layoutDirty: false,
    contentDirty: true,
    stylePropsDirty: true,
    bgDirty: true,
    subtreeDirty: true,
    childrenDirty: false,
    layoutSubscribers: new Set,
    isRawText: false,
    inlineRects: null
  };
}
function applyBoxProps(layoutNode2, props, oldProps) {
  const c = getConstants();
  const wasRemoved = (prop) => oldProps?.[prop] !== undefined && props[prop] === undefined;
  if (props.width !== undefined) {
    if (typeof props.width === "string" && props.width.endsWith("%")) {
      layoutNode2.setWidthPercent(Number.parseFloat(props.width));
    } else if (typeof props.width === "number") {
      layoutNode2.setWidth(props.width);
    } else if (props.width === "auto") {
      layoutNode2.setWidthAuto();
    }
  } else if (wasRemoved("width")) {
    layoutNode2.setWidthAuto();
  }
  if (props.height !== undefined) {
    if (typeof props.height === "string" && props.height.endsWith("%")) {
      layoutNode2.setHeightPercent(Number.parseFloat(props.height));
    } else if (typeof props.height === "number") {
      layoutNode2.setHeight(props.height);
    } else if (props.height === "auto") {
      layoutNode2.setHeightAuto();
    }
  } else if (wasRemoved("height")) {
    layoutNode2.setHeightAuto();
  }
  if (props.minWidth !== undefined) {
    if (typeof props.minWidth === "string" && props.minWidth.endsWith("%")) {
      layoutNode2.setMinWidthPercent(Number.parseFloat(props.minWidth));
    } else if (typeof props.minWidth === "number") {
      layoutNode2.setMinWidth(props.minWidth);
    }
  } else if (wasRemoved("minWidth")) {
    layoutNode2.setMinWidth(0);
  }
  if (props.minHeight !== undefined) {
    if (typeof props.minHeight === "string" && props.minHeight.endsWith("%")) {
      layoutNode2.setMinHeightPercent(Number.parseFloat(props.minHeight));
    } else if (typeof props.minHeight === "number") {
      layoutNode2.setMinHeight(props.minHeight);
    }
  } else if (wasRemoved("minHeight")) {
    layoutNode2.setMinHeight(0);
  }
  if (props.maxWidth !== undefined) {
    if (typeof props.maxWidth === "string" && props.maxWidth.endsWith("%")) {
      layoutNode2.setMaxWidthPercent(Number.parseFloat(props.maxWidth));
    } else if (typeof props.maxWidth === "number") {
      layoutNode2.setMaxWidth(props.maxWidth);
    }
  } else if (wasRemoved("maxWidth")) {
    layoutNode2.setMaxWidth(Number.POSITIVE_INFINITY);
  }
  if (props.maxHeight !== undefined) {
    if (typeof props.maxHeight === "string" && props.maxHeight.endsWith("%")) {
      layoutNode2.setMaxHeightPercent(Number.parseFloat(props.maxHeight));
    } else if (typeof props.maxHeight === "number") {
      layoutNode2.setMaxHeight(props.maxHeight);
    }
  } else if (wasRemoved("maxHeight")) {
    layoutNode2.setMaxHeight(Number.POSITIVE_INFINITY);
  }
  if (props.flexGrow !== undefined) {
    layoutNode2.setFlexGrow(props.flexGrow);
  } else if (wasRemoved("flexGrow")) {
    layoutNode2.setFlexGrow(0);
  }
  if (props.flexShrink !== undefined) {
    layoutNode2.setFlexShrink(props.flexShrink);
  } else if (wasRemoved("flexShrink")) {
    layoutNode2.setFlexShrink(1);
  }
  if (props.flexBasis !== undefined) {
    if (typeof props.flexBasis === "string" && props.flexBasis.endsWith("%")) {
      layoutNode2.setFlexBasisPercent(Number.parseFloat(props.flexBasis));
    } else if (props.flexBasis === "auto") {
      layoutNode2.setFlexBasisAuto();
    } else if (typeof props.flexBasis === "number") {
      layoutNode2.setFlexBasis(props.flexBasis);
    }
  } else if (wasRemoved("flexBasis")) {
    layoutNode2.setFlexBasisAuto();
  }
  if (props.flexDirection !== undefined) {
    const directionMap = {
      row: c.FLEX_DIRECTION_ROW,
      column: c.FLEX_DIRECTION_COLUMN,
      "row-reverse": c.FLEX_DIRECTION_ROW_REVERSE,
      "column-reverse": c.FLEX_DIRECTION_COLUMN_REVERSE
    };
    layoutNode2.setFlexDirection(directionMap[props.flexDirection] ?? c.FLEX_DIRECTION_ROW);
  } else if (wasRemoved("flexDirection")) {
    layoutNode2.setFlexDirection(c.FLEX_DIRECTION_ROW);
  }
  if (props.flexWrap !== undefined) {
    const wrapMap = {
      nowrap: c.WRAP_NO_WRAP,
      wrap: c.WRAP_WRAP,
      "wrap-reverse": c.WRAP_WRAP_REVERSE
    };
    layoutNode2.setFlexWrap(wrapMap[props.flexWrap] ?? c.WRAP_NO_WRAP);
  } else if (wasRemoved("flexWrap")) {
    layoutNode2.setFlexWrap(c.WRAP_NO_WRAP);
  }
  if (props.alignItems !== undefined) {
    layoutNode2.setAlignItems(alignToConstant(props.alignItems));
  } else if (wasRemoved("alignItems")) {
    layoutNode2.setAlignItems(c.ALIGN_STRETCH);
  }
  if (props.alignSelf !== undefined) {
    if (props.alignSelf === "auto") {
      layoutNode2.setAlignSelf(c.ALIGN_AUTO);
    } else {
      layoutNode2.setAlignSelf(alignToConstant(props.alignSelf));
    }
  } else if (wasRemoved("alignSelf")) {
    layoutNode2.setAlignSelf(c.ALIGN_AUTO);
  }
  if (props.alignContent !== undefined) {
    layoutNode2.setAlignContent(alignToConstant(props.alignContent));
  } else if (wasRemoved("alignContent")) {
    layoutNode2.setAlignContent(c.ALIGN_FLEX_START);
  }
  if (props.justifyContent !== undefined) {
    layoutNode2.setJustifyContent(justifyToConstant(props.justifyContent));
  } else if (wasRemoved("justifyContent")) {
    layoutNode2.setJustifyContent(c.JUSTIFY_FLEX_START);
  }
  applySpacing(layoutNode2, "padding", props);
  applySpacing(layoutNode2, "margin", props);
  if (props.gap !== undefined) {
    layoutNode2.setGap(c.GUTTER_ALL, props.gap);
  } else if (wasRemoved("gap")) {
    layoutNode2.setGap(c.GUTTER_ALL, 0);
  }
  if (props.columnGap !== undefined) {
    layoutNode2.setGap(c.GUTTER_COLUMN, props.columnGap);
  } else if (wasRemoved("columnGap")) {
    layoutNode2.setGap(c.GUTTER_COLUMN, 0);
  }
  if (props.rowGap !== undefined) {
    layoutNode2.setGap(c.GUTTER_ROW, props.rowGap);
  } else if (wasRemoved("rowGap")) {
    layoutNode2.setGap(c.GUTTER_ROW, 0);
  }
  if (props.display !== undefined) {
    layoutNode2.setDisplay(props.display === "none" ? c.DISPLAY_NONE : c.DISPLAY_FLEX);
  } else if (wasRemoved("display")) {
    layoutNode2.setDisplay(c.DISPLAY_FLEX);
  }
  if (props.position !== undefined) {
    if (props.position === "absolute") {
      layoutNode2.setPositionType(c.POSITION_TYPE_ABSOLUTE);
    } else if (props.position === "static") {
      layoutNode2.setPositionType(c.POSITION_TYPE_STATIC);
    } else {
      layoutNode2.setPositionType(c.POSITION_TYPE_RELATIVE);
    }
  } else if (wasRemoved("position")) {
    layoutNode2.setPositionType(c.POSITION_TYPE_RELATIVE);
  }
  if (props.position !== "static") {
    applyPositionOffset(layoutNode2, c.EDGE_TOP, props.top);
    applyPositionOffset(layoutNode2, c.EDGE_LEFT, props.left);
    applyPositionOffset(layoutNode2, c.EDGE_BOTTOM, props.bottom);
    applyPositionOffset(layoutNode2, c.EDGE_RIGHT, props.right);
  }
  if (props.aspectRatio !== undefined) {
    layoutNode2.setAspectRatio(props.aspectRatio);
  } else if (wasRemoved("aspectRatio")) {
    layoutNode2.setAspectRatio(NaN);
  }
  const effectiveOverflow = props.overflow ?? (props.overflowX === "hidden" || props.overflowY === "hidden" ? "hidden" : undefined);
  if (effectiveOverflow !== undefined) {
    if (effectiveOverflow === "hidden") {
      layoutNode2.setOverflow(c.OVERFLOW_HIDDEN);
    } else if (effectiveOverflow === "scroll") {
      layoutNode2.setOverflow(c.OVERFLOW_SCROLL);
    } else {
      layoutNode2.setOverflow(c.OVERFLOW_VISIBLE);
    }
  } else if (wasRemoved("overflow") || wasRemoved("overflowX") || wasRemoved("overflowY")) {
    layoutNode2.setOverflow(c.OVERFLOW_VISIBLE);
  }
  if (props.borderStyle) {
    const borderWidth = 1;
    if (props.borderTop !== false) {
      layoutNode2.setBorder(c.EDGE_TOP, borderWidth);
    } else {
      layoutNode2.setBorder(c.EDGE_TOP, 0);
    }
    if (props.borderBottom !== false) {
      layoutNode2.setBorder(c.EDGE_BOTTOM, borderWidth);
    } else {
      layoutNode2.setBorder(c.EDGE_BOTTOM, 0);
    }
    if (props.borderLeft !== false) {
      layoutNode2.setBorder(c.EDGE_LEFT, borderWidth);
    } else {
      layoutNode2.setBorder(c.EDGE_LEFT, 0);
    }
    if (props.borderRight !== false) {
      layoutNode2.setBorder(c.EDGE_RIGHT, borderWidth);
    } else {
      layoutNode2.setBorder(c.EDGE_RIGHT, 0);
    }
  } else {
    layoutNode2.setBorder(c.EDGE_TOP, 0);
    layoutNode2.setBorder(c.EDGE_BOTTOM, 0);
    layoutNode2.setBorder(c.EDGE_LEFT, 0);
    layoutNode2.setBorder(c.EDGE_RIGHT, 0);
  }
}
function applySpacing(layoutNode2, type, props) {
  const c = getConstants();
  const set = type === "padding" ? layoutNode2.setPadding.bind(layoutNode2) : layoutNode2.setMargin.bind(layoutNode2);
  const all = props[type];
  const x = props[`${type}X`];
  const yy = props[`${type}Y`];
  const top = props[`${type}Top`];
  const bottom = props[`${type}Bottom`];
  const left = props[`${type}Left`];
  const right = props[`${type}Right`];
  set(c.EDGE_TOP, top ?? yy ?? all ?? 0);
  set(c.EDGE_BOTTOM, bottom ?? yy ?? all ?? 0);
  set(c.EDGE_LEFT, left ?? x ?? all ?? 0);
  set(c.EDGE_RIGHT, right ?? x ?? all ?? 0);
}
function applyPositionOffset(layoutNode2, edge, value) {
  if (value === undefined) {
    layoutNode2.setPosition(edge, NaN);
    return;
  }
  if (typeof value === "string" && value.endsWith("%")) {
    layoutNode2.setPositionPercent(edge, Number.parseFloat(value));
  } else if (typeof value === "number") {
    layoutNode2.setPosition(edge, value);
  }
}
function alignToConstant(align) {
  const c = getConstants();
  const map = {
    "flex-start": c.ALIGN_FLEX_START,
    "flex-end": c.ALIGN_FLEX_END,
    center: c.ALIGN_CENTER,
    stretch: c.ALIGN_STRETCH,
    baseline: c.ALIGN_BASELINE,
    "space-between": c.ALIGN_SPACE_BETWEEN,
    "space-around": c.ALIGN_SPACE_AROUND,
    "space-evenly": c.ALIGN_SPACE_EVENLY
  };
  return map[align] ?? c.ALIGN_STRETCH;
}
function justifyToConstant(justify) {
  const c = getConstants();
  const map = {
    "flex-start": c.JUSTIFY_FLEX_START,
    "flex-end": c.JUSTIFY_FLEX_END,
    center: c.JUSTIFY_CENTER,
    "space-between": c.JUSTIFY_SPACE_BETWEEN,
    "space-around": c.JUSTIFY_SPACE_AROUND,
    "space-evenly": c.JUSTIFY_SPACE_EVENLY
  };
  return map[justify] ?? c.JUSTIFY_FLEX_START;
}

// packages/ag-react/src/reconciler/host-config.ts
function normalizeNodeType(type) {
  if (type === "ink-box")
    return "silvery-box";
  if (type === "ink-text")
    return "silvery-text";
  return type;
}
var onNodeRemovedCallback = null;
function markSubtreeDirty(node) {
  while (node && !node.subtreeDirty) {
    node.subtreeDirty = true;
    node = node.parent;
  }
}
function markLayoutAncestorDirty(node) {
  if (node.layoutNode)
    return;
  let ancestor = node.parent;
  while (ancestor && !ancestor.layoutNode) {
    ancestor = ancestor.parent;
  }
  if (ancestor?.layoutNode) {
    ancestor.contentDirty = true;
    ancestor.stylePropsDirty = true;
    ancestor.layoutDirty = true;
    ancestor.layoutNode.markDirty();
  }
}
var inkStrictValidation = false;
var currentUpdatePriority = import_constants5.NoEventPriority;
var hostConfig = {
  rendererPackageName: "@silvery/ag-react",
  rendererVersion: "0.0.1",
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  getRootHostContext() {
    return { isInsideText: false };
  },
  getChildHostContext(parentHostContext, type) {
    const normalizedType = normalizeNodeType(type);
    const isInsideText = parentHostContext.isInsideText || normalizedType === "silvery-text";
    if (isInsideText === parentHostContext.isInsideText) {
      return parentHostContext;
    }
    return { isInsideText };
  },
  createInstance(type, props, _rootContainer, hostContext) {
    type = normalizeNodeType(type);
    if ("style" in props && props.style && typeof props.style === "object") {
      props = { ...props.style, ...props };
    }
    if (type === "silvery-box" && hostContext.isInsideText) {
      if (inkStrictValidation) {
        throw new Error("<Box> can’t be nested inside <Text> component");
      }
      if (false) {}
    }
    if (type === "silvery-text" && hostContext.isInsideText) {
      return createVirtualTextNode(props);
    }
    return createNode(type, props);
  },
  createTextInstance(text, _rootContainer, hostContext) {
    if (inkStrictValidation && !hostContext.isInsideText && text.trim().length > 0) {
      throw new Error(`Text string "${text}" must be rendered inside <Text> component`);
    }
    const node = {
      type: "silvery-text",
      props: { children: text },
      children: [],
      parent: null,
      layoutNode: null,
      contentRect: null,
      screenRect: null,
      renderRect: null,
      prevLayout: null,
      prevScreenRect: null,
      prevRenderRect: null,
      layoutChangedThisFrame: false,
      layoutDirty: false,
      contentDirty: true,
      stylePropsDirty: true,
      bgDirty: true,
      subtreeDirty: true,
      childrenDirty: false,
      layoutSubscribers: new Set,
      textContent: text,
      isRawText: true
    };
    return node;
  },
  appendChild(parentInstance, child) {
    const existingIndex = parentInstance.children.indexOf(child);
    if (existingIndex !== -1) {
      parentInstance.children.splice(existingIndex, 1);
      if (parentInstance.layoutNode && child.layoutNode) {
        parentInstance.layoutNode.removeChild(child.layoutNode);
      }
    }
    child.parent = parentInstance;
    parentInstance.children.push(child);
    if (parentInstance.layoutNode && child.layoutNode) {
      const layoutIndex = parentInstance.children.filter((c) => c.layoutNode !== null).length - 1;
      parentInstance.layoutNode.insertChild(child.layoutNode, layoutIndex);
    }
    parentInstance.childrenDirty = true;
    parentInstance.contentDirty = true;
    parentInstance.layoutDirty = true;
    parentInstance.layoutNode?.markDirty();
    markLayoutAncestorDirty(parentInstance);
    markSubtreeDirty(parentInstance);
  },
  appendInitialChild(parentInstance, child) {
    child.parent = parentInstance;
    parentInstance.children.push(child);
    if (parentInstance.layoutNode && child.layoutNode) {
      const layoutIndex = parentInstance.children.filter((c) => c.layoutNode !== null).length - 1;
      parentInstance.layoutNode.insertChild(child.layoutNode, layoutIndex);
    }
  },
  appendChildToContainer(container, child) {
    const existingIndex = container.root.children.indexOf(child);
    if (existingIndex !== -1) {
      container.root.children.splice(existingIndex, 1);
      if (container.root.layoutNode && child.layoutNode) {
        container.root.layoutNode.removeChild(child.layoutNode);
      }
    }
    child.parent = container.root;
    container.root.children.push(child);
    if (container.root.layoutNode && child.layoutNode) {
      const layoutIndex = container.root.children.filter((c) => c.layoutNode !== null).length - 1;
      container.root.layoutNode.insertChild(child.layoutNode, layoutIndex);
    }
    container.root.childrenDirty = true;
    container.root.contentDirty = true;
    container.root.layoutDirty = true;
    container.root.layoutNode?.markDirty();
    markSubtreeDirty(container.root);
  },
  removeChild(parentInstance, child) {
    const index = parentInstance.children.indexOf(child);
    if (index !== -1) {
      onNodeRemovedCallback?.(child);
      parentInstance.children.splice(index, 1);
      if (parentInstance.layoutNode && child.layoutNode) {
        parentInstance.layoutNode.removeChild(child.layoutNode);
        child.layoutNode.free();
      }
      child.parent = null;
      parentInstance.childrenDirty = true;
      parentInstance.contentDirty = true;
      parentInstance.layoutDirty = true;
      parentInstance.layoutNode?.markDirty();
      markLayoutAncestorDirty(parentInstance);
      markSubtreeDirty(parentInstance);
    }
  },
  removeChildFromContainer(container, child) {
    const index = container.root.children.indexOf(child);
    if (index !== -1) {
      onNodeRemovedCallback?.(child);
      container.root.children.splice(index, 1);
      if (container.root.layoutNode && child.layoutNode) {
        container.root.layoutNode.removeChild(child.layoutNode);
        child.layoutNode.free();
      }
      child.parent = null;
      container.root.childrenDirty = true;
      container.root.contentDirty = true;
      container.root.layoutDirty = true;
      container.root.layoutNode?.markDirty();
      markSubtreeDirty(container.root);
    }
  },
  insertBefore(parentInstance, child, beforeChild) {
    const existingIndex = parentInstance.children.indexOf(child);
    if (existingIndex !== -1) {
      parentInstance.children.splice(existingIndex, 1);
      if (parentInstance.layoutNode && child.layoutNode) {
        parentInstance.layoutNode.removeChild(child.layoutNode);
      }
    }
    const beforeIndex = parentInstance.children.indexOf(beforeChild);
    if (beforeIndex !== -1) {
      child.parent = parentInstance;
      parentInstance.children.splice(beforeIndex, 0, child);
      if (parentInstance.layoutNode && child.layoutNode) {
        const layoutIndex = parentInstance.children.slice(0, beforeIndex).filter((c) => c.layoutNode !== null).length;
        parentInstance.layoutNode.insertChild(child.layoutNode, layoutIndex);
      }
      parentInstance.childrenDirty = true;
      parentInstance.contentDirty = true;
      parentInstance.layoutDirty = true;
      parentInstance.layoutNode?.markDirty();
      markLayoutAncestorDirty(parentInstance);
      markSubtreeDirty(parentInstance);
    }
  },
  insertInContainerBefore(container, child, beforeChild) {
    const existingIndex = container.root.children.indexOf(child);
    if (existingIndex !== -1) {
      container.root.children.splice(existingIndex, 1);
      if (container.root.layoutNode && child.layoutNode) {
        container.root.layoutNode.removeChild(child.layoutNode);
      }
    }
    const beforeIndex = container.root.children.indexOf(beforeChild);
    if (beforeIndex !== -1) {
      child.parent = container.root;
      container.root.children.splice(beforeIndex, 0, child);
      if (container.root.layoutNode && child.layoutNode) {
        const layoutIndex = container.root.children.slice(0, beforeIndex).filter((c) => c.layoutNode !== null).length;
        container.root.layoutNode.insertChild(child.layoutNode, layoutIndex);
      }
      container.root.childrenDirty = true;
      container.root.contentDirty = true;
      container.root.layoutDirty = true;
      container.root.layoutNode?.markDirty();
      markSubtreeDirty(container.root);
    }
  },
  prepareUpdate(_instance, _type, oldProps, newProps) {
    return !propsEqual(oldProps, newProps);
  },
  commitUpdate(instance, _type, oldProps, newProps, _finishedWork) {
    if ("style" in oldProps && oldProps.style && typeof oldProps.style === "object") {
      oldProps = { ...oldProps.style, ...oldProps };
    }
    if ("style" in newProps && newProps.style && typeof newProps.style === "object") {
      newProps = { ...newProps.style, ...newProps };
    }
    if (propsEqual(oldProps, newProps)) {
      instance.props = newProps;
      return;
    }
    if (layoutPropsChanged(oldProps, newProps)) {
      if (instance.layoutNode) {
        applyBoxProps(instance.layoutNode, newProps, oldProps);
        instance.layoutNode.markDirty();
      }
      instance.layoutDirty = true;
    }
    const contentChanged = contentPropsChanged(oldProps, newProps);
    if (contentChanged) {
      instance.stylePropsDirty = true;
      if (contentChanged === "text") {
        instance.contentDirty = true;
        if (instance.layoutNode) {
          instance.layoutNode.markDirty();
        }
      }
      if (oldProps.backgroundColor !== newProps.backgroundColor) {
        instance.bgDirty = true;
      }
      if (oldProps.borderStyle && !newProps.borderStyle) {
        instance.bgDirty = true;
      }
      if (oldProps.outlineStyle && !newProps.outlineStyle) {
        instance.bgDirty = true;
      }
      if (oldProps.theme !== newProps.theme) {
        instance.bgDirty = true;
      }
    }
    instance.props = newProps;
    const scrollToChanged = oldProps.scrollTo !== newProps.scrollTo;
    const scrollOffsetChanged = oldProps.scrollOffset !== newProps.scrollOffset;
    if (instance.layoutDirty || contentChanged || scrollToChanged || scrollOffsetChanged) {
      markLayoutAncestorDirty(instance);
      markSubtreeDirty(instance);
    }
  },
  commitTextUpdate(textInstance, _oldText, newText) {
    textInstance.textContent = newText;
    textInstance.props = { children: newText };
    textInstance.contentDirty = true;
    textInstance.stylePropsDirty = true;
    markLayoutAncestorDirty(textInstance);
    markSubtreeDirty(textInstance);
  },
  finalizeInitialChildren() {
    return false;
  },
  prepareForCommit() {
    return null;
  },
  resetAfterCommit(container) {
    container.onRender();
  },
  getPublicInstance(instance) {
    return instance;
  },
  shouldSetTextContent() {
    return false;
  },
  clearContainer(container) {
    for (const child of container.root.children) {
      onNodeRemovedCallback?.(child);
    }
    for (const child of container.root.children) {
      if (container.root.layoutNode && child.layoutNode) {
        container.root.layoutNode.removeChild(child.layoutNode);
        child.layoutNode.free();
      }
    }
    container.root.children = [];
    container.root.childrenDirty = true;
    container.root.contentDirty = true;
    container.root.layoutDirty = true;
    container.root.layoutNode?.markDirty();
    markSubtreeDirty(container.root);
  },
  preparePortalMount() {},
  getCurrentEventPriority() {
    if (currentUpdatePriority !== import_constants5.NoEventPriority) {
      return currentUpdatePriority;
    }
    return import_constants5.DefaultEventPriority;
  },
  getInstanceFromNode() {
    return null;
  },
  beforeActiveInstanceBlur() {},
  afterActiveInstanceBlur() {},
  prepareScopeUpdate() {},
  getInstanceFromScope() {
    return null;
  },
  detachDeletedInstance() {},
  setCurrentUpdatePriority(newPriority) {
    currentUpdatePriority = newPriority;
  },
  getCurrentUpdatePriority() {
    return currentUpdatePriority;
  },
  resolveUpdatePriority() {
    if (currentUpdatePriority !== import_constants5.NoEventPriority) {
      return currentUpdatePriority;
    }
    return import_constants5.DefaultEventPriority;
  },
  maySuspendCommit() {
    return false;
  },
  NotPendingTransition: null,
  HostTransitionContext: import_react.createContext(null),
  resetFormInstance() {},
  requestPostPaintCallback() {},
  shouldAttemptEagerTransition() {
    return false;
  },
  trackSchedulerEvent() {},
  resolveEventType() {
    return null;
  },
  resolveEventTimeStamp() {
    return -1.1;
  },
  preloadInstance() {
    return true;
  },
  startSuspendingCommit() {},
  suspendInstance() {},
  waitForCommitToBeReady() {
    return null;
  },
  hideInstance(instance) {
    instance.hidden = true;
    instance.contentDirty = true;
    instance.stylePropsDirty = true;
    instance.layoutDirty = true;
    if (instance.layoutNode) {
      instance.layoutNode.markDirty();
    }
    if (instance.parent) {
      instance.parent.contentDirty = true;
    }
    markLayoutAncestorDirty(instance);
    markSubtreeDirty(instance);
  },
  unhideInstance(instance, _props) {
    instance.hidden = false;
    instance.contentDirty = true;
    instance.stylePropsDirty = true;
    instance.layoutDirty = true;
    if (instance.layoutNode) {
      instance.layoutNode.markDirty();
    }
    if (instance.parent) {
      instance.parent.contentDirty = true;
    }
    markLayoutAncestorDirty(instance);
    markSubtreeDirty(instance);
  },
  hideTextInstance(textInstance) {
    textInstance.hidden = true;
    textInstance.contentDirty = true;
    textInstance.stylePropsDirty = true;
    if (textInstance.parent) {
      textInstance.parent.contentDirty = true;
    }
    markLayoutAncestorDirty(textInstance);
    markSubtreeDirty(textInstance);
  },
  unhideTextInstance(textInstance, _text) {
    textInstance.hidden = false;
    textInstance.contentDirty = true;
    textInstance.stylePropsDirty = true;
    if (textInstance.parent) {
      textInstance.parent.contentDirty = true;
    }
    markLayoutAncestorDirty(textInstance);
    markSubtreeDirty(textInstance);
  }
};

// packages/ag-react/src/reconciler/index.ts
var reconciler = import_react_reconciler.default(hostConfig);
function createContainer(onRender) {
  const root = createRootNode();
  return { root, onRender };
}
function createFiberRoot(container) {
  return reconciler.createContainer(container, 1, null, false, null, "", () => {}, () => {}, () => {}, null);
}
function getContainerRoot(container) {
  return container.root;
}

// packages/ag-term/src/browser-renderer.ts
var initialized = false;
function initBrowserRenderer(factory, config) {
  if (initialized)
    return;
  setLayoutEngine(createFlexilyZeroEngine());
  setRenderAdapter(factory.createAdapter(config));
  initialized = true;
}
function createBrowserRenderer(element, width, height, onRender, onUnmount) {
  const container = createContainer(() => {
    scheduleRender();
  });
  const root = getContainerRoot(container);
  const fiberRoot = createFiberRoot(container);
  let currentBuffer = null;
  let currentElement = element;
  let renderScheduled = false;
  function scheduleRender() {
    if (renderScheduled)
      return;
    renderScheduled = true;
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => {
        renderScheduled = false;
        doRender();
      });
    } else {
      setTimeout(() => {
        renderScheduled = false;
        doRender();
      }, 0);
    }
  }
  function doRender() {
    reconciler.updateContainerSync(currentElement, fiberRoot, null, null);
    reconciler.flushSyncWork();
    const prevBuffer = currentBuffer;
    const result = executeRenderAdapter(root, width, height, prevBuffer);
    currentBuffer = result.buffer;
    onRender(currentBuffer);
  }
  doRender();
  const unmount = () => {
    reconciler.updateContainer(null, fiberRoot, null, () => {});
    onUnmount?.();
  };
  return {
    rerender(newElement) {
      currentElement = newElement;
      scheduleRender();
    },
    unmount,
    [Symbol.dispose]: unmount,
    getBuffer() {
      return currentBuffer;
    },
    refresh() {
      scheduleRender();
    }
  };
}

// packages/ag-react/src/components/Box.tsx
var import_react3 = __toESM(require_react(), 1);

// packages/ag-react/src/context.ts
var import_react2 = __toESM(require_react(), 1);
var TermContext = import_react2.createContext(null);
var NodeContext = import_react2.createContext(null);
var StdoutContext = import_react2.createContext(null);
var StderrContext = import_react2.createContext(null);
var RuntimeContext = import_react2.createContext(null);
var FocusManagerContext = import_react2.createContext(null);

// packages/ag-react/src/components/Box.tsx
var jsx_runtime = __toESM(require_jsx_runtime(), 1);
var Box = import_react3.forwardRef(function Box2(props, ref) {
  const { children, onLayout, ...restProps } = props;
  const nodeRef = import_react3.useRef(null);
  const [node, setNode] = import_react3.useState(null);
  const lastReportedLayout = import_react3.useRef(null);
  import_react3.useLayoutEffect(() => {
    if (nodeRef.current) {
      setNode(nodeRef.current);
    }
  }, []);
  import_react3.useLayoutEffect(() => {
    if (!onLayout || !node)
      return;
    const handleLayoutChange = () => {
      const layout = node.contentRect;
      if (!layout)
        return;
      const last = lastReportedLayout.current;
      if (!last || last.x !== layout.x || last.y !== layout.y || last.width !== layout.width || last.height !== layout.height) {
        lastReportedLayout.current = layout;
        onLayout(layout);
      }
    };
    node.layoutSubscribers.add(handleLayoutChange);
    if (node.contentRect) {
      handleLayoutChange();
    }
    return () => {
      node.layoutSubscribers.delete(handleLayoutChange);
    };
  }, [node, onLayout]);
  import_react3.useImperativeHandle(ref, () => ({
    getNode: () => nodeRef.current,
    getContentRect: () => nodeRef.current?.contentRect ?? null,
    getScreenRect: () => nodeRef.current?.screenRect ?? null
  }), []);
  return /* @__PURE__ */ jsx_runtime.jsx("silvery-box", {
    ref: nodeRef,
    ...restProps,
    children: /* @__PURE__ */ jsx_runtime.jsx(NodeContext.Provider, {
      value: node,
      children
    })
  });
});
// packages/ag-react/src/components/Text.tsx
var import_react4 = __toESM(require_react(), 1);
var jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
var Text = import_react4.forwardRef(function Text2(props, ref) {
  const { children, ...styleProps } = props;
  return /* @__PURE__ */ jsx_runtime2.jsx("silvery-text", {
    ref: (node) => {
      if (typeof ref === "function") {
        ref(node ? { getNode: () => node } : null);
      } else if (ref) {
        ref.current = node ? { getNode: () => node } : null;
      }
    },
    ...styleProps,
    children
  });
});
// packages/ag-react/src/hooks/useLayout.ts
var import_react5 = __toESM(require_react(), 1);
function getInnerRect(node) {
  const rect = node.contentRect;
  if (!rect)
    return { x: 0, y: 0, width: 0, height: 0 };
  const props = node.props;
  if (!props || node.type === "silvery-text")
    return rect;
  const pTop = props.paddingTop ?? props.paddingY ?? props.padding ?? 0;
  const pBottom = props.paddingBottom ?? props.paddingY ?? props.padding ?? 0;
  const pLeft = props.paddingLeft ?? props.paddingX ?? props.padding ?? 0;
  const pRight = props.paddingRight ?? props.paddingX ?? props.padding ?? 0;
  let bTop = 0;
  let bBottom = 0;
  let bLeft = 0;
  let bRight = 0;
  if (props.borderStyle) {
    bTop = props.borderTop !== false ? 1 : 0;
    bBottom = props.borderBottom !== false ? 1 : 0;
    bLeft = props.borderLeft !== false ? 1 : 0;
    bRight = props.borderRight !== false ? 1 : 0;
  }
  return {
    x: rect.x + pLeft + bLeft,
    y: rect.y + pTop + bTop,
    width: Math.max(0, rect.width - pLeft - pRight - bLeft - bRight),
    height: Math.max(0, rect.height - pTop - pBottom - bTop - bBottom)
  };
}
function useContentRect() {
  const node = import_react5.useContext(NodeContext);
  const [, forceUpdate] = import_react5.useReducer((x) => x + 1, 0);
  import_react5.useLayoutEffect(() => {
    if (!node)
      return;
    const handleLayoutComplete = () => {
      if (!rectEqual(node.prevLayout, node.contentRect)) {
        forceUpdate();
      }
    };
    node.layoutSubscribers.add(handleLayoutComplete);
    return () => {
      node.layoutSubscribers.delete(handleLayoutComplete);
    };
  }, [node]);
  if (!node)
    return { x: 0, y: 0, width: 0, height: 0 };
  return getInnerRect(node);
}
// packages/ag-react/src/hooks/useApp.ts
var import_react6 = __toESM(require_react(), 1);

// packages/ag-react/src/ui/canvas/index.ts
var canvasAdapterFactory = {
  createAdapter: (config) => createCanvasAdapter(config)
};
function initCanvasRenderer(config = {}) {
  initBrowserRenderer(canvasAdapterFactory, config);
}
function renderToCanvas(element, canvas, options = {}) {
  initCanvasRenderer(options);
  const pixelWidth = options.width ?? canvas.width;
  const pixelHeight = options.height ?? canvas.height;
  if (canvas.width !== pixelWidth)
    canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight)
    canvas.height = pixelHeight;
  const fontSize = options.fontSize ?? 14;
  const lineHeightMultiplier = options.lineHeight ?? 1.2;
  const charWidth = fontSize * 0.6;
  const lineHeight = fontSize * lineHeightMultiplier;
  const cols = Math.floor(pixelWidth / charWidth);
  const rows = Math.floor(pixelHeight / lineHeight);
  return createBrowserRenderer(element, cols, rows, (buffer) => {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(buffer.canvas, 0, 0);
    }
  });
}

// examples/web/canvas-app.tsx
var jsx_runtime3 = __toESM(require_jsx_runtime(), 1);
function SizeDisplay() {
  const { width, height } = useContentRect();
  return /* @__PURE__ */ jsx_runtime3.jsxs(Text, {
    color: "green",
    children: [
      "Size: ",
      Math.round(width),
      "px × ",
      Math.round(height),
      "px"
    ]
  });
}
function App() {
  return /* @__PURE__ */ jsx_runtime3.jsxs(Box, {
    flexDirection: "column",
    padding: 1,
    children: [
      /* @__PURE__ */ jsx_runtime3.jsx(Box, {
        borderStyle: "single",
        borderColor: "cyan",
        padding: 1,
        children: /* @__PURE__ */ jsx_runtime3.jsxs(Box, {
          flexDirection: "column",
          children: [
            /* @__PURE__ */ jsx_runtime3.jsx(Text, {
              bold: true,
              color: "cyan",
              children: "silvery Canvas Rendering"
            }),
            /* @__PURE__ */ jsx_runtime3.jsx(SizeDisplay, {})
          ]
        })
      }),
      /* @__PURE__ */ jsx_runtime3.jsx(Box, {
        marginTop: 1,
        borderStyle: "round",
        borderColor: "magenta",
        padding: 1,
        children: /* @__PURE__ */ jsx_runtime3.jsxs(Box, {
          flexDirection: "column",
          children: [
            /* @__PURE__ */ jsx_runtime3.jsx(Text, {
              color: "magenta",
              children: "Text Styles"
            }),
            /* @__PURE__ */ jsx_runtime3.jsxs(Box, {
              flexDirection: "row",
              gap: 2,
              children: [
                /* @__PURE__ */ jsx_runtime3.jsx(Text, {
                  children: "Normal"
                }),
                /* @__PURE__ */ jsx_runtime3.jsx(Text, {
                  bold: true,
                  children: "Bold"
                }),
                /* @__PURE__ */ jsx_runtime3.jsx(Text, {
                  italic: true,
                  children: "Italic"
                })
              ]
            }),
            /* @__PURE__ */ jsx_runtime3.jsxs(Box, {
              flexDirection: "row",
              gap: 2,
              children: [
                /* @__PURE__ */ jsx_runtime3.jsx(Text, {
                  underline: true,
                  children: "Underline"
                }),
                /* @__PURE__ */ jsx_runtime3.jsx(Text, {
                  strikethrough: true,
                  children: "Strike"
                }),
                /* @__PURE__ */ jsx_runtime3.jsx(Text, {
                  underlineStyle: "curly",
                  underlineColor: "red",
                  children: "Curly"
                })
              ]
            })
          ]
        })
      }),
      /* @__PURE__ */ jsx_runtime3.jsxs(Box, {
        marginTop: 1,
        flexDirection: "row",
        gap: 1,
        children: [
          /* @__PURE__ */ jsx_runtime3.jsx(Box, {
            backgroundColor: "red",
            padding: 1,
            children: /* @__PURE__ */ jsx_runtime3.jsx(Text, {
              color: "white",
              children: "Red"
            })
          }),
          /* @__PURE__ */ jsx_runtime3.jsx(Box, {
            backgroundColor: "green",
            padding: 1,
            children: /* @__PURE__ */ jsx_runtime3.jsx(Text, {
              color: "black",
              children: "Green"
            })
          }),
          /* @__PURE__ */ jsx_runtime3.jsx(Box, {
            backgroundColor: "blue",
            padding: 1,
            children: /* @__PURE__ */ jsx_runtime3.jsx(Text, {
              color: "white",
              children: "Blue"
            })
          })
        ]
      }),
      /* @__PURE__ */ jsx_runtime3.jsx(Box, {
        marginTop: 1,
        children: /* @__PURE__ */ jsx_runtime3.jsx(Text, {
          dim: true,
          children: "Layout by Flexx, rendered to OffscreenCanvas, drawn to visible canvas"
        })
      })
    ]
  });
}
var canvas = document.getElementById("canvas");
if (canvas) {
  const instance = renderToCanvas(/* @__PURE__ */ jsx_runtime3.jsx(App, {}), canvas, {
    fontSize: 14,
    fontFamily: "monospace"
  });
  window.silveryInstance = instance;
}

//# debugId=938038C8A3919F3964756E2164756E21
