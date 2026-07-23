import { describe, expect, it } from "vitest";
import { extractEmailsFromHtml } from "../src/contacts.js";

describe("contact extraction", () => {
  it("keeps public business emails only on contact-like pages", () => {
    const html = `
      <a href="mailto:hello@acme.example">hello@acme.example</a>
      <p>Jane.Doe@acme.example</p>
      <p>noreply@acme.example</p>
      <p>person@gmail.com</p>
    `;
    const contacts = extractEmailsFromHtml(
      html,
      "https://acme.example/contact",
      "acme.example",
    );

    expect(contacts.map((contact) => contact.email)).toEqual([
      "hello@acme.example",
      "jane.doe@acme.example",
    ]);
    expect(contacts.every((contact) => contact.email_source.endsWith("/contact"))).toBe(
      true,
    );
    expect(
      extractEmailsFromHtml(html, "https://acme.example/blog", "acme.example"),
    ).toEqual([]);
  });
});
