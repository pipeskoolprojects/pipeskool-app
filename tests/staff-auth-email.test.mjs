import test from "node:test";
import assert from "node:assert/strict";
import {
  idEmail,
  legacyIdEmail,
  legacyMobileEmail,
  signUpStaffAccount,
} from "../lib/staff-auth-email.mjs";

test("generates stable staff emails on the app apex domain", () => {
  assert.equal(idEmail({ id: 26 }), "staff-26@pipeskool.app");
  assert.equal(idEmail({ id: 26, auth_version: 3 }), "staff-26-v3@pipeskool.app");
});

test("keeps old synthetic addresses available for existing account sign-in", () => {
  assert.equal(legacyIdEmail({ id: 26 }), "staff-26@staff.pipeskool.app");
  assert.equal(legacyIdEmail({ id: 26, auth_version: 3 }), "staff-26-v3@staff.pipeskool.app");
  assert.equal(legacyMobileEmail(" 9825000000 "), "9825000000@staff.pipeskool.app");
});

test("first-time signup submits the generated email and password to Supabase Auth", async () => {
  const calls = [];
  const auth = { signUp: async credentials => {
    calls.push(credentials);
    return { data: { user: { id: "auth-user" } }, error: null };
  }};

  const result = await signUpStaffAccount(auth, { id: 26 }, "safe-password");

  assert.deepEqual(calls, [{ email: "staff-26@pipeskool.app", password: "safe-password" }]);
  assert.equal(result.email, "staff-26@pipeskool.app");
  assert.equal(result.data.user.id, "auth-user");
  assert.equal(result.error, null);
});

test("returns Supabase signup errors without suppressing them", async () => {
  const error = { code: "email_address_invalid" };
  const result = await signUpStaffAccount({ signUp: async () => ({ data: null, error }) }, { id: 26 }, "password");

  assert.equal(result.error, error);
});
