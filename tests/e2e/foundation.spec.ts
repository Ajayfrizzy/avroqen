import { expect, test } from "@playwright/test";

test("foundation page is honest and usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Authority stays with the owner." }),
  ).toBeVisible();
  await expect(page.getByText("Payments are not enabled.")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
