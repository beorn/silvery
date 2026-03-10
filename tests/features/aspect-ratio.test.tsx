import { describe, test, expect } from "vitest";
import { createRenderer } from "@silvery/test";
import { Box, Text } from "silvery";

describe("aspectRatio", () => {
  const render = createRenderer({ cols: 20, rows: 20 });

  test("aspectRatio=2 with height=3 computes width=6 (empty box)", () => {
    const app = render(
      <Box width={20} height={10}>
        <Box aspectRatio={2} height={3} alignSelf="flex-start" id="ar" />
      </Box>,
    );
    const box = app.locator("#ar").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(6);
    expect(box!.height).toBe(3);
  });

  test("aspectRatio=3 with height=2 computes width=6 (empty box)", () => {
    const app = render(
      <Box width={20} height={10}>
        <Box aspectRatio={3} height={2} alignSelf="flex-start" id="ar" />
      </Box>,
    );
    const box = app.locator("#ar").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(6);
    expect(box!.height).toBe(2);
  });

  test("aspectRatio=1 with height=4 computes width=4 (square)", () => {
    const app = render(
      <Box width={20} height={10}>
        <Box aspectRatio={1} height={4} alignSelf="flex-start" id="ar" />
      </Box>,
    );
    const box = app.locator("#ar").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(4);
    expect(box!.height).toBe(4);
  });

  test("aspectRatio with explicit width computes height", () => {
    const app = render(
      <Box width={20} height={10}>
        <Box aspectRatio={2} width={10} alignSelf="flex-start" id="ar" />
      </Box>,
    );
    const box = app.locator("#ar").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(10);
    expect(box!.height).toBe(5);
  });

  test("aspectRatio=0.5 with height=4 computes width=2", () => {
    const app = render(
      <Box width={20} height={10}>
        <Box aspectRatio={0.5} height={4} alignSelf="flex-start" id="ar" />
      </Box>,
    );
    const box = app.locator("#ar").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(2);
    expect(box!.height).toBe(4);
  });
});
