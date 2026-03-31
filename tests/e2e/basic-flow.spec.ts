import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:3001";

async function openDashboard(page: Page) {
  await page.goto(BASE_URL);
  await page.getByRole("button", { name: "English" }).click();
}

test.describe("Basic Flow E2E", () => {
  test("complete user journey: register -> create company -> create project -> create workflow -> run workflow", async ({
    page
  }) => {
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = "testpassword123";
    const companyName = "Test Company";
    const projectName = "Test Project";
    const workflowNodeTitle = "First Task";

    await openDashboard(page);

    await expect(page.getByText("Agent Company", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Register" }).click();
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.fill('input[placeholder="Founder"]', "Test User");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Test User", { exact: true })).toBeVisible({ timeout: 10000 });

    await page.waitForSelector('input[placeholder="My Awesome Company"]', { state: "visible" });
    await page.fill('input[placeholder="My Awesome Company"]', companyName);
    await page.getByRole("button", { name: "Create Company" }).click();

    await page.waitForSelector('input[placeholder="My Awesome Project"]', { state: "visible" });
    await page.getByRole("combobox", { name: "Company" }).selectOption({ label: companyName });
    await page.fill('input[placeholder="My Awesome Project"]', projectName);
    await page.getByRole("button", { name: "Create Project" }).click();

    const projectButton = page
      .getByRole("button", { name: new RegExp(`^${projectName}\\b`) })
      .first();
    await expect(projectButton).toBeVisible({ timeout: 10000 });

    await projectButton.click();
    await page.waitForTimeout(1000);

    await page.getByRole("button", { name: "+ New Workflow" }).click();
    await page.waitForSelector('input[placeholder="Node Title"]', { state: "visible" });

    await page.fill('input[placeholder="Node Title"]', workflowNodeTitle);

    await page.getByRole("button", { name: "Save Workflow" }).click();
    await page.waitForTimeout(1000);

    await expect(page.getByText(workflowNodeTitle, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Run Workflow/i }).click();
    await page.waitForTimeout(2000);

    await expect(page.getByRole("heading", { name: "First Task queued" })).toBeVisible({
      timeout: 5000
    });
  });

  test("SSE event reception", async ({ page }) => {
    const testEmail = `sse-test-${Date.now()}@example.com`;
    const testPassword = "testpassword123";

    await openDashboard(page);

    await page.getByRole("button", { name: "Register" }).click();
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.fill('input[placeholder="Founder"]', "SSE Tester");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("SSE Tester", { exact: true })).toBeVisible({ timeout: 10000 });

    await page.waitForSelector('input[placeholder="My Awesome Company"]', { state: "visible" });
    await page.fill('input[placeholder="My Awesome Company"]', "SSE Company");
    await page.getByRole("button", { name: "Create Company" }).click();

    await page.waitForSelector('input[placeholder="My Awesome Project"]', { state: "visible" });
    await page.getByRole("combobox", { name: "Company" }).selectOption({ label: "SSE Company" });
    await page.fill('input[placeholder="My Awesome Project"]', "SSE Project");
    await page.getByRole("button", { name: "Create Project" }).click();

    await page.waitForTimeout(2000);

    await expect(page.locator("header").getByText("SSE Live", { exact: true })).toBeVisible({
      timeout: 15000
    });
  });
});
