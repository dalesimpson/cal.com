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

import { BookingStatus, CreationSource } from "@calcom/prisma/enums";

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

function getDate(param: { dateIncrement?: number } = {}) {
  const { dateIncrement = 0 } = param;
  const date = new Date();
  date.setDate(date.getDate() + dateIncrement);
  return {
    date,
    dateString: date.toISOString().split("T")[0],
  };
}

function createMockBookingEventHandler() {
  return {
    onBookingCreated: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockFeaturesRepository() {
  return {
    checkIfTeamHasFeature: vi.fn().mockResolvedValue(true),
    checkIfFeatureIsEnabledGlobally: vi.fn().mockResolvedValue(false),
    checkIfUserHasFeature: vi.fn().mockResolvedValue(false),
    checkIfUserHasFeatureNonHierarchical: vi.fn().mockResolvedValue(false),
    getTeamsWithFeatureEnabled: vi.fn().mockResolvedValue([]),
    setUserFeatureState: vi.fn().mockResolvedValue(undefined),
    setTeamFeatureState: vi.fn().mockResolvedValue(undefined),
  };
}

async function setupBookingScenario() {
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

  return { plus1DateString };
}

function createMockBookingData(plus1DateString: string): CreateInstantBookingData {
  return {
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
    creationSource: CreationSource.WEBAPP,
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
        creationSource: CreationSource.WEBAPP,
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
        creationSource: CreationSource.WEBAPP,
      };

      await expect(
        instantBookingCreateService.createBooking({
          bookingData: mockBookingData,
        })
      ).rejects.toThrow("Only Team Event Types are supported for Instant Meeting");
    });
  });

  describe("booking audit events", () => {
    it("should fire booking created audit event with correct payload shape, actor, source, and auditData", async () => {
      const mockBookingEventHandler = createMockBookingEventHandler();
      const mockFeaturesRepository = createMockFeaturesRepository();
      const service = new InstantBookingCreateService({
        prismaClient: prismock,
        bookingEventHandler: mockBookingEventHandler as any,
        featuresRepository: mockFeaturesRepository,
      });

      const { plus1DateString } = await setupBookingScenario();
      const mockBookingData = createMockBookingData(plus1DateString);

      const result = await service.createBooking({ bookingData: mockBookingData });

      expect(result.message).toBe("Success");
      expect(mockBookingEventHandler.onBookingCreated).toHaveBeenCalledOnce();

      const call = mockBookingEventHandler.onBookingCreated.mock.calls[0][0];

      // Payload shape
      expect(call.payload.config.isDryRun).toBe(false);
      expect(call.payload.bookingFormData.hashedLink).toBeNull();
      expect(call.payload.booking.uid).toBeDefined();
      expect(call.payload.booking.startTime).toBeInstanceOf(Date);
      expect(call.payload.booking.endTime).toBeInstanceOf(Date);
      expect(call.payload.booking.status).toBe(BookingStatus.AWAITING_HOST);

      // Actor — attendee actor since the booker email matches an attendee record
      expect(call.actor.identifiedBy).toBe("attendee");
      expect(call.actor.attendeeId).toEqual(expect.any(Number));

      // Source
      expect(call.source).toBe("WEBAPP");

      // Audit data
      expect(call.auditData.startTime).toEqual(expect.any(Number));
      expect(call.auditData.endTime).toEqual(expect.any(Number));
      expect(call.auditData.status).toBe(BookingStatus.AWAITING_HOST);
      expect(call.auditData).toHaveProperty("hostUserUuid");
      expect(call.auditData.seatReferenceUid).toBeNull();
    });

    it("should not break the booking flow when onBookingCreated rejects", async () => {
      const mockBookingEventHandler = createMockBookingEventHandler();
      mockBookingEventHandler.onBookingCreated.mockRejectedValue(new Error("Audit service unavailable"));
      const mockFeaturesRepository = createMockFeaturesRepository();
      const service = new InstantBookingCreateService({
        prismaClient: prismock,
        bookingEventHandler: mockBookingEventHandler as any,
        featuresRepository: mockFeaturesRepository,
      });

      const { plus1DateString } = await setupBookingScenario();
      const mockBookingData = createMockBookingData(plus1DateString);

      const result = await service.createBooking({ bookingData: mockBookingData });

      // Booking should still succeed despite audit failure
      expect(result.message).toBe("Success");
      expect(result.bookingId).toBeDefined();
      expect(result.bookingUid).toBeDefined();
      expect(result.meetingTokenId).toBeDefined();
    });

    it("should use user actor when bookingMeta contains userUuid", async () => {
      const mockBookingEventHandler = createMockBookingEventHandler();
      const mockFeaturesRepository = createMockFeaturesRepository();
      const service = new InstantBookingCreateService({
        prismaClient: prismock,
        bookingEventHandler: mockBookingEventHandler as any,
        featuresRepository: mockFeaturesRepository,
      });

      const { plus1DateString } = await setupBookingScenario();
      const mockBookingData = createMockBookingData(plus1DateString);

      await service.createBooking({
        bookingData: mockBookingData,
        bookingMeta: {
          userUuid: "test-user-uuid-123",
          impersonatedByUserUuid: null,
        },
      });

      expect(mockBookingEventHandler.onBookingCreated).toHaveBeenCalledOnce();
      const call = mockBookingEventHandler.onBookingCreated.mock.calls[0][0];

      // Actor should be user actor when userUuid is provided
      expect(call.actor.identifiedBy).toBe("user");
      expect(call.actor.userUuid).toBe("test-user-uuid-123");
    });
  });
});
