import prismock from "@calcom/testing/lib/__mocks__/prisma";

import {
  createBookingScenario,
  getScenarioData,
  getGoogleCalendarCredential,
  TestData,
  getOrganizer,
  mockSuccessfulVideoMeetingCreation,
  mockCalendarToHaveNoBusySlots,
  mockNoTranslations,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";

import { describe, it, expect, vi, beforeEach } from "vitest";

import { BookingStatus } from "@calcom/prisma/enums";

import { getInstantBookingCreateService } from "../../di/InstantBookingCreateService.container";
import type { CreateInstantBookingData } from "../dto/types";

const { mockOnBookingCreated, mockCheckIfTeamHasFeature } = vi.hoisted(() => ({
  mockOnBookingCreated: vi.fn().mockResolvedValue(undefined),
  mockCheckIfTeamHasFeature: vi.fn().mockResolvedValue(false),
}));

vi.mock("@calcom/features/notifications/sendNotification", () => ({
  sendNotification: vi.fn(),
}));

vi.mock("@calcom/features/conferencing/lib/videoClient", () => ({
  createInstantMeetingWithCalVideo: vi.fn().mockResolvedValue({
    type: "daily_video",
    id: "MOCK_INSTANT_MEETING_ID",
    password: "MOCK_INSTANT_PASS",
    url: "http://mock-dailyvideo.example.com/instant-meeting-url",
  }),
}));

// Mock the BookingEventHandlerService DI module to avoid deep transitive dependency resolution
vi.mock("@calcom/features/bookings/di/BookingEventHandlerService.module", async () => {
  const { createModule } = await import("@evyweb/ioctopus");
  const token = Symbol("BookingEventHandlerService");
  const moduleToken = Symbol("BookingEventHandlerServiceModule");
  const mod = createModule();
  mod.bind(token).toFactory(() => ({
    onBookingCreated: mockOnBookingCreated,
  }));
  return {
    moduleLoader: {
      token,
      loadModule: (container: any) => {
        container.load(moduleToken, mod);
      },
    },
  };
});

// Mock the FeaturesRepository DI module to control checkIfTeamHasFeature
vi.mock("@calcom/features/di/modules/FeaturesRepository", async () => {
  const { createModule } = await import("@evyweb/ioctopus");
  const token = Symbol("FeaturesRepository");
  const moduleToken = Symbol("FeaturesRepositoryModule");
  const mod = createModule();
  mod.bind(token).toFactory(() => ({
    checkIfTeamHasFeature: mockCheckIfTeamHasFeature,
  }));
  return {
    featuresRepositoryModule: mod,
    moduleLoader: {
      token,
      loadModule: (container: any) => {
        container.load(moduleToken, mod);
      },
    },
  };
});

describe("handleInstantMeeting", () => {
  beforeEach(() => {
    mockNoTranslations();
    mockOnBookingCreated.mockClear();
    mockCheckIfTeamHasFeature.mockClear();
    mockCheckIfTeamHasFeature.mockResolvedValue(false);
  });
  describe("team event instant meeting", () => {
    it("should successfully create instant meeting for team event", async () => {
      const instantBookingCreateService = getInstantBookingCreateService();
      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
      });

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 45,
              length: 45,
              users: [
                {
                  id: 101,
                },
              ],
              team: {
                id: 1,
              },
              instantMeetingExpiryTimeOffsetInSeconds: 90,
            },
          ],
          organizer,
          apps: [TestData.apps["daily-video"], TestData.apps["google-calendar"]],
        })
      );

      mockSuccessfulVideoMeetingCreation({
        metadataLookupKey: "dailyvideo",
        videoMeetingData: {
          id: "MOCK_ID",
          password: "MOCK_PASS",
          url: `http://mock-dailyvideo.example.com/meeting-1`,
        },
      });
      mockCalendarToHaveNoBusySlots("googlecalendar", {
        create: {
          uid: "MOCKED_GOOGLE_CALENDAR_EVENT_ID",
        },
      });

      const mockBookingData: CreateInstantBookingData = {
        eventTypeId: 1,
        timeZone: "UTC",
        language: "en",
        start: `${plus1DateString}T04:00:00.000Z`,
        end: `${plus1DateString}T04:45:00.000Z`,
        responses: {
          name: "Test User",
          email: "test@example.com",
          attendeePhoneNumber: "+918888888888",
        },
        metadata: {},
        instant: true,
      };

      const result = await instantBookingCreateService.createBooking({
        bookingData: mockBookingData,
      });

      expect(result.message).toBe("Success");
      expect(result.bookingId).toBeDefined();
      expect(result.bookingUid).toBeDefined();
      expect(result.meetingTokenId).toBeDefined();
      expect(result.expires).toBeInstanceOf(Date);

      const booking = await prismock.booking.findUnique({
        where: { id: result.bookingId },
        select: { status: true, attendees: true, references: true },
      });

      expect(booking).toBeDefined();
      expect(booking?.status).toBe(BookingStatus.AWAITING_HOST);
      expect(booking?.attendees).toHaveLength(1);
      expect(booking?.attendees[0].email).toBe("test@example.com");
      expect(booking?.attendees[0].phoneNumber).toBe("+918888888888");
      expect(booking?.references).toHaveLength(1);
      expect(booking?.references[0].type).toBe("daily_video");
    });

    it("should throw error for non-team event types", async () => {
      const instantBookingCreateService = getInstantBookingCreateService();
      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
      });

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 45,
              length: 45,
              users: [
                {
                  id: 101,
                },
              ],
            },
          ],
          organizer,
          apps: [TestData.apps["daily-video"], TestData.apps["google-calendar"]],
        })
      );

      const mockBookingData: CreateInstantBookingData = {
        eventTypeId: 1,
        timeZone: "UTC",
        language: "en",
        start: `${plus1DateString}T04:00:00.000Z`,
        end: `${plus1DateString}T04:45:00.000Z`,
        responses: {
          name: "Test User",
          email: "test@example.com",
          attendeePhoneNumber: "+918888888888",
        },
        metadata: {},
        instant: true,
      };

      await expect(
        instantBookingCreateService.createBooking({
          bookingData: mockBookingData,
        })
      ).rejects.toThrow("Only Team Event Types are supported for Instant Meeting");
    });

    it("should emit booking audit event when booking-audit feature flag is enabled", async () => {
      // Create the org team first
      await prismock.team.create({
        data: {
          id: 100,
          name: "Test Org",
          slug: "test-org",
          isOrganization: true,
        },
      });

      mockCheckIfTeamHasFeature.mockResolvedValue(true);

      const instantBookingCreateService = getInstantBookingCreateService();
      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
      });

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 45,
              length: 45,
              users: [
                {
                  id: 101,
                },
              ],
              team: {
                id: 1,
              },
              instantMeetingExpiryTimeOffsetInSeconds: 90,
            },
          ],
          organizer,
          apps: [TestData.apps["daily-video"], TestData.apps["google-calendar"]],
        })
      );

      // Set the team's parentId to the org after scenario creation
      await prismock.team.update({
        where: { id: 1 },
        data: { parentId: 100 },
      });

      mockSuccessfulVideoMeetingCreation({
        metadataLookupKey: "dailyvideo",
        videoMeetingData: {
          id: "MOCK_ID",
          password: "MOCK_PASS",
          url: `http://mock-dailyvideo.example.com/meeting-1`,
        },
      });
      mockCalendarToHaveNoBusySlots("googlecalendar", {
        create: {
          uid: "MOCKED_GOOGLE_CALENDAR_EVENT_ID",
        },
      });

      const mockBookingData: CreateInstantBookingData = {
        eventTypeId: 1,
        timeZone: "UTC",
        language: "en",
        start: `${plus1DateString}T04:00:00.000Z`,
        end: `${plus1DateString}T04:45:00.000Z`,
        responses: {
          name: "Test User",
          email: "test@example.com",
          attendeePhoneNumber: "+918888888888",
        },
        metadata: {},
        instant: true,
      };

      const result = await instantBookingCreateService.createBooking({
        bookingData: mockBookingData,
        bookingMeta: {
          userUuid: "test-user-uuid-123",
          impersonatedByUserUuid: null,
        },
      });

      expect(result.message).toBe("Success");

      // Verify checkIfTeamHasFeature was called with the org id and booking-audit flag
      expect(mockCheckIfTeamHasFeature).toHaveBeenCalledWith(100, "booking-audit");

      // Verify onBookingCreated was called with the expected audit payload
      expect(mockOnBookingCreated).toHaveBeenCalledTimes(1);
      expect(mockOnBookingCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            config: { isDryRun: false },
            bookingFormData: { hashedLink: null },
            booking: expect.objectContaining({
              uid: result.bookingUid,
              status: BookingStatus.AWAITING_HOST,
              userId: null,
            }),
            organizationId: 100,
          }),
          auditData: expect.objectContaining({
            status: BookingStatus.AWAITING_HOST,
            hostUserUuid: null,
            seatReferenceUid: null,
          }),
          isBookingAuditEnabled: true,
          operationId: null,
          source: expect.any(String),
          actor: expect.objectContaining({
            identifiedBy: "user",
            userUuid: "test-user-uuid-123",
          }),
        })
      );
    });
  });
});

function getDate(param: { dateIncrement?: number } = {}) {
  const { dateIncrement = 0 } = param;
  const date = new Date();
  date.setDate(date.getDate() + dateIncrement);
  return {
    date,
    dateString: date.toISOString().split("T")[0],
  };
}
