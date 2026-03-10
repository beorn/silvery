/**
 * Chalk compat test: instance (from chalk/test/instance.js)
 */
import { test, expect } from "vitest";
import chalk, { Chalk } from "../../../packages/compat/src/chalk";

chalk.level = 1;

test("create an isolated context where colors can be disabled (by level)", () => {
  const instance = new Chalk({ level: 0 });
  expect(instance.red("foo")).toBe("foo");
  expect(chalk.red("foo")).toBe("\u001B[31mfoo\u001B[39m");
  instance.level = 2;
  expect(instance.red("foo")).toBe("\u001B[31mfoo\u001B[39m");
});

test("the `level` option should be a number from 0 to 3", () => {
  expect(() => {
    new Chalk({ level: 10 as any });
  }).toThrow(/should be an integer from 0 to 3/);

  expect(() => {
    new Chalk({ level: -1 as any });
  }).toThrow(/should be an integer from 0 to 3/);
});
