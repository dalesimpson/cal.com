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
import { InstantBookingCreateService } from "./InstantBookingCreateService";

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

vi.mock("@calcom/lib/getOrgIdFromMemberOrTeamId", () => ({
  default: vi.fn().mockResolvedValue(100),
}));

function createMockBookingEventHandler() {
  return {
    onBookingCreated: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockFeaturesRepository(opts: { bookingAuditEnabled?: boolean } = {}) {
  return {
    checkIfTeamHasFeature: vi.fn().mockImplementation((_teamId: number, featureId: string) => {
      if (featureId === "booking-audit") return Promise.resolve(opts.bookingAuditEnabled ?? false);
      return Promise.resolve(false);
    }),
  };
}

describe("handleInstantMeeting", () => {
  beforeEach(() => {
    mockNoTranslations();
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
  });

  describe("audit event emission", () => {
    async function setupTeamScenario() {
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
              users: [{ id: 101 }],
              team: { id: 1 },
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
          url: "http://mock-dailyvideo.example.com/meeting-1",
        },
      });
      mockCalendarToHaveNoBusySlots("googlecalendar", {
        create: { uid: "MOCKED_GOOGLE_CALENDAR_EVENT_ID" },
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

      return { mockBookingData };
    }

    it("should fire onBookingCreated with AWAITING_HOST status and null hostUserUuid", async () => {
      const mockBookingEventHandler = createMockBookingEventHandler();
      const mockFeaturesRepository = createMockFeaturesRepository({ bookingAuditEnabled: true });

      const service = new InstantBookingCreateService({
        prismaClient: prismock,
        bookingEventHandler: mockBookingEventHandler as any,
        featuresRepository: mockFeaturesRepository as any,
      });

      const { mockBookingData } = await setupTeamScenario();

      const result = await service.createBooking({ bookingData: mockBookingData });
      expect(result.message).toBe("Success");

      expect(mockBookingEventHandler.onBookingCreated).toHaveBeenCalledTimes(1);

      const callArgs = mockBookingEventHandler.onBookingCreated.mock.calls[0][0];
      expect(callArgs.auditData.status).toBe(BookingStatus.AWAITING_HOST);
      expect(callArgs.auditData.hostUserUuid).toBeNull();
      expect(callArgs.auditData.seatReferenceUid).toBeNull();
      expect(callArgs.auditData.startTime).toEqual(expect.any(Number));
      expect(callArgs.auditData.endTime).toEqual(expect.any(Number));
      expect(callArgs.isBookingAuditEnabled).toBe(true);
      expect(callArgs.payload.booking.uid).toBe(result.bookingUid);
      expect(callArgs.payload.booking.status).toBe(BookingStatus.AWAITING_HOST);
      expect(callArgs.payload.config.isDryRun).toBe(false);
    });

    it("should not break the booking flow if audit event handler throws", async () => {
      const mockBookingEventHandler = {
        onBookingCreated: vi.fn().mockRejectedValue(new Error("Audit service unavailable")),
      };
      const mockFeaturesRepository = createMockFeaturesRepository({ bookingAuditEnabled: true });

      const service = new InstantBookingCreateService({
        prismaClient: prismock,
        bookingEventHandler: mockBookingEventHandler as any,
        featuresRepository: mockFeaturesRepository as any,
      });

      const { mockBookingData } = await setupTeamScenario();

      const result = await service.createBooking({ bookingData: mockBookingData });
      expect(result.message).toBe("Success");
      expect(result.bookingId).toBeDefined();
      expect(mockBookingEventHandler.onBookingCreated).toHaveBeenCalledTimes(1);
    });

    it("should pass isBookingAuditEnabled=false when feature flag is disabled", async () => {
      const mockBookingEventHandler = createMockBookingEventHandler();
      const mockFeaturesRepository = createMockFeaturesRepository({ bookingAuditEnabled: false });

      const service = new InstantBookingCreateService({
        prismaClient: prismock,
        bookingEventHandler: mockBookingEventHandler as any,
        featuresRepository: mockFeaturesRepository as any,
      });

      const { mockBookingData } = await setupTeamScenario();

      await service.createBooking({ bookingData: mockBookingData });

      expect(mockBookingEventHandler.onBookingCreated).toHaveBeenCalledTimes(1);
      const callArgs = mockBookingEventHandler.onBookingCreated.mock.calls[0][0];
      expect(callArgs.isBookingAuditEnabled).toBe(false);
    });

    it("should pass correct action source from bookingData.creationSource", async () => {
      const mockBookingEventHandler = createMockBookingEventHandler();
      const mockFeaturesRepository = createMockFeaturesRepository({ bookingAuditEnabled: true });

      const service = new InstantBookingCreateService({
        prismaClient: prismock,
        bookingEventHandler: mockBookingEventHandler as any,
        featuresRepository: mockFeaturesRepository as any,
      });

      const { mockBookingData } = await setupTeamScenario();
      mockBookingData.creationSource = "WEBAPP" as any;

      await service.createBooking({ bookingData: mockBookingData });

      expect(mockBookingEventHandler.onBookingCreated).toHaveBeenCalledTimes(1);
      const callArgs = mockBookingEventHandler.onBookingCreated.mock.calls[0][0];
      expect(callArgs.source).toBe("WEBAPP");
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
