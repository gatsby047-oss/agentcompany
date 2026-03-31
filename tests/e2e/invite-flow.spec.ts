import { expect, test, type APIResponse, type Browser, type BrowserContext } from "@playwright/test";

type RegisterResponse = {
  data: {
    user: {
      email: string;
      displayName: string;
    };
  };
};

type CompanyCreateResponse = {
  data: {
    company: {
      id: string;
      name: string;
    };
  };
};

type InvitationCreateResponse = {
  data: {
    token: string;
  };
};

type DashboardOverviewResponse = {
  data: {
    user: {
      email: string;
      displayName: string;
    } | null;
    companies: Array<{
      id: string;
      name: string;
    }>;
  };
};

type InviteFixture = {
  companyName: string;
  inviteeEmail: string;
  token: string;
};

async function parseSuccessJson<T>(response: APIResponse): Promise<T> {
  const payload = (await response.json()) as T;
  expect(response.ok(), JSON.stringify(payload)).toBeTruthy();
  return payload;
}

async function registerUser(
  context: BrowserContext,
  input: { email: string; password: string; displayName: string }
) {
  const response = await context.request.post("/api/auth/register", {
    data: {
      ...input,
      locale: "zh-HK"
    }
  });

  return parseSuccessJson<RegisterResponse>(response);
}

async function createCompany(context: BrowserContext, name: string) {
  const response = await context.request.post("/api/companies", {
    data: {
      name
    }
  });

  return parseSuccessJson<CompanyCreateResponse>(response);
}

async function createInvitation(
  context: BrowserContext,
  input: { companyId: string; inviteeEmail: string }
) {
  const response = await context.request.post(`/api/companies/${input.companyId}/invitations`, {
    data: {
      inviteeEmail: input.inviteeEmail,
      role: "MEMBER",
      expiresInDays: 7
    }
  });

  return parseSuccessJson<InvitationCreateResponse>(response);
}

async function getDashboardOverview(context: BrowserContext) {
  const response = await context.request.get("/api/dashboard/overview");
  return parseSuccessJson<DashboardOverviewResponse>(response);
}

async function createInviteFixture(browser: Browser, baseURL: string, suffix: string) {
  const founderContext = await browser.newContext({ baseURL });

  try {
    const founderPassword = "testpassword123";
    const founderEmail = `founder-${suffix}@example.com`;
    const companyName = `Invite Company ${suffix}`;
    const inviteeEmail = `invitee-${suffix}@example.com`;

    await registerUser(founderContext, {
      email: founderEmail,
      password: founderPassword,
      displayName: `Founder ${suffix}`
    });

    const overview = await getDashboardOverview(founderContext);
    expect(overview.data.user?.email).toBe(founderEmail);

    const company = await createCompany(founderContext, companyName);
    const invitation = await createInvitation(founderContext, {
      companyId: company.data.company.id,
      inviteeEmail
    });

    return {
      companyName,
      inviteeEmail,
      token: invitation.data.token
    } satisfies InviteFixture;
  } finally {
    await founderContext.close();
  }
}

test.describe("Invite flow", () => {
  test("invited user can register from invite page and join the company", async ({
    browser,
    baseURL
  }) => {
    const resolvedBaseURL = baseURL ?? "http://127.0.0.1:3001";
    const suffix = `${Date.now()}-register`;
    const invite = await createInviteFixture(browser, resolvedBaseURL, suffix);
    const inviteContext = await browser.newContext({ baseURL: resolvedBaseURL });
    const inviteePassword = "testpassword123";
    const inviteeName = "Invited Register User";

    try {
      const page = await inviteContext.newPage();
      await page.goto(`/invite/${invite.token}`);

      await expect(page.getByRole("heading", { name: /been invited/i })).toBeVisible();
      await expect(page.getByText(invite.inviteeEmail)).toBeVisible();
      await expect(page.getByText(invite.companyName)).toBeVisible();

      await page.getByLabel("Display name").fill(inviteeName);
      await page.getByLabel("Password").fill(inviteePassword);
      await page.getByRole("button", { name: "Create account and join" }).click();

      await expect(page.getByRole("heading", { name: "Welcome!" })).toBeVisible({
        timeout: 15000
      });
      await expect(
        page.getByText(new RegExp(`joined ${invite.companyName}`, "i"))
      ).toBeVisible();

      const overview = await getDashboardOverview(inviteContext);
      expect(overview.data.user?.email).toBe(invite.inviteeEmail);
      expect(overview.data.companies.some((company) => company.name === invite.companyName)).toBe(
        true
      );
    } finally {
      await inviteContext.close();
    }
  });

  test("existing invited user can login from invite page and join the company", async ({
    browser,
    baseURL
  }) => {
    const resolvedBaseURL = baseURL ?? "http://127.0.0.1:3001";
    const suffix = `${Date.now()}-login`;
    const invite = await createInviteFixture(browser, resolvedBaseURL, suffix);
    const inviteePassword = "testpassword123";
    const userSetupContext = await browser.newContext({ baseURL: resolvedBaseURL });
    const inviteeContext = await browser.newContext({ baseURL: resolvedBaseURL });

    try {
      await registerUser(userSetupContext, {
        email: invite.inviteeEmail,
        password: inviteePassword,
        displayName: "Invited Login User"
      });

      const page = await inviteeContext.newPage();
      await page.goto(`/invite/${invite.token}`);

      await expect(page.getByRole("heading", { name: /been invited/i })).toBeVisible();
      await page.getByRole("button", { name: /^Login$/ }).click();
      await page.getByLabel("Password").fill(inviteePassword);
      await page.getByRole("button", { name: "Login and join" }).click();

      await expect(page.getByRole("heading", { name: "Welcome!" })).toBeVisible({
        timeout: 15000
      });

      const overview = await getDashboardOverview(inviteeContext);
      expect(overview.data.user?.email).toBe(invite.inviteeEmail);
      expect(overview.data.companies.some((company) => company.name === invite.companyName)).toBe(
        true
      );
    } finally {
      await userSetupContext.close();
      await inviteeContext.close();
    }
  });
});
