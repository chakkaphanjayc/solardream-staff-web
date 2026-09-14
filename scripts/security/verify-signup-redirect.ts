import { buildSignupEmailRedirectTo } from "../../src/lib/authRedirect";

function assertEqual(actual: string, expected: string, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual:   ${actual}`);
  }
}

function main() {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://accounts.example.test/config-path";

  try {
    assertEqual(
      buildSignupEmailRedirectTo({
        locale: "en",
        nextPath: "/en/wizard/summary?draft=estimate-1",
      }),
      "https://accounts.example.test/en/auth/callback?next=%2Fen%2Fwizard%2Fsummary%3Fdraft%3Destimate-1",
      "A valid localized internal destination was not preserved.",
    );

    for (const nextPath of [
      "https://attacker.example/steal",
      "//attacker.example/steal",
      "%252F%252Fattacker.example%252Fsteal",
    ]) {
      assertEqual(
        buildSignupEmailRedirectTo({ locale: "en", nextPath }),
        "https://accounts.example.test/en/auth/callback?next=%2Fen",
        `An unsafe destination was accepted: ${nextPath}`,
      );
    }

    assertEqual(
      buildSignupEmailRedirectTo({
        locale: "https://attacker.example",
        nextPath: "/th/dashboard",
      }),
      "https://accounts.example.test/th/auth/callback?next=%2Fth%2Fdashboard",
      "An unsupported locale changed the callback route.",
    );
  } finally {
    if (previousSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    }
  }

  process.stdout.write("Signup confirmation redirect validation passed.\n");
}

main();
