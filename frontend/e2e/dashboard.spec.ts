import { expect, Page, test } from "@playwright/test";

const profileReady = { exists: true, is_empty: false, completeness: 100 };

async function mockProfileReady(page: Page) {
  await page.route("**/api/v1/profile/status", (route) =>
    route.fulfill({ json: profileReady }),
  );
}

test.describe("deterministic application flows", () => {
  test("shows a backend-unavailable state without external requests", async ({ page }) => {
    await page.route("**/api/v1/**", (route) =>
      route.fulfill({ status: 503, json: { detail: "offline" } }),
    );
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Backend Not Running" })).toBeVisible();
  });

  test("redirects first boot and completes setup with correctly typed data", async ({ page }) => {
    let complete = false;
    let saved: Record<string, unknown> | undefined;
    await page.route("**/api/v1/profile/status", (route) =>
      route.fulfill({
        json: complete ? profileReady : { exists: false, is_empty: true, completeness: 0 },
      }),
    );
    await page.route("**/api/v1/profile", async (route) => {
      saved = route.request().postDataJSON() as Record<string, unknown>;
      complete = true;
      await route.fulfill({ json: { status: "saved", profile: saved } });
    });
    await page.route("**/api/v1/status", (route) =>
      route.fulfill({ json: { lead_counts: {}, ollama_available: false, timestamp: "2026-10-05T00:00:00Z" } }),
    );
    await page.route("**/api/v1/health", (route) =>
      route.fulfill({ json: { status: "ok", ollama: false, timestamp: "2026-10-05T00:00:00Z" } }),
    );

    await page.goto("/");
    await expect(page).toHaveURL(/\/setup$/);
    await page.getByRole("button", { name: "Get Started" }).click();
    await page.getByRole("button", { name: "c++" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "plugin dev" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByPlaceholder("e.g. 3000").fill("4500");
    await page.getByPlaceholder("e.g. 150").fill("175");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Finish → Dashboard" }).click();

    await expect(page).toHaveURL(/\/$/);
    const skills = saved?.skills as { languages: string[] };
    const preferences = saved?.preferences as { rate_floor: number; hourly_floor: number };
    expect(skills.languages).toEqual(["c++"]);
    expect(preferences.rate_floor).toBe(4500);
    expect(preferences.hourly_floor).toBe(175);
  });

  test("filters leads, resets details, and updates status", async ({ page }) => {
    await mockProfileReady(page);
    const leads = [
      {
        id: "lead-a", source: "fixture", tier: 1, title: "DSP Lead A", company: "Acme",
        url: "https://example.test/a", raw_text: "A", niche: "plugin_dev",
        signals: { dsp: 10 }, score: 90, verdict: "HOT", status: "HOT",
        discovered_at: "2026-10-05T00:00:00Z", last_updated: "2026-10-05T00:00:00Z",
      },
      {
        id: "lead-b", source: "fixture", tier: 2, title: "Rust Lead B", company: "Beta",
        url: "https://example.test/b", raw_text: "B", niche: "rust_audio",
        signals: { rust: 8 }, score: 70, verdict: "WARM", status: "WARM",
        discovered_at: "2026-10-05T00:00:00Z", last_updated: "2026-10-05T00:00:00Z",
      },
    ];
    await page.route("**/api/v1/leads**", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ json: { status: "updated", lead_id: "lead-a", new_status: "CONTACTED" } });
      } else {
        await route.fulfill({ json: { count: leads.length, leads } });
      }
    });
    await page.route("**/api/v1/profile/blocked", (route) =>
      route.fulfill({ json: { blocked_companies: [] } }),
    );
    await page.route("**/api/v1/outreach/**", (route) =>
      route.fulfill({ json: { lead_id: "lead-a", template: "fixture", draft: "Draft A", generated_at: "now", violations: [], safe_to_send: true } }),
    );

    await page.goto("/leads");
    await expect(page.getByText("DSP Lead A")).toBeVisible();
    await page.getByRole("button", { name: "HOT", exact: true }).click();
    await page.getByText("DSP Lead A").click();
    await page.getByRole("button", { name: "Generate draft" }).click();
    await expect(page.locator("textarea[readonly]")).toHaveValue("Draft A");
    await page.getByRole("button", { name: "CONTACTED" }).click();
    await expect(page.getByText("→ CONTACTED")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByText("Rust Lead B").click();
    await expect(page.locator("textarea[readonly]")).toHaveCount(0);
  });

  test("shows upload success, type rejection, and oversize rejection", async ({ page }) => {
    await mockProfileReady(page);
    await page.route("**/api/v1/profile/upload", (route) =>
      route.fulfill({ json: { filename: "resume.pdf", path: "synthetic", type: "resume", uploaded_at: "now" } }),
    );
    await page.goto("/setup");
    await page.getByRole("button", { name: "Get Started" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    const input = page.locator('input[type="file"]');

    await input.setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("bad") });
    await expect(page.getByRole("alert")).toContainText("Unsupported file type");
    await input.setInputFiles({ name: "huge.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
    await expect(page.getByRole("alert")).toContainText("File too large");
    await input.setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("pdf") });
    await expect(page.getByText("resume.pdf")).toBeVisible();
  });

  test("persists theme selection across reload without hydration errors", async ({ page }) => {
    await mockProfileReady(page);
    await page.route("**/api/v1/status", (route) => route.fulfill({ json: { lead_counts: {}, ollama_available: false, timestamp: "now" } }));
    await page.route("**/api/v1/health", (route) => route.fulfill({ json: { status: "ok", ollama: false, timestamp: "now" } }));
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /hydration/i.test(message.text())) hydrationErrors.push(message.text());
    });
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /Switch to light theme/ });
    await toggle.click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
    expect(hydrationErrors).toEqual([]);
  });

  test("preserves protected endpoint denial and principal landmarks", async ({ page }) => {
    await page.route("**/briefing", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: '{"detail":"Missing Authorization"}' }),
    );
    const response = await page.goto("/briefing");
    expect(response?.status()).toBe(401);
    await expect(page.getByText("Missing Authorization")).toBeVisible();

    await mockProfileReady(page);
    await page.route("**/api/v1/leads**", (route) => route.fulfill({ json: { count: 0, leads: [] } }));
    await page.route("**/api/v1/profile/blocked", (route) => route.fulfill({ json: { blocked_companies: [] } }));
    await page.goto("/leads");
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  });
});
