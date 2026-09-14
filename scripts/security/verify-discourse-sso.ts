import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  createDiscourseConnectResponse,
  getDiscourseSsoLoginUrl,
  getDiscourseSsoStartUrl,
  verifyAndParseDiscourseConnectRequest,
} from "../../src/lib/discourseConnect";

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function main() {
  const previousSecret = process.env.DISCOURSE_SSO_SECRET;
  const previousForumUrl = process.env.DISCOURSE_FORUM_URL;
  const secret = "discourse-sso-test-secret-that-is-at-least-32-bytes";

  process.env.DISCOURSE_SSO_SECRET = secret;
  process.env.DISCOURSE_FORUM_URL = "https://forum.example.test/";

  try {
    const returnSsoUrl = "https://forum.example.test/session/sso_login";
    const requestSso = Buffer.from(
      new URLSearchParams({ nonce: "nonce-123", return_sso_url: returnSsoUrl }).toString(),
      "utf8",
    ).toString("base64");
    const requestSignature = sign(requestSso, secret);

    assert.deepEqual(
      verifyAndParseDiscourseConnectRequest(requestSso, requestSignature),
      { nonce: "nonce-123", returnSsoUrl },
    );
    assert.throws(
      () => verifyAndParseDiscourseConnectRequest(requestSso, "0".repeat(64)),
      /Invalid DiscourseConnect signature/,
    );

    const response = createDiscourseConnectResponse("nonce-123", {
      email: "member@example.test",
      externalId: "user-123",
      username: "member",
      name: "SolarDream Member",
    });
    const responsePayload = new URLSearchParams(
      Buffer.from(response.sso, "base64").toString("utf8"),
    );

    assert.equal(responsePayload.get("nonce"), "nonce-123");
    assert.equal(responsePayload.get("email"), "member@example.test");
    assert.equal(responsePayload.get("external_id"), "user-123");
    assert.equal(response.sig, sign(response.sso, secret));
    assert.equal(getDiscourseSsoStartUrl().toString(), "https://forum.example.test/session/sso");
    assert.equal(
      getDiscourseSsoLoginUrl(returnSsoUrl, response.sso, response.sig).origin,
      "https://forum.example.test",
    );

    const untrustedReturnUrl = "https://attacker.example/session/sso_login";
    const untrustedSso = Buffer.from(
      new URLSearchParams({ nonce: "nonce-123", return_sso_url: untrustedReturnUrl }).toString(),
      "utf8",
    ).toString("base64");
    assert.throws(
      () => verifyAndParseDiscourseConnectRequest(untrustedSso, sign(untrustedSso, secret)),
      /Invalid DiscourseConnect return URL/,
    );
    assert.throws(
      () => getDiscourseSsoLoginUrl(untrustedReturnUrl, response.sso, response.sig),
      /Invalid DiscourseConnect return URL/,
    );
  } finally {
    restoreEnvironment("DISCOURSE_SSO_SECRET", previousSecret);
    restoreEnvironment("DISCOURSE_FORUM_URL", previousForumUrl);
  }

  process.stdout.write("DiscourseConnect signing and redirect validation passed.\n");
}

main();
