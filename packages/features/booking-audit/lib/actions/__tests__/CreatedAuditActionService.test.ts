import { describe, expect, it, beforeEach } from "vitest";

import { verifyDataRequirementsContract, createMockEnrichmentDataStore } from "./contractVerification";
import { CreatedAuditActionService } from "../CreatedAuditActionService";

describe("CreatedAuditActionService - getDataRequirements contract", () => {
  let service: CreatedAuditActionService;

  beforeEach(() => {
    service = new CreatedAuditActionService();
  });

  it("should declare exactly the userUuids accessed when hostUserUuid is present", async () => {
    const storedData = {
      version: 1,
      fields: {
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        status: "ACCEPTED",
        hostUserUuid: "host-uuid-123",
      },
    };

    const { errors, accessedData } = await verifyDataRequirementsContract(service, storedData);
    expect(errors).toEqual([]);
    expect(accessedData.userUuids.size).toBe(1);
  });

  it("should declare empty userUuids when hostUserUuid is null", async () => {
    const storedData = {
      version: 1,
      fields: {
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        status: "ACCEPTED",
        hostUserUuid: null,
      },
    };

    const { errors, accessedData } = await verifyDataRequirementsContract(service, storedData);
    expect(errors).toEqual([]);
    expect(accessedData.userUuids.size).toBe(0);
  });

  it("should declare exactly the userUuids accessed for seated booking", async () => {
    const storedData = {
      version: 1,
      fields: {
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        status: "ACCEPTED",
        hostUserUuid: "host-uuid-456",
        seatReferenceUid: "seat-ref-123",
      },
    };

    const { errors, accessedData } = await verifyDataRequirementsContract(service, storedData);
    expect(errors).toEqual([]);
    expect(accessedData.userUuids.size).toBe(1);
  });
});

describe("CreatedAuditActionService - getDisplayTitle", () => {
  let service: CreatedAuditActionService;

  beforeEach(() => {
    service = new CreatedAuditActionService();
  });

  it("should return 'created' key with host name for ACCEPTED booking", async () => {
    const storedData = {
      version: 1,
      fields: {
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        status: "ACCEPTED",
        hostUserUuid: "host-uuid-123",
      },
    };

    const requirements = service.getDataRequirements(storedData);
    const dbStore = createMockEnrichmentDataStore(
      {
        users: [
          {
            id: 1,
            uuid: "host-uuid-123",
            name: "Jane Host",
            email: "jane@example.com",
            avatarUrl: null,
          },
        ],
      },
      requirements
    );

    const result = await service.getDisplayTitle({ storedData, dbStore, userTimeZone: "UTC" });
    expect(result).toEqual({
      key: "booking_audit_action.created",
      params: { host: "Jane Host" },
    });
  });

  it("should return 'created_awaiting_host' key for AWAITING_HOST booking with null hostUserUuid", async () => {
    const storedData = {
      version: 1,
      fields: {
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        status: "AWAITING_HOST",
        hostUserUuid: null,
      },
    };

    const requirements = service.getDataRequirements(storedData);
    const dbStore = createMockEnrichmentDataStore({}, requirements);

    const result = await service.getDisplayTitle({ storedData, dbStore, userTimeZone: "UTC" });
    expect(result).toEqual({
      key: "booking_audit_action.created_awaiting_host",
    });
  });

  it("should return 'created_with_seat' key for seated booking", async () => {
    const storedData = {
      version: 1,
      fields: {
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        status: "ACCEPTED",
        hostUserUuid: "host-uuid-456",
        seatReferenceUid: "seat-ref-123",
      },
    };

    const requirements = service.getDataRequirements(storedData);
    const dbStore = createMockEnrichmentDataStore(
      {
        users: [
          {
            id: 2,
            uuid: "host-uuid-456",
            name: "John Host",
            email: "john@example.com",
            avatarUrl: null,
          },
        ],
      },
      requirements
    );

    const result = await service.getDisplayTitle({ storedData, dbStore, userTimeZone: "UTC" });
    expect(result).toEqual({
      key: "booking_audit_action.created_with_seat",
      params: { host: "John Host" },
    });
  });
});
