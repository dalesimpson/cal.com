import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeAll } from "vitest";

import type { SignupProps } from "./signup-view";

beforeAll(() => {
  process.env.NEXT_PUBLIC_WEBSITE_URL = "https://cal.com";
});

// Mock external dependencies before importing the component
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("next/script", () => ({
  default: () => null,
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn() },
}));

vi.mock("@dub/analytics/react", () => ({
  Analytics: () => null,
}));

vi.mock("@calcom/app-store/stripepayment/lib/client", () => ({
  default: vi.fn(),
}));

vi.mock("@calcom/app-store/stripepayment/lib/utils", () => ({
  getPremiumPlanPriceValue: vi.fn(() => "$9.99"),
}));

vi.mock("@calcom/features/auth/signup/lib/fetchSignup", () => ({
  fetchSignup: vi.fn(),
  isUserAlreadyExistsError: vi.fn(),
  hasCheckoutSession: vi.fn(),
}));

vi.mock("@calcom/features/auth/signup/utils/getOrgUsernameFromEmail", () => ({
  getOrgUsernameFromEmail: vi.fn(),
}));

vi.mock("@calcom/features/ee/organizations/lib/orgDomains", () => ({
  getOrgFullOrigin: vi.fn(() => "https://cal.com/"),
}));

vi.mock("@calcom/lib/components/ServerTrans", () => ({
  default: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@calcom/lib/constants", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    IS_CALCOM: false,
    CLOUDFLARE_SITE_ID: "",
  };
});

vi.mock("@calcom/lib/env", () => ({
  isENVDev: false,
}));

vi.mock("@calcom/lib/fetchUsername", () => ({
  fetchUsername: vi.fn(() => Promise.resolve({ data: { premium: false, available: true } })),
}));

vi.mock("@calcom/lib/gtm", () => ({
  pushGTMEvent: vi.fn(),
}));

vi.mock("@calcom/lib/hooks/useCompatSearchParams", () => ({
  useCompatSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("@calcom/lib/hooks/useDebounce", () => ({
  useDebounce: vi.fn((val: string) => val),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@calcom/lib/server/checkCfTurnstileToken", () => ({
  INVALID_CLOUDFLARE_TOKEN_ERROR: "invalid_cf_token",
}));

vi.mock("@calcom/lib/timezoneConstants", () => ({
  IS_EUROPE: false,
}));

vi.mock("sonner", () => ({
  Toaster: () => null,
}));

vi.mock("@calcom/ui/components/toast", () => ({
  showToast: vi.fn(),
}));

const defaultProps: SignupProps = {
  prepopulateFormValues: {
    username: "",
    email: "",
    password: "",
    language: "en",
    token: "",
  },
  token: "",
  orgSlug: "",
  isGoogleLoginEnabled: false,
  isSAMLLoginEnabled: false,
  orgAutoAcceptEmail: "",
  redirectUrl: null,
  emailVerificationEnabled: false,
  onboardingV3Enabled: false,
};

import { TooltipProvider } from "@radix-ui/react-tooltip";

// Import the component after all mocks are set up
import Signup from "./signup-view";

function renderSignupWithEmailForm(props: Partial<SignupProps> = {}) {
  const merged = { ...defaultProps, ...props, token: "test-token" };
  return render(
    <TooltipProvider>
      <Signup {...merged} />
    </TooltipProvider>
  );
}

describe("Signup email validation", () => {
  it("should NOT show 'Invalid email' error while typing before blur", async () => {
    const user = userEvent.setup();
    renderSignupWithEmailForm();

    const emailInput = screen.getByTestId("signup-emailfield");

    // Click into the field and type a single character
    await user.click(emailInput);
    await user.keyboard("j");

    // The error should NOT appear yet because the field hasn't been blurred
    const errorElements = screen.queryAllByTestId("field-error");
    const emailError = errorElements.find((el) => el.textContent?.includes("Invalid email"));
    expect(emailError).toBeUndefined();
  });

  it("should show 'Invalid email' error after blur with invalid email", async () => {
    const user = userEvent.setup();
    renderSignupWithEmailForm();

    const emailInput = screen.getByTestId("signup-emailfield");

    // Type an invalid email then blur
    await user.click(emailInput);
    await user.keyboard("notvalid");
    await user.tab(); // blur the field

    await waitFor(() => {
      const errorElements = screen.queryAllByTestId("field-error");
      const emailError = errorElements.find((el) => el.textContent?.includes("Invalid email"));
      expect(emailError).toBeDefined();
    });
  });

  it("should NOT show error after blur with a valid email", async () => {
    const user = userEvent.setup();
    renderSignupWithEmailForm();

    const emailInput = screen.getByTestId("signup-emailfield");

    // Type a valid email then blur
    await user.click(emailInput);
    await user.keyboard("user@example.com");
    await user.tab(); // blur the field

    await waitFor(() => {
      const errorElements = screen.queryAllByTestId("field-error");
      const emailError = errorElements.find((el) => el.textContent?.includes("Invalid email"));
      expect(emailError).toBeUndefined();
    });
  });
});
