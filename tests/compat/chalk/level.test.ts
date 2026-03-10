/**
 * Chalk compat test: level (from chalk/test/level.js)
 * Skips tests that require `execa` (subprocess testing)
 */
import { test, expect } from "vitest";
import chalk from "../../../packages/compat/src/chalk";

chalk.level = 1;

test("don't output colors when manually disabled", () => {
  const oldLevel = chalk.level;
  chalk.level = 0;
  expect(chalk.red("foo")).toBe("foo");
  chalk.level = oldLevel;
});

test("enable/disable colors based on overall chalk .level property, not individual instances", () => {
  const oldLevel = chalk.level;
  chalk.level = 1;
  const { red } = chalk.red;
  expect(red.level).toBe(1);
  chalk.level = 0;
  expect(red.level).toBe(chalk.level);
  chalk.level = oldLevel;
});

test("propagate enable/disable changes from child colors", () => {
  const oldLevel = chalk.level;
  chalk.level = 1;
  const { red } = chalk;
  expect(red.level).toBe(1);
  expect(chalk.level).toBe(1);
  red.level = 0;
  expect(red.level).toBe(0);
  expect(chalk.level).toBe(0);
  chalk.level = 1;
  expect(red.level).toBe(1);
  expect(chalk.level).toBe(1);
  chalk.level = oldLevel;
});
