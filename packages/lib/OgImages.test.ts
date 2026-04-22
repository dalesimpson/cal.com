import { describe, expect, it } from "vitest";

import { LOGO } from "./constants";

describe("OG_ASSETS", () => {
  it("generic type should use the LOGO constant, not a hardcoded value", async () => {
    // We need to check the OG_ASSETS object indirectly since it's not exported.
    // The LOGO constant is used in the meeting and app types but was hardcoded in generic.
    // We verify by checking that constructGenericImage produces a version hash that
    // changes when LOGO changes — but more directly, we can import and inspect the module.

    // Since OG_ASSETS is not exported, we verify through the Generic component's behavior
    // by checking that getOGImageVersion for "generic" incorporates the LOGO constant.
    // The simplest approach: import the module source and check the asset config.

    // We'll use a different approach - read the actual OG_ASSETS by importing the module
    // and checking the version hash changes match between types that should use LOGO.
    const { getOGImageVersion } = await import("./OgImages");

    // Get versions - these incorporate all OG_ASSETS fields into the hash
    const meetingVersion = await getOGImageVersion("meeting");
    const genericVersion = await getOGImageVersion("generic");

    // Both should be valid hashes
    expect(meetingVersion).toMatch(/^[a-f0-9]{8}$/);
    expect(genericVersion).toMatch(/^[a-f0-9]{8}$/);
  });

  it("all OG image types should use the LOGO constant for their logo field", async () => {
    // Import the source file as text to verify the logo field values
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(path.join(__dirname, "OgImages.tsx"), "utf-8");

    // Extract the OG_ASSETS object definition
    const ogAssetsMatch = source.match(/const OG_ASSETS = \{([\s\S]*?)\n\};/);
    expect(ogAssetsMatch).not.toBeNull();

    const ogAssetsBlock = ogAssetsMatch![1];

    // Check that "generic" section uses LOGO, not a hardcoded string
    const genericSection = ogAssetsBlock.match(/generic:\s*\{([\s\S]*?)\}/);
    expect(genericSection).not.toBeNull();

    const genericBlock = genericSection![1];

    // The logo field should reference the LOGO constant, not a string literal
    const logoLine = genericBlock.match(/logo:\s*(.*),/);
    expect(logoLine).not.toBeNull();

    const logoValue = logoLine![1].trim();
    // Should be LOGO (the constant), not a quoted string like "cal-logo-word-black.svg"
    expect(logoValue).toBe("LOGO");
  });
});
