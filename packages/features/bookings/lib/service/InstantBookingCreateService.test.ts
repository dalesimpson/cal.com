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

const { mockGetOrgId } = vi.hoisted(() => ({
  mockGetOrgId: vi.fn().mockResolvedValue(null as number | null),
}));

vi.mock("@calcom/lib/getOrgIdFromMemberOrTeamId", () => ({
  default: mockGetOrgId,
}));

describe("handleInstantMeeting", () => {
  beforeEach(() => {
    mockNoTranslations();
    mockGetOrgId.mockResolvedValue(null);
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
    function createServiceWithMocks(overrides: {
      onBookingCreatedImpl?: (...args: any[]) => Promise<void>;
      checkIfTeamHasFeatureImpl?: (...args: any[]) => Promise<boolean>;
    } = {}) {
      const mockOnBookingCreated = vi
        .fn()
        .mockImplementation(overrides.onBookingCreatedImpl ?? (() => Promise.resolve()));
      const mockCheckIfTeamHasFeature = vi
        .fn()
        .mockImplementation(overrides.checkIfTeamHasFeatureImpl ?? (() => Promise.resolve(true)));

      const service = new InstantBookingCreateService({
        prismaClient: prismock as any,
        bookingEventHandler: {
          onBookingCreated: mockOnBookingCreated,
        } as unknown as BookingEventHandlerService,
        featuresRepository: {
          checkIfTeamHasFeature: mockCheckIfTeamHasFeature,
        } as unknown as FeaturesRepository,
      });

      return { service, mockOnBookingCreated, mockCheckIfTeamHasFeature };
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
          url: `http://mock-dailyvideo.example.com/meeting-1`,
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
        creationSource: CreationSource.WEBAPP,
      };

      return { mockBookingData };
    }

    beforeEach(() => {
      mockGetOrgId.mockResolvedValue(100);
    });

    it("should call onBookingCreated with correct audit data on successful booking", async () => {
      const { service, mockOnBookingCreated, mockCheckIfTeamHasFeature } = createServiceWithMocks();
      const { mockBookingData } = await setupTeamEventScenario();

      const result = await service.createBooking({
        bookingData: mockBookingData,
        bookingMeta: { userUuid: "test-user-uuid", impersonatedByUserUuid: null },
      });

      expect(result.message).toBe("Success");
      expect(mockCheckIfTeamHasFeature).toHaveBeenCalledWith(100, "booking-audit");
      expect(mockOnBookingCreated).toHaveBeenCalledTimes(1);

      const callArgs = mockOnBookingCreated.mock.calls[0][0];
      expect(callArgs.source).toBe("WEBAPP");
      expect(callArgs.isBookingAuditEnabled).toBe(true);
      expect(callArgs.actor).toBeDefined();
    });

    it("should not break booking flow when onBookingCreated rejects", async () => {
      const { service } = createServiceWithMocks({
        onBookingCreatedImpl: () => Promise.reject(new Error("Audit service unavailable")),
      });
      const { mockBookingData } = await setupTeamEventScenario();

      const result = await service.createBooking({
        bookingData: mockBookingData,
        bookingMeta: { userUuid: "test-user-uuid", impersonatedByUserUuid: null },
      });

      expect(result.message).toBe("Success");
      expect(result.bookingId).toBeDefined();
    });

    it("should pass hostUserUuid as null for AWAITING_HOST bookings", async () => {
      const { service, mockOnBookingCreated } = createServiceWithMocks();
      const { mockBookingData } = await setupTeamEventScenario();

      await service.createBooking({
        bookingData: mockBookingData,
        bookingMeta: { userUuid: "test-user-uuid", impersonatedByUserUuid: null },
      });

      expect(mockOnBookingCreated).toHaveBeenCalledTimes(1);
      const callArgs = mockOnBookingCreated.mock.calls[0][0];
      expect(callArgs.auditData.hostUserUuid).toBeNull();
      expect(callArgs.auditData.status).toBe(BookingStatus.AWAITING_HOST);
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
