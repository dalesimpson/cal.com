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

  it("should return created key with host name when status is ACCEPTED and host exists", async () => {
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
      { users: [{ id: 1, uuid: "host-uuid-123", name: "Alice", email: "alice@example.com", avatarUrl: null }] },
      requirements
    );

    const result = await service.getDisplayTitle({ storedData, dbStore, userTimeZone: "UTC" });
    expect(result).toEqual({ key: "booking_audit_action.created", params: { host: "Alice" } });
  });

  it("should return created_with_seat key with host name for seated bookings", async () => {
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
      { users: [{ id: 2, uuid: "host-uuid-456", name: "Bob", email: "bob@example.com", avatarUrl: null }] },
      requirements
    );

    const result = await service.getDisplayTitle({ storedData, dbStore, userTimeZone: "UTC" });
    expect(result).toEqual({ key: "booking_audit_action.created_with_seat", params: { host: "Bob" } });
  });

  it("should return created_awaiting_host key without host param when status is AWAITING_HOST", async () => {
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
    expect(result).toEqual({ key: "booking_audit_action.created_awaiting_host" });
  });

  it("should return created_awaiting_host key even if hostUserUuid is somehow present with AWAITING_HOST status", async () => {
    const storedData = {
      version: 1,
      fields: {
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        status: "AWAITING_HOST",
        hostUserUuid: "host-uuid-789",
      },
    };

    const requirements = service.getDataRequirements(storedData);
    const dbStore = createMockEnrichmentDataStore(
      { users: [{ id: 3, uuid: "host-uuid-789", name: "Charlie", email: "charlie@example.com", avatarUrl: null }] },
      requirements
    );

    const result = await service.getDisplayTitle({ storedData, dbStore, userTimeZone: "UTC" });
    expect(result).toEqual({ key: "booking_audit_action.created_awaiting_host" });
  });

  it("should return Unknown host when hostUserUuid is null and status is not AWAITING_HOST", async () => {
    const storedData = {
      version: 1,
      fields: {
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        status: "ACCEPTED",
        hostUserUuid: null,
      },
    };

    const requirements = service.getDataRequirements(storedData);
    const dbStore = createMockEnrichmentDataStore({}, requirements);

    const result = await service.getDisplayTitle({ storedData, dbStore, userTimeZone: "UTC" });
    expect(result).toEqual({ key: "booking_audit_action.created", params: { host: "Unknown" } });
  });
});
