import { describe, expect, it, beforeEach } from "vitest";

import { verifyDataRequirementsContract, createTrackingDbStore, createEmptyAccessedData } from "./contractVerification";
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

  it("should return created_awaiting_host key when status is AWAITING_HOST", async () => {
    const storedData = {
      version: 1,
      fields: {
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        status: "AWAITING_HOST",
        hostUserUuid: null,
      },
    };
    const accessedData = createEmptyAccessedData();
    const dbStore = createTrackingDbStore(accessedData);

    const result = await service.getDisplayTitle({ storedData, dbStore, userTimeZone: "UTC" });

    expect(result).toEqual({ key: "booking_audit_action.created_awaiting_host", params: {} });
    expect(accessedData.userUuids.size).toBe(0);
  });

  it("should use nullish coalescing so empty-string host name is preserved", async () => {
    const storedData = {
      version: 1,
      fields: {
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        status: "ACCEPTED",
        hostUserUuid: "host-uuid-empty",
      },
    };
    const dbStore = {
      getUserByUuid: () => ({ id: 1, uuid: "host-uuid-empty", name: "", email: "e@x.com", avatarUrl: null }),
      getAttendeeById: () => null,
      getCredentialById: () => null,
    } as any;

    const result = await service.getDisplayTitle({ storedData, dbStore, userTimeZone: "UTC" });

    expect(result.params.host).toBe("");
  });
});
