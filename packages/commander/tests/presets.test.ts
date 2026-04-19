import { describe, it, expect, expectTypeOf } from "vitest"
import {
  Command,
  int,
  uint,
  float,
  port,
  url,
  path,
  csv,
  json,
  bool,
  date,
  email,
  regex,
  intRange,
} from "../src/index.ts"
import type { CLIType, StandardSchemaV1 } from "../src/index.ts"

// ---------------------------------------------------------------------------
// All built-in types implement Standard Schema v1
// ---------------------------------------------------------------------------

describe("standard schema interface", () => {
  it("every type has ~standard with version 1", () => {
    for (const type of [int, uint, float, port, url, path, csv, json, bool, date, email, regex]) {
      expect(type["~standard"].version).toBe(1)
      expect(type["~standard"].vendor).toBe("@silvery/commander")
      expect(typeof type["~standard"].validate).toBe("function")
    }
  })

  it("factory-created types have ~standard with version 1", () => {
    const range = intRange(1, 10)
    expect(range["~standard"].version).toBe(1)
    expect(typeof range["~standard"].validate).toBe("function")
  })

  it("types satisfy StandardSchemaV1 type", () => {
    expectTypeOf(int).toMatchTypeOf<StandardSchemaV1<number>>()
    expectTypeOf(uint).toMatchTypeOf<StandardSchemaV1<number>>()
    expectTypeOf(float).toMatchTypeOf<StandardSchemaV1<number>>()
    expectTypeOf(port).toMatchTypeOf<StandardSchemaV1<number>>()
    expectTypeOf(url).toMatchTypeOf<StandardSchemaV1<string>>()
    expectTypeOf(path).toMatchTypeOf<StandardSchemaV1<string>>()
    expectTypeOf(csv).toMatchTypeOf<StandardSchemaV1<string[]>>()
    expectTypeOf(json).toMatchTypeOf<StandardSchemaV1<unknown>>()
    expectTypeOf(bool).toMatchTypeOf<StandardSchemaV1<boolean>>()
    expectTypeOf(date).toMatchTypeOf<StandardSchemaV1<Date>>()
    expectTypeOf(email).toMatchTypeOf<StandardSchemaV1<string>>()
    expectTypeOf(regex).toMatchTypeOf<StandardSchemaV1<RegExp>>()
  })

  it("factory types satisfy StandardSchemaV1 type", () => {
    const range = intRange(1, 10)
    expectTypeOf(range).toMatchTypeOf<StandardSchemaV1<number>>()
  })
})

// ---------------------------------------------------------------------------
// .parse() and .safeParse() standalone methods
// ---------------------------------------------------------------------------

describe("parse / safeParse", () => {
  it("parse returns valid value", () => {
    expect(int.parse("42")).toBe(42)
    expect(port.parse("8080")).toBe(8080)
    expect(bool.parse("true")).toBe(true)
  })

  it("parse throws on invalid value", () => {
    expect(() => int.parse("abc")).toThrow("Expected integer")
    expect(() => port.parse("0")).toThrow("Expected port")
    expect(() => bool.parse("maybe")).toThrow("Expected boolean")
  })

  it("safeParse returns success for valid value", () => {
    const result = port.safeParse("3000")
    expect(result.success).toBe(true)
    if (result.success) expect(result.value).toBe(3000)
  })

  it("safeParse returns failure for invalid value", () => {
    const result = port.safeParse("99999")
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues).toHaveLength(1)
      expect(result.issues![0]!.message).toContain("Expected port")
    }
  })

  it("safeParse does not throw", () => {
    expect(() => int.safeParse("not a number")).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Type: int
// ---------------------------------------------------------------------------

describe("int", () => {
  it("parses valid integers", () => {
    expect(int.parse("0")).toBe(0)
    expect(int.parse("42")).toBe(42)
    expect(int.parse("-7")).toBe(-7)
    expect(int.parse("1000000")).toBe(1000000)
  })

  it("rejects non-integers", () => {
    expect(() => int.parse("3.14")).toThrow('Expected integer, got "3.14"')
    expect(() => int.parse("abc")).toThrow('Expected integer, got "abc"')
    expect(() => int.parse("")).toThrow('Expected integer, got ""')
  })

  it("rejects Infinity and NaN strings", () => {
    expect(() => int.parse("Infinity")).toThrow("Expected integer")
    expect(() => int.parse("NaN")).toThrow("Expected integer")
  })
})

// ---------------------------------------------------------------------------
// Type: uint
// ---------------------------------------------------------------------------

describe("uint", () => {
  it("parses valid unsigned integers", () => {
    expect(uint.parse("0")).toBe(0)
    expect(uint.parse("1")).toBe(1)
    expect(uint.parse("999")).toBe(999)
  })

  it("rejects negative integers", () => {
    expect(() => uint.parse("-1")).toThrow('Expected unsigned integer (>= 0), got "-1"')
    expect(() => uint.parse("-100")).toThrow("Expected unsigned integer")
  })

  it("rejects non-integers", () => {
    expect(() => uint.parse("1.5")).toThrow("Expected unsigned integer")
    expect(() => uint.parse("abc")).toThrow("Expected unsigned integer")
  })
})

// ---------------------------------------------------------------------------
// Type: float
// ---------------------------------------------------------------------------

describe("float", () => {
  it("parses valid numbers", () => {
    expect(float.parse("3.14")).toBeCloseTo(3.14)
    expect(float.parse("0")).toBe(0)
    expect(float.parse("-2.5")).toBeCloseTo(-2.5)
    expect(float.parse("1e3")).toBe(1000)
  })

  it("accepts Infinity", () => {
    expect(float.parse("Infinity")).toBe(Infinity)
    expect(float.parse("-Infinity")).toBe(-Infinity)
  })

  it("rejects non-numeric strings", () => {
    expect(() => float.parse("abc")).toThrow('Expected number, got "abc"')
    expect(() => float.parse("")).toThrow('Expected number, got ""')
    expect(() => float.parse("NaN")).toThrow('Expected number, got "NaN"')
  })
})

// ---------------------------------------------------------------------------
// Type: port
// ---------------------------------------------------------------------------

describe("port", () => {
  it("parses valid ports", () => {
    expect(port.parse("1")).toBe(1)
    expect(port.parse("80")).toBe(80)
    expect(port.parse("443")).toBe(443)
    expect(port.parse("8080")).toBe(8080)
    expect(port.parse("65535")).toBe(65535)
  })

  it("rejects out-of-range ports", () => {
    expect(() => port.parse("0")).toThrow('Expected port (1-65535), got "0"')
    expect(() => port.parse("65536")).toThrow('Expected port (1-65535), got "65536"')
    expect(() => port.parse("-1")).toThrow("Expected port")
  })

  it("rejects non-integer ports", () => {
    expect(() => port.parse("80.5")).toThrow("Expected port")
    expect(() => port.parse("abc")).toThrow("Expected port")
  })
})

// ---------------------------------------------------------------------------
// Type: url
// ---------------------------------------------------------------------------

describe("url", () => {
  it("parses valid URLs", () => {
    expect(url.parse("https://example.com")).toBe("https://example.com")
    expect(url.parse("http://localhost:3000/path")).toBe("http://localhost:3000/path")
    expect(url.parse("ftp://files.example.com")).toBe("ftp://files.example.com")
  })

  it("rejects invalid URLs", () => {
    expect(() => url.parse("not-a-url")).toThrow('Expected valid URL, got "not-a-url"')
    expect(() => url.parse("")).toThrow('Expected valid URL, got ""')
    expect(() => url.parse("://missing-protocol")).toThrow("Expected valid URL")
  })
})

// ---------------------------------------------------------------------------
// Type: path
// ---------------------------------------------------------------------------

describe("path", () => {
  it("accepts non-empty strings", () => {
    expect(path.parse("/usr/local/bin")).toBe("/usr/local/bin")
    expect(path.parse("./relative")).toBe("./relative")
    expect(path.parse("file.txt")).toBe("file.txt")
  })

  it("coerces non-string values to string", () => {
    expect(path.parse(42)).toBe("42")
  })

  it("rejects empty after coercion", () => {
    expect(() => path.parse("")).toThrow("Expected non-empty path")
  })
})

// ---------------------------------------------------------------------------
// Type: csv
// ---------------------------------------------------------------------------

describe("csv", () => {
  it("splits comma-separated values", () => {
    expect(csv.parse("a,b,c")).toEqual(["a", "b", "c"])
    expect(csv.parse("one")).toEqual(["one"])
  })

  it("trims whitespace around values", () => {
    expect(csv.parse("a , b , c")).toEqual(["a", "b", "c"])
  })

  it("filters empty segments", () => {
    expect(csv.parse("a,,b,")).toEqual(["a", "b"])
    expect(csv.parse(",,,")).toEqual([])
    expect(csv.parse("")).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Type: json
// ---------------------------------------------------------------------------

describe("json", () => {
  it("parses valid JSON", () => {
    expect(json.parse('{"a":1}')).toEqual({ a: 1 })
    expect(json.parse("[1,2,3]")).toEqual([1, 2, 3])
    expect(json.parse('"hello"')).toBe("hello")
    expect(json.parse("42")).toBe(42)
    expect(json.parse("null")).toBe(null)
    expect(json.parse("true")).toBe(true)
  })

  it("rejects invalid JSON", () => {
    expect(() => json.parse("{bad}")).toThrow('Expected valid JSON, got "{bad}"')
    expect(() => json.parse("")).toThrow('Expected valid JSON, got ""')
    expect(() => json.parse("undefined")).toThrow("Expected valid JSON")
  })
})

// ---------------------------------------------------------------------------
// Type: bool
// ---------------------------------------------------------------------------

describe("bool", () => {
  it("parses truthy values", () => {
    expect(bool.parse("true")).toBe(true)
    expect(bool.parse("TRUE")).toBe(true)
    expect(bool.parse("True")).toBe(true)
    expect(bool.parse("1")).toBe(true)
    expect(bool.parse("yes")).toBe(true)
    expect(bool.parse("y")).toBe(true)
    expect(bool.parse("Y")).toBe(true)
  })

  it("parses falsy values", () => {
    expect(bool.parse("false")).toBe(false)
    expect(bool.parse("FALSE")).toBe(false)
    expect(bool.parse("0")).toBe(false)
    expect(bool.parse("no")).toBe(false)
    expect(bool.parse("n")).toBe(false)
    expect(bool.parse("N")).toBe(false)
  })

  it("rejects ambiguous values", () => {
    expect(() => bool.parse("maybe")).toThrow(
      'Expected boolean (true/false/yes/no/1/0), got "maybe"',
    )
    expect(() => bool.parse("")).toThrow("Expected boolean")
    expect(() => bool.parse("2")).toThrow("Expected boolean")
  })
})

// ---------------------------------------------------------------------------
// Type: date
// ---------------------------------------------------------------------------

describe("date", () => {
  it("parses valid date strings", () => {
    const d = date.parse("2024-01-15")
    expect(d).toBeInstanceOf(Date)
    expect(d.getFullYear()).toBe(2024)

    const d2 = date.parse("2024-01-15T10:30:00Z")
    expect(d2).toBeInstanceOf(Date)
  })

  it("parses common date formats", () => {
    expect(date.parse("January 1, 2024")).toBeInstanceOf(Date)
  })

  it("rejects invalid dates", () => {
    expect(() => date.parse("not-a-date")).toThrow('Expected valid date, got "not-a-date"')
    expect(() => date.parse("")).toThrow('Expected valid date, got ""')
  })
})

// ---------------------------------------------------------------------------
// Type: email
// ---------------------------------------------------------------------------

describe("email", () => {
  it("accepts valid-looking emails", () => {
    expect(email.parse("user@example.com")).toBe("user@example.com")
    expect(email.parse("a@b.c")).toBe("a@b.c")
    expect(email.parse("user+tag@domain.co.uk")).toBe("user+tag@domain.co.uk")
  })

  it("rejects strings without @ or .", () => {
    expect(() => email.parse("invalid")).toThrow('Expected email address, got "invalid"')
    expect(() => email.parse("user@")).toThrow("Expected email address")
    expect(() => email.parse("@domain")).toThrow("Expected email address")
    expect(() => email.parse("")).toThrow("Expected email address")
  })
})

// ---------------------------------------------------------------------------
// Type: regex
// ---------------------------------------------------------------------------

describe("regex", () => {
  it("parses valid regex patterns", () => {
    const r = regex.parse("^hello.*world$")
    expect(r).toBeInstanceOf(RegExp)
    expect(r.test("hello cruel world")).toBe(true)
  })

  it("parses simple patterns", () => {
    expect(regex.parse("\\d+")).toBeInstanceOf(RegExp)
    expect(regex.parse(".")).toBeInstanceOf(RegExp)
  })

  it("rejects invalid regex", () => {
    expect(() => regex.parse("[invalid")).toThrow('Expected valid regex, got "[invalid"')
    expect(() => regex.parse("(?P<bad")).toThrow("Expected valid regex")
  })
})

// ---------------------------------------------------------------------------
// Factory: intRange
// ---------------------------------------------------------------------------

describe("intRange", () => {
  it("accepts integers within range", () => {
    const r = intRange(1, 10)
    expect(r.parse("1")).toBe(1)
    expect(r.parse("5")).toBe(5)
    expect(r.parse("10")).toBe(10)
  })

  it("rejects integers outside range", () => {
    const r = intRange(1, 10)
    expect(() => r.parse("0")).toThrow('Expected integer 1-10, got "0"')
    expect(() => r.parse("11")).toThrow('Expected integer 1-10, got "11"')
    expect(() => r.parse("-5")).toThrow("Expected integer 1-10")
  })

  it("rejects non-integers", () => {
    const r = intRange(0, 100)
    expect(() => r.parse("5.5")).toThrow("Expected integer 0-100")
    expect(() => r.parse("abc")).toThrow("Expected integer 0-100")
  })

  it("works with different ranges", () => {
    const small = intRange(0, 1)
    expect(small.parse("0")).toBe(0)
    expect(small.parse("1")).toBe(1)
    expect(() => small.parse("2")).toThrow("Expected integer 0-1")

    const big = intRange(-1000, 1000)
    expect(big.parse("-1000")).toBe(-1000)
    expect(big.parse("1000")).toBe(1000)
  })

  it("implements Standard Schema v1", () => {
    const r = intRange(1, 10)
    expect(r["~standard"].version).toBe(1)
    const result = r["~standard"].validate("5")
    expect("value" in result && result.value).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// Commander integration -- built-in types as .option() schemas
// ---------------------------------------------------------------------------

describe("commander integration", () => {
  it("uses int type for option parsing", () => {
    const cli = new Command("test").option("-r, --retries <n>", "Retries", int)
    cli.parse(["node", "test", "--retries", "3"], { from: "node" })
    expect(cli.opts().retries).toBe(3)
  })

  it("uses port type for option parsing", () => {
    const cli = new Command("test").option("-p, --port <n>", "Port", port)
    cli.parse(["node", "test", "--port", "8080"], { from: "node" })
    expect(cli.opts().port).toBe(8080)
  })

  it("port type rejects invalid port via Commander", () => {
    const cli = new Command("test").option("-p, --port <n>", "Port", port)
    cli.exitOverride()
    cli.configureOutput({ writeErr: () => {} })
    expect(() => {
      cli.parse(["node", "test", "--port", "99999"], { from: "node" })
    }).toThrow()
  })

  it("uses csv type for option parsing", () => {
    const cli = new Command("test").option("--tags <t>", "Tags", csv)
    cli.parse(["node", "test", "--tags", "a,b,c"], { from: "node" })
    expect(cli.opts().tags).toEqual(["a", "b", "c"])
  })

  it("uses url type for option parsing", () => {
    const cli = new Command("test").option("--callback <url>", "Callback", url)
    cli.parse(["node", "test", "--callback", "https://example.com/hook"], { from: "node" })
    expect(cli.opts().callback).toBe("https://example.com/hook")
  })

  it("uses array as choices for option parsing", () => {
    const cli = new Command("test").option("-e, --env <e>", "Env", ["dev", "staging", "prod"])
    cli.parse(["node", "test", "--env", "dev"], { from: "node" })
    expect(cli.opts().env).toBe("dev")
  })

  it("array choices rejects invalid values via Commander", () => {
    const cli = new Command("test").option("-e, --env <e>", "Env", ["dev", "staging", "prod"])
    cli.exitOverride()
    cli.configureOutput({ writeErr: () => {} })
    expect(() => {
      cli.parse(["node", "test", "--env", "invalid"], { from: "node" })
    }).toThrow()
  })

  it("uses bool type for option parsing", () => {
    const cli = new Command("test").option("--flag <v>", "Flag", bool)
    cli.parse(["node", "test", "--flag", "yes"], { from: "node" })
    expect(cli.opts().flag).toBe(true)
  })

  it("uses json type for option parsing", () => {
    const cli = new Command("test").option("--config <json>", "Config", json)
    cli.parse(["node", "test", "--config", '{"key":"value"}'], { from: "node" })
    expect(cli.opts().config).toEqual({ key: "value" })
  })

  it("accumulates types with regular options and array choices", () => {
    const cli = new Command("test")
      .option("-v, --verbose", "Verbose")
      .option("-p, --port <n>", "Port", port)
      .option("--tags <t>", "Tags", csv)
      .option("-e, --env <e>", "Env", ["dev", "prod"])
    cli.parse(["node", "test", "--verbose", "--port", "3000", "--tags", "a,b", "--env", "dev"], {
      from: "node",
    })
    const opts = cli.opts()
    expect(opts.verbose).toBe(true)
    expect(opts.port).toBe(3000)
    expect(opts.tags).toEqual(["a", "b"])
    expect(opts.env).toBe("dev")
  })
})
