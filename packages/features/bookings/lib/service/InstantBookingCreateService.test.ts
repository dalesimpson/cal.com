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
import type { PrismaClient } from "@calcom/prisma";
import type { BookingEventHandlerService } from "../onBookingEvents/BookingEventHandlerService";
import type { FeaturesRepository } from "@calcom/features/flags/features.repository";

import { getInstantBookingCreateService } from "../../di/InstantBookingCreateService.container";
import { InstantBookingCreateService } from "./InstantBookingCreateService";
import type { CreateInstantBookingData } from "../dto/types";

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

  describe("booking audit emission", () => {
    function createServiceWithMocks({
      onBookingCreated = vi.fn().mockResolvedValue(undefined),
      checkIfFeatureIsEnabledGlobally = vi.fn().mockResolvedValue(true),
    }: {
      onBookingCreated?: ReturnType<typeof vi.fn>;
      checkIfFeatureIsEnabledGlobally?: ReturnType<typeof vi.fn>;
    } = {}) {
      const mockBookingEventHandler = {
        onBookingCreated,
      } as unknown as BookingEventHandlerService;

      const mockFeaturesRepository = {
        checkIfFeatureIsEnabledGlobally,
      } as unknown as FeaturesRepository;

      const service = new InstantBookingCreateService({
        prismaClient: prismock as unknown as PrismaClient,
        bookingEventHandler: mockBookingEventHandler,
        featuresRepository: mockFeaturesRepository,
      });

      return { service, onBookingCreated, checkIfFeatureIsEnabledGlobally };
    }

    async function setupTeamEventScenario() {
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

      return mockBookingData;
    }

    it("should call onBookingCreated with correct payload, actor, and auditData when feature is enabled", async () => {
      const { service, onBookingCreated, checkIfFeatureIsEnabledGlobally } = createServiceWithMocks({
        checkIfFeatureIsEnabledGlobally: vi.fn().mockResolvedValue(true),
      });
      const mockBookingData = await setupTeamEventScenario();

      const result = await service.createBooking({ bookingData: mockBookingData });

      expect(result.message).toBe("Success");
      expect(checkIfFeatureIsEnabledGlobally).toHaveBeenCalledWith("booking-audit");
      expect(onBookingCreated).toHaveBeenCalledTimes(1);

      const callArgs = onBookingCreated.mock.calls[0][0];

      expect(callArgs.payload).toEqual(
        expect.objectContaining({
          config: { isDryRun: false },
          bookingFormData: { hashedLink: null },
          booking: expect.objectContaining({
            uid: result.bookingUid,
            status: BookingStatus.AWAITING_HOST,
          }),
        })
      );

      expect(callArgs.actor).toEqual({
        identifiedBy: "guest",
        email: "test@example.com",
        name: "Test User",
      });

      expect(callArgs.auditData).toEqual(
        expect.objectContaining({
          status: BookingStatus.AWAITING_HOST,
          hostUserUuid: null,
          seatReferenceUid: null,
        })
      );

      expect(callArgs.source).toBe("WEBAPP");
      expect(callArgs.isBookingAuditEnabled).toBe(true);
    });

    it("should not propagate errors when onBookingCreated rejects", async () => {
      const { service, onBookingCreated } = createServiceWithMocks({
        onBookingCreated: vi.fn().mockRejectedValue(new Error("Audit service unavailable")),
      });
      const mockBookingData = await setupTeamEventScenario();

      const result = await service.createBooking({ bookingData: mockBookingData });

      expect(result.message).toBe("Success");
      expect(result.bookingId).toBeDefined();
      expect(result.bookingUid).toBeDefined();
      expect(onBookingCreated).toHaveBeenCalledTimes(1);
    });

    it("should pass isBookingAuditEnabled as false when feature flag is disabled", async () => {
      const { service, onBookingCreated, checkIfFeatureIsEnabledGlobally } = createServiceWithMocks({
        checkIfFeatureIsEnabledGlobally: vi.fn().mockResolvedValue(false),
      });
      const mockBookingData = await setupTeamEventScenario();

      const result = await service.createBooking({ bookingData: mockBookingData });

      expect(result.message).toBe("Success");
      expect(checkIfFeatureIsEnabledGlobally).toHaveBeenCalledWith("booking-audit");
      expect(onBookingCreated).toHaveBeenCalledTimes(1);

      const callArgs = onBookingCreated.mock.calls[0][0];
      expect(callArgs.isBookingAuditEnabled).toBe(false);
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
