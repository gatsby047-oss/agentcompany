import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:3001";

async function openDashboard(page: Page) {
  await page.goto(BASE_URL);
  await page.getByRole("button", { name: "English" }).click();
}

async function registerUser(
  page: Page,
  input: { email: string; password: string; displayName: string }
) {
  await openDashboard(page);
  await page.getByRole("button", { name: "Register" }).click();
  await page.fill('input[type="email"]', input.email);
  await page.fill('input[type="password"]', input.password);
  await page.fill('input[placeholder="Founder"]', input.displayName);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(input.displayName, { exact: true })).toBeVisible({
    timeout: 10000
  });
}

async function loginUser(
  page: Page,
  input: { email: string; password: string; displayName?: string }
) {
  await openDashboard(page);
  await page.fill('input[type="email"]', input.email);
  await page.fill('input[type="password"]', input.password);
  await page.locator(".auth-actions").getByRole("button", { name: "Login" }).click();

  if (input.displayName) {
    await expect(page.getByText(input.displayName, { exact: true })).toBeVisible({
      timeout: 10000
    });
  }
}

async function createCompany(page: Page, companyName: string) {
  await page.waitForSelector('input[placeholder="My Awesome Company"]', { state: "visible" });
  await page.fill('input[placeholder="My Awesome Company"]', companyName);
  await page.getByRole("button", { name: "Create Company" }).click();
}

async function createProject(page: Page, companyName: string, projectName: string) {
  await page.waitForSelector('input[placeholder="My Awesome Project"]', { state: "visible" });
  await page.getByRole("combobox", { name: "Company" }).selectOption({ label: companyName });
  await page.fill('input[placeholder="My Awesome Project"]', projectName);
  await page.getByRole("button", { name: "Create Project" }).click();
}

async function createAdditionalProject(
  page: Page,
  input: { companyName: string; projectName: string }
) {
  await page.getByRole("button", { name: "+ New Project" }).click();
  await page.waitForSelector('input[placeholder="My Awesome Project"]', { state: "visible" });
  await page.getByRole("combobox", { name: "Company" }).selectOption({
    label: input.companyName
  });
  await page.fill('input[placeholder="My Awesome Project"]', input.projectName);
  await page.getByRole("button", { name: "Create Project" }).click();
}

function projectButton(page: Page, projectName: string) {
  return page.getByRole("button", { name: new RegExp(`^${projectName}\\b`) }).first();
}

async function selectProject(page: Page, projectName: string) {
  const button = projectButton(page, projectName);
  await expect(button).toBeVisible({ timeout: 10000 });
  await button.click();
  await page.waitForTimeout(1000);
}

async function createWorkflow(page: Page, nodeTitle: string) {
  await page.getByRole("button", { name: "+ New Workflow" }).click();
  await page.waitForSelector('input[placeholder="Node Title"]', { state: "visible" });
  await page.fill('input[placeholder="Node Title"]', nodeTitle);
  await page.getByRole("button", { name: "Save Workflow" }).click();
  await page.waitForTimeout(1000);
}

test.describe("Authentication", () => {
  test("should display login/register forms", async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByRole("button", { name: "Login" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Register" }).first()).toBeVisible();
  });

  test("should register new user and auto-login", async ({ page }) => {
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = "testpassword123";

    await registerUser(page, {
      email: testEmail,
      password: testPassword,
      displayName: "Test User"
    });
  });

  test("should login existing user", async ({ page }) => {
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = "testpassword123";

    await registerUser(page, {
      email: testEmail,
      password: testPassword,
      displayName: "Test User"
    });

    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page.getByRole("button", { name: "Login" })).toBeVisible({
      timeout: 10000
    });

    await loginUser(page, {
      email: testEmail,
      password: testPassword,
      displayName: "Test User"
    });
  });
});

test.describe("Company Management", () => {
  test("should create a company", async ({ page }) => {
    const testEmail = `company-test-${Date.now()}@example.com`;
    const testPassword = "testpassword123";
    const companyName = "E2E Test Company";

    await registerUser(page, {
      email: testEmail,
      password: testPassword,
      displayName: "Test Founder"
    });

    await createCompany(page, companyName);

    await expect(page.getByRole("combobox", { name: "Company" })).toBeVisible({
      timeout: 10000
    });
    await expect(page.locator('option').filter({ hasText: companyName })).toHaveCount(1, {
      timeout: 10000
    });
  });
});

test.describe("Project Management", () => {
  test("should create a project under a company", async ({ page }) => {
    const testEmail = `project-test-${Date.now()}@example.com`;
    const testPassword = "testpassword123";
    const companyName = "Project Test Company";
    const projectName = "Project Test Project";

    await registerUser(page, {
      email: testEmail,
      password: testPassword,
      displayName: "Test Founder"
    });

    await createCompany(page, companyName);
    await createProject(page, companyName, projectName);

    await expect(projectButton(page, projectName)).toBeVisible({ timeout: 10000 });
  });

  test("should switch between projects", async ({ page }) => {
    const testEmail = `switch-test-${Date.now()}@example.com`;
    const testPassword = "testpassword123";
    const companyName = "Switch Test Company";
    const firstProjectName = "Project A";
    const secondProjectName = "Project B";

    await registerUser(page, {
      email: testEmail,
      password: testPassword,
      displayName: "Test Founder"
    });

    await createCompany(page, companyName);
    await createProject(page, companyName, firstProjectName);
    await createAdditionalProject(page, {
      companyName,
      projectName: secondProjectName
    });

    await selectProject(page, secondProjectName);
    await expect(projectButton(page, secondProjectName)).toBeVisible();

    await selectProject(page, firstProjectName);
    await expect(projectButton(page, firstProjectName)).toBeVisible();
  });
});

test.describe("Workflow Management", () => {
  test("should create a workflow with nodes", async ({ page }) => {
    const testEmail = `workflow-test-${Date.now()}@example.com`;
    const testPassword = "testpassword123";
    const companyName = "Workflow Test Company";
    const projectName = "Workflow Test Project";

    await registerUser(page, {
      email: testEmail,
      password: testPassword,
      displayName: "Test Founder"
    });

    await createCompany(page, companyName);
    await createProject(page, companyName, projectName);
    await selectProject(page, projectName);

    await createWorkflow(page, "First Task");

    await expect(page.getByText("First Task", { exact: true })).toBeVisible();
  });

  test("should prevent circular dependency in workflow", async ({ page }) => {
    const testEmail = `dag-test-${Date.now()}@example.com`;
    const testPassword = "testpassword123";
    const companyName = "DAG Test Company";
    const projectName = "DAG Test Project";

    await registerUser(page, {
      email: testEmail,
      password: testPassword,
      displayName: "Test Founder"
    });

    await createCompany(page, companyName);
    await createProject(page, companyName, projectName);
    await selectProject(page, projectName);

    await page.getByRole("button", { name: "+ New Workflow" }).click();
    await page.waitForSelector('input[placeholder="Node Title"]', { state: "visible" });

    await page.getByRole("button", { name: "+ Add Node" }).click();
    const nodeTitleInputs = page.locator('input[placeholder="Node Title"]');
    await expect(nodeTitleInputs).toHaveCount(2);
    await nodeTitleInputs.nth(1).fill("Second Task");

    await page.getByRole("button", { name: "+ Add Edge" }).click();
    const edgeSelects = page.locator(".workflow-edge-edit select");
    await edgeSelects.nth(0).selectOption({ label: "Start (start)" });
    await edgeSelects.nth(1).selectOption({ label: "Start (start)" });

    await expect(page.getByText("Self-loop detected. Edges cannot connect a node to itself."))
      .toBeVisible();
  });
});

test.describe("SSE Connection", () => {
  test("should establish SSE connection after project selection", async ({ page }) => {
    const testEmail = `sse-test-${Date.now()}@example.com`;
    const testPassword = "testpassword123";
    const companyName = "SSE Company";
    const projectName = "SSE Project";

    await registerUser(page, {
      email: testEmail,
      password: testPassword,
      displayName: "SSE Tester"
    });

    await createCompany(page, companyName);
    await createProject(page, companyName, projectName);

    await expect(page.locator("header").getByText("SSE Live", { exact: true })).toBeVisible({
      timeout: 15000
    });
  });
});

test.describe("Live Dashboard", () => {
  test("should display dashboard overview stats", async ({ page }) => {
    const testEmail = `stats-test-${Date.now()}@example.com`;
    const testPassword = "testpassword123";

    await registerUser(page, {
      email: testEmail,
      password: testPassword,
      displayName: "Stats Tester"
    });

    await expect(page.getByText("Online agents", { exact: true })).toBeVisible();
    await expect(page.getByText("Running projects", { exact: true })).toBeVisible();
    await expect(page.getByText("Running tasks", { exact: true })).toBeVisible();
  });
});
